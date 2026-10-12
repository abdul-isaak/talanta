import { ListSkeleton } from '@/components/ui/Skeleton';
import { ratingColor } from '@/lib/poseAnalysis';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
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

const positions = ['All', 'Striker', 'Midfielder', 'Defender', 'Goalkeeper', 'Winger'];
const sortOptions = ['Newest', 'AI rating', 'Goals'];

export default function ScoutSearchScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPos, setSelectedPos] = useState('All');
  const [sortBy, setSortBy] = useState('Newest');

  useFocusEffect(
    useCallback(() => {
      fetchPlayers();
    }, [])
  );

  const fetchPlayers = async () => {
    try {
      const { data, error } = await supabase
        .from('player_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Attach average AI rating per player
      const { data: analyses } = await supabase
        .from('video_analysis')
        .select('player_id, overall_rating');

      const grouped: Record<string, number[]> = {};
      (analyses || []).forEach((a: any) => {
        if (!grouped[a.player_id]) grouped[a.player_id] = [];
        grouped[a.player_id].push(Number(a.overall_rating));
      });

      const enriched = data.map((p: any) => {
        const scores = grouped[p.id];
        return {
          ...p,
          aiRating: scores && scores.length > 0
            ? scores.reduce((s, v) => s + v, 0) / scores.length
            : null,
        };
      });

      setPlayers(enriched);
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

  let filtered = players.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.county || '').toLowerCase().includes(q) ||
      (p.current_club || '').toLowerCase().includes(q);
    const matchPos = selectedPos === 'All' || p.position === selectedPos;
    return matchSearch && matchPos;
  });

  if (sortBy === 'AI rating') {
    filtered = [...filtered].sort((a, b) => (b.aiRating ?? -1) - (a.aiRating ?? -1));
  } else if (sortBy === 'Goals') {
    filtered = [...filtered].sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0));
  }

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
        <TouchableOpacity onPress={() => router.push('/messages' as any)}>
          <Text style={styles.navIcon}>💬</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, county or club..."
            placeholderTextColor="#4a6070"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <Text style={styles.resultCount}>
          {filtered.length} player{filtered.length !== 1 ? 's' : ''} found
        </Text>

        <Text style={styles.filterLabel}>Position</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {positions.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.filterChip, selectedPos === p && styles.filterChipActive]}
              onPress={() => setSelectedPos(p)}
            >
              <Text style={[styles.filterChipText, selectedPos === p && styles.filterChipTextActive]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>Sort by</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.filterRow, { marginBottom: 18 }]}
        >
          {sortOptions.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, sortBy === s && styles.filterChipActive]}
              onPress={() => setSortBy(s)}
            >
              <Text style={[styles.filterChipText, sortBy === s && styles.filterChipTextActive]}>
                {s === 'AI rating' ? '🤖 AI rating' : s}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>No players match your filters.</Text>
        ) : (
          filtered.map((p, i) => (
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
                  <View style={styles.nameRow}>
                    <Text style={styles.cardName}>{p.full_name}</Text>
                    {p.availability === 'available' && <View style={styles.availableDot} />}
                  </View>
                  <Text style={styles.cardMeta}>
                    {p.position || '—'} · {p.county || '—'} · {p.age || '—'} yrs
                  </Text>
                </View>

                {p.aiRating !== null ? (
                  <View style={styles.aiBadge}>
                    <Text style={styles.aiBadgeLabel}>AI</Text>
                    <Text style={[styles.aiBadgeScore, { color: ratingColor(p.aiRating) }]}>
                      {p.aiRating.toFixed(1)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.noAiBadge}>
                    <Text style={styles.noAiBadgeText}>No AI{'\n'}data</Text>
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
            </TouchableOpacity>
          ))
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
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>🔍</Text>
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>Find Players</Text>
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

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, marginTop: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1e3448' },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 13 },
  resultCount: { fontSize: 13, color: MUTED, marginBottom: 16 },

  filterLabel: { fontSize: 12, color: MUTED, fontWeight: '600', marginBottom: 8 },
  filterRow: { marginBottom: 14 },
  filterChip: { backgroundColor: CARD, borderWidth: 1, borderColor: '#1e3448', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  filterChipActive: { backgroundColor: NAVY, borderColor: GREEN },
  filterChipText: { fontSize: 13, color: MUTED },
  filterChipTextActive: { color: GREEN, fontWeight: '600' },

  emptyText: { color: MUTED, fontSize: 14, textAlign: 'center', marginTop: 40 },

  playerCard: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1e3448' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1e3448', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: GREEN, fontSize: 15, fontWeight: '800' },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  availableDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  cardMeta: { color: MUTED, fontSize: 12, marginTop: 3 },

  aiBadge: { alignItems: 'center', backgroundColor: NAVY, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  aiBadgeLabel: { color: MUTED, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  aiBadgeScore: { fontSize: 17, fontWeight: '800' },
  noAiBadge: { alignItems: 'center', backgroundColor: NAVY, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  noAiBadgeText: { color: MUTED, fontSize: 9, textAlign: 'center', lineHeight: 12 },

  cardStats: { flexDirection: 'row', gap: 8 },
  miniStat: { flex: 1, backgroundColor: NAVY, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  miniStatN: { color: '#fff', fontSize: 14, fontWeight: '800' },
  miniStatL: { color: MUTED, fontSize: 9, marginTop: 2 },

  tabBar: { flexDirection: 'row', backgroundColor: '#071d33', borderTopWidth: 1, borderTopColor: '#1e3448', paddingVertical: 10, paddingHorizontal: 16 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, marginBottom: 3 },
  tabLabel: { fontSize: 10, color: MUTED },
  tabLabelActive: { color: GREEN, fontWeight: '600' },
})