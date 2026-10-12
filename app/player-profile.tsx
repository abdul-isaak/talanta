import ActionSheet from '@/components/ui/ActionSheet';
import AppHeader, { HeaderIconButton } from '@/components/ui/AppHeader';
import Button from '@/components/ui/Button';
import PlayerTabBar from '@/components/ui/PlayerTabBar';
import PressableScale from '@/components/ui/PressableScale';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import StateView from '@/components/ui/StateView';
import ActiveAnalysisBanner from '@/components/video/ActiveAnalysisBanner';
import VideoCard from '@/components/video/VideoCard';
import VideoPlayerModal from '@/components/video/VideoPlayerModal';
import { useVideoActions } from '@/components/video/useVideoActions';
import { C, R, S, T } from '@/constants/ui';
import { useAnalysis } from '@/lib/analysis/AnalysisProvider';
import { friendlyError } from '@/lib/errors';
import { ratingColor, ratingLabel } from '@/lib/poseAnalysis';
import { getMyPlayerProfile } from '@/lib/session';
import { fetchPlayerVideos, type VideoWithMeta } from '@/lib/videoMeta';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'overview' | 'stats' | 'videos' | 'endorsements';

export default function PlayerProfileScreen() {
  const router = useRouter();
  const { jobs } = useAnalysis();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [profile, setProfile] = useState<any>(null);
  const [videos, setVideos] = useState<VideoWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [playing, setPlaying] = useState<VideoWithMeta | null>(null);
  const [menuFor, setMenuFor] = useState<VideoWithMeta | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const me = await getMyPlayerProfile(force);
      if (!me) { router.replace('/login' as any); return; }
      setProfile(me);
      setVideos(await fetchPlayerVideos(me.id));
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const { actionsFor, renameModal } = useVideoActions({
    onRenamed: (id, title) => setVideos((vs) => vs.map((v) => (v.id === id ? { ...v, title } : v))),
    onDeleted: (id) => setVideos((vs) => vs.filter((v) => v.id !== id)),
  });

  const analyzed = videos.filter((v) => v.analysis);
  const avgRating = analyzed.length
    ? analyzed.reduce((s, v) => s + Number(v.analysis.overall_rating), 0) / analyzed.length
    : null;

  const initials = (name?: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '??';
  };

  const shareProfile = () => {
    Share.share({
      message: `${profile?.full_name} — ${profile?.position || 'Footballer'} from ${profile?.county || 'Kenya'} on Talanta.${avgRating !== null ? ` AI rating ${avgRating.toFixed(1)}.` : ''}`,
    }).catch(() => {});
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <AppHeader title="My Profile" />
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  if (error && !profile) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <AppHeader title="My Profile" />
        <StateView icon="cloud-offline-outline" tone="error" title="Couldn’t load your profile" message={error} actions={[{ title: 'Try again', icon: 'refresh', onPress: () => load(true) }]} />
      </SafeAreaView>
    );
  }

  const details = [
    { icon: 'football-outline', label: 'Position', value: profile?.position || 'Not set' },
    { icon: 'walk-outline', label: 'Preferred foot', value: profile?.preferred_foot || 'Not set' },
    { icon: 'resize-outline', label: 'Height / weight', value: profile?.height ? `${profile.height} cm · ${profile.weight ?? '—'} kg` : 'Not set' },
    { icon: 'shield-outline', label: 'Current club', value: profile?.current_club || 'Not set' },
    { icon: 'checkmark-circle-outline', label: 'Availability', value: profile?.availability || 'Available', green: true },
    { icon: 'call-outline', label: 'Contact', value: profile?.phone || '—' },
  ];

  const stats = [
    { n: String(profile?.goals ?? 0), l: 'Goals' },
    { n: String(profile?.assists ?? 0), l: 'Assists' },
    { n: String(profile?.appearances ?? 0), l: 'Apps' },
    { n: profile?.pass_accuracy ? `${profile.pass_accuracy}` : '—', l: 'Pass acc.' },
  ];

  const videoSection = (limit?: number) => (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Highlight videos</Text>
        <PressableScale onPress={() => router.push('/upload-video' as any)} style={styles.addBtn} accessibilityLabel="Upload video">
          <Ionicons name="add" size={16} color={C.onPrimary} />
          <Text style={styles.addText}>Upload</Text>
        </PressableScale>
      </View>
      <ActiveAnalysisBanner />
      {videos.length === 0 ? (
        <StateView
          compact
          icon="videocam-outline"
          title="No videos yet"
          message="Upload a short clip so scouts can see you play and the AI can rate you."
          actions={[{ title: 'Upload your first video', icon: 'cloud-upload', onPress: () => router.push('/upload-video' as any) }]}
        />
      ) : (
        <>
          {(limit ? videos.slice(0, limit) : videos).map((v) => (
            <VideoCard key={v.id} video={v} job={jobs[v.id]} onPress={() => setPlaying(v)} onMore={() => setMenuFor(v)} />
          ))}
          {limit && videos.length > limit && (
            <Button title={`See all ${videos.length} videos`} variant="ghost" icon="albums-outline" onPress={() => router.push('/my-videos' as any)} />
          )}
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader
        title="My Profile"
        right={<HeaderIconButton icon="share-social-outline" label="Share profile" onPress={shareProfile} />}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={C.primary} colors={[C.primary]} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.avatar}>
              {profile?.photo_url
                ? <Image source={{ uri: profile.photo_url }} style={styles.avatarImg} contentFit="cover" />
                : <Text style={styles.avatarText}>{initials(profile?.full_name)}</Text>}
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={styles.heroName}>{profile?.full_name || 'Player'}</Text>
              <View style={styles.chips}>
                <Chip icon="location-outline" text={profile?.county || '—'} />
                <Chip icon="calendar-outline" text={profile?.age ? `${profile.age} yrs` : '—'} />
                <Chip icon="football-outline" text={profile?.position || '—'} />
              </View>
            </View>
          </View>
          <Button title="Edit profile" icon="create-outline" variant="secondary" small onPress={() => router.push('/edit-player-profile' as any)} />
        </View>

        {avgRating !== null && (
          <View style={[styles.aiSummary, { borderColor: ratingColor(avgRating) }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiLabel}>AI PERFORMANCE RATING</Text>
              <Text style={styles.aiSub}>Average of {analyzed.length} analyzed video{analyzed.length > 1 ? 's' : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.aiScore, { color: ratingColor(avgRating) }]}>{avgRating.toFixed(1)}</Text>
              <Text style={[styles.aiGrade, { color: ratingColor(avgRating) }]}>{ratingLabel(avgRating)}</Text>
            </View>
          </View>
        )}

        <View style={styles.tabs}>
          {(['overview', 'stats', 'videos', 'endorsements'] as Tab[]).map((tab) => (
            <PressableScale key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]} accessibilityRole="tab">
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </PressableScale>
          ))}
        </View>

        {(activeTab === 'overview' || activeTab === 'stats') && (
          <View style={styles.statsRow}>
            {stats.map((s) => (
              <View key={s.l} style={styles.statBox}>
                <Text style={styles.statN}>{s.n}</Text>
                <Text style={styles.statL}>{s.l}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'overview' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Player details</Text>
              {details.map((row, i) => (
                <View key={row.label} style={[styles.detailRow, i < details.length - 1 && styles.detailBorder]}>
                  <View style={styles.detailLeft}>
                    <Ionicons name={row.icon as any} size={15} color={C.muted} />
                    <Text style={styles.detailLabel}>{row.label}</Text>
                  </View>
                  <Text style={[styles.detailValue, row.green && { color: C.primary }]}>{row.value}</Text>
                </View>
              ))}
            </View>
            {videoSection(3)}
            {!!profile?.bio && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>About</Text>
                <Text style={styles.bio}>{profile.bio}</Text>
              </View>
            )}
          </>
        )}

        {activeTab === 'stats' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Season statistics</Text>
            <Text style={styles.bio}>Keep your goals, assists and appearances up to date so scouts see your latest form.</Text>
            <Button title="Update stats" icon="stats-chart-outline" variant="secondary" small onPress={() => router.push('/edit-player-profile' as any)} style={{ marginTop: S.md, alignSelf: 'flex-start' }} />
          </View>
        )}

        {activeTab === 'videos' && videoSection()}

        {activeTab === 'endorsements' && (
          <View style={styles.card}>
            <StateView compact icon="ribbon-outline" title="No endorsements yet" message="Endorsements from coaches and scouts will appear here." />
          </View>
        )}
      </ScrollView>

      <PlayerTabBar current="profile" />

      <VideoPlayerModal
        video={playing}
        subtitle={playing?.analysis ? `AI rating ${Number(playing.analysis.overall_rating).toFixed(1)}` : 'Not analyzed yet'}
        onClose={() => setPlaying(null)}
        actions={playing ? actionsFor(playing).filter((a) => a.key !== 'share').map((a) => ({ ...a, onPress: () => { setPlaying(null); setTimeout(a.onPress, 250); } })) : []}
      />
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.title}
        actions={menuFor ? actionsFor(menuFor, { includePlay: () => setPlaying(menuFor) }) : []}
        onClose={() => setMenuFor(null)}
      />
      {renameModal}
    </SafeAreaView>
  );
}

function Chip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={11} color={C.textSoft} />
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: S.lg, paddingBottom: 32 },
  hero: { backgroundColor: C.surfaceAlt, padding: S.lg, borderRadius: R.lg, marginBottom: S.md, gap: S.lg },
  heroTop: { flexDirection: 'row', gap: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.border, borderWidth: 3, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: C.primary, fontSize: 22, fontWeight: '800' },
  heroName: { color: C.text, fontSize: T.h2, fontWeight: '800', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { color: C.textSoft, fontSize: T.caption },

  aiSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, borderWidth: 1.5 },
  aiLabel: { color: C.primary, fontSize: T.caption, fontWeight: '800', letterSpacing: 0.5 },
  aiSub: { color: C.muted, fontSize: T.caption, marginTop: 3 },
  aiScore: { fontSize: 32, fontWeight: '900', lineHeight: 36 },
  aiGrade: { fontSize: T.caption, fontWeight: '800' },

  tabs: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: R.md, padding: 4, marginBottom: S.md },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: R.sm },
  tabActive: { backgroundColor: C.surfaceAlt },
  tabText: { fontSize: T.small, color: C.muted, fontWeight: '600' },
  tabTextActive: { color: C.primary, fontWeight: '800' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: S.md },
  statBox: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  statN: { fontSize: T.h2, fontWeight: '800', color: C.text },
  statL: { fontSize: 10.5, color: C.muted, marginTop: 3, textAlign: 'center' },

  card: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg, marginBottom: S.md, borderWidth: 1, borderColor: C.border },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.md },
  cardTitle: { fontSize: T.caption, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.primary, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  addText: { color: C.onPrimary, fontSize: T.small, fontWeight: '800' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11 },
  detailBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { fontSize: T.body, color: C.muted },
  detailValue: { fontSize: T.body, color: C.text, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: S.md },
  bio: { fontSize: T.body, color: C.textSoft, lineHeight: 20 },
});
