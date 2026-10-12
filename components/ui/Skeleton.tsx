import { C, R } from '@/constants/ui';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

type Props = { width?: DimensionValue; height?: DimensionValue; radius?: number; style?: StyleProp<ViewStyle> };

/** A shimmering placeholder block shown while content loads. */
export default function Skeleton({ width = '100%', height = 14, radius = R.sm, style }: Props) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: C.border, opacity: pulse }, style]}
    />
  );
}

export function VideoCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton height={undefined} style={styles.thumb} radius={R.md} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} />
        <Skeleton width="55%" height={18} radius={R.pill} />
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={{ padding: 16, gap: 14 }}>
      <View style={[styles.block, { flexDirection: 'row', gap: 14, alignItems: 'center' }]}>
        <Skeleton width={64} height={64} radius={32} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="80%" height={12} />
        </View>
      </View>
      <Skeleton height={88} radius={R.lg} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={62} radius={R.md} style={{ flex: 1 }} />)}
      </View>
      <Skeleton height={180} radius={R.lg} />
    </View>
  );
}

/** Generic list/page placeholder: a header bar followed by avatar rows. */
export function ListSkeleton({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Skeleton height={44} radius={R.md} />
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[styles.block, { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 }]}>
          {avatar && <Skeleton width={44} height={44} radius={22} />}
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="80%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  thumb: { width: 128, aspectRatio: 16 / 9 },
  block: { backgroundColor: C.surface, borderRadius: R.lg, padding: 16 },
});
