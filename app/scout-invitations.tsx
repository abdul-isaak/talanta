import { ListSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Alert,
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
const ORANGE = '#f5a623';
const RED = '#ff6b6b';

const STATUS = {
  pending:  { label: 'Awaiting response', color: ORANGE, icon: '⏳' },
  accepted: { label: 'Accepted',          color: GREEN,  icon: '✅' },
  declined: { label: 'Declined',          color: RED,    icon: '❌' },
};

export default function ScoutInvitationsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'declined'>('all');

  useFocusEffect(
    useCallback(() => {
      fetchInvitations();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const fetchInvitations = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        router.replace('/login' as any);
        return;
      }

      const { data: scoutData } = await supabase
        .from('scout_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!scoutData) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('invitations')
        .select('*, player_profiles(id, user_id, full_name, position, county, age, phone)')
        .eq('scout_id', scoutData.id)
        .order('created_at', { ascending: false });

      if (!error && data) setInvitations(data);
    } catch (err) {
      console.log('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const cancelInvitation = (id: string, playerName: string) => {
    Alert.alert('Cancel invitation', `Withdraw the trial invitation sent to ${playerName}?`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('invitations').delete().eq('id', id);
          fetchInvitations();
        },
      },
    ]);
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || '??';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const counts = {
    all: invitations.length,
    pending: invitations.filter(i => i.status === 'pending').length,
    accepted: invitations.filter(i => i.status === 'accepted').length,
    declined: invitations.filter(i => i.status === 'declined').length,
  };

  const filtered = filter === 'all'
    ? invitations
    : invitations.filter(i => i.status === filter);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ListSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>

      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Trial Invitations</Text>
        <View style={{ width: 55 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {invitations.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>No invitations sent</Text>
            <Text style={styles.emptyText}>
              Open a player&apos;s profile and tap &quot;Invite to trial&quot; to send your first invitation.
            </Text>
            <TouchableOpacity
              style={styles.browseBtn}
              onPress={() => router.push('/scout-search' as any)}
            >
              <Text style={styles.browseBtnText}>🔍  Find players</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Summary */}
            <View style={styles.summaryRow}>
              {[
                { n: counts.pending,  l: 'Pending',  c: ORANGE },
                { n: counts.accepted, l: 'Accepted', c: GREEN },
                { n: counts.declined, l: 'Declined', c: RED },
              ].map((s, i) => (
                <View key={i} style={styles.summaryBox}>
                  <Text style={[styles.summaryN, { color: s.c }]}>{s.n}</Text>
                  <Text style={styles.summaryL}>{s.l}</Text>
                </View>
              ))}
            </View>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {(['all', 'pending', 'accepted', 'declined'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filter === f && styles.filterChipActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {filtered.length === 0 ? (
              <Text style={styles.noneText}>No {filter} invitations.</Text>
            ) : (
              filtered.map((inv, i) => {
                const p = inv.player_profiles;
                const st = STATUS[inv.status as keyof typeof STATUS] || STATUS.pending;

                return (
                  <View key={i} style={[styles.invCard, { borderLeftColor: st.color }]}>

                    {/* Status strip */}
                    <View style={styles.statusRow}>
                      <Text style={[styles.statusText, { color: st.color }]}>
                        {st.icon}  {st.label}
                      </Text>
                      <Text style={styles.sentDate}>Sent {formatDate(inv.created_at)}</Text>
                    </View>

                    {/* Player */}
                    <TouchableOpacity
                      style={styles.playerRow}
                      activeOpacity={0.8}
                      onPress={() =>
                        p?.user_id &&
                        router.push({
                          pathname: '/player-profile-view' as any,
                          params: { id: p.user_id },
                        })
                      }
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{getInitials(p?.full_name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName}>{p?.full_name || 'Unknown player'}</Text>
                        <Text style={styles.playerMeta}>
                          {p?.position || '—'} · {p?.county || '—'} · {p?.age || '—'} yrs
                        </Text>
                      </View>
                      <Text style={styles.chev}>›</Text>
                    </TouchableOpacity>

                    {/* Trial details */}
                    <View style={styles.trialBox}>
                      <Text style={styles.trialName}>{inv.trial_name}</Text>
                      <View style={styles.trialMetaRow}>
                        <Text style={styles.trialMeta}>📍 {inv.location}</Text>
                        <Text style={styles.trialMeta}>📅 {inv.trial_date}</Text>
                      </View>
                      {inv.message ? (
                        <Text style={styles.trialMsg}>&quot;{inv.message}&quot;</Text>
                      ) : null}
                    </View>

                    {/* Accepted — show contact + message CTA */}
                    {inv.status === 'accepted' && (
                      <View style={styles.acceptedBox}>
                        <Text style={styles.acceptedText}>
                          🎉 {p?.full_name?.split(' ')[0]} accepted. Contact: {p?.phone || 'no phone on file'}
                        </Text>
                        <TouchableOpacity
                          style={styles.contactBtn}
                          onPress={() => router.push('/messages' as any)}
                        >
                          <Text style={styles.contactBtnText}>💬  Message player</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Pending — allow withdraw */}
                    {inv.status === 'pending' && (
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => cancelInvitation(inv.id, p?.full_name || 'this player')}
                      >
                        <Text style={styles.cancelBtnText}>Withdraw invitation</Text>
                      </TouchableOpacity>
                    )}

                  </View>
                );
              })
            )}
          </>
        )}

      </ScrollView>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => router.push('/scout-dashboard' as any)}
        >
          <Text style={styles.tabIcon}>🏠</Text>
          <Text style={styles.tabLabel}>Home</Text>
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 16 },

  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  backBtn: { color: GREEN, fontSize: 14, fontWeight: '600', width: 55 },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 16, opacity: 0.4 },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: MUTED, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  browseBtn: { backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  browseBtnText: { color: NAVY, fontSize: 14, fontWeight: '800' },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryBox: { flex: 1, backgroundColor: CARD, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448' },
  summaryN: { fontSize: 24, fontWeight: '800' },
  summaryL: { color: MUTED, fontSize: 11, marginTop: 3 },

  filterRow: { marginBottom: 16 },
  filterChip: { backgroundColor: CARD, borderWidth: 1, borderColor: '#1e3448', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  filterChipActive: { backgroundColor: NAVY, borderColor: GREEN },
  filterChipText: { fontSize: 12, color: MUTED },
  filterChipTextActive: { color: GREEN, fontWeight: '700' },

  noneText: { color: MUTED, fontSize: 13, textAlign: 'center', marginTop: 30 },

  invCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1e3448', borderLeftWidth: 4 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusText: { fontSize: 12, fontWeight: '800' },
  sentDate: { color: MUTED, fontSize: 11 },

  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: GREEN, fontSize: 14, fontWeight: '800' },
  playerName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  playerMeta: { color: MUTED, fontSize: 12, marginTop: 2 },
  chev: { color: MUTED, fontSize: 22 },

  trialBox: { paddingTop: 12 },
  trialName: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  trialMetaRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  trialMeta: { color: MUTED, fontSize: 12 },
  trialMsg: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontStyle: 'italic', marginTop: 8, lineHeight: 18 },

  acceptedBox: { marginTop: 12, backgroundColor: 'rgba(59,224,151,0.08)', borderRadius: 10, padding: 12 },
  acceptedText: { color: GREEN, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  contactBtn: { backgroundColor: GREEN, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  contactBtnText: { color: NAVY, fontSize: 13, fontWeight: '700' },

  cancelBtn: { marginTop: 12, backgroundColor: NAVY, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448' },
  cancelBtnText: { color: MUTED, fontSize: 12, fontWeight: '600' },

  tabBar: { flexDirection: 'row', backgroundColor: '#071d33', borderTopWidth: 1, borderTopColor: '#1e3448', paddingVertical: 10, paddingHorizontal: 16 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, marginBottom: 3 },
  tabLabel: { fontSize: 10, color: MUTED },
});