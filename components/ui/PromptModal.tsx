import { C, R, S, T } from '@/constants/ui';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Button from './Button';

type Props = {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

/** Cross-platform text prompt (Alert.prompt only exists on iOS). */
export default function PromptModal({ visible, title, initialValue = '', placeholder, confirmLabel = 'Save', busy, onCancel, onSubmit }: Props) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (visible) setValue(initialValue); }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={C.dim}
            style={styles.input}
            autoFocus
            maxLength={60}
            selectTextOnFocus
            onSubmitEditing={() => value.trim() && onSubmit(value.trim())}
          />
          <View style={styles.row}>
            <Button title="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
            <Button title={confirmLabel} onPress={() => onSubmit(value.trim())} disabled={!value.trim()} loading={busy} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: S.xl, backgroundColor: C.overlay },
  card: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.xl, borderWidth: 1, borderColor: C.border, gap: S.lg },
  title: { color: C.text, fontSize: T.title, fontWeight: '800' },
  input: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: R.md, color: C.text, fontSize: T.bodyLg, paddingHorizontal: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', gap: S.md },
});
