import { C, R, S, T } from '@/constants/ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Button from './Button';

type Action = { title: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; variant?: 'primary' | 'secondary' | 'ghost' };

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  tone?: 'neutral' | 'error';
  actions?: Action[];
  compact?: boolean;
};

/** Empty, error and "nothing here yet" states share this layout. */
export default function StateView({ icon, title, message, tone = 'neutral', actions = [], compact }: Props) {
  const color = tone === 'error' ? C.danger : C.primary;
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={[styles.iconWrap, { backgroundColor: tone === 'error' ? C.dangerSoft : C.primarySoft }]}>
        <Ionicons name={icon} size={compact ? 24 : 30} color={color} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((a, i) => (
            <Button
              key={a.title}
              title={a.title}
              icon={a.icon}
              onPress={a.onPress}
              variant={a.variant ?? (i === 0 ? 'primary' : 'secondary')}
              style={{ alignSelf: 'stretch' }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: S.xxl, paddingHorizontal: S.xl },
  compact: { paddingVertical: S.lg },
  iconWrap: { width: 64, height: 64, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', marginBottom: S.md },
  title: { color: C.text, fontSize: T.title, fontWeight: '700', textAlign: 'center' },
  message: { color: C.muted, fontSize: T.body, lineHeight: 20, textAlign: 'center', marginTop: 6, maxWidth: 320 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: S.lg },
});
