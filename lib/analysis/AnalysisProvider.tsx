import { friendlyError } from '@/lib/errors';
import { buildEngineHtml, type AnalysisResult, type EngineJob, type EngineMessage, type EngineStage } from '@/lib/poseAnalysis';
import { supabase } from '@/lib/supabase';
import { isMissingColumn } from '@/lib/videoMeta';
import { logActivity } from '@/lib/activityLog';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Runs AI video analysis in the background for the whole app.
 *
 * A single WebView hosting the MediaPipe engine lives at the root of the app,
 * so analysis keeps going while the user navigates elsewhere. The engine is
 * kept warm between jobs and released after a period of inactivity to free
 * memory. Only one job runs at a time; duplicate requests for the same video
 * are ignored.
 */
export type JobStatus = 'queued' | 'running' | 'saving' | 'done' | 'error';

export type AnalysisJob = {
  videoId: string;
  title: string;
  status: JobStatus;
  stage: EngineStage;
  progress: number;
  current?: number;
  total?: number;
  error?: string;
  result?: AnalysisResult;
  startedAt: number;
};

export type StartOptions = {
  videoId: string;
  playerId: string;
  title: string;
  url: string;
  start?: number | null;
  end?: number | null;
};

type Ctx = {
  jobs: Record<string, AnalysisJob>;
  start: (o: StartOptions) => void;
  cancel: (videoId: string) => void;
  dismiss: (videoId: string) => void;
  /** Starts loading the AI model before it is needed. */
  prewarm: () => void;
  engineReady: boolean;
};

const AnalysisContext = createContext<Ctx | null>(null);

const IDLE_RELEASE_MS = 90_000;
/** Fail queued jobs if the model cannot be downloaded (e.g. offline). */
const ENGINE_LOAD_TIMEOUT_MS = 75_000;
const EXTRA_KEY = 'talanta.analysisExtra.v1';

/** Extra estimate fields are stored on the device if the DB lacks the columns. */
export async function getLocalAnalysisExtra(videoId: string): Promise<Partial<AnalysisResult> | null> {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(EXTRA_KEY)) || '{}');
    return all[videoId] ?? null;
  } catch {
    return null;
  }
}

async function saveLocalExtra(videoId: string, extra: Partial<AnalysisResult>) {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(EXTRA_KEY)) || '{}');
    all[videoId] = extra;
    await AsyncStorage.setItem(EXTRA_KEY, JSON.stringify(all));
  } catch { /* best effort */ }
}

async function persistResult(o: StartOptions, r: AnalysisResult) {
  const { est_distance_m, est_top_speed_kmh, est_jump_cm, analyzed_seconds, ...core } = r;
  const extra = { est_distance_m, est_top_speed_kmh, est_jump_cm, analyzed_seconds };

  // Re-analysis replaces the existing report in place, so a video never ends
  // up with more than one report.
  const { data: existing } = await supabase
    .from('video_analysis')
    .select('id')
    .eq('video_id', o.videoId)
    .order('created_at', { ascending: false });
  const keepId = existing?.[0]?.id as string | undefined;
  const write = (row: Record<string, unknown>) => keepId
    ? supabase.from('video_analysis').update({ ...row, created_at: new Date().toISOString() }).eq('id', keepId)
    : supabase.from('video_analysis').insert({ video_id: o.videoId, player_id: o.playerId, ...row });

  let { error } = await write({ ...core, ...extra });
  if (error && isMissingColumn(error)) {
    ({ error } = await write({ ...core }));
    await saveLocalExtra(o.videoId, extra);
  }
  if (error) throw error;
  if (existing && existing.length > 1) {
    await supabase.from('video_analysis').delete().in('id', existing.slice(1).map((e: any) => e.id));
  }
  await supabase.from('videos').update({ analysis_status: 'analyzed' }).eq('id', o.videoId);
  void logActivity('ai_analysis', `Analyzed "${o.title}" — rating ${r.overall_rating}`);
}

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, AnalysisJob>>({});
  const [mounted, setMounted] = useState(false);
  const [engineReady, setEngineReady] = useState(false);

  const webRef = useRef<WebView>(null);
  const engineReadyRef = useRef(false);
  const jobsRef = useRef(jobs);
  const queue = useRef<StartOptions[]>([]);
  const active = useRef<(StartOptions & { runId: string }) | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const html = useMemo(() => buildEngineHtml(), []);

  const patch = useCallback((id: string, p: Partial<AnalysisJob>) => {
    setJobs((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...p } } : prev));
  }, []);

  const scheduleRelease = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!active.current && queue.current.length === 0) {
        engineReadyRef.current = false;
        setMounted(false);
        setEngineReady(false);
      }
    }, IDLE_RELEASE_MS);
  }, []);

  const runNext = useCallback(() => {
    if (active.current || !engineReadyRef.current) return;
    const next = queue.current.shift();
    if (!next) { scheduleRelease(); return; }
    // A unique id per run, so a cancelled run can never report into a new one.
    const runId = `${next.videoId}:${Date.now()}`;
    active.current = { ...next, runId };
    if (idleTimer.current) clearTimeout(idleTimer.current);
    patch(next.videoId, { status: 'running', stage: 'processing', progress: 0.06 });

    const job: EngineJob = {
      id: runId,
      url: next.url,
      start: next.start ?? null,
      end: next.end ?? null,
    };
    webRef.current?.injectJavaScript(`window.__talantaAnalyze(${JSON.stringify(job)}); true;`);
  }, [patch, scheduleRelease]);

  const finishActive = useCallback(() => {
    active.current = null;
    setTimeout(runNext, 50);
  }, [runNext]);

  const onMessage = useCallback(async (event: { nativeEvent: { data: string } }) => {
    let msg: EngineMessage;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }

    if (msg.type === 'ready') {
      engineReadyRef.current = true;
      setEngineReady(true);
      runNext();
      return;
    }
    if (msg.type === 'fatal') {
      engineReadyRef.current = false;
      const failing = [active.current, ...queue.current].filter(Boolean) as StartOptions[];
      queue.current = [];
      active.current = null;
      failing.forEach((o) => patch(o.videoId, { status: 'error', error: friendlyError(msg.message, 'analysis') }));
      setMounted(false);
      return;
    }

    const current = active.current;
    if (!current || msg.id !== current.runId) return;
    const vid = current.videoId;

    if (msg.type === 'progress') {
      patch(vid, { stage: msg.stage, progress: msg.progress, current: msg.current, total: msg.total });
    } else if (msg.type === 'done') {
      patch(vid, { status: 'saving', stage: 'generating', progress: 0.98, result: msg.result });
      try {
        await persistResult(current, msg.result);
        patch(vid, { status: 'done', stage: 'done', progress: 1 });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (e) {
        patch(vid, { status: 'error', error: friendlyError(e, 'save') });
      }
      finishActive();
    } else if (msg.type === 'error') {
      patch(vid, { status: 'error', error: friendlyError(msg.message, 'analysis') });
      finishActive();
    }
  }, [finishActive, patch, runNext]);

  const prewarm = useCallback(() => {
    setMounted(true);
    scheduleRelease();
  }, [scheduleRelease]);

  const start = useCallback((o: StartOptions) => {
    const existing = jobsRef.current[o.videoId];
    if (existing && (existing.status === 'queued' || existing.status === 'running' || existing.status === 'saving')) return;
    if (active.current?.videoId === o.videoId || queue.current.some((q) => q.videoId === o.videoId)) return;
    setJobs((prev) => ({
      ...prev,
      [o.videoId]: { videoId: o.videoId, title: o.title, status: 'queued', stage: 'preparing', progress: 0.01, startedAt: Date.now() },
    }));
    queue.current.push(o);
    setMounted(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    runNext();

    setTimeout(() => {
      if (engineReadyRef.current || !queue.current.some((q) => q.videoId === o.videoId)) return;
      queue.current = queue.current.filter((q) => q.videoId !== o.videoId);
      patch(o.videoId, { status: 'error', error: friendlyError('network timeout', 'analysis') });
      if (!active.current && queue.current.length === 0) setMounted(false);
    }, ENGINE_LOAD_TIMEOUT_MS);
  }, [patch, runNext]);

  const cancel = useCallback((videoId: string) => {
    queue.current = queue.current.filter((q) => q.videoId !== videoId);
    if (active.current?.videoId === videoId) {
      webRef.current?.injectJavaScript(`window.__talantaCancel(${JSON.stringify(active.current.runId)}); true;`);
      active.current = null;
      setTimeout(runNext, 50);
    }
    setJobs((prev) => { const n = { ...prev }; delete n[videoId]; return n; });
  }, [runNext]);

  const dismiss = useCallback((videoId: string) => {
    setJobs((prev) => {
      const j = prev[videoId];
      if (!j || j.status === 'running' || j.status === 'queued' || j.status === 'saving') return prev;
      const n = { ...prev }; delete n[videoId]; return n;
    });
  }, []);

  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  const value = useMemo(() => ({ jobs, start, cancel, dismiss, prewarm, engineReady }), [jobs, start, cancel, dismiss, prewarm, engineReady]);

  return (
    <AnalysisContext.Provider value={value}>
      {children}
      {mounted && (
        <View style={styles.engine} pointerEvents="none">
          <WebView
            ref={webRef}
            source={{ html }}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            mixedContentMode="always"
            cacheEnabled
            cacheMode="LOAD_DEFAULT"
            androidLayerType="hardware"
            onContentProcessDidTerminate={() => onMessage({ nativeEvent: { data: JSON.stringify({ type: 'fatal', message: 'The AI engine stopped unexpectedly' }) } })}
            onRenderProcessGone={() => onMessage({ nativeEvent: { data: JSON.stringify({ type: 'fatal', message: 'The AI engine stopped unexpectedly' }) } })}
            onError={(e) => onMessage({ nativeEvent: { data: JSON.stringify({ type: 'fatal', message: e.nativeEvent.description || 'network' }) } })}
          />
        </View>
      )}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error('useAnalysis must be used inside AnalysisProvider');
  return ctx;
}

export function useAnalysisJob(videoId?: string | null) {
  const { jobs } = useAnalysis();
  return videoId ? jobs[videoId] : undefined;
}

const styles = StyleSheet.create({
  // Kept on-screen (but invisible) so Android does not throttle the WebView.
  engine: { position: 'absolute', left: 0, bottom: 0, width: 4, height: 4, opacity: 0.01 },
});
