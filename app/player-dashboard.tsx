import PlayerTabBar from '@/components/ui/PlayerTabBar';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import ActiveAnalysisBanner from '@/components/video/ActiveAnalysisBanner';
import { ratingColor, ratingLabel } from '@/lib/poseAnalysis';
import { getCurrentUserId, getMyPlayerProfile, invalidatePlayerCache } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const GREEN = '#3BE097';
const NAVY = '#0d1b2a';
const CARD = '#132233';
const MUTED = '#7a99b0';

export default function PlayerDashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [videoCount, setVideoCount] = useState(0);
  const [avgAiRating, setAvgAiRating] = useState<number | null>(null);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const fetchData = async () => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        router.replace('/login' as any);
        return;
      }

      const data = await getMyPlayerProfile(true);
      if (!data) return;
      setProfile(data);

      // Invitations and videos (with their AI analyses) load in parallel.
      const [{ data: invData }, { data: vids }] = await Promise.all([
        supabase
          .from('invitations')
          .select('*, scout_profiles(full_name, organization)')
          .eq('player_id', data.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('videos')
          .select('id, video_analysis(overall_rating)')
          .eq('player_id', data.id),
      ]);

      setInvitations(invData || []);
      setVideoCount(vids?.length || 0);

      const ratings = (vids || []).flatMap((v: any) => (v.video_analysis || []).slice(0, 1).map((a: any) => Number(a.overall_rating)));
      if (ratings.length > 0) {
        setAvgAiRating(ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length);
        setAnalyzedCount(ratings.length);
      } else {
        setAvgAiRating(null);
        setAnalyzedCount(0);
      }
    } catch (err) {
      console.log('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const respondToInvitation = async (invitationId: string, status: 'accepted' | 'declined') => {
    const { error } = await supabase
      .from('invitations')
      .update({ status })
      .eq('id', invitationId);

    if (!error) {
      Alert.alert(
        status === 'accepted' ? 'Invitation Accepted! 🎉' : 'Invitation Declined',
        status === 'accepted'
          ? 'The scout has been notified. Good luck!'
          : 'The invitation has been declined.'
      );
      fetchData();
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || '??';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const calculateCompleteness = () => {
    if (!profile) return 0;
    const checks = [
      !!profile.full_name,
      !!profile.phone,
      !!profile.county,
      !!profile.position,
      !!profile.age,
      !!profile.height,
      !!profile.current_club,
      videoCount > 0,
    ];
    const filled = checks.filter(Boolean).length;
    return Math.round((filled / checks.length) * 100);
  };

  const completeness = calculateCompleteness();

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>

      <View style={styles.navbar}>
        <Text style={styles.navLogo}>Talan<Text style={styles.navLogoGreen}>ta</Text></Text>
        <TouchableOpacity onPress={() => router.push('/messages' as any)} accessibilityLabel="Messages" hitSlop={10}>
          <Ionicons name="chatbubbles-outline" size={23} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }} tintColor={GREEN} colors={[GREEN]} />}
      >
        <View style={{ height: 16 }} />
        <ActiveAnalysisBanner />

        {/* ── Profile banner ── */}
        <View style={styles.banner}>
          <View style={styles.bannerAvatar}>
            <Text style={styles.bannerAvatarText}>{getInitials(profile?.full_name)}</Text>
          </View>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerName}>{profile?.full_name || 'Player'}</Text>
            <Text style={styles.bannerMeta}>
              {profile?.position || 'Position not set'} · {profile?.county || 'County not set'} · {profile?.age || '?'} yrs
            </Text>
          </View>
          <View style={styles.availableBadge}>
            <Text style={styles.availableBadgeText}>
              {profile?.availability === 'available' ? 'Available' : 'Unavailable'}
            </Text>
          </View>
        </View>

        {/* ── AI rating card ── */}
        {avgAiRating !== null ? (
          <TouchableOpacity
            style={styles.aiCard}
            onPress={() => router.push('/player-profile' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.aiCardLeft}>
              <Text style={styles.aiCardLabel}>🤖 YOUR AI RATING</Text>
              <Text style={styles.aiCardSub}>
                From {analyzedCount} analyzed video{analyzedCount > 1 ? 's' : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.aiCardScore, { color: ratingColor(avgAiRating) }]}>
                {avgAiRating.toFixed(1)}
              </Text>
              <Text style={[styles.aiCardGrade, { color: ratingColor(avgAiRating) }]}>
                {ratingLabel(avgAiRating)}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.aiPromptCard}
            onPress={() => router.push((videoCount === 0 ? '/upload-video' : '/my-videos') as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles" size={26} color={GREEN} />
            <View style={{ flex: 1 }}>
              <Text style={styles.aiPromptTitle}>Get your AI performance rating</Text>
              <Text style={styles.aiPromptSub}>
                {videoCount === 0
                  ? 'Upload a highlight video, then run AI analysis'
                  : 'Run AI analysis on your videos to get scored'}
              </Text>
            </View>
            <Text style={styles.aiPromptArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* ── Profile completeness ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Profile completeness</Text>
            <Text style={styles.completePct}>{completeness}%</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${completeness}%` as any }]} />
          </View>
          <View style={styles.taskList}>
            {[
              { done: !!profile?.full_name, text: 'Add personal details' },
              { done: !!profile?.position && !!profile?.age, text: 'Complete football info' },
              { done: profile?.goals > 0 || profile?.appearances > 0, text: 'Add season stats' },
              { done: videoCount > 0, text: 'Upload a highlight video' },
              { done: analyzedCount > 0, text: 'Run AI analysis' },
            ].map((t, i) => (
              <View key={i} style={styles.taskRow}>
                <View style={[styles.taskDot, t.done && styles.taskDotDone]}>
                  <Text style={styles.taskDotText}>{t.done ? '✓' : '+'}</Text>
                </View>
                <Text style={[styles.taskText, t.done && styles.taskTextDone]}>{t.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          {[
            { n: String(profile?.goals ?? 0), l: 'Goals' },
            { n: String(profile?.assists ?? 0), l: 'Assists' },
            { n: String(profile?.appearances ?? 0), l: 'Appearances' },
            { n: profile?.pass_accuracy || '—', l: 'Pass acc.' },
          ].map((s, i) => (
            <View key={i} style={styles.statBox}>
              <Text style={styles.statN}>{s.n}</Text>
              <Text style={styles.statL}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* ── Trial invitations ── */}
        {invitations.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trial invitations</Text>
              <Text style={styles.inviteBadge}>{invitations.length} pending</Text>
            </View>

            {invitations.map((inv, i) => (
              <View key={i} style={styles.inviteCard}>
                <View style={styles.inviteRow}>
                  <View style={styles.inviteIcon}>
                    <Text style={styles.inviteIconText}>📅</Text>
                  </View>
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteTitle}>{inv.trial_name}</Text>
                    <Text style={styles.inviteMeta}>{inv.trial_date} · {inv.location}</Text>
                    <Text style={styles.inviteScout}>
                      From: {inv.scout_profiles?.full_name} — {inv.scout_profiles?.organization}
                    </Text>
                    {inv.message ? <Text style={styles.inviteMessage}>&quot;{inv.message}&quot;</Text> : null}
                  </View>
                </View>
                <View style={styles.inviteActions}>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => respondToInvitation(inv.id, 'accepted')}
                  >
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => respondToInvitation(inv.id, 'declined')}
                  >
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── My details ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My details</Text>
        </View>

        <View style={styles.card}>
          {[
            { label: 'Email', value: profile?.email || '—' },
            { label: 'Phone', value: profile?.phone || '—' },
            { label: 'Current club', value: profile?.current_club || 'Not set' },
            { label: 'Videos uploaded', value: String(videoCount) },
          ].map((row, i) => (
            <View key={i} style={[styles.detailRow, i < 3 && styles.detailRowBorder]}>
              <Text style={styles.detailLabel}>{row.label}</Text>
              <Text style={styles.detailValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick actions ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
        </View>

        <View style={styles.actionsRow}>
          {[
            { icon: 'cloud-upload-outline', label: 'Upload video', path: '/upload-video' },
            { icon: 'film-outline', label: 'My videos', path: '/my-videos' },
            { icon: 'stats-chart-outline', label: 'Update stats', path: '/edit-player-profile' },
            { icon: 'person-outline', label: 'View profile', path: '/player-profile' },
          ].map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionBtn} onPress={() => router.push(a.path as any)} activeOpacity={0.75}>
              <Ionicons name={a.icon as any} size={22} color={GREEN} style={{ marginBottom: 6 }} />
              <Text style={styles.actionText}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={async () => {
            invalidatePlayerCache();
            await supabase.auth.signOut();
            router.replace('/login' as any);
          }}
        >
          <Text style={styles.logoutBtnText}>Sign out</Text>
        </TouchableOpacity>

      </ScrollView>

      <PlayerTabBar current="home" />

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 100 },
  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: NAVY, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  navLogo: { fontSize: 22, fontWeight: '800', color: '#fff' },
  navLogoGreen: { color: GREEN },
  navIcon: { fontSize: 22 },

  banner: { backgroundColor: '#0a2540', borderRadius: 16, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1e3448', borderWidth: 2, borderColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  bannerAvatarText: { color: GREEN, fontSize: 16, fontWeight: '700' },
  bannerInfo: { flex: 1 },
  bannerName: { color: '#fff', fontSize: 17, fontWeight: '700' },
  bannerMeta: { color: MUTED, fontSize: 13, marginTop: 2 },
  availableBadge: { backgroundColor: 'rgba(59,224,151,0.12)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  availableBadgeText: { color: GREEN, fontSize: 11, fontWeight: '600' },

  aiCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 2, borderColor: GREEN },
  aiCardLeft: { flex: 1 },
  aiCardLabel: { color: GREEN, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  aiCardSub: { color: MUTED, fontSize: 11, marginTop: 3 },
  aiCardScore: { fontSize: 34, fontWeight: '800', lineHeight: 38 },
  aiCardGrade: { fontSize: 11, fontWeight: '700' },

  aiPromptCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#1e3448', borderStyle: 'dashed' },
  aiPromptIcon: { fontSize: 26 },
  aiPromptTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  aiPromptSub: { color: MUTED, fontSize: 11, marginTop: 3 },
  aiPromptArrow: { color: GREEN, fontSize: 18, fontWeight: '700' },

  card: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1e3448' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  completePct: { fontSize: 14, fontWeight: '700', color: GREEN },
  progressBg: { height: 6, backgroundColor: '#1e3448', borderRadius: 3, overflow: 'hidden', marginBottom: 14 },
  progressFill: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  taskList: { gap: 10 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#1e3448', borderWidth: 1, borderColor: '#2e4a5e', alignItems: 'center', justifyContent: 'center' },
  taskDotDone: { backgroundColor: GREEN, borderColor: GREEN },
  taskDotText: { color: NAVY, fontSize: 10, fontWeight: '800' },
  taskText: { fontSize: 13, color: '#fff' },
  taskTextDone: { color: MUTED, textDecorationLine: 'line-through' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448' },
  statN: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statL: { fontSize: 10, color: MUTED, marginTop: 3, textAlign: 'center' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  inviteBadge: { backgroundColor: GREEN, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, fontSize: 11, color: NAVY, fontWeight: '700', overflow: 'hidden' },

  inviteCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1e3448' },
  inviteRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  inviteIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(59,224,151,0.12)', alignItems: 'center', justifyContent: 'center' },
  inviteIconText: { fontSize: 20 },
  inviteInfo: { flex: 1 },
  inviteTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  inviteMeta: { fontSize: 12, color: MUTED, marginBottom: 2 },
  inviteScout: { fontSize: 12, color: MUTED },
  inviteMessage: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', marginTop: 4 },
  inviteActions: { flexDirection: 'row', gap: 10 },
  acceptBtn: { flex: 1, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  acceptBtnText: { color: NAVY, fontSize: 13, fontWeight: '700' },
  declineBtn: { flex: 1, backgroundColor: '#1e3448', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2e4a5e' },
  declineBtnText: { color: MUTED, fontSize: 13, fontWeight: '600' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  detailLabel: { fontSize: 13, color: MUTED },
  detailValue: { fontSize: 13, color: '#fff', fontWeight: '600' },

  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtn: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448' },
  actionIcon: { fontSize: 22, marginBottom: 6 },
  actionText: { fontSize: 11, color: MUTED, textAlign: 'center' },

  logoutBtn: { backgroundColor: CARD, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448', marginBottom: 20 },
  logoutBtnText: { color: '#ff4d4d', fontSize: 14, fontWeight: '600' },

  tabBar: { flexDirection: 'row', backgroundColor: '#071d33', borderTopWidth: 1, borderTopColor: '#1e3448', paddingVertical: 10, paddingHorizontal: 16 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, marginBottom: 3 },
  tabLabel: { fontSize: 10, color: MUTED },
  tabLabelActive: { color: GREEN, fontWeight: '600' },
})