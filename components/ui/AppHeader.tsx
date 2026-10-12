import { C, S, T } from '@/constants/ui';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  hideBack?: boolean;
  right?: React.ReactNode;
};

export default function AppHeader({ title, subtitle, onBack, hideBack, right }: Props) {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/' as any)));

  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {!hideBack && (
          <Pressable
            onPress={back}
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </Pressable>
        )}
      </View>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function HeaderIconButton({ icon, onPress, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={C.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  side: { width: 56 },
  center: { flex: 1, alignItems: 'center' },
  title: { color: C.text, fontSize: T.title, fontWeight: '700' },
  subtitle: { color: C.muted, fontSize: T.caption, marginTop: 1 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
});
