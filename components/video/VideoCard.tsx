import PressableScale from '@/components/ui/PressableScale';
import { C, R, S, T } from '@/constants/ui';
import type { AnalysisJob } from '@/lib/analysis/AnalysisProvider';
import { ratingColor } from '@/lib/poseAnalysis';
import { relativeDate, type VideoWithMeta } from '@/lib/videoMeta';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import VideoThumb from './VideoThumb';

type Props = {
  video: VideoWithMeta;
  job?: AnalysisJob;
  thumbnail?: string | null;
  ownerName?: string;
  onPress: () => void;
  onMore?: () => void;
};

export function AnalysisStatus({ analysis, job }: { analysis: any | null; job?: AnalysisJob }) {
  if (job && (job.status === 'queued' || job.status === 'running' || job.status === 'saving')) {
    return (
      <View style={[styles.status, { backgroundColor: C.infoSoft }]}>
        <Ionicons name="sync" size={11} color={C.info} />
        <Text style={[styles.statusText, { color: C.info }]}>
          {job.status === 'queued' ? 'Waiting to analyze' : `Analyzing ${Math.round(job.progress * 100)}%`}
        </Text>
      </View>
    );
  }
  if (job?.status === 'error' && !analysis) {
    return (
      <View style={[styles.status, { backgroundColor: C.dangerSoft }]}>
        <Ionicons name="alert-circle" size={11} color={C.danger} />
        <Text style={[styles.statusText, { color: C.danger }]}>Analysis failed</Text>
      </View>
    );
  }
  if (analysis) {
    const score = Number(analysis.overall_rating);
    return (
      <View style={[styles.status, { backgroundColor: C.primarySoft }]}>
        <Ionicons name="checkmark-circle" size={11} color={C.primary} />
        <Text style={[styles.statusText, { color: C.primary }]}>AI complete</Text>
        <Text style={[styles.score, { color: ratingColor(score) }]}>{score.toFixed(0)}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.status, { backgroundColor: C.warningSoft }]}>
      <Ionicons name="time-outline" size={11} color={C.warning} />
      <Text style={[styles.statusText, { color: C.warning }]}>Analysis pending</Text>
    </View>
  );
}

function VideoCard({ video, job, thumbnail, ownerName, onPress, onMore }: Props) {
  const trimmed = video.meta.trimStart != null || video.meta.trimEnd != null;
  return (
    <PressableScale onPress={onPress} style={styles.card} accessibilityRole="button" accessibilityLabel={`Open ${video.title}`}>
      <VideoThumb uri={thumbnail ?? video.thumbnail_url} duration={video.meta.duration} style={styles.thumb} compact />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {ownerName ? `${ownerName} · ` : ''}{relativeDate(video.created_at)}
        </Text>
        <View style={styles.row}>
          <AnalysisStatus analysis={video.analysis} job={job} />
          {trimmed && (
            <View style={styles.trimTag}>
              <Ionicons name="cut-outline" size={11} color={C.muted} />
            </View>
          )}
        </View>
      </View>
      {onMore && (
        <Pressable onPress={onMore} hitSlop={10} style={({ pressed }) => [styles.more, pressed && { opacity: 0.5 }]} accessibilityLabel="Video options">
          <Ionicons name="ellipsis-vertical" size={18} color={C.muted} />
        </Pressable>
      )}
    </PressableScale>
  );
}

export default memo(VideoCard);

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: S.md, padding: 10, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: 10, alignItems: 'center' },
  thumb: { width: 132 },
  info: { flex: 1, gap: 4 },
  title: { color: C.text, fontSize: T.body, fontWeight: '700' },
  meta: { color: C.muted, fontSize: T.caption },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10.5, fontWeight: '700' },
  score: { fontSize: 11, fontWeight: '800', marginLeft: 2 },
  trimTag: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  more: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
});
