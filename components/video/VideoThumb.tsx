import { C, R } from '@/constants/ui';
import { formatDuration } from '@/lib/videoMeta';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  uri?: string | null;
  duration?: number | null;
  style?: StyleProp<ViewStyle>;
  /** Small cards hide the large play button. */
  compact?: boolean;
  badge?: React.ReactNode;
};

/** A video frame with the play overlay and duration pill, like a phone gallery. */
export default function VideoThumb({ uri, duration, style, compact, badge }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" recyclingKey={uri} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Ionicons name="film-outline" size={compact ? 22 : 32} color={C.dim} />
        </View>
      )}
      <View style={styles.shade} />
      <View style={[styles.play, compact && styles.playSmall]}>
        <Ionicons name="play" size={compact ? 14 : 22} color="#fff" style={{ marginLeft: 2 }} />
      </View>
      {!!formatDuration(duration) && (
        <View style={styles.duration}>
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>
      )}
      {badge && <View style={styles.badge}>{badge}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { aspectRatio: 16 / 9, borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  play: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  playSmall: { width: 30, height: 30, borderRadius: 15, borderWidth: 1 },
  duration: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  durationText: { color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badge: { position: 'absolute', left: 6, top: 6 },
});
