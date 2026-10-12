import ProgressBar from '@/components/ui/ProgressBar';
import PressableScale from '@/components/ui/PressableScale';
import { C, R, S, T } from '@/constants/ui';
import { useAnalysis } from '@/lib/analysis/AnalysisProvider';
import { STAGE_LABEL } from '@/lib/poseAnalysis';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Shows AI analyses running in the background; tapping opens the live view. */
export default function ActiveAnalysisBanner({ exclude }: { exclude?: string }) {
  const { jobs } = useAnalysis();
  const router = useRouter();
  const active = Object.values(jobs)
    .filter((j) => j.videoId !== exclude && (j.status === 'queued' || j.status === 'running' || j.status === 'saving'))
    .sort((a, b) => a.startedAt - b.startedAt);

  if (active.length === 0) return null;
  const j = active[0];

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/analyze-video' as any, params: { videoId: j.videoId } })}
      style={styles.banner}
      accessibilityRole="button"
      accessibilityLabel="Open analysis in progress"
    >
      <View style={styles.icon}>
        <Ionicons name="sparkles" size={16} color={C.primary} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>
            {j.status === 'queued' ? 'Waiting' : STAGE_LABEL[j.stage]} · {j.title}
          </Text>
          <Text style={styles.pct}>{Math.round(j.progress * 100)}%</Text>
        </View>
        <ProgressBar value={j.progress} height={4} />
        {active.length > 1 && <Text style={styles.more}>+{active.length - 1} more queued</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.lg, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: 'rgba(59,224,151,0.35)', marginBottom: S.md },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: C.text, fontSize: T.small, fontWeight: '700' },
  pct: { color: C.primary, fontSize: T.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  more: { color: C.muted, fontSize: T.caption },
});
