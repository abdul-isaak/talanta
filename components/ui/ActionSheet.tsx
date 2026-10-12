import { C, R, S, T } from '@/constants/ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SheetAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hint?: string;
};

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
};

/** Bottom action sheet used for the video "more" menus. */
export default function ActionSheet({ visible, title, subtitle, actions, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}>
        <View style={styles.grabber} />
        {!!title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        {actions.map((a) => (
          <Pressable
            key={a.key}
            disabled={a.disabled}
            onPress={() => { onClose(); setTimeout(a.onPress, 220); }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceRaised }, a.disabled && { opacity: 0.4 }]}
            accessibilityRole="button"
          >
            <View style={[styles.icon, a.destructive && { backgroundColor: C.dangerSoft }]}>
              <Ionicons name={a.icon} size={19} color={a.destructive ? C.danger : C.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, a.destructive && { color: C.danger }]}>{a.label}</Text>
              {!!a.hint && <Text style={styles.hint}>{a.hint}</Text>}
            </View>
          </Pressable>
        ))}
        <Pressable onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.overlay },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingHorizontal: S.lg, paddingTop: S.sm, borderTopWidth: 1, borderColor: C.border },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderStrong, marginBottom: S.md },
  title: { color: C.text, fontSize: T.bodyLg, fontWeight: '700' },
  subtitle: { color: C.muted, fontSize: T.small, marginTop: 2, marginBottom: S.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: 11, paddingHorizontal: S.sm, borderRadius: R.md },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  label: { color: C.text, fontSize: T.body, fontWeight: '600' },
  hint: { color: C.muted, fontSize: T.caption, marginTop: 1 },
  cancel: { marginTop: S.sm, paddingVertical: 14, alignItems: 'center', borderRadius: R.md, backgroundColor: C.surfaceAlt },
  cancelText: { color: C.text, fontSize: T.body, fontWeight: '700' },
});
