import { C, R, S, T } from '@/constants/ui';
import { formatClock } from '@/lib/videoMeta';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoThumbnail } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

export type TrimRange = { start: number; end: number };

type Props = {
  uri: string;
  /** Known duration in seconds; read from the player when not supplied. */
  duration?: number;
  value: TrimRange | null;
  onChange: (range: TrimRange | null) => void;
};

const MIN_LEN = 2;
const STRIP_FRAMES = 8;
const HANDLE_W = 22;

/**
 * Simple sports-clip trimmer: drag the two handles to choose the section that
 * matters (a sprint, a dribble, a jump). The preview loops that section.
 * Nothing is re-encoded — the chosen times are saved with the video and used
 * by both playback and the AI analysis.
 */
export default function TrimEditor({ uri, duration: knownDuration, value, onChange }: Props) {
  const player = useVideoPlayer({ uri, useCaching: true }, (p) => {
    p.muted = true;
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });

  const [duration, setDuration] = useState(knownDuration || 0);
  const [thumbs, setThumbs] = useState<VideoThumbnail[]>([]);
  const [width, setWidth] = useState(0);

  const range: TrimRange = value ?? { start: 0, end: duration };

  // Read the duration and build the filmstrip once the clip is ready.
  useEffect(() => {
    if (status !== 'readyToPlay') return;
    const d = player.duration || knownDuration || 0;
    if (d && !duration) setDuration(d);
    if (thumbs.length || !d) return;
    const times = Array.from({ length: STRIP_FRAMES }, (_, i) => (d / STRIP_FRAMES) * (i + 0.5));
    // Not available on every platform (e.g. web); the strip then shows plain tiles.
    try {
      player.generateThumbnailsAsync(times, { maxWidth: 160 }).then(setThumbs).catch(() => {});
    } catch { /* unsupported */ }
  }, [status, player, knownDuration, duration, thumbs.length]);

  // Loop playback inside the selected section.
  useEffect(() => {
    const t = time?.currentTime ?? 0;
    if (isPlaying && duration && t >= range.end - 0.05) {
      player.currentTime = range.start;
    }
  }, [time, isPlaying, range.start, range.end, duration, player]);

  const live = useRef({ range, duration, width, onChange });
  useEffect(() => { live.current = { range, duration, width, onChange }; });

  const drag = (which: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { player.pause(); },
      onPanResponderMove: (_, g) => {
        const { range: r, duration: d, width: w } = live.current;
        if (!d || !w) return;
        const base = which === 'start' ? (startAt.current ?? r.start) : (endAt.current ?? r.end);
        if (which === 'start' && startAt.current === null) startAt.current = r.start;
        if (which === 'end' && endAt.current === null) endAt.current = r.end;
        const t = Math.max(0, Math.min(d, base + (g.dx / w) * d));
        const next = which === 'start'
          ? { start: Math.min(t, r.end - MIN_LEN), end: r.end }
          : { start: r.start, end: Math.max(t, r.start + MIN_LEN) };
        next.start = Math.max(0, next.start);
        next.end = Math.min(d, next.end);
        player.currentTime = which === 'start' ? next.start : next.end;
        live.current.onChange(next);
      },
      onPanResponderRelease: () => { startAt.current = null; endAt.current = null; },
      onPanResponderTerminate: () => { startAt.current = null; endAt.current = null; },
    });

  const startAt = useRef<number | null>(null);
  const endAt = useRef<number | null>(null);
  const [startPan] = useState(() => drag('start'));
  const [endPan] = useState(() => drag('end'));

  const toX = (t: number) => (duration ? (t / duration) * width : 0);
  const sel = range.end - range.start;
  const isTrimmed = !!value && (value.start > 0.25 || value.end < duration - 0.25);

  const playSelection = () => {
    if (isPlaying) { player.pause(); return; }
    player.currentTime = range.start;
    player.play();
  };

  return (
    <View>
      <View style={styles.preview}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        {status === 'loading' && <ActivityIndicator style={StyleSheet.absoluteFill} color={C.primary} />}
        <Pressable onPress={playSelection} style={styles.previewBtn} accessibilityLabel="Preview selection">
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={26} color="#fff" style={!isPlaying ? { marginLeft: 3 } : undefined} />
        </Pressable>
      </View>

      <View style={styles.headRow}>
        <Text style={styles.label}>Select the important part</Text>
        {isTrimmed && (
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Text style={styles.reset}>Reset</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.stripWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.strip}>
          {thumbs.length > 0
            ? thumbs.map((t, i) => <Image key={i} source={t} style={styles.frame} contentFit="cover" />)
            : Array.from({ length: STRIP_FRAMES }).map((_, i) => <View key={i} style={[styles.frame, { backgroundColor: C.surfaceAlt }]} />)}
        </View>
        {duration > 0 && width > 0 && (
          <>
            <View style={[styles.dim, { left: 0, width: toX(range.start) }]} pointerEvents="none" />
            <View style={[styles.dim, { left: toX(range.end), right: 0 }]} pointerEvents="none" />
            <View style={[styles.window, { left: toX(range.start), width: Math.max(0, toX(range.end) - toX(range.start)) }]} pointerEvents="none" />
            <View
              style={[styles.playhead, { left: toX(Math.min(range.end, Math.max(range.start, time?.currentTime ?? 0))) }]}
              pointerEvents="none"
            />
            <View {...startPan.panHandlers} style={[styles.handle, { left: toX(range.start) - HANDLE_W / 2 }]}>
              <View style={styles.grip} />
            </View>
            <View {...endPan.panHandlers} style={[styles.handle, { left: toX(range.end) - HANDLE_W / 2 }]}>
              <View style={styles.grip} />
            </View>
          </>
        )}
      </View>

      <View style={styles.timesRow}>
        <Text style={styles.time}>{formatClock(range.start)}</Text>
        <Text style={styles.selected}>{sel > 0 ? `${sel.toFixed(1)}s selected` : ''}</Text>
        <Text style={styles.time}>{formatClock(range.end)}</Text>
      </View>
      {sel > 30 && (
        <Text style={styles.hint}>
          Tip: a section of 10–30 seconds showing one action (a sprint, dribble or jump) gives the most detailed AI results.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { aspectRatio: 16 / 9, backgroundColor: C.black, borderRadius: R.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  previewBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: S.lg, marginBottom: S.sm },
  label: { color: C.text, fontSize: T.body, fontWeight: '700' },
  reset: { color: C.primary, fontSize: T.small, fontWeight: '700' },
  stripWrap: { height: 56, justifyContent: 'center' },
  strip: { flexDirection: 'row', height: 48, borderRadius: R.sm, overflow: 'hidden' },
  frame: { flex: 1, height: 48 },
  dim: { position: 'absolute', top: 4, height: 48, backgroundColor: 'rgba(0,0,0,0.62)' },
  window: { position: 'absolute', top: 2, height: 52, borderWidth: 2.5, borderColor: C.warning, borderRadius: 6 },
  playhead: { position: 'absolute', top: 0, width: 2, height: 56, backgroundColor: '#fff' },
  handle: { position: 'absolute', top: 0, width: HANDLE_W, height: 56, borderRadius: 6, backgroundColor: C.warning, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 3, height: 20, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.45)' },
  timesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { color: C.muted, fontSize: T.small, fontVariant: ['tabular-nums'] },
  selected: { color: C.warning, fontSize: T.small, fontWeight: '700' },
  hint: { color: C.muted, fontSize: T.caption, marginTop: 8, lineHeight: 16 },
});
