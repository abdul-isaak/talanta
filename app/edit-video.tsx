import AppHeader from '@/components/ui/AppHeader';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import StateView from '@/components/ui/StateView';
import TrimEditor, { type TrimRange } from '@/components/video/TrimEditor';
import { C, R, S, T } from '@/constants/ui';
import { useAnalysis } from '@/lib/analysis/AnalysisProvider';
import { friendlyError } from '@/lib/errors';
import { fetchVideo, saveVideoMeta, type VideoWithMeta } from '@/lib/videoMeta';
import { renameVideo } from '@/lib/videoUpload';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Edit an uploaded video: rename it and choose the section the AI analyzes. */
export default function EditVideoScreen() {
  const router = useRouter();
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const analysis = useAnalysis();

  const [video, setVideo] = useState<VideoWithMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [trim, setTrim] = useState<TrimRange | null>(null);
  const [saving, setSaving] = useState<'save' | 'analyze' | null>(null);

  const load = async () => {
    try {
      const v = await fetchVideo(String(videoId));
      if (!v) { setError('This video no longer exists.'); return; }
      setVideo(v);
      setTitle(v.title);
      if (v.meta.trimStart != null || v.meta.trimEnd != null) {
        setTrim({ start: v.meta.trimStart ?? 0, end: v.meta.trimEnd ?? v.meta.duration ?? 0 });
      }
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'load'));
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [videoId]);

  const save = async (reanalyze: boolean) => {
    if (!video) return;
    setSaving(reanalyze ? 'analyze' : 'save');
    try {
      // `trim` is null when the whole video is used (the editor's Reset).
      const start = trim ? +trim.start.toFixed(2) : null;
      const end = trim ? +trim.end.toFixed(2) : null;
      await saveVideoMeta(video.id, { trimStart: start, trimEnd: end });
      if (title.trim() && title.trim() !== video.title) await renameVideo(video.id, title);

      if (reanalyze) {
        analysis.start({ videoId: video.id, playerId: video.player_id, title: title.trim() || video.title, url: video.video_url, start, end });
        router.replace({ pathname: '/analyze-video' as any, params: { videoId: video.id } });
      } else {
        router.back();
      }
    } catch (e) {
      Alert.alert('Couldn’t save changes', friendlyError(e, 'save'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <AppHeader title="Edit video" />
      {error ? (
        <StateView icon="alert-circle-outline" tone="error" title="Couldn’t open video" message={error} actions={[{ title: 'Try again', icon: 'refresh', onPress: load }, { title: 'Go back', onPress: () => router.back(), variant: 'secondary' }]} />
      ) : !video ? (
        <View style={{ padding: S.lg, gap: 14 }}>
          <Skeleton height={200} radius={R.lg} />
          <Skeleton height={56} radius={R.sm} />
          <Skeleton height={48} radius={R.md} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TrimEditor uri={video.video_url} duration={video.meta.duration ?? undefined} value={trim} onChange={setTrim} />
            <Text style={styles.note}>
              The original video is kept. Playback highlights this section and the AI analyzes only this part.
            </Text>

            <Text style={styles.label}>Title</Text>
            <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="Video title" placeholderTextColor={C.dim} maxLength={60} />

            <Button title="Save & re-analyze" icon="sparkles" onPress={() => save(true)} loading={saving === 'analyze'} disabled={!!saving} style={{ marginTop: S.xl }} />
            <Button title="Save changes" variant="secondary" onPress={() => save(false)} loading={saving === 'save'} disabled={!!saving} style={{ marginTop: S.md }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: S.lg, paddingBottom: 48 },
  note: { color: C.muted, fontSize: T.caption, lineHeight: 16, marginTop: S.md },
  label: { color: C.text, fontSize: T.body, fontWeight: '700', marginTop: S.xl, marginBottom: S.sm },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, color: C.text, fontSize: T.bodyLg, paddingHorizontal: 14, paddingVertical: 12 },
});
