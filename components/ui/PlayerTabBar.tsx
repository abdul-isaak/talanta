import { C } from '@/constants/ui';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'home' | 'profile' | 'videos' | 'messages';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap; path: string }[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', active: 'home', path: '/player-dashboard' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', active: 'person', path: '/player-profile' },
  { key: 'videos', label: 'Videos', icon: 'film-outline', active: 'film', path: '/my-videos' },
  { key: 'messages', label: 'Messages', icon: 'chatbubbles-outline', active: 'chatbubbles', path: '/messages' },
];

/** Bottom navigation shared by the player's main screens. */
export default function PlayerTabBar({ current }: { current: Tab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const on = t.key === current;
        return (
          <Pressable
            key={t.key}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
            onPress={() => { if (!on) router.push(t.path as any); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
          >
            <Ionicons name={on ? t.active : t.icon} size={22} color={on ? C.primary : C.muted} />
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.bgDeep, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 8 },
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  label: { fontSize: 10.5, color: C.muted, fontWeight: '600' },
  labelOn: { color: C.primary, fontWeight: '800' },
});
