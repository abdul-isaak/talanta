import * as Haptics from 'expo-haptics';
import React, { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far the element shrinks while pressed. */
  scaleTo?: number;
  haptic?: boolean;
  children?: React.ReactNode;
};

/** Pressable with a subtle press-in scale and optional haptic tick. */
export default function PressableScale({ style, scaleTo = 0.97, haptic, onPress, disabled, children, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={() => animate(scaleTo)}
      onPressOut={() => animate(1)}
      onPress={(e) => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
