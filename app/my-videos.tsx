import ActionSheet from '@/components/ui/ActionSheet';
import AppHeader, { HeaderIconButton } from '@/components/ui/AppHeader';
import PressableScale from '@/components/ui/PressableScale';
import { VideoCardSkeleton } from '@/components/ui/Skeleton';
import StateView from '@/components/ui/StateView';
import ActiveAnalysisBanner from '@/components/video/ActiveAnalysisBanner';
import VideoCard from '@/components/video/VideoCard';
import VideoPlayerModal from '@/components/video/VideoPlayerModal';
import { useVideoActions } from '@/components/video/useVideoActions';
import { C, R, S, T } from '@/constants/ui';
import { useAnalysis } from '@/lib/analysis/AnalysisProvider';
import { friendlyError } from '@/lib/errors';
import { ratingColor } from '@/lib/poseAnalysis';
import { getMyPlayerProfile } from '@/lib/session';
import { fetchPlayerVideos, type VideoWithMeta } from '@/lib/videoMeta';
import { backfillThumbnail } from '@/lib/videoUpload';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Filter = 'all' | 'analyzed' | 'pending';

export default function MyVideosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { jobs } = useAnalysis();

  const [videos, setVideos] = useState<VideoWithMeta[] | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [playing, setPlaying] = useState<VideoWithMeta | null>(null);
  const [menuFor, setMenuFor] = useState<VideoWithMeta | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const backfilled = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const me = await getMyPlayerProfile();
      if (!me) { router.replace('/login' as any); return; }
      setPlayer(me);
      setVideos(await fetchPlayerVideos(me.id));
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'load'));
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Refresh when a background analysis for one of these videos finishes.
  const doneKey = Object.values(jobs).filter((j) => j.status === 'done').map((j) => j.videoId).join(',');
  useEffect(() => { if (doneKey) load(); }, [doneKey, load]);

  // Generate missing thumbnails for older uploads, one at a time.
  useEffect(() => {
    if (!videos) return;
    let stop = false;
    (async () => {
      for (const v of videos) {
        if (stop) return;
        if (v.thumbnail_url || backfilled.current.has(v.id)) continue;
        backfilled.current.add(v.id);
        const uri = await backfillThumbnail(v);
        if (uri && !stop) setThumbs((t) => ({ ...t, [v.id]: uri }));
      }
    })();
    return () => { stop = true; };
  }, [videos]);

  const { actionsFor, renameModal } = useVideoActions({
    onRenamed: (id, title) => setVideos((vs) => vs?.map((v) => (v.id === id ? { ...v, title } : v)) ?? vs),
    onDeleted: (id) => setVideos((vs) => vs?.filter((v) => v.id !== id) ?? vs),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const list = (videos ?? []).filter((v) => (filter === 'all' ? true : filter === 'analyzed' ? !!v.analysis : !v.analysis));
  const analyzed = (videos ?? []).filter((v) => v.analysis);
  const avg = analyzed.length ? analyzed.reduce((s, v) => s + Number(v.analysis.overall_rating), 0) / analyzed.length : null;

  const header = (
    <View>
      <ActiveAnalysisBanner />
      {videos && videos.length > 0 && (
        <>
          <View style={styles.summary}>
            <Stat value={String(videos.length)} label="Videos" />
            <Stat value={String(analyzed.length)} label="Analyzed" />
            <Stat value={avg !== null ? avg.toFixed(1) : '—'} label="Avg AI rating" color={avg !== null ? ratingColor(avg) : undefined} />
          </View>
          <View style={styles.filters}>
            {(['all', 'analyzed', 'pending'] as Filter[]).map((f) => (
              <PressableScale key={f} onPress={() => setFilter(f)} style={[styles.filter, filter === f && styles.filterActive]}>
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                  {f === 'all' ? 'All' : f === 'analyzed' ? 'AI complete' : 'Pending'}
                </Text>
              </PressableScale>
            ))}
          </View>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader
        title="My Videos"
        subtitle={player?.full_name}
        right={<HeaderIconButton icon="add" label="Upload video" onPress={() => router.push('/upload-video' as any)} />}
      />

      {videos === null && !error ? (
        <View style={{ padding: S.lg }}>
          {[0, 1, 2, 3].map((i) => <VideoCardSkeleton key={i} />)}
        </View>
      ) : error && !videos ? (
        <StateView icon="cloud-offline-outline" tone="error" title="Couldn’t load your videos" message={error} actions={[{ title: 'Try again', icon: 'refresh', onPress: load }]} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 100 }}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
          initialNumToRender={6}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <VideoCard
              video={item}
              job={jobs[item.id]}
              thumbnail={thumbs[item.id]}
              ownerName={player?.full_name}
              onPress={() => setPlaying(item)}
              onMore={() => setMenuFor(item)}
            />
          )}
          ListEmptyComponent={
            videos && videos.length > 0 ? (
              <StateView compact icon="filter-outline" title="No videos here" message="Try a different filter." />
            ) : (
              <StateView
                icon="videocam-outline"
                title="No videos yet"
                message="Upload a short clip of a sprint, dribble or match moment. The AI will rate your performance."
                actions={[{ title: 'Upload your first video', icon: 'cloud-upload', onPress: () => router.push('/upload-video' as any) }]}
              />
            )
          }
        />
      )}

      {videos && videos.length > 0 && (
        <PressableScale haptic onPress={() => router.push('/upload-video' as any)} style={[styles.fab, { bottom: insets.bottom + 24 }]} accessibilityLabel="Upload video">
          <Ionicons name="cloud-upload" size={20} color={C.onPrimary} />
          <Text style={styles.fabText}>Upload</Text>
        </PressableScale>
      )}

      <VideoPlayerModal
        video={playing}
        subtitle={playing?.analysis ? `AI rating ${Number(playing.analysis.overall_rating).toFixed(1)}` : 'Not analyzed yet'}
        onClose={() => setPlaying(null)}
        actions={playing ? actionsFor(playing).filter((a) => a.key !== 'share').map((a) => ({ ...a, onPress: () => { setPlaying(null); setTimeout(a.onPress, 250); } })) : []}
      />
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.title}
        subtitle={menuFor?.analysis ? `AI rating ${Number(menuFor.analysis.overall_rating).toFixed(1)}` : 'Analysis pending'}
        actions={menuFor ? actionsFor(menuFor, { includePlay: () => setPlaying(menuFor) }) : []}
        onClose={() => setMenuFor(null)}
      />
      {renameModal}
    </SafeAreaView>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  summary: { flexDirection: 'row', gap: 8, marginBottom: S.md },
  stat: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statValue: { color: C.text, fontSize: T.h2, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: T.caption, marginTop: 2 },
  filters: { flexDirection: 'row', gap: 8, marginBottom: S.md },
  filter: { borderRadius: R.pill, borderWidth: 1, borderColor: C.borderStrong, paddingHorizontal: 14, paddingVertical: 7 },
  filterActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { color: C.textSoft, fontSize: T.small, fontWeight: '600' },
  filterTextActive: { color: C.onPrimary, fontWeight: '800' },
  fab: { position: 'absolute', right: S.xl, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, borderRadius: R.pill, paddingHorizontal: 20, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: C.onPrimary, fontSize: T.bodyLg, fontWeight: '800' },
});
