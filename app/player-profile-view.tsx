import { ProfileSkeleton, VideoCardSkeleton } from '@/components/ui/Skeleton';
import StateView from '@/components/ui/StateView';
import VideoCard from '@/components/video/VideoCard';
import VideoPlayerModal from '@/components/video/VideoPlayerModal';
import { METRIC_INFO, ratingColor, ratingLabel } from '@/lib/poseAnalysis';
import { supabase } from '@/lib/supabase';
import { fetchPlayerVideos, type VideoWithMeta } from '@/lib/videoMeta';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

export default function PlayerProfileViewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [profile, setProfile] = useState<any>(null);
  const [videos, setVideos] = useState<VideoWithMeta[] | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<VideoWithMeta | null>(null);
  const [showFullReport, setShowFullReport] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [trialName, setTrialName] = useState('');
  const [trialLocation, setTrialLocation] = useState('');
  const [trialDate, setTrialDate] = useState('');
  const [trialMessage, setTrialMessage] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingShortlist, setSavingShortlist] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchVideos();
    checkShortlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('player_profiles')
        .select('*')
        .eq('user_id', id)
        .single();
      if (!error) setProfile(data);
    } catch (err) {
      console.log('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVideos = async () => {
    try {
      const { data: playerData } = await supabase
        .from('player_profiles')
        .select('id')
        .eq('user_id', id)
        .single();

      if (!playerData) { setVideos([]); return; }

      // Videos and their AI analyses arrive in a single request.
      const list = await fetchPlayerVideos(playerData.id);
      setVideos(list);
      const map: Record<string, any> = {};
      list.forEach((v) => { if (v.analysis) map[v.id] = v.analysis; });
      setAnalyses(map);
    } catch (err) {
      console.log('Error fetching videos:', err);
      setVideos([]);
    }
  };

  const checkShortlist = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const scoutUserId = userData?.user?.id;
      if (!scoutUserId) return;

      const { data: scoutData } = await supabase
        .from('scout_profiles').select('id').eq('user_id', scoutUserId).single();
      if (!scoutData) return;

      const { data: playerData } = await supabase
        .from('player_profiles').select('id').eq('user_id', id).single();
      if (!playerData) return;

      const { data } = await supabase
        .from('shortlists').select('id')
        .eq('scout_id', scoutData.id).eq('player_id', playerData.id).single();

      if (data) setSaved(true);
    } catch (err) {
      console.log('Error checking shortlist:', err);
    }
  };

  const toggleShortlist = async () => {
    setSavingShortlist(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const scoutUserId = userData?.user?.id;
      if (!scoutUserId) return;

      const { data: scoutData } = await supabase
        .from('scout_profiles').select('id').eq('user_id', scoutUserId).single();
      const { data: playerData } = await supabase
        .from('player_profiles').select('id').eq('user_id', id).single();
      if (!scoutData || !playerData) return;

      if (saved) {
        await supabase.from('shortlists').delete()
          .eq('scout_id', scoutData.id).eq('player_id', playerData.id);
        setSaved(false);
        Alert.alert('Removed', 'Player removed from shortlist.');
      } else {
        await supabase.from('shortlists')
          .insert({ scout_id: scoutData.id, player_id: playerData.id });
        setSaved(true);
        Alert.alert('Saved! ⭐', 'Player added to your shortlist.');
      }
    } catch (err) {
      console.log('Error toggling shortlist:', err);
    } finally {
      setSavingShortlist(false);
    }
  };

  const sendInvitation = async () => {
    if (!trialName || !trialLocation || !trialDate) {
      Alert.alert('Missing fields', 'Please fill in trial name, location and date.');
      return;
    }
    setSendingInvite(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const scoutUserId = userData?.user?.id;
      if (!scoutUserId) return;

      const { data: scoutData } = await supabase
        .from('scout_profiles').select('id').eq('user_id', scoutUserId).single();
      const { data: playerData } = await supabase
        .from('player_profiles').select('id').eq('user_id', id).single();
      if (!scoutData || !playerData) return;

      const { error } = await supabase.from('invitations').insert({
        scout_id: scoutData.id,
        player_id: playerData.id,
        trial_name: trialName,
        location: trialLocation,
        trial_date: trialDate,
        message: trialMessage,
        status: 'pending',
      });

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Invitation sent! 📅', `Trial invitation sent to ${profile?.full_name}.`);
        setShowInviteForm(false);
        setTrialName(''); setTrialLocation(''); setTrialDate(''); setTrialMessage('');
      }
    } catch (err) {
      console.log('Error sending invite:', err);
    } finally {
      setSendingInvite(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || '??';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  // ── Aggregate AI data across all analyzed videos ──
  const analysisList = Object.values(analyses) as any[];
  const hasAi = analysisList.length > 0;

  const avg = (key: string) =>
    analysisList.reduce((s, a) => s + Number(a[key]), 0) / analysisList.length;

  const aiOverall = hasAi ? avg('overall_rating') : 0;
  const aiConfidence = hasAi ? avg('detection_confidence') : 0;

  const metricKeys = [
    'sprint_speed_score',
    'agility_score',
    'activity_intensity',
    'vertical_leap_score',
    'balance_score',
    'symmetry_score',
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.emptyText}>Player not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>

      <VideoPlayerModal
        video={selectedVideo}
        subtitle={profile?.full_name}
        onClose={() => setSelectedVideo(null)}
        actions={selectedVideo?.analysis ? [{
          key: 'report',
          label: 'View AI analysis',
          icon: 'analytics-outline',
          onPress: () => {
            const vid = selectedVideo.id;
            setSelectedVideo(null);
            setTimeout(() => router.push({ pathname: '/analyze-video' as any, params: { videoId: vid } }), 250);
          },
        }] : []}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Player Profile</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(profile?.full_name)}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{profile?.full_name || 'Player'}</Text>
              <View style={styles.heroChips}>
                <View style={styles.chip}><Text style={styles.chipText}>📍 {profile?.county || '—'}</Text></View>
                <View style={styles.chip}><Text style={styles.chipText}>🎂 {profile?.age || '—'} yrs</Text></View>
                <View style={styles.chip}><Text style={styles.chipText}>⚽ {profile?.position || '—'}</Text></View>
              </View>
            </View>
          </View>

          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.inviteBtn} onPress={() => setShowInviteForm(!showInviteForm)}>
              <Text style={styles.inviteBtnText}>📅 Invite to trial</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saved && styles.saveBtnActive]}
              onPress={toggleShortlist}
              disabled={savingShortlist}
            >
              <Text style={[styles.saveBtnText, saved && styles.saveBtnTextActive]}>
                {savingShortlist ? '...' : saved ? '⭐ Saved' : '☆ Save'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.msgBtn} onPress={() => router.push('/messages' as any)}>
              <Text style={styles.msgBtnText}>💬</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── AI SCOUTING REPORT ── */}
        {hasAi ? (
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <View>
                <Text style={styles.aiLabel}>🤖 AI SCOUTING REPORT</Text>
                <Text style={styles.aiSub}>
                  From {analysisList.length} analyzed video{analysisList.length > 1 ? 's' : ''}
                </Text>
              </View>
              <View style={styles.aiScoreWrap}>
                <Text style={[styles.aiScore, { color: ratingColor(aiOverall) }]}>
                  {aiOverall.toFixed(1)}
                </Text>
                <Text style={[styles.aiGrade, { color: ratingColor(aiOverall) }]}>
                  {ratingLabel(aiOverall)}
                </Text>
              </View>
            </View>

            {/* Top 3 metrics always visible */}
            {metricKeys.slice(0, showFullReport ? 6 : 3).map((key) => {
              const info = METRIC_INFO[key];
              const value = avg(key);
              return (
                <View key={key} style={styles.aiMetric}>
                  <View style={styles.aiMetricHead}>
                    <Text style={styles.aiMetricLabel}>{info.icon}  {info.label}</Text>
                    <Text style={[styles.aiMetricValue, { color: ratingColor(value) }]}>
                      {value.toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.aiBarBg}>
                    <View style={[styles.aiBarFill, { width: `${value}%` as any, backgroundColor: ratingColor(value) }]} />
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.toggleReportBtn}
              onPress={() => setShowFullReport(!showFullReport)}
            >
              <Text style={styles.toggleReportText}>
                {showFullReport ? '▲  Show less' : '▼  Show full report'}
              </Text>
            </TouchableOpacity>

            {showFullReport && (
              <>
                <View style={styles.aiNotesBox}>
                  <Text style={styles.aiNotesTitle}>AI observations</Text>
                  <Text style={styles.aiNotesText}>
                    {analysisList[0]?.analysis_notes}
                  </Text>
                </View>

                <View style={styles.aiRelBox}>
                  <Text style={styles.aiRelText}>
                    Detection confidence: <Text style={{ color: GREEN, fontWeight: '700' }}>{aiConfidence.toFixed(1)}%</Text>
                    {'  ·  '}33 landmarks/frame
                  </Text>
                  <Text style={styles.aiRelSource}>Powered by Google MediaPipe</Text>
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={styles.noAiCard}>
            <Text style={styles.noAiIcon}>🤖</Text>
            <Text style={styles.noAiTitle}>No AI analysis yet</Text>
            <Text style={styles.noAiText}>
              This player hasn&apos;t run AI analysis on their videos. Manual review only.
            </Text>
          </View>
        )}

        {showInviteForm && (
          <View style={styles.inviteForm}>
            <Text style={styles.inviteFormTitle}>Send Trial Invitation</Text>
            <TextInput style={styles.inviteInput} placeholder="Trial name e.g. Gor Mahia FC Trial" placeholderTextColor="#4a6070" value={trialName} onChangeText={setTrialName} />
            <TextInput style={styles.inviteInput} placeholder="Location e.g. Kasarani Stadium" placeholderTextColor="#4a6070" value={trialLocation} onChangeText={setTrialLocation} />
            <TextInput style={styles.inviteInput} placeholder="Date e.g. Sat 21 Jun 2026" placeholderTextColor="#4a6070" value={trialDate} onChangeText={setTrialDate} />
            <TextInput style={[styles.inviteInput, { height: 80, textAlignVertical: 'top' }]} placeholder="Message (optional)" placeholderTextColor="#4a6070" value={trialMessage} onChangeText={setTrialMessage} multiline />
            <View style={styles.inviteFormBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowInviteForm(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendBtn} onPress={sendInvitation} disabled={sendingInvite}>
                {sendingInvite
                  ? <ActivityIndicator color={NAVY} size="small" />
                  : <Text style={styles.sendBtnText}>Send Invitation</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.statsRow}>
          {[
            { n: String(profile?.goals ?? 0), l: 'Goals' },
            { n: String(profile?.assists ?? 0), l: 'Assists' },
            { n: String(profile?.appearances ?? 0), l: 'Apps' },
            { n: profile?.pass_accuracy || '—', l: 'Pass acc.' },
          ].map((s, i) => (
            <View key={i} style={styles.statBox}>
              <Text style={styles.statN}>{s.n}</Text>
              <Text style={styles.statL}>{s.l}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Player details</Text>
          {[
            { label: '⚽ Position', value: profile?.position || 'Not set' },
            { label: '🦶 Preferred foot', value: profile?.preferred_foot || 'Not set' },
            { label: '📏 Height / weight', value: profile?.height ? `${profile.height} cm · ${profile.weight} kg` : 'Not set' },
            { label: '🏟️ Current club', value: profile?.current_club || 'Not set' },
            { label: '✅ Availability', value: profile?.availability || 'Available', green: true },
            { label: '📞 Contact', value: profile?.phone || '—' },
          ].map((row, i) => (
            <View key={i} style={[styles.detailRow, i < 5 && styles.detailRowBorder]}>
              <Text style={styles.detailLabel}>{row.label}</Text>
              <Text style={[styles.detailValue, (row as any).green && { color: GREEN }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Videos with AI badges ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Highlight videos</Text>
          {videos === null ? (
            <>
              <VideoCardSkeleton />
              <VideoCardSkeleton />
            </>
          ) : videos.length === 0 ? (
            <StateView compact icon="videocam-off-outline" title="No videos yet" message="This player hasn’t uploaded any highlight videos." />
          ) : (
            videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                ownerName={profile?.full_name}
                onPress={() => setSelectedVideo(v)}
              />
            ))
          )}
        </View>

        {profile?.bio && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>About</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  backBtn: { color: GREEN, fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyText: { color: MUTED, fontSize: 13, textAlign: 'center', paddingVertical: 10 },
  hero: { backgroundColor: '#0a2540', padding: 16, marginTop: 16, borderRadius: 16, marginBottom: 14 },
  heroTop: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1e3448', borderWidth: 3, borderColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: GREEN, fontSize: 22, fontWeight: '800' },
  heroInfo: { flex: 1, justifyContent: 'center' },
  heroName: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  heroActions: { flexDirection: 'row', gap: 10 },
  inviteBtn: { flex: 1, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  inviteBtnText: { color: NAVY, fontSize: 13, fontWeight: '700' },
  saveBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  saveBtnActive: { backgroundColor: '#EAF3DE' },
  saveBtnText: { color: '#fff', fontSize: 13 },
  saveBtnTextActive: { color: '#27500A', fontWeight: '600' },
  msgBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  msgBtnText: { fontSize: 18 },

  // AI report card
  aiCard: { backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 2, borderColor: GREEN },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  aiLabel: { color: GREEN, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  aiSub: { color: MUTED, fontSize: 11, marginTop: 3 },
  aiScoreWrap: { alignItems: 'flex-end' },
  aiScore: { fontSize: 38, fontWeight: '800', lineHeight: 42 },
  aiGrade: { fontSize: 12, fontWeight: '700' },
  aiMetric: { marginBottom: 12 },
  aiMetricHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  aiMetricLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  aiMetricValue: { fontSize: 13, fontWeight: '800' },
  aiBarBg: { height: 7, backgroundColor: '#1e3448', borderRadius: 4, overflow: 'hidden' },
  aiBarFill: { height: '100%', borderRadius: 4 },
  toggleReportBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  toggleReportText: { color: GREEN, fontSize: 12, fontWeight: '700' },
  aiNotesBox: { backgroundColor: NAVY, borderRadius: 10, padding: 14, marginTop: 6 },
  aiNotesTitle: { color: MUTED, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  aiNotesText: { color: '#fff', fontSize: 12, lineHeight: 19 },
  aiRelBox: { marginTop: 12, alignItems: 'center' },
  aiRelText: { color: MUTED, fontSize: 11 },
  aiRelSource: { color: MUTED, fontSize: 10, marginTop: 4, fontStyle: 'italic' },

  noAiCard: { backgroundColor: CARD, borderRadius: 14, padding: 20, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448', borderStyle: 'dashed' },
  noAiIcon: { fontSize: 28, marginBottom: 8, opacity: 0.5 },
  noAiTitle: { color: MUTED, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  noAiText: { color: MUTED, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  inviteForm: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: GREEN },
  inviteFormTitle: { color: GREEN, fontSize: 14, fontWeight: '700', marginBottom: 14 },
  inviteInput: { backgroundColor: NAVY, color: '#fff', fontSize: 14, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#1e3448', marginBottom: 10 },
  inviteFormBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, backgroundColor: '#1e3448', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: MUTED, fontSize: 14, fontWeight: '600' },
  sendBtn: { flex: 1, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  sendBtnText: { color: NAVY, fontSize: 14, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448' },
  statN: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statL: { fontSize: 10, color: MUTED, marginTop: 3, textAlign: 'center' },
  card: { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1e3448' },
  cardTitle: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  detailLabel: { fontSize: 13, color: MUTED },
  detailValue: { fontSize: 13, color: '#fff', fontWeight: '600' },

  videoItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  videoItemThumb: { width: 64, height: 40, backgroundColor: '#0a2540', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  videoItemPlay: { fontSize: 18 },
  videoItemInfo: { flex: 1 },
  videoItemTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  ratedBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  ratedBadgeText: { fontSize: 11, fontWeight: '800' },
  notAnalyzed: { color: MUTED, fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  videoArrow: { color: MUTED, fontSize: 22 },

  bioText: { fontSize: 13, color: MUTED, lineHeight: 20 },

  fsRoot: { flex: 1, backgroundColor: '#000' },
  fsTopBarWrap: { backgroundColor: '#000' },
  fsTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  fsCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  fsCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  fsTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center', marginHorizontal: 12 },
  fsVideoWrap: { flex: 1, justifyContent: 'center', backgroundColor: '#000', position: 'relative' },
  fsVideo: { width: '100%', height: '100%' },
  fsBuffering: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  fsBufferingText: { color: '#fff', fontSize: 13, marginTop: 10 },
  fsBottomWrap: { backgroundColor: '#000' },
  fsActions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  fsActionBtn: { alignItems: 'center', paddingHorizontal: 20 },
  fsActionIcon: { fontSize: 22, marginBottom: 6 },
  fsActionLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
})