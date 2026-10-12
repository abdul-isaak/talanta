import AppHeader from '@/components/ui/AppHeader';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import Skeleton from '@/components/ui/Skeleton';
import StateView from '@/components/ui/StateView';
import VideoPlayerModal from '@/components/video/VideoPlayerModal';
import VideoThumb from '@/components/video/VideoThumb';
import { C, R, S, T } from '@/constants/ui';
import { getLocalAnalysisExtra, useAnalysis, useAnalysisJob } from '@/lib/analysis/AnalysisProvider';
import { friendlyError } from '@/lib/errors';
import { METRIC_INFO, METRIC_KEYS, ratingColor, ratingLabel, STAGE_LABEL, STAGE_ORDER, type AnalysisResult } from '@/lib/poseAnalysis';
import { getMyPlayerProfile } from '@/lib/session';
import { fetchVideo, formatDuration, type VideoWithMeta } from '@/lib/videoMeta';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AnalyzeVideoScreen() {
  const router = useRouter();
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const id = String(videoId);
  const analysis = useAnalysis();
  const job = useAnalysisJob(id);

  const [video, setVideo] = useState<VideoWithMeta | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [v, me] = await Promise.all([fetchVideo(id), getMyPlayerProfile().catch(() => null)]);
      if (!v) { setLoadError('This video no longer exists.'); return; }
      setVideo(v);
      setIsOwner(!!me && me.id === v.player_id);
      if (v.analysis) {
        const extra = await getLocalAnalysisExtra(id);
        setResult({ ...(extra ?? {}), ...v.analysis });
      } else {
        setResult(null);
      }
      setLoadError(null);
    } catch (e) {
      setLoadError(friendlyError(e, 'load'));
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Warm the model while the player reads the screen.
  useEffect(() => {
    if (loaded && isOwner && !result) analysis.prewarm();
  }, [loaded, isOwner, result, analysis]);

  // When a background job finishes, show its result immediately.
  useEffect(() => {
    if (job?.status === 'done' && job.result) {
      setResult(job.result);
      load();
    }
  }, [job?.status, job?.result, load]);

  const running = job && (job.status === 'queued' || job.status === 'running' || job.status === 'saving');

  const start = () => {
    if (!video) return;
    analysis.start({
      videoId: video.id,
      playerId: video.player_id,
      title: video.title,
      url: video.video_url,
      start: video.meta.trimStart,
      end: video.meta.trimEnd,
    });
  };

  const reanalyze = () => {
    Alert.alert('Re-analyze video?', 'The current report will be replaced with a new one.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Re-analyze', onPress: () => { analysis.dismiss(id); setResult(null); start(); } },
    ]);
  };

  const body = () => {
    if (!loaded) {
      return (
        <View style={{ gap: 14 }}>
          <Skeleton height={190} radius={R.lg} />
          <Skeleton height={130} radius={R.lg} />
          <Skeleton height={220} radius={R.lg} />
        </View>
      );
    }
    if (loadError || !video) {
      return <StateView icon="alert-circle-outline" tone="error" title="Couldn’t open this video" message={loadError ?? undefined} actions={[{ title: 'Try again', icon: 'refresh', onPress: load }]} />;
    }

    const videoCard = (
      <View style={styles.videoCard}>
        <VideoThumb uri={video.thumbnail_url} duration={video.meta.duration} style={{ width: 120 }} compact />
        <View style={{ flex: 1 }}>
          <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
          <Text style={styles.videoMeta}>
            {video.meta.trimStart != null || video.meta.trimEnd != null
              ? `Section ${formatDuration(video.meta.trimStart ?? 0)}–${formatDuration(video.meta.trimEnd ?? video.meta.duration)}`
              : 'Full video'}
          </Text>
          <Button title="Watch" icon="play" small variant="secondary" onPress={() => setPlaying(true)} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        </View>
      </View>
    );

    if (running && job) return <>{videoCard}<RunningView job={job} onCancel={() => analysis.cancel(id)} /></>;

    if (job?.status === 'error' && !result) {
      return (
        <>
          {videoCard}
          <View style={styles.card}>
            <StateView
              icon="alert-circle-outline"
              tone="error"
              title="Analysis didn’t finish"
              message={job.error}
              compact
              actions={[
                { title: 'Try again', icon: 'refresh', onPress: () => { analysis.dismiss(id); start(); } },
                ...(isOwner ? [{ title: 'Choose a clearer section', onPress: () => router.push({ pathname: '/edit-video' as any, params: { videoId: id } }), variant: 'secondary' as const }] : []),
              ]}
            />
          </View>
        </>
      );
    }

    if (result) {
      return (
        <>
          {videoCard}
          <ResultsView result={result} />
          {isOwner && (
            <View style={{ gap: 10, marginTop: S.sm }}>
              <Button title="Re-analyze" icon="refresh" variant="secondary" onPress={reanalyze} />
              <Button title="Change analyzed section" icon="cut-outline" variant="ghost" onPress={() => router.push({ pathname: '/edit-video' as any, params: { videoId: id } })} />
            </View>
          )}
        </>
      );
    }

    return (
      <>
        {videoCard}
        <View style={styles.card}>
          <View style={styles.introIcon}><Ionicons name="sparkles" size={26} color={C.primary} /></View>
          <Text style={styles.introTitle}>AI performance analysis</Text>
          <Text style={styles.introText}>
            Google MediaPipe finds 33 body points in each sampled frame. Talanta measures how they move to score your speed,
            agility, jump, work rate, balance and body symmetry.
          </Text>
          <View style={styles.introRow}><Ionicons name="time-outline" size={15} color={C.muted} /><Text style={styles.introSmall}>Usually under a minute. It keeps running if you leave this screen.</Text></View>
          <View style={styles.introRow}><Ionicons name="cut-outline" size={15} color={C.muted} /><Text style={styles.introSmall}>Trim long videos to the key 10–30 seconds for the most detailed results.</Text></View>
        </View>
        {isOwner ? (
          <>
            <Button title="Analyze with AI" icon="sparkles" onPress={start} />
            <Button title="Trim section first" icon="cut-outline" variant="ghost" onPress={() => router.push({ pathname: '/edit-video' as any, params: { videoId: id } })} style={{ marginTop: 6 }} />
          </>
        ) : (
          <Text style={styles.introSmall}>This player has not analyzed this video yet.</Text>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader title="AI Analysis" subtitle={video?.title} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {body()}
      </ScrollView>
      <VideoPlayerModal
        video={playing ? video : null}
        onClose={() => setPlaying(false)}
        subtitle={result ? `AI rating ${Number(result.overall_rating).toFixed(1)}` : undefined}
      />
    </SafeAreaView>
  );
}

function RunningView({ job, onCancel }: { job: NonNullable<ReturnType<typeof useAnalysisJob>>; onCancel: () => void }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const currentIndex = job.status === 'queued' ? 0 : STAGE_ORDER.indexOf(job.stage);
  const pct = Math.round(job.progress * 100);

  return (
    <View style={styles.card}>
      <View style={styles.runHead}>
        <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
          <Ionicons name="sync" size={22} color={C.primary} />
        </Animated.View>
        <Text style={styles.runTitle}>{job.status === 'queued' ? 'Waiting for the AI…' : `${STAGE_LABEL[job.stage]}…`}</Text>
        <Text style={styles.runPct}>{pct}%</Text>
      </View>
      <ProgressBar value={job.progress} height={10} />
      {!!job.total && job.status === 'running' && (job.stage === 'detecting' || job.stage === 'tracking') && (
        <Text style={styles.frames}>Frame {job.current} of {job.total}</Text>
      )}

      <View style={{ gap: 11, marginTop: S.lg }}>
        {STAGE_ORDER.map((s, i) => {
          const done = i < currentIndex || job.status === 'saving' && i < STAGE_ORDER.length - 1;
          const current = i === currentIndex && job.status !== 'saving';
          return (
            <View key={s} style={styles.stageRow}>
              <View style={[styles.stageDot, done && styles.stageDone, current && styles.stageCurrent]}>
                {done && <Ionicons name="checkmark" size={12} color={C.onPrimary} />}
              </View>
              <Text style={[styles.stageText, (done || current) && { color: C.text }, current && { fontWeight: '700' }]}>{STAGE_LABEL[s]}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.leaveNote}>
        <Ionicons name="information-circle-outline" size={16} color={C.muted} />
        <Text style={styles.leaveText}>You can leave this screen — the analysis keeps running and your report is saved automatically.</Text>
      </View>
      <Button title="Cancel analysis" variant="ghost" onPress={onCancel} />
    </View>
  );
}

function ResultsView({ result }: { result: AnalysisResult }) {
  const overall = Number(result.overall_rating);
  const color = ratingColor(overall);
  const confidence = Number(result.detection_confidence);
  const detectedPct = result.frames_analyzed ? Math.round((result.frames_with_detection / result.frames_analyzed) * 100) : 0;
  const notes = String(result.analysis_notes || '')
    .split(/\.\s+/)
    .map((n) => n.trim())
    .filter((n) => n && !/^Analysis based on/.test(n))
    .map((n) => (n.endsWith('.') ? n : `${n}.`));
  const estimates = [
    result.est_top_speed_kmh != null && { icon: 'speedometer-outline', label: 'Top speed', value: `${result.est_top_speed_kmh}`, unit: 'km/h' },
    result.est_distance_m != null && { icon: 'footsteps-outline', label: 'Distance', value: `${result.est_distance_m}`, unit: 'm' },
    result.est_jump_cm != null && { icon: 'arrow-up-circle-outline', label: 'Jump height', value: `${result.est_jump_cm}`, unit: 'cm' },
  ].filter(Boolean) as { icon: any; label: string; value: string; unit: string }[];

  return (
    <>
      <View style={styles.completeRow}>
        <Ionicons name="checkmark-circle" size={18} color={C.primary} />
        <Text style={styles.completeText}>Analysis complete</Text>
      </View>

      <View style={[styles.overall, { borderColor: color }]}>
        <View style={[styles.ring, { borderColor: color }]}>
          <Text style={[styles.ringScore, { color }]}>{overall.toFixed(0)}</Text>
          <Text style={styles.ringLabel}>/ 100</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.overallLabel}>OVERALL RATING</Text>
          <Text style={[styles.overallGrade, { color }]}>{ratingLabel(overall)}</Text>
          <Text style={styles.overallSub}>{confidence.toFixed(0)}% detection confidence</Text>
        </View>
      </View>

      {estimates.length > 0 && (
        <>
          <Text style={styles.section}>PLAYER PERFORMANCE</Text>
          <View style={styles.estRow}>
            {estimates.map((e) => (
              <View key={e.label} style={styles.estTile}>
                <Ionicons name={e.icon} size={18} color={C.primary} />
                <Text style={styles.estValue}>{e.value}<Text style={styles.estUnit}> {e.unit}</Text></Text>
                <Text style={styles.estLabel}>{e.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.estNote}>Estimates assume a mostly still camera and an average body size.</Text>
        </>
      )}

      <Text style={styles.section}>SCORES</Text>
      <View style={styles.grid}>
        {METRIC_KEYS.map((key) => {
          const info = METRIC_INFO[key];
          const value = Number(result[key]);
          const c = ratingColor(value);
          return (
            <View key={key} style={styles.metric}>
              <View style={styles.metricHead}>
                <View style={[styles.metricIcon, { backgroundColor: c + '22' }]}>
                  <Ionicons name={info.ion as any} size={15} color={c} />
                </View>
                <Text style={[styles.metricValue, { color: c }]}>{value.toFixed(0)}</Text>
              </View>
              <Text style={styles.metricLabel}>{info.label}</Text>
              <View style={styles.barBg}><View style={[styles.barFill, { width: `${Math.max(2, value)}%`, backgroundColor: c }]} /></View>
              <Text style={styles.metricDesc} numberOfLines={2}>{info.desc}</Text>
            </View>
          );
        })}
      </View>

      {notes.length > 0 && (
        <>
          <Text style={styles.section}>AI OBSERVATIONS</Text>
          <View style={styles.card}>
            {notes.map((n) => (
              <View key={n} style={styles.noteRow}>
                <Ionicons name="football-outline" size={14} color={C.primary} style={{ marginTop: 2 }} />
                <Text style={styles.noteText}>{n}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.section}>RELIABILITY</Text>
      <View style={styles.card}>
        <Row label="Detection confidence" value={`${confidence.toFixed(1)}%`} highlight />
        <Row label="Frames sampled" value={String(result.frames_analyzed)} />
        <Row label="Player detected in" value={`${result.frames_with_detection} frames (${detectedPct}%)`} />
        {result.analyzed_seconds != null && <Row label="Section analyzed" value={`${result.analyzed_seconds}s`} />}
        <Row label="Body landmarks per frame" value="33" last />
        <Text style={styles.footnote}>Powered by Google MediaPipe Pose Landmarker. Ball touches and passing accuracy are not measured by the current model.</Text>
      </View>
    </>
  );
}

function Row({ label, value, highlight, last }: { label: string; value: string; highlight?: boolean; last?: boolean }) {
  return (
    <View style={[styles.relRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.relLabel}>{label}</Text>
      <Text style={[styles.relValue, highlight && { color: C.primary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: S.lg, paddingBottom: 60 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, borderWidth: 1, borderColor: C.border },
  videoCard: { flexDirection: 'row', gap: S.md, alignItems: 'center', backgroundColor: C.surfaceAlt, borderRadius: R.lg, padding: 10, marginBottom: S.md },
  videoTitle: { color: C.text, fontSize: T.body, fontWeight: '700' },
  videoMeta: { color: C.muted, fontSize: T.caption, marginTop: 3 },

  introIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: S.md },
  introTitle: { color: C.text, fontSize: T.title, fontWeight: '800', marginBottom: 6 },
  introText: { color: C.textSoft, fontSize: T.body, lineHeight: 20, marginBottom: S.md },
  introRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 6 },
  introSmall: { color: C.muted, fontSize: T.small, lineHeight: 17, flex: 1 },

  runHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: S.md },
  runTitle: { flex: 1, color: C.text, fontSize: T.bodyLg, fontWeight: '800' },
  runPct: { color: C.primary, fontSize: T.bodyLg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  frames: { color: C.muted, fontSize: T.caption, marginTop: 6 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  stageDone: { backgroundColor: C.primary, borderColor: C.primary },
  stageCurrent: { borderColor: C.primary },
  stageText: { color: C.muted, fontSize: T.body },
  leaveNote: { flexDirection: 'row', gap: 8, marginTop: S.lg, padding: S.md, backgroundColor: C.surfaceAlt, borderRadius: R.md },
  leaveText: { flex: 1, color: C.muted, fontSize: T.small, lineHeight: 17 },

  completeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: S.sm },
  completeText: { color: C.primary, fontSize: T.body, fontWeight: '800' },
  overall: { flexDirection: 'row', alignItems: 'center', gap: S.lg, backgroundColor: C.surfaceAlt, borderRadius: R.xl, padding: S.lg, borderWidth: 1.5, marginBottom: S.md },
  ring: { width: 96, height: 96, borderRadius: 48, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontSize: 34, fontWeight: '900', lineHeight: 38 },
  ringLabel: { color: C.muted, fontSize: 10, fontWeight: '700' },
  overallLabel: { color: C.muted, fontSize: T.caption, fontWeight: '800', letterSpacing: 1 },
  overallGrade: { fontSize: T.h2, fontWeight: '900', marginTop: 2 },
  overallSub: { color: C.muted, fontSize: T.small, marginTop: 4 },

  section: { color: C.muted, fontSize: T.caption, fontWeight: '800', letterSpacing: 1, marginTop: S.md, marginBottom: S.sm },
  estRow: { flexDirection: 'row', gap: 8 },
  estTile: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border, gap: 4 },
  estValue: { color: C.text, fontSize: T.h2, fontWeight: '800' },
  estUnit: { color: C.muted, fontSize: T.small, fontWeight: '600' },
  estLabel: { color: C.muted, fontSize: T.caption },
  estNote: { color: C.dim, fontSize: T.caption, marginTop: 6 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '47%', flexGrow: 1, backgroundColor: C.surface, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.border },
  metricHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: T.h2, fontWeight: '900' },
  metricLabel: { color: C.text, fontSize: T.small, fontWeight: '700', marginTop: 8 },
  barBg: { height: 5, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden', marginTop: 6 },
  barFill: { height: 5, borderRadius: 3 },
  metricDesc: { color: C.muted, fontSize: 10.5, marginTop: 6, lineHeight: 14 },

  noteRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  noteText: { flex: 1, color: C.textSoft, fontSize: T.body, lineHeight: 20 },
  relRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  relLabel: { color: C.muted, fontSize: T.small },
  relValue: { color: C.text, fontSize: T.small, fontWeight: '700' },
  footnote: { color: C.dim, fontSize: T.caption, marginTop: S.md, lineHeight: 16 },
});
