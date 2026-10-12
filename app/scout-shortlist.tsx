import { ListSkeleton } from '@/components/ui/Skeleton';
import { ratingColor } from '@/lib/poseAnalysis';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const GREEN = '#3BE097';
const NAVY = '#0d1b2a';
const CARD = '#132233';
const MUTED = '#7a99b0';

export default function ScoutShortlistScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [shortlist, setShortlist] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchShortlist();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const fetchShortlist = async () => {
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

      // Pull shortlist joined with the player's profile
      const { data, error } = await supabase
        .from('shortlists')
        .select('id, notes, created_at, player_profiles(*)')
        .eq('scout_id', scoutData.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.log('Shortlist error:', error);
        setLoading(false);
        return;
      }

      const rows = data || [];

      // Attach each player's average AI rating
      const playerIds = rows
        .map((r: any) => r.player_profiles?.id)
        .filter(Boolean);

      let ratingMap: Record<string, number> = {};

      if (playerIds.length > 0) {
        const { data: analyses } = await supabase
          .from('video_analysis')
          .select('player_id, overall_rating')
          .in('player_id', playerIds);

        const grouped: Record<string, number[]> = {};
        (analyses || []).forEach((a: any) => {
          if (!grouped[a.player_id]) grouped[a.player_id] = [];
          grouped[a.player_id].push(Number(a.overall_rating));
        });

        Object.entries(grouped).forEach(([pid, scores]) => {
          ratingMap[pid] = scores.reduce((s, v) => s + v, 0) / scores.length;
        });
      }

      const enriched = rows.map((r: any) => ({
        ...r,
        aiRating: ratingMap[r.player_profiles?.id] ?? null,
      }));

      setShortlist(enriched);
    } catch (err) {
      console.log('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeFromShortlist = (shortlistId: string, playerName: string) => {
    Alert.alert('Remove player', `Remove ${playerName} from your shortlist?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('shortlists').delete().eq('id', shortlistId);
          fetchShortlist();
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

  const filtered = shortlist.filter((s) => {
    const p = s.player_profiles;
    if (!p) return false;
    const q = search.toLowerCase();
    return (
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.position || '').toLowerCase().includes(q) ||
      (p.county || '').toLowerCase().includes(q)
    );
  });

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
        <Text style={styles.navLogo}>Talan<Text style={styles.navLogoGreen}>ta</Text></Text>
        <Text style={styles.navTitle}>My Shortlist</Text>
        <TouchableOpacity onPress={() => router.push('/messages' as any)}>
          <Text style={styles.navIcon}>💬</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {shortlist.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>⭐</Text>
            <Text style={styles.emptyTitle}>No saved players yet</Text>
            <Text style={styles.emptyText}>
              Browse players and tap Save on any profile to add them here.
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
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Filter by name, position or county..."
                placeholderTextColor="#4a6070"
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <Text style={styles.count}>
              {filtered.length} player{filtered.length !== 1 ? 's' : ''} shortlisted
            </Text>

            {filtered.map((s, i) => {
              const p = s.player_profiles;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.playerCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/player-profile-view' as any,
                      params: { id: p.user_id },
                    })
                  }
                >
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getInitials(p.full_name)}</Text>
                    </View>

                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName}>{p.full_name}</Text>
                      <Text style={styles.cardMeta}>
                        {p.position || '—'} · {p.county || '—'} · {p.age || '—'} yrs
                      </Text>
                    </View>

                    {s.aiRating !== null && (
                      <View style={styles.aiBadge}>
                        <Text style={styles.aiBadgeLabel}>AI</Text>
                        <Text style={[styles.aiBadgeScore, { color: ratingColor(s.aiRating) }]}>
                          {s.aiRating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.cardStats}>
                    {[
                      { n: p.goals ?? 0, l: 'Goals' },
                      { n: p.assists ?? 0, l: 'Assists' },
                      { n: p.appearances ?? 0, l: 'Apps' },
                      { n: p.pass_accuracy || '—', l: 'Pass' },
                    ].map((st, j) => (
                      <View key={j} style={styles.miniStat}>
                        <Text style={styles.miniStatN}>{st.n}</Text>
                        <Text style={styles.miniStatL}>{st.l}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.viewBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/player-profile-view' as any,
                          params: { id: p.user_id },
                        })
                      }
                    >
                      <Text style={styles.viewBtnText}>View profile</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.msgBtn}
                      onPress={() => router.push('/messages' as any)}
                    >
                      <Text style={styles.msgBtnText}>💬</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeFromShortlist(s.id, p.full_name)}
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
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
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>⭐</Text>
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>Shortlist</Text>
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
  navLogo: { fontSize: 20, fontWeight: '800', color: '#fff', width: 80 },
  navLogoGreen: { color: GREEN },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  navIcon: { fontSize: 20, width: 80, textAlign: 'right' },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 16, opacity: 0.4 },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: MUTED, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  browseBtn: { backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  browseBtnText: { color: NAVY, fontSize: 14, fontWeight: '800' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1e3448' },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 12 },
  count: { color: MUTED, fontSize: 13, marginBottom: 14 },

  playerCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1e3448' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1e3448', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: GREEN, fontSize: 15, fontWeight: '800' },
  cardInfo: { flex: 1 },
  cardName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cardMeta: { color: MUTED, fontSize: 12, marginTop: 3 },
  aiBadge: { alignItems: 'center', backgroundColor: NAVY, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  aiBadgeLabel: { color: MUTED, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  aiBadgeScore: { fontSize: 17, fontWeight: '800' },

  cardStats: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  miniStat: { flex: 1, backgroundColor: NAVY, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  miniStatN: { color: '#fff', fontSize: 14, fontWeight: '800' },
  miniStatL: { color: MUTED, fontSize: 9, marginTop: 2 },

  cardActions: { flexDirection: 'row', gap: 8 },
  viewBtn: { flex: 1, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  viewBtnText: { color: NAVY, fontSize: 13, fontWeight: '700' },
  msgBtn: { backgroundColor: '#1e3448', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  msgBtnText: { fontSize: 16 },
  removeBtn: { backgroundColor: '#1e3448', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  removeBtnText: { color: '#ff6b6b', fontSize: 14, fontWeight: '700' },

  tabBar: { flexDirection: 'row', backgroundColor: '#071d33', borderTopWidth: 1, borderTopColor: '#1e3448', paddingVertical: 10, paddingHorizontal: 16 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, marginBottom: 3 },
  tabLabel: { fontSize: 10, color: MUTED },
  tabLabelActive: { color: GREEN, fontWeight: '600' },
});