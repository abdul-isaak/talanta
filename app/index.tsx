import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LandingScreen() {
  const router = useRouter();
  const tapCount = useRef(0);
  const tapTimer = useRef<any>(null);
  const [hintVisible, setHintVisible] = useState(false);

  // Tap the logo 5 times within 2 seconds to reveal admin access
  const handleLogoTap = () => {
    tapCount.current += 1;

    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
      setHintVisible(false);
    }, 2000);

    if (tapCount.current === 3) {
      setHintVisible(true);
    }

    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setHintVisible(false);
      clearTimeout(tapTimer.current);
      router.push('/admin-login' as any);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Navbar — logo is the hidden admin trigger ── */}
        <View style={styles.navbar}>
          <TouchableOpacity onPress={handleLogoTap} activeOpacity={1}>
            <Text style={styles.logo}>
              Talan<Text style={styles.logoGreen}>ta</Text>
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signinBtn}
            onPress={() => router.push('/login' as any)}
          >
            <Text style={styles.signinBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>

        {hintVisible && (
          <Text style={styles.hint}>2 more taps...</Text>
        )}

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.eyebrow}>
            <Text style={styles.eyebrowText}>⚽ Kenya&apos;s football talent platform</Text>
          </View>
          <Text style={styles.h1}>
            Where talent meets{'\n'}
            <Text style={styles.h1Green}>opportunity</Text>
          </Text>
          <Text style={styles.subtitle}>
            Players showcase their skills. Scouts discover the next generation.
            AI analyses every highlight. Built for Kenyan football.
          </Text>

          <TouchableOpacity
            style={styles.btnMain}
            onPress={() => router.push('/register-player' as any)}
          >
            <Text style={styles.btnMainText}>Join as a Player</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnGhost}
            onPress={() => router.push('/register-scout' as any)}
          >
            <Text style={styles.btnGhostText}>I&apos;m a Scout →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsBar}>
          {[
            { n: '33', l: 'AI landmarks' },
            { n: '47', l: 'Counties' },
            { n: '6', l: 'Metrics' },
            { n: '100%', l: 'Free' },
          ].map((s, i) => (
            <View key={i} style={[styles.stat, i < 3 && styles.statBorder]}>
              <Text style={styles.statN}>{s.n}</Text>
              <Text style={styles.statL}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* ── Role cards ── */}
        <View style={styles.cards}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/register-player' as any)}
          >
            <Text style={styles.cardIcon}>⚽</Text>
            <Text style={styles.cardTitle}>For Players</Text>
            <Text style={styles.cardDesc}>
              Build your profile, upload highlights and get an AI performance rating
              scouts can trust.
            </Text>
            <Text style={styles.cardCta}>Create profile →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/register-scout' as any)}
          >
            <Text style={styles.cardIcon}>🔍</Text>
            <Text style={styles.cardTitle}>For Scouts</Text>
            <Text style={styles.cardDesc}>
              Search verified talent by position, county and AI rating. Shortlist and
              invite to trials.
            </Text>
            <Text style={styles.cardCta}>Start scouting →</Text>
          </TouchableOpacity>
        </View>

        {/* ── AI feature strip ── */}
        <View style={styles.aiStrip}>
          <Text style={styles.aiStripIcon}>🤖</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiStripTitle}>AI-powered video analysis</Text>
            <Text style={styles.aiStripText}>
              Every highlight is analysed frame by frame to score speed, agility,
              leap, work rate, balance and symmetry.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.bottomRow}
          onPress={() => router.push('/login' as any)}
        >
          <Text style={styles.bottomText}>
            Already have an account? <Text style={styles.bottomLink}>Sign in</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1b2a' },
  scroll: { flexGrow: 1 },

  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#071d33',
    borderBottomWidth: 1,
    borderBottomColor: '#3BE097',
  },
  logo: { fontSize: 28, fontWeight: '800', color: '#ffffff', letterSpacing: -1 },
  logoGreen: { color: '#3BE097' },
  signinBtn: {
    borderWidth: 1.5,
    borderColor: '#3BE097',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  signinBtnText: { color: '#3BE097', fontSize: 13, fontWeight: '700' },
  hint: {
    color: '#7a99b0',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 6,
    backgroundColor: '#071d33',
  },

  hero: {
    backgroundColor: '#0a2540',
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 44,
    alignItems: 'center',
  },
  eyebrow: {
    backgroundColor: 'rgba(59,224,151,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 20,
  },
  eyebrowText: { color: '#3BE097', fontSize: 12, fontWeight: '600' },
  h1: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 44,
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  h1Green: { color: '#3BE097' },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 310,
  },
  btnMain: {
    backgroundColor: '#3BE097',
    borderRadius: 10,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnMainText: { color: '#0a2540', fontSize: 15, fontWeight: '800' },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  btnGhostText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },

  statsBar: {
    backgroundColor: '#071d33',
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  stat: { flex: 1, paddingVertical: 20, alignItems: 'center' },
  statBorder: { borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.07)' },
  statN: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  statL: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3 },

  cards: { backgroundColor: '#f5f5f5', flexDirection: 'row', gap: 12, padding: 20 },
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#e8e8e8',
  },
  cardIcon: { fontSize: 30, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0a2540', marginBottom: 6 },
  cardDesc: { fontSize: 12, color: '#666', lineHeight: 18, marginBottom: 14 },
  cardCta: { fontSize: 13, fontWeight: '700', color: '#0a2540' },

  aiStrip: {
    backgroundColor: '#f5f5f5',
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'flex-start',
  },
  aiStripIcon: { fontSize: 30 },
  aiStripTitle: { color: '#0a2540', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  aiStripText: { color: '#666', fontSize: 12, lineHeight: 18 },

  bottomRow: { backgroundColor: '#f5f5f5', paddingVertical: 24, alignItems: 'center' },
  bottomText: { fontSize: 13, color: '#666' },
  bottomLink: { color: '#0a2540', fontWeight: '700' },
});