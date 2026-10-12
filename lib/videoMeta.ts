import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Video records and their extra metadata (duration, trimmed section).
 *
 * The `videos` table already has `thumbnail_url`. `duration`, `trim_start`,
 * `trim_end` and `file_size` are added by
 * supabase/migrations/20261007_video_metadata.sql. Until that migration is
 * applied, the same values are kept on the device so the app keeps working.
 */
export type VideoRow = {
  id: string;
  player_id: string;
  title: string;
  video_url: string;
  thumbnail_url?: string | null;
  created_at: string;
  analysis_status?: string | null;
  duration?: number | null;
  trim_start?: number | null;
  trim_end?: number | null;
  file_size?: number | null;
  video_analysis?: any[] | null;
};

export type VideoMeta = { duration?: number | null; trimStart?: number | null; trimEnd?: number | null; fileSize?: number | null };

const LOCAL_KEY = 'talanta.videoMeta.v1';
let localCache: Record<string, VideoMeta> | null = null;
let extendedSupported: boolean | null = null;

async function loadLocal(): Promise<Record<string, VideoMeta>> {
  if (localCache) return localCache;
  try {
    localCache = JSON.parse((await AsyncStorage.getItem(LOCAL_KEY)) || '{}');
  } catch {
    localCache = {};
  }
  return localCache!;
}

async function saveLocal(id: string, meta: VideoMeta) {
  const all = await loadLocal();
  all[id] = { ...all[id], ...meta };
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(all)).catch(() => {});
}

export function isMissingColumn(error: any) {
  const code = error?.code;
  return code === '42703' || code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(error?.message ?? '');
}

/** Whether the optional metadata columns exist (checked once per session). */
export async function hasExtendedColumns(): Promise<boolean> {
  if (extendedSupported !== null) return extendedSupported;
  const { error } = await supabase.from('videos').select('duration,trim_start,trim_end,file_size').limit(0);
  extendedSupported = !error;
  return extendedSupported;
}

export function metaFor(video: VideoRow, local?: VideoMeta): Required<VideoMeta> {
  return {
    duration: video.duration ?? local?.duration ?? null,
    trimStart: video.trim_start ?? local?.trimStart ?? null,
    trimEnd: video.trim_end ?? local?.trimEnd ?? null,
    fileSize: video.file_size ?? local?.fileSize ?? null,
  };
}

export async function getLocalMeta(id: string): Promise<VideoMeta | undefined> {
  return (await loadLocal())[id];
}

/** Stores metadata in the database when possible, otherwise on the device. */
export async function saveVideoMeta(id: string, meta: VideoMeta) {
  if (await hasExtendedColumns()) {
    const patch: Record<string, number | null> = {};
    if (meta.duration !== undefined) patch.duration = meta.duration;
    if (meta.trimStart !== undefined) patch.trim_start = meta.trimStart;
    if (meta.trimEnd !== undefined) patch.trim_end = meta.trimEnd;
    if (meta.fileSize !== undefined) patch.file_size = meta.fileSize;
    const { error } = await supabase.from('videos').update(patch).eq('id', id);
    if (!error) return;
    if (!isMissingColumn(error)) throw error;
    extendedSupported = false;
  }
  await saveLocal(id, meta);
}

export type VideoWithMeta = VideoRow & { meta: Required<VideoMeta>; analysis: any | null };

/** All videos for a player, newest first, with their AI analysis — one request. */
export async function fetchPlayerVideos(playerId: string): Promise<VideoWithMeta[]> {
  const [{ data, error }, local] = await Promise.all([
    supabase
      .from('videos')
      .select('*, video_analysis(*)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),
    loadLocal(),
  ]);
  if (error) throw error;
  return (data || []).map((v: VideoRow) => ({ ...v, meta: metaFor(v, local[v.id]), analysis: latestAnalysis(v) }));
}

function latestAnalysis(v: VideoRow) {
  if (!Array.isArray(v.video_analysis) || v.video_analysis.length === 0) return null;
  return [...v.video_analysis].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
}

export async function fetchVideo(id: string): Promise<VideoWithMeta | null> {
  const [{ data, error }, local] = await Promise.all([
    supabase.from('videos').select('*, video_analysis(*)').eq('id', id).maybeSingle(),
    loadLocal(),
  ]);
  if (error) throw error;
  if (!data) return null;
  const v = data as VideoRow;
  return { ...v, meta: metaFor(v, local[v.id]), analysis: latestAnalysis(v) };
}

export function formatDuration(seconds?: number | null) {
  if (seconds == null || !isFinite(seconds)) return '';
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function formatClock(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function relativeDate(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Uploaded today';
  if (days === 1) return 'Uploaded yesterday';
  if (days < 7) return `Uploaded ${days} days ago`;
  return `Uploaded ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Storage object path inside the bucket, derived from a public URL. */
export function storagePathFromUrl(url?: string | null, bucket = 'player-videos') {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null;
}
