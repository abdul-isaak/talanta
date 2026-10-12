/**
 * Turns low-level errors (network, Supabase, native modules) into messages a
 * player or scout can actually act on.
 */
export type ErrorContext = 'upload' | 'analysis' | 'load' | 'save' | 'delete' | 'picker' | 'playback' | 'compress';

const CONTEXT_FALLBACK: Record<ErrorContext, string> = {
  upload: 'Unable to upload your video. Please try again.',
  analysis: 'The AI could not analyze this video. Please try again.',
  load: 'Unable to load this content. Pull down to refresh or try again.',
  save: 'Your changes could not be saved. Please try again.',
  delete: 'The video could not be deleted. Please try again.',
  picker: 'Unable to open your gallery. Please try again.',
  playback: 'This video could not be played. Check your connection and try again.',
  compress: 'Unable to prepare this video for upload. Try a shorter clip.',
};

export function rawMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err && 'message' in err) return String((err as any).message ?? '');
  return String(err);
}

export function friendlyError(err: unknown, context: ErrorContext): string {
  const msg = rawMessage(err).toLowerCase();

  if (!msg) return CONTEXT_FALLBACK[context];

  if (msg.includes('network request failed') || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timed out') || msg.includes('timeout') || msg.includes('unable to resolve host') || msg.includes('econn')) {
    return context === 'upload'
      ? 'Unable to upload your video. Please check your internet connection and try again.'
      : context === 'analysis'
        ? 'The AI needs an internet connection to load the video and model. Check your connection and try again.'
        : 'You appear to be offline. Check your internet connection and try again.';
  }
  if (msg.includes('exceeded the maximum allowed size') || msg.includes('payload too large') || msg.includes('413') || msg.includes('too large')) {
    return 'This video is too large to upload. Trim it to the important part or record a shorter clip (under 50 MB).';
  }
  if (msg.includes('jwt') || msg.includes('not authenticated') || msg.includes('401') || msg.includes('session')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (msg.includes('row-level security') || msg.includes('permission denied') || msg.includes('403') || msg.includes('unauthorized')) {
    return 'You do not have permission to do that.';
  }
  if (msg.includes('not enough poses') || msg.includes('no player')) {
    return 'The AI could not see a player clearly. Film closer, keep the whole body in frame, use good light, then try again.';
  }
  if (msg.includes('video failed to load') || msg.includes('format') || msg.includes('decode') || msg.includes('src_not_supported')) {
    return context === 'analysis'
      ? 'This video format could not be read by the AI. Re-upload it as an MP4 (H.264) clip and try again.'
      : 'This video format is not supported. Please choose an MP4 or MOV video.';
  }
  if (msg.includes('no space') || msg.includes('enospc') || msg.includes('storage')) {
    return 'Your phone is running out of storage. Free up some space and try again.';
  }
  if (msg.includes('cancel')) return 'Cancelled.';
  return CONTEXT_FALLBACK[context];
}

export function isCancelled(err: unknown) {
  return rawMessage(err).toLowerCase().includes('cancel');
}
