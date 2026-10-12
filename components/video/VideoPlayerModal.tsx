import ActionSheet, { type SheetAction } from '@/components/ui/ActionSheet';
import StateView from '@/components/ui/StateView';
import { C, R, S, T } from '@/constants/ui';
import { friendlyError } from '@/lib/errors';
import { formatClock } from '@/lib/videoMeta';
import { Ionicons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, Share, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SeekBar from './SeekBar';

export type PlayerVideo = {
  id: string;
  title: string;
  video_url: string;
  meta?: { trimStart?: number | null; trimEnd?: number | null };
};

type Props = {
  video: PlayerVideo | null;
  onClose: () => void;
  /** Extra menu entries (rename, delete, re-analyze …) supplied by the screen. */
  actions?: SheetAction[];
  subtitle?: string;
};

const SPEEDS = [0.5, 1, 1.5, 2];

export default function VideoPlayerModal({ video, onClose, actions = [], subtitle }: Props) {
  return (
    <Modal
      visible={!!video}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      {/* Mounting the player only while open releases decoder memory on close. */}
      {video && <PlayerBody video={video} onClose={onClose} actions={actions} subtitle={subtitle} />}
    </Modal>
  );
}

function PlayerBody({ video, onClose, actions = [], subtitle }: Props & { video: PlayerVideo }) {
  const insets = useSafeAreaInsets();
  const viewRef = useRef<VideoView>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const fade = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer({ uri: video.video_url, useCaching: true }, (p) => {
    p.timeUpdateEventInterval = 0.25;
    if (video.meta?.trimStart) p.currentTime = video.meta.trimStart;
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });
  const [ended, setEnded] = useState(false);
  useEventListener(player, 'playToEnd', () => { setEnded(true); setControlsVisible(true); });

  const duration = player.duration || 0;
  const position = time?.currentTime ?? 0;
  const range = video.meta && (video.meta.trimStart != null || video.meta.trimEnd != null)
    ? { start: video.meta.trimStart ?? 0, end: video.meta.trimEnd ?? duration }
    : null;

  // Auto-hide the controls while the video plays.
  useEffect(() => {
    Animated.timing(fade, { toValue: controlsVisible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (controlsVisible && isPlaying) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), 3200);
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [controlsVisible, isPlaying, fade]);

  const poke = () => setControlsVisible(true);

  const togglePlay = () => {
    poke();
    if (ended) {
      player.currentTime = range?.start ?? 0;
      setEnded(false);
      player.play();
    } else if (isPlaying) player.pause();
    else player.play();
  };

  const seekTo = (t: number) => {
    setEnded(false);
    player.currentTime = Math.max(0, Math.min(duration || t, t));
    poke();
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    player.playbackRate = SPEEDS[next];
    poke();
  };

  const share = async () => {
    try {
      await Share.share({ message: `Watch "${video.title}" on Talanta: ${video.video_url}` });
    } catch { /* user dismissed */ }
  };

  const menu: SheetAction[] = [
    ...actions,
    { key: 'share', label: 'Share', icon: 'share-social-outline', onPress: share },
  ];

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setControlsVisible((v) => !v)} accessibilityLabel="Toggle controls">
        <VideoView
          ref={viewRef}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={fullscreen}
          fullscreenOptions={{ enable: true, orientation: 'landscape' }}
          allowsPictureInPicture={false}
          onFullscreenEnter={() => setFullscreen(true)}
          onFullscreenExit={() => setFullscreen(false)}
        />
      </Pressable>

      {status === 'loading' && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>Loading video…</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={[styles.center, { backgroundColor: 'rgba(0,0,0,0.75)' }]}>
          <StateView
            icon="cloud-offline-outline"
            tone="error"
            title="Can’t play this video"
            message={friendlyError(error?.message, 'playback')}
            actions={[
              { title: 'Try again', icon: 'refresh', onPress: () => player.replace({ uri: video.video_url, useCaching: true }) },
              { title: 'Close', onPress: onClose, variant: 'secondary' },
            ]}
          />
        </View>
      )}

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents={controlsVisible ? 'box-none' : 'none'}>
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.roundBtn} accessibilityLabel="Close video">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: S.md }}>
            <Text style={styles.title} numberOfLines={1}>{video.title}</Text>
            {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={styles.roundBtn} accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Centre transport */}
        {status !== 'error' && (
          <View style={styles.transport} pointerEvents="box-none">
            <Pressable onPress={() => seekTo(position - 10)} hitSlop={10} style={styles.skipBtn} accessibilityLabel="Rewind 10 seconds">
              <Ionicons name="play-back" size={24} color="#fff" />
              <Text style={styles.skipText}>10</Text>
            </Pressable>
            <Pressable onPress={togglePlay} style={styles.playBtn} accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
              <Ionicons name={ended ? 'refresh' : isPlaying ? 'pause' : 'play'} size={34} color="#fff" style={!isPlaying && !ended ? { marginLeft: 4 } : undefined} />
            </Pressable>
            <Pressable onPress={() => seekTo(position + 10)} hitSlop={10} style={styles.skipBtn} accessibilityLabel="Forward 10 seconds">
              <Ionicons name="play-forward" size={24} color="#fff" />
              <Text style={styles.skipText}>10</Text>
            </Pressable>
          </View>
        )}

        {/* Bottom bar */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <SeekBar position={position} duration={duration} onSeek={seekTo} onScrubStart={poke} range={range} />
          <View style={styles.bottomRow}>
            <Text style={styles.time}>{formatClock(position)} / {formatClock(duration)}</Text>
            <View style={{ flex: 1 }} />
            {range && (
              <View style={styles.rangeTag}>
                <Ionicons name="cut-outline" size={12} color={C.warning} />
                <Text style={styles.rangeText}>AI section</Text>
              </View>
            )}
            <Pressable onPress={() => { player.muted = !muted; poke(); }} hitSlop={8} style={styles.smallBtn} accessibilityLabel={muted ? 'Unmute' : 'Mute'}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
            </Pressable>
            <Pressable onPress={cycleSpeed} hitSlop={8} style={styles.speedBtn} accessibilityLabel="Playback speed">
              <Text style={styles.speedText}>{SPEEDS[speedIndex]}×</Text>
            </Pressable>
            <Pressable onPress={() => viewRef.current?.enterFullscreen()} hitSlop={8} style={styles.smallBtn} accessibilityLabel="Fullscreen">
              <Ionicons name="expand" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <ActionSheet visible={menuOpen} title={video.title} actions={menu} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.black },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#fff', marginTop: 10, fontSize: T.small },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: T.bodyLg, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: T.caption, marginTop: 1 },
  transport: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 44 },
  playBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  skipBtn: { alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.35)' },
  skipText: { color: '#fff', fontSize: 9, fontWeight: '800', marginTop: -2 },
  bottomBar: { paddingHorizontal: S.lg, paddingTop: 6, backgroundColor: 'rgba(0,0,0,0.45)' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { color: '#fff', fontSize: T.small, fontVariant: ['tabular-nums'] },
  smallBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  speedBtn: { minWidth: 44, height: 28, borderRadius: R.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  speedText: { color: '#fff', fontSize: T.small, fontWeight: '800' },
  rangeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,166,35,0.18)', borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 },
  rangeText: { color: C.warning, fontSize: 10, fontWeight: '700' },
});
