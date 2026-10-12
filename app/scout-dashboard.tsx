import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
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

export default function ScoutDashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [recentPlayers, setRecentPlayers] = useState<any[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [shortlistCount, setShortlistCount] = useState(0);
  const [invitesSent, setInvitesSent] = useState(0);
  const [invitesAccepted, setInvitesAccepted] = useState(0);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const fetchData = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) {
        router.replace('/login' as any);
        return;
      }

      const { data: scoutData, error: scoutError } = await supabase
        .from('scout_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!scoutError) setProfile(scoutData);

      // Recent players + total count
      const { data: playersData, count } = await supabase
        .from('player_profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(3);

      if (playersData) {
        setRecentPlayers(playersData);
        setTotalPlayers(count || 0);
      }

      if (scoutData) {
        // Shortlist count
        const { count: slCount } = await supabase
          .from('shortlists')
          .select('id', { count: 'exact', head: true })
          .eq('scout_id', scoutData.id);
        setShortlistCount(slCount || 0);

        // Invitations
        const { data: invs } = await supabase
          .from('invitations')
          .select('status')
          .eq('scout_id', scoutData.id);

        setInvitesSent(invs?.length || 0);
        setInvitesAccepted((invs || []).filter((i: any) => i.status === 'accepted').length);
      }

    } catch (err) {
      console.log('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || '??';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

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
        <TouchableOpacity onPress={() => router.push('/messages' as any)}>
          <Text style={styles.navIcon}>💬</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.banner}>
          <View style={styles.bannerLeft}>
            <Text style={styles.bannerGreeting}>
              Hello, {profile?.full_name?.split(' ')[0] || 'Scout'} 👋
            </Text>
            <Text style={styles.bannerSub}>Here is what&apos;s happening with your scouting</Text>
          </View>
          <TouchableOpacity
            style={styles.findBtn}
            onPress={() => router.push('/scout-search' as any)}
          >
            <Text style={styles.findBtnText}>🔍 Find</Text>
          </TouchableOpacity>
        </View>

        {/* ── Live stats ── */}
        <View style={styles.statsRow}>
          {[
            { n: String(totalPlayers), l: 'Total players' },
            { n: String(shortlistCount), l: 'Shortlisted' },
            { n: String(invitesSent), l: 'Trials sent' },
            { n: String(invitesAccepted), l: 'Accepted' },
          ].map((s, i) => (
            <View key={i} style={styles.statBox}>
              <Text style={styles.statN}>{s.n}</Text>
              <Text style={styles.statL}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* ── Recently registered players ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recently registered players</Text>
          <TouchableOpacity onPress={() => router.push('/scout-search' as any)}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {recentPlayers.length === 0 ? (
            <Text style={styles.emptyText}>No players registered yet.</Text>
          ) : (
            recentPlayers.map((p, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.playerRow, i < recentPlayers.length - 1 && styles.playerRowBorder]}
                onPress={() =>
                  router.push({
                    pathname: '/player-profile-view' as any,
                    params: { id: p.user_id },
                  })
                }
              >
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>{getInitials(p.full_name)}</Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{p.full_name}</Text>
                  <Text style={styles.playerPos}>
                    {p.position || 'Position not set'} · {p.county || 'County not set'}
                  </Text>
                </View>
                <View style={styles.viewBtn}>
                  <Text style={styles.viewBtnText}>View</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* ── My details ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My details</Text>
        </View>

        <View style={styles.card}>
          {[
            { label: 'Email', value: profile?.email || '—' },
            { label: 'Organization', value: profile?.organization || '—' },
            { label: 'Role', value: profile?.role || '—' },
            { label: 'County', value: profile?.county || '—' },
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
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/scout-search' as any)}
          >
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.actionText}>Find players</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/scout-shortlist' as any)}
          >
            <Text style={styles.actionIcon}>⭐</Text>
            <Text style={styles.actionText}>Shortlist</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/scout-invitations' as any)}
          >
            <Text style={styles.actionIcon}>📅</Text>
            <Text style={styles.actionText}>Trials</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/messages' as any)}
          >
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>Messages</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace('/login' as any);
          }}
        >
          <Text style={styles.logoutBtnText}>Sign out</Text>
        </TouchableOpacity>

      </ScrollView>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>🏠</Text>
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => router.push('/scout-search' as any)}
        >
          <Text style={styles.tabIcon}>🔍</Text>
          <Text style={styles.tabLabel}>Find Players</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => router.push('/scout-shortlist' as any)}
        >
          <Text style={styles.tabIcon}>⭐</Text>
          <Text style={styles.tabLabel}>Shortlist</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => router.push('/messages' as any)}
        >
          <Text style={styles.tabIcon}>💬</Text>
          <Text style={styles.tabLabel}>Messages</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 100 },
  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  navLogo: { fontSize: 22, fontWeight: '800', color: '#fff' },
  navLogoGreen: { color: GREEN },
  navIcon: { fontSize: 22 },
  banner: { backgroundColor: '#0a2540', borderRadius: 16, padding: 16, marginTop: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerLeft: { flex: 1 },
  bannerGreeting: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bannerSub: { color: MUTED, fontSize: 12, marginTop: 4 },
  findBtn: { backgroundColor: GREEN, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  findBtnText: { color: NAVY, fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448' },
  statN: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statL: { fontSize: 10, color: MUTED, marginTop: 3, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  seeAll: { fontSize: 13, color: GREEN, fontWeight: '600' },
  card: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1e3448' },
  emptyText: { color: MUTED, fontSize: 13, textAlign: 'center', paddingVertical: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  playerRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  playerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e3448', alignItems: 'center', justifyContent: 'center' },
  playerAvatarText: { fontSize: 14, fontWeight: '700', color: GREEN },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  playerPos: { fontSize: 12, color: MUTED, marginTop: 2 },
  viewBtn: { backgroundColor: NAVY, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  viewBtnText: { color: GREEN, fontSize: 12, fontWeight: '600' },
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