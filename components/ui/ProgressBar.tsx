import { C, R } from '@/constants/ui';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

type Props = {
  /** 0..1, or null for an indeterminate bar. */
  value: number | null;
  color?: string;
  height?: number;
};

export default function ProgressBar({ value, color = C.primary, height = 8 }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const width = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value === null) return;
    Animated.timing(width, {
      toValue: Math.max(0, Math.min(1, value)),
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, width]);

  useEffect(() => {
    if (value !== null) return;
    const loop = Animated.loop(
      Animated.timing(slide, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, slide]);

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {value === null ? (
        <Animated.View
          style={{
            width: '35%',
            height,
            borderRadius: height / 2,
            backgroundColor: color,
            transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-trackWidth * 0.35, trackWidth] }) }],
          }}
        />
      ) : (
        <Animated.View
          style={{
            height,
            borderRadius: height / 2,
            backgroundColor: color,
            width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: C.border, overflow: 'hidden', borderRadius: R.pill },
});
