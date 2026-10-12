import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform, TurboModuleRegistry, NativeModules } from 'react-native';
import { logActivity } from './activityLog';
import { getAccessToken, getCurrentUserId, getMyPlayerProfile } from './session';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';
import { hasExtendedColumns, isMissingColumn, saveVideoMeta, storagePathFromUrl, type VideoRow } from './videoMeta';

export const BUCKET = 'player-videos';
/** Supabase's default per-object upload limit. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/**
 * Clips above this size or resolution are re-encoded to 720p H.264 before
 * upload. Re-encoding also converts HEVC phone recordings, which many Android
 * WebViews (and so the AI engine) cannot decode.
 */
const COMPRESS_ABOVE_BYTES = 8 * 1024 * 1024;
const COMPRESS_ABOVE_PX = 1280;

const SUPPORTED_EXT = ['mp4', 'mov', 'm4v', '3gp', 'webm', 'mkv'];

export type PickedVideo = {
  uri: string;
  duration: number; // seconds
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
  fileName?: string;
};

export class PermissionDeniedError extends Error {
  constructor(public kind: 'library' | 'camera', public canAskAgain: boolean) {
    super(kind === 'camera' ? 'Camera permission denied' : 'Gallery permission denied');
  }
}

export class UploadCancelledError extends Error {
  constructor() { super('Upload cancelled'); }
}

// ───────────────────────── Picking ─────────────────────────

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedVideo {
  return {
    uri: asset.uri,
    // expo-image-picker reports milliseconds
    duration: asset.duration ? asset.duration / 1000 : 0,
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize ?? undefined,
    mimeType: asset.mimeType ?? undefined,
    fileName: asset.fileName ?? undefined,
  };
}

/**
 * Opens the phone's video gallery. Android 13+ and iOS 14+ use the system
 * photo picker, which needs no permission; older Android needs storage access.
 */
export async function pickVideoFromGallery(): Promise<PickedVideo | null> {
  // The system photo picker (Android 13+, iOS) needs no permission. Only older
  // Android versions read the gallery through storage permission.
  const needsPermission = Platform.OS === 'android' && Number(Platform.Version) < 33;
  if (needsPermission) await ensureLibraryPermission();

  return launchLibrary();
}

async function ensureLibraryPermission() {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!current.granted && current.accessPrivileges !== 'limited') {
    const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!req.granted && req.accessPrivileges !== 'limited') {
      throw new PermissionDeniedError('library', req.canAskAgain);
    }
  }
}

async function launchLibrary(): Promise<PickedVideo | null> {
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 1,
      // iOS hands back an already-compressed 720p H.264 file, which uploads much faster.
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
  } catch (e: any) {
    // Some devices still route through the permission-based picker.
    if (/permission/i.test(e?.message ?? '')) {
      await ensureLibraryPermission();
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    } else {
      throw e;
    }
  }
  if (result.canceled || !result.assets?.length) return null;
  return toPicked(result.assets[0]);
}

export async function recordVideo(): Promise<PickedVideo | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new PermissionDeniedError('camera', perm.canAskAgain);

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: 120,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame1280x720,
  });
  if (result.canceled || !result.assets?.length) return null;
  return toPicked(result.assets[0]);
}

export function extensionOf(video: PickedVideo) {
  const fromName = video.fileName?.split('.').pop()?.toLowerCase();
  const fromUri = video.uri.split('?')[0].split('.').pop()?.toLowerCase();
  const fromMime = video.mimeType?.split('/')[1]?.replace('quicktime', 'mov');
  return [fromName, fromUri, fromMime].find((e) => e && SUPPORTED_EXT.includes(e)) ?? null;
}

export function contentTypeFor(ext: string) {
  switch (ext) {
    case 'mov': return 'video/quicktime';
    case 'webm': return 'video/webm';
    case 'mkv': return 'video/x-matroska';
    case '3gp': return 'video/3gpp';
    case 'm4v': return 'video/x-m4v';
    default: return 'video/mp4';
  }
}

/** Fills in the file size when the picker did not provide it. */
export async function withFileSize(video: PickedVideo): Promise<PickedVideo> {
  if (video.fileSize) return video;
  try {
    const info = await FileSystem.getInfoAsync(video.uri);
    return { ...video, fileSize: info.exists ? (info as any).size : undefined };
  } catch {
    return video;
  }
}

/** Returns a reason the video cannot be used, or null if it is fine. */
export function validateVideo(video: PickedVideo): string | null {
  if (!extensionOf(video)) return 'This video format is not supported. Please choose an MP4 or MOV video.';
  if (video.duration > 0 && video.duration < 2) return 'This clip is too short. Choose a video that is at least 2 seconds long.';
  if (video.duration > 15 * 60) return 'This video is longer than 15 minutes. Please choose a shorter clip.';
  return null;
}

// ───────────────────────── Compression ─────────────────────────

export function isCompressorAvailable() {
  try {
    return !!(TurboModuleRegistry.get('Compressor') ?? (NativeModules as any).Compressor);
  } catch {
    return false;
  }
}

export function needsCompression(video: PickedVideo) {
  const longSide = Math.max(video.width ?? 0, video.height ?? 0);
  return (video.fileSize ?? 0) > COMPRESS_ABOVE_BYTES || longSide > COMPRESS_ABOVE_PX;
}

/**
 * Re-encodes to 720p H.264 (~3.5 Mbps). MediaPipe works on 256px frames, so
 * this keeps everything the AI needs while cutting file size several times.
 */
export async function compressVideo(
  video: PickedVideo,
  onProgress: (p: number) => void,
  registerCancel: (cancel: () => void) => void,
): Promise<{ uri: string; size?: number }> {
  if (!isCompressorAvailable()) return { uri: video.uri, size: video.fileSize };

  const free = await FileSystem.getFreeDiskStorageAsync().catch(() => Number.MAX_SAFE_INTEGER);
  if (video.fileSize && free < video.fileSize * 1.2) throw new Error('No space left on device');

  // Required lazily: the module throws at import time if the native side is missing.
  const { Video } = require('react-native-compressor') as typeof import('react-native-compressor');
  let cancelId: string | null = null;
  registerCancel(() => { if (cancelId) Video.cancelCompression(cancelId); });

  const out = await Video.compress(
    video.uri,
    {
      compressionMethod: 'manual',
      maxSize: 1280,
      bitrate: 3_500_000,
      minimumFileSizeForCompress: 0,
      progressDivider: 2,
      getCancellationId: (id) => { cancelId = id; },
    },
    (p) => onProgress(Math.max(0, Math.min(1, p))),
  );
  const uri = out.startsWith('file://') || out.startsWith('content://') ? out : `file://${out}`;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  const size = info && info.exists ? (info as any).size : undefined;
  // Keep the original if re-encoding did not actually help.
  if (size && video.fileSize && size >= video.fileSize) return { uri: video.uri, size: video.fileSize };
  return { uri, size };
}

// ───────────────────────── Thumbnails ─────────────────────────

export async function createThumbnail(uri: string, atSeconds = 0.5): Promise<string | null> {
  try {
    const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.max(0, Math.round(atSeconds * 1000)), quality: 0.7 });
    return thumb;
  } catch {
    if (atSeconds > 0) {
      try {
        return (await VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.7 })).uri;
      } catch { /* fall through */ }
    }
    return null;
  }
}

// ───────────────────────── Uploading ─────────────────────────

export function publicUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Streams a file from disk to Supabase Storage with progress. Unlike
 * `supabase.storage.upload`, the file never passes through JS memory.
 */
export async function uploadFile(
  fileUri: string,
  path: string,
  contentType: string,
  onProgress: (sent: number, total: number) => void,
  registerCancel: (cancel: () => void) => void,
): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  let cancelled = false;
  const task = FileSystem.createUploadTask(
    `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`,
    fileUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': contentType,
        'x-upsert': 'false',
        'cache-control': 'max-age=31536000',
      },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => onProgress(totalBytesSent, totalBytesExpectedToSend),
  );
  registerCancel(() => { cancelled = true; task.cancelAsync().catch(() => {}); });

  let res: FileSystem.FileSystemUploadResult | null | undefined;
  try {
    res = await task.uploadAsync();
  } catch (e) {
    if (cancelled) throw new UploadCancelledError();
    throw e;
  }
  if (cancelled || !res) throw new UploadCancelledError();
  if (res.status < 200 || res.status >= 300) {
    let message = `Upload failed (${res.status})`;
    try { message = JSON.parse(res.body)?.message || message; } catch { /* keep default */ }
    if (res.status === 413) message = 'Payload too large';
    throw new Error(message);
  }
  return publicUrl(path);
}

export type UploadStage = 'preparing' | 'compressing' | 'uploading' | 'thumbnail' | 'saving' | 'done';

export type UploadOptions = {
  video: PickedVideo;
  title: string;
  trimStart?: number | null;
  trimEnd?: number | null;
  onStage: (stage: UploadStage) => void;
  onProgress: (fraction: number | null, detail?: string) => void;
  /** Called with a function that cancels whatever step is running. */
  registerCancel: (cancel: () => void) => void;
  isCancelled: () => boolean;
};

export type UploadResult = { video: VideoRow; localUri: string; thumbnailLocal: string | null };

/** Prepare → compress → thumbnail → upload → save the row. */
export async function uploadPlayerVideo(o: UploadOptions): Promise<UploadResult> {
  const check = () => { if (o.isCancelled()) throw new UploadCancelledError(); };

  o.onStage('preparing');
  o.onProgress(null);
  const [userId, player] = await Promise.all([getCurrentUserId(), getMyPlayerProfile()]);
  if (!userId) throw new Error('Not authenticated');
  if (!player) throw new Error('Player profile not found');
  let video = await withFileSize(o.video);
  check();

  let fileUri = video.uri;
  let size = video.fileSize;
  if (needsCompression(video) && isCompressorAvailable()) {
    o.onStage('compressing');
    o.onProgress(0);
    const out = await compressVideo(video, (p) => o.onProgress(p), o.registerCancel);
    fileUri = out.uri;
    size = out.size ?? size;
    check();
  }
  if (size && size > MAX_UPLOAD_BYTES) {
    throw new Error(`This video is too large (${Math.round(size / 1048576)} MB).`);
  }

  const ext = fileUri === video.uri ? (extensionOf(video) ?? 'mp4') : 'mp4';
  const stamp = Date.now();
  const videoPath = `${userId}_${stamp}.${ext}`;

  // Generate the thumbnail locally from the section the player chose.
  o.onStage('thumbnail');
  const thumbLocal = await createThumbnail(fileUri, (o.trimStart ?? 0) + 0.5);
  check();

  o.onStage('uploading');
  o.onProgress(0);
  const videoUrl = await uploadFile(fileUri, videoPath, contentTypeFor(ext), (sent, total) => {
    const t = total || size || 1;
    o.onProgress(Math.min(1, sent / t), `${(sent / 1048576).toFixed(1)} of ${(t / 1048576).toFixed(1)} MB`);
  }, o.registerCancel);
  check();

  let thumbnailUrl: string | null = null;
  if (thumbLocal) {
    try {
      thumbnailUrl = await uploadFile(thumbLocal, `${userId}_${stamp}_thumb.jpg`, 'image/jpeg', () => {}, () => {});
    } catch { /* a missing thumbnail must not fail the upload */ }
  }

  o.onStage('saving');
  o.onProgress(null);
  const base = { player_id: player.id, title: o.title.trim() || 'Highlight video', video_url: videoUrl, thumbnail_url: thumbnailUrl };
  const extended = {
    duration: video.duration || null,
    trim_start: o.trimStart ?? null,
    trim_end: o.trimEnd ?? null,
    file_size: size ?? null,
  };

  let row: VideoRow | null = null;
  if (await hasExtendedColumns()) {
    const { data, error } = await supabase.from('videos').insert({ ...base, ...extended }).select('*').single();
    if (!error) row = data as VideoRow;
    else if (!isMissingColumn(error)) throw error;
  }
  if (!row) {
    const { data, error } = await supabase.from('videos').insert(base).select('*').single();
    if (error) {
      // Do not leave an orphaned file behind.
      await supabase.storage.from(BUCKET).remove([videoPath]).catch(() => {});
      throw error;
    }
    row = data as VideoRow;
    await saveVideoMeta(row.id, { duration: extended.duration, trimStart: extended.trim_start, trimEnd: extended.trim_end, fileSize: extended.file_size });
  }

  void logActivity('video_upload', `Uploaded "${base.title}"`);
  o.onStage('done');
  o.onProgress(1);
  return { video: row, localUri: fileUri, thumbnailLocal: thumbLocal };
}

// ───────────────────────── Library actions ─────────────────────────

export async function renameVideo(id: string, title: string) {
  const { error } = await supabase.from('videos').update({ title: title.trim() }).eq('id', id);
  if (error) throw error;
}

/** Removes the analysis, the row and the stored files. */
export async function deleteVideo(video: Pick<VideoRow, 'id' | 'video_url' | 'thumbnail_url' | 'title'>) {
  await supabase.from('video_analysis').delete().eq('video_id', video.id);
  const { error } = await supabase.from('videos').delete().eq('id', video.id);
  if (error) throw error;
  const paths = [storagePathFromUrl(video.video_url), storagePathFromUrl(video.thumbnail_url)].filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
  void logActivity('video_delete', `Deleted "${video.title}"`);
}

const backfilling = new Set<string>();

/**
 * Older uploads have no thumbnail. Generate one from the remote file once,
 * upload it, and store the URL so every device benefits afterwards.
 */
export async function backfillThumbnail(video: VideoRow): Promise<string | null> {
  if (video.thumbnail_url || backfilling.has(video.id)) return video.thumbnail_url ?? null;
  backfilling.add(video.id);
  try {
    const local = await createThumbnail(video.video_url, (video.trim_start ?? 0) + 0.5);
    if (!local) return null;
    const userId = await getCurrentUserId();
    const path = `${userId}_${Date.now()}_thumb.jpg`;
    const url = await uploadFile(local, path, 'image/jpeg', () => {}, () => {});
    const { error } = await supabase.from('videos').update({ thumbnail_url: url }).eq('id', video.id);
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      return local;
    }
    return url;
  } catch {
    return null;
  } finally {
    backfilling.delete(video.id);
  }
}

export const platformPickerNote = Platform.OS === 'android'
  ? 'Your videos open in the Android photo picker.'
  : 'Your videos open in the Photos picker.';
