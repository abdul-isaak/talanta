import { C, R, T } from '@/constants/ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import PressableScale from './PressableScale';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: C.primary, fg: C.onPrimary, border: C.primary },
  secondary: { bg: C.surface, fg: C.text, border: C.borderStrong },
  ghost: { bg: 'transparent', fg: C.primary, border: 'transparent' },
  danger: { bg: C.dangerSoft, fg: C.danger, border: 'rgba(255,107,107,0.35)' },
};

export default function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style }: Props) {
  const p = palette[variant];
  return (
    <PressableScale
      haptic={variant === 'primary'}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[
        styles.base,
        small && styles.small,
        { backgroundColor: p.bg, borderColor: p.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={small ? 15 : 18} color={p.fg} />}
          <Text style={[styles.text, small && styles.textSmall, { color: p.fg }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 50, borderRadius: R.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  small: { minHeight: 38, paddingHorizontal: 12, borderRadius: R.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: T.bodyLg, fontWeight: '700' },
  textSmall: { fontSize: T.small },
});
