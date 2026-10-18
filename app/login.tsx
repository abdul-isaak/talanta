import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const GREEN = '#3BE097';
const NAVY = '#0d1b2a';
const CARD = '#132233';
const MUTED = '#7a99b0';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'player' | 'scout'>('player');

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase()
      const cleanPassword = password.trim()

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      })

      if (error) {
        // Account exists but the email code was never entered: send a fresh code.
        if (/not confirmed/i.test(error.message)) {
          await supabase.auth.resend({ type: 'signup', email: cleanEmail })
          router.push({ pathname: '/verify-account' as any, params: { email: cleanEmail, userId: '', role } })
          return
        }
        Alert.alert('Login failed', error.message)
        return
      }

      // The tab is only a hint: route by the profile this account actually has,
      // so a scout signing in on the Player tab never lands in an empty player account.
      const userId = data.user?.id
      const [playerRes, scoutRes] = await Promise.all([
        supabase.from('player_profiles').select('id').eq('user_id', userId).maybeSingle(),
        supabase.from('scout_profiles').select('id').eq('user_id', userId).maybeSingle(),
      ])
      const actualRole = playerRes.data ? 'player' : scoutRes.data ? 'scout' : null

      if (!actualRole) {
        await supabase.auth.signOut()
        Alert.alert(
          'No profile found',
          'This account is not registered as a player or a scout. Administrators should use the Administrator login.'
        )
        return
      }

      if (actualRole !== role) {
        setRole(actualRole)
        Alert.alert(
          actualRole === 'scout' ? 'Scout account' : 'Player account',
          `This email is registered as a ${actualRole}, so you have been signed in to your ${actualRole} account.`
        )
      }

      router.replace(actualRole === 'player' ? '/player-dashboard' as any : '/scout-dashboard' as any)

    } catch (err) {
      console.log('CATCH ERROR:', err)
      Alert.alert('Login failed', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.eyebrow}>
          <Text style={styles.eyebrowText}>⚽  Kenya&apos;s football talent platform</Text>
        </View>

        <Text style={styles.h1}>Welcome{'\n'}back</Text>
        <Text style={styles.subtitle}>Sign in to continue to Talanta</Text>

        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleBtn, role === 'player' && styles.roleBtnActive]}
            onPress={() => setRole('player')}
          >
            <Text style={[styles.roleBtnText, role === 'player' && styles.roleBtnTextActive]}>⚽ Player</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleBtn, role === 'scout' && styles.roleBtnActive]}
            onPress={() => setRole('scout')}
          >
            <Text style={[styles.roleBtnText, role === 'scout' && styles.roleBtnTextActive]}>🔍 Scout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#4a6070"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, { paddingRight: 70 }]}
              placeholder="••••••••"
              placeholderTextColor="#4a6070"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity style={styles.showBtn} onPress={() => setShowPassword(v => !v)}>
              <Text style={styles.showBtnText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.forgotRow}
          onPress={() => Alert.alert('Forgot password', 'Password reset coming soon.')}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signinBtn, loading && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#0d1b2a" />
            : <Text style={styles.signinBtnText}>Sign in as {role === 'player' ? 'Player' : 'Scout'}</Text>
          }
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.registerBtn}
          onPress={() => router.push('/register-player' as any)}
        >
          <Text style={styles.registerBtnText}>⚽ Register as a Player</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.registerBtn, { marginTop: 10 }]}
          onPress={() => router.push('/register-scout' as any)}
        >
          <Text style={styles.registerBtnText}>🔍 Register as a Scout</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back to home</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48 },
  eyebrow: { alignSelf: 'center', backgroundColor: 'rgba(59,224,151,0.12)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 28 },
  eyebrowText: { color: GREEN, fontSize: 12, fontWeight: '600' },
  h1: { fontSize: 40, fontWeight: '800', color: '#fff', lineHeight: 48, marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: MUTED, marginBottom: 32 },
  roleRow: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 4, marginBottom: 28 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  roleBtnActive: { backgroundColor: GREEN },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: MUTED },
  roleBtnTextActive: { color: NAVY },
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 13, color: MUTED, fontWeight: '500', marginBottom: 8 },
  input: { backgroundColor: CARD, color: '#fff', fontSize: 15, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: '#1e3448' },
  passwordWrap: { position: 'relative' },
  showBtn: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  showBtnText: { color: GREEN, fontSize: 13, fontWeight: '600' },
  forgotRow: { alignItems: 'flex-end', marginBottom: 28, marginTop: -6 },
  forgotText: { color: GREEN, fontSize: 13, fontWeight: '600' },
  signinBtn: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 24 },
  signinBtnText: { color: NAVY, fontSize: 16, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#1e3448' },
  dividerText: { color: MUTED, fontSize: 13 },
  registerBtn: { backgroundColor: CARD, borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448', marginBottom: 0 },
  registerBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  backRow: { alignItems: 'center', paddingVertical: 20 },
  backText: { color: MUTED, fontSize: 13 },
});