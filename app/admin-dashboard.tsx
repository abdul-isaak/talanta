import { ACTION_META, logActivity } from '@/lib/activityLog';
import { ratingColor } from '@/lib/poseAnalysis';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
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
const DEEP = '#071d33';
const CARD = '#132233';
const MUTED = '#7a99b0';
const GOLD = '#f5a623';
const BLUE = '#4a9eff';
const RED = '#ff6b6b';

type Tab = 'overview' | 'users' | 'activity';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [adminName, setAdminName] = useState('Administrator');

  // Stats
  const [stats, setStats] = useState({
    players: 0,
    scouts: 0,
    videos: 0,
    analyses: 0,
    shortlists: 0,
    invitations: 0,
    accepted: 0,
    messages: 0,
    avgRating: 0,
    avgConfidence: 0,
  });

  const [players, setPlayers] = useState<any[]>([]);
  const [scouts, setScouts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState(0);

  useFocusEffect(
    useCallback(() => {
      verifyAndLoad();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const verifyAndLoad = async () => {
    // Gate: kick out anyone who isn't an admin
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    if (!userId) {
      router.replace('/admin-login' as any);
      return;
    }

    const { data: adminRow } = await supabase
      .from('admins')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (!adminRow) {
      Alert.alert('Access denied', 'You do not have administrator privileges.');
      await supabase.auth.signOut();
      router.replace('/' as any);
      return;
    }

    setAdminName(adminRow.full_name || 'Administrator');
    await loadData();
  };

  const loadData = async () => {
    try {
      const [
        playersRes,
        scoutsRes,
        videosRes,
        analysesRes,
        shortlistsRes,
        invitationsRes,
        messagesRes,
        logsRes,
      ] = await Promise.all([
        supabase.from('player_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('scout_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('videos').select('id', { count: 'exact', head: true }),
        supabase.from('video_analysis').select('video_id, overall_rating, detection_confidence, created_at').order('created_at', { ascending: false }),
        supabase.from('shortlists').select('id', { count: 'exact', head: true }),
        supabase.from('invitations').select('status'),
        supabase.from('messages').select('id', { count: 'exact', head: true }),
        supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

      // One report per video (the newest), so re-analysed videos are not counted twice.
      const seen = new Set<string>();
      const analyses = (analysesRes.data || []).filter((a: any) => !seen.has(a.video_id) && !!seen.add(a.video_id));
      const invitations = invitationsRes.data || [];

      setPlayers(playersRes.data || []);
      setScouts(scoutsRes.data || []);
      setLogs(logsRes.data || []);

      setStats({
        players: playersRes.data?.length || 0,
        scouts: scoutsRes.data?.length || 0,
        videos: videosRes.count || 0,
        analyses: analyses.length,
        shortlists: shortlistsRes.count || 0,
        invitations: invitations.length,
        accepted: invitations.filter((i: any) => i.status === 'accepted').length,
        messages: messagesRes.count || 0,
        avgRating: analyses.length
          ? analyses.reduce((s: number, a: any) => s + Number(a.overall_rating), 0) / analyses.length
          : 0,
        avgConfidence: analyses.length
          ? analyses.reduce((s: number, a: any) => s + Number(a.detection_confidence), 0) / analyses.length
          : 0,
      });

      // Rough "currently online" — logins in the last hour without a matching later logout
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = (logsRes.data || []).filter((l: any) => l.created_at > hourAgo);
      const sessionMap: Record<string, string> = {};
      [...recent].reverse().forEach((l: any) => {
        if (l.action === 'login') sessionMap[l.user_id] = 'in';
        if (l.action === 'logout') delete sessionMap[l.user_id];
      });
      setActiveSessions(Object.keys(sessionMap).length);

    } catch (err) {
      console.log('Admin load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const signOut = async () => {
    await logActivity('logout', 'Administrator signed out');
    await supabase.auth.signOut();
    router.replace('/' as any);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const fullDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return ''; }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const p = name.trim().split(' ');
    return p.length === 1
      ? p[0][0]?.toUpperCase() || '??'
      : (p[0][0] + p[1][0]).toUpperCase();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={styles.loadingText}>Verifying credentials...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🔐 Admin Panel</Text>
          <Text style={styles.headerSub}>{adminName}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabs}>
        {(['overview', 'users', 'activity'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'overview' ? '📊 Overview' : t === 'users' ? '👥 Users' : '📋 Activity'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />
        }
      >

        {/* ══════════ OVERVIEW ══════════ */}
        {tab === 'overview' && (
          <>
            <View style={styles.liveBar}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                {activeSessions} user{activeSessions !== 1 ? 's' : ''} active in the last hour
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Platform totals</Text>
            <View style={styles.grid}>
              {[
                { n: stats.players,   l: 'Players',     c: GREEN, i: '⚽' },
                { n: stats.scouts,    l: 'Scouts',      c: BLUE,  i: '🔍' },
                { n: stats.videos,    l: 'Videos',      c: GOLD,  i: '🎥' },
                { n: stats.analyses,  l: 'AI analyses', c: GREEN, i: '🤖' },
              ].map((s, i) => (
                <View key={i} style={styles.gridBox}>
                  <Text style={styles.gridIcon}>{s.i}</Text>
                  <Text style={[styles.gridN, { color: s.c }]}>{s.n}</Text>
                  <Text style={styles.gridL}>{s.l}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Engagement</Text>
            <View style={styles.grid}>
              {[
                { n: stats.shortlists,  l: 'Shortlisted',  c: GOLD,  i: '⭐' },
                { n: stats.invitations, l: 'Invites sent', c: BLUE,  i: '📅' },
                { n: stats.accepted,    l: 'Accepted',     c: GREEN, i: '✅' },
                { n: stats.messages,    l: 'Messages',     c: BLUE,  i: '💬' },
              ].map((s, i) => (
                <View key={i} style={styles.gridBox}>
                  <Text style={styles.gridIcon}>{s.i}</Text>
                  <Text style={[styles.gridN, { color: s.c }]}>{s.n}</Text>
                  <Text style={styles.gridL}>{s.l}</Text>
                </View>
              ))}
            </View>

            {/* AI performance — this is your objective iv evidence */}
            <Text style={styles.sectionLabel}>AI system performance</Text>
            <View style={styles.aiCard}>
              <View style={styles.aiRow}>
                <View style={styles.aiCol}>
                  <Text style={styles.aiLabel}>Mean detection confidence</Text>
                  <Text style={[styles.aiBig, { color: GREEN }]}>
                    {stats.avgConfidence.toFixed(1)}%
                  </Text>
                  <Text style={styles.aiNote}>Across {stats.analyses} analyses</Text>
                </View>
                <View style={styles.aiDivider} />
                <View style={styles.aiCol}>
                  <Text style={styles.aiLabel}>Mean player rating</Text>
                  <Text style={[styles.aiBig, { color: ratingColor(stats.avgRating) }]}>
                    {stats.avgRating.toFixed(1)}
                  </Text>
                  <Text style={styles.aiNote}>Out of 100</Text>
                </View>
              </View>
              <View style={styles.aiFooter}>
                <Text style={styles.aiFooterText}>
                  MediaPipe Pose Landmarker · 33 landmarks · 24–72 frames sampled per video
                </Text>
              </View>
            </View>

            {/* Adoption rates */}
            <Text style={styles.sectionLabel}>Adoption</Text>
            <View style={styles.card}>
              {[
                {
                  label: 'Players with videos',
                  value: stats.players ? Math.round((stats.videos / stats.players) * 100) : 0,
                },
                {
                  label: 'Videos analyzed by AI',
                  value: stats.videos ? Math.round((stats.analyses / stats.videos) * 100) : 0,
                },
                {
                  label: 'Invitations accepted',
                  value: stats.invitations ? Math.round((stats.accepted / stats.invitations) * 100) : 0,
                },
              ].map((r, i) => (
                <View key={i} style={styles.rateRow}>
                  <View style={styles.rateHead}>
                    <Text style={styles.rateLabel}>{r.label}</Text>
                    <Text style={styles.rateValue}>{r.value}%</Text>
                  </View>
                  <View style={styles.rateBarBg}>
                    <View style={[styles.rateBarFill, { width: `${Math.min(r.value, 100)}%` as any }]} />
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.reportBtn}
              onPress={() => router.push('/admin-report' as any)}
            >
              <Text style={styles.reportBtnText}>📄  Generate printable report</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ══════════ USERS ══════════ */}
        {tab === 'users' && (
          <>
            <Text style={styles.sectionLabel}>Players ({players.length})</Text>
            {players.length === 0 ? (
              <Text style={styles.emptyText}>No players registered.</Text>
            ) : (
              players.map((p, i) => (
                <View key={i} style={styles.userRow}>
                  <View style={[styles.userAvatar, { borderColor: GREEN }]}>
                    <Text style={[styles.userAvatarText, { color: GREEN }]}>
                      {getInitials(p.full_name)}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{p.full_name || 'Unnamed'}</Text>
                    <Text style={styles.userMeta}>{p.email}</Text>
                    <Text style={styles.userMeta}>
                      {p.position || '—'} · {p.county || '—'} · joined {timeAgo(p.created_at)}
                    </Text>
                  </View>
                  <View style={[styles.roleTag, { backgroundColor: 'rgba(59,224,151,0.15)' }]}>
                    <Text style={[styles.roleTagText, { color: GREEN }]}>Player</Text>
                  </View>
                </View>
              ))
            )}

            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Scouts ({scouts.length})</Text>
            {scouts.length === 0 ? (
              <Text style={styles.emptyText}>No scouts registered.</Text>
            ) : (
              scouts.map((s, i) => (
                <View key={i} style={styles.userRow}>
                  <View style={[styles.userAvatar, { borderColor: BLUE }]}>
                    <Text style={[styles.userAvatarText, { color: BLUE }]}>
                      {getInitials(s.full_name)}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{s.full_name || 'Unnamed'}</Text>
                    <Text style={styles.userMeta}>{s.email}</Text>
                    <Text style={styles.userMeta}>
                      {s.organization || '—'} · {s.county || '—'} · joined {timeAgo(s.created_at)}
                    </Text>
                  </View>
                  <View style={[styles.roleTag, { backgroundColor: 'rgba(74,158,255,0.15)' }]}>
                    <Text style={[styles.roleTagText, { color: BLUE }]}>Scout</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ══════════ ACTIVITY ══════════ */}
        {tab === 'activity' && (
          <>
            <Text style={styles.sectionLabel}>
              Activity log — last {logs.length} events
            </Text>

            {logs.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  No activity recorded yet. Events appear here as users sign in,
                  upload videos and run analyses.
                </Text>
              </View>
            ) : (
              logs.map((l, i) => {
                const meta = ACTION_META[l.action] || {
                  label: l.action, icon: '•', color: MUTED,
                };
                return (
                  <View key={i} style={[styles.logRow, { borderLeftColor: meta.color }]}>
                    <Text style={styles.logIcon}>{meta.icon}</Text>
                    <View style={styles.logBody}>
                      <View style={styles.logTop}>
                        <Text style={[styles.logAction, { color: meta.color }]}>
                          {meta.label}
                        </Text>
                        <Text style={styles.logTime}>{timeAgo(l.created_at)}</Text>
                      </View>
                      <Text style={styles.logUser}>
                        {l.user_name || 'Unknown'}
                        {l.user_role ? ` · ${l.user_role}` : ''}
                      </Text>
                      {l.details ? (
                        <Text style={styles.logDetails}>{l.details}</Text>
                      ) : null}
                      <Text style={styles.logStamp}>{fullDate(l.created_at)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DEEP },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: MUTED, fontSize: 13, marginTop: 14 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 16 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3448',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: GOLD, fontSize: 12, marginTop: 2 },
  signOutBtn: {
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  signOutText: { color: RED, fontSize: 12, fontWeight: '700' },

  tabs: {
    flexDirection: 'row',
    backgroundColor: CARD,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 12,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: NAVY },
  tabText: { fontSize: 12, color: MUTED, fontWeight: '600' },
  tabTextActive: { color: GOLD, fontWeight: '800' },

  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1e3448',
  },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: GREEN },
  liveText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  sectionLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  gridBox: {
    width: '47.5%',
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e3448',
  },
  gridIcon: { fontSize: 20, marginBottom: 8 },
  gridN: { fontSize: 28, fontWeight: '800' },
  gridL: { color: MUTED, fontSize: 11, marginTop: 2 },

  aiCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 18,
    marginBottom: 22,
    borderWidth: 2,
    borderColor: GREEN,
  },
  aiRow: { flexDirection: 'row', alignItems: 'center' },
  aiCol: { flex: 1, alignItems: 'center' },
  aiDivider: { width: 1, height: 60, backgroundColor: '#1e3448' },
  aiLabel: { color: MUTED, fontSize: 11, marginBottom: 6, textAlign: 'center' },
  aiBig: { fontSize: 32, fontWeight: '800' },
  aiNote: { color: MUTED, fontSize: 10, marginTop: 4 },
  aiFooter: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1e3448' },
  aiFooterText: { color: MUTED, fontSize: 10, textAlign: 'center', fontStyle: 'italic' },

  card: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#1e3448',
  },
  rateRow: { marginBottom: 16 },
  rateHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rateLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  rateValue: { color: GOLD, fontSize: 13, fontWeight: '800' },
  rateBarBg: { height: 7, backgroundColor: '#1e3448', borderRadius: 4, overflow: 'hidden' },
  rateBarFill: { height: '100%', backgroundColor: GOLD, borderRadius: 4 },

  reportBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  reportBtnText: { color: NAVY, fontSize: 15, fontWeight: '800' },

  emptyText: { color: MUTED, fontSize: 13, textAlign: 'center', paddingVertical: 16, lineHeight: 19 },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e3448',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: NAVY,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { fontSize: 14, fontWeight: '800' },
  userInfo: { flex: 1 },
  userName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  userMeta: { color: MUTED, fontSize: 11, marginTop: 2 },
  roleTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  roleTagText: { fontSize: 10, fontWeight: '800' },

  logRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e3448',
    borderLeftWidth: 3,
  },
  logIcon: { fontSize: 18 },
  logBody: { flex: 1 },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logAction: { fontSize: 13, fontWeight: '800' },
  logTime: { color: MUTED, fontSize: 10 },
  logUser: { color: '#fff', fontSize: 12, marginTop: 3 },
  logDetails: { color: MUTED, fontSize: 11, marginTop: 3, fontStyle: 'italic' },
  logStamp: { color: '#2e4a5e', fontSize: 10, marginTop: 4 },
});