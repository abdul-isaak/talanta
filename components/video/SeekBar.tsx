import { C } from '@/constants/ui';
import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

type Props = {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onScrubStart?: () => void;
  /** Optional highlighted section (e.g. the trimmed part used for analysis). */
  range?: { start: number; end: number } | null;
};

/** A draggable progress bar; tapping or dragging anywhere seeks. */
export default function SeekBar({ position, duration, onSeek, onScrubStart, range }: Props) {
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const widthRef = useRef(0);
  const durRef = useRef(duration);
  const handlers = useRef({ onSeek, onScrubStart });
  useEffect(() => { durRef.current = duration; }, [duration]);
  useEffect(() => { handlers.current = { onSeek, onScrubStart }; });

  const toTime = (x: number) => {
    const w = widthRef.current || 1;
    return Math.max(0, Math.min(1, x / w)) * (durRef.current || 0);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { handlers.current.onScrubStart?.(); setScrub(toTime(e.nativeEvent.locationX)); },
      onPanResponderMove: (e) => setScrub(toTime(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => { const t = toTime(e.nativeEvent.locationX); setScrub(null); handlers.current.onSeek(t); },
      onPanResponderTerminate: () => setScrub(null),
    }),
  ).current;

  const shown = scrub ?? position;
  const frac = duration > 0 ? Math.max(0, Math.min(1, shown / duration)) : 0;

  return (
    <View
      style={styles.hit}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width); }}
      {...responder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
    >
      <View style={styles.track} pointerEvents="none">
        {range && duration > 0 && (
          <View
            style={[styles.range, { left: (range.start / duration) * width, width: Math.max(2, ((range.end - range.start) / duration) * width) }]}
          />
        )}
        <View style={[styles.fill, { width: frac * width }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, scrub !== null && styles.thumbActive, { left: frac * width - (scrub !== null ? 9 : 7) }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 32, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  range: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(245,166,35,0.55)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.primary },
  thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' },
  thumbActive: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.primary },
});
