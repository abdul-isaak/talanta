import { logActivity } from '@/lib/activityLog';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';

const GREEN = '#3BE097';
const NAVY = '#0d1b2a';
const CARD = '#132233';
const MUTED = '#7a99b0';
const RED = '#ff4d4d';
const ORANGE = '#f5a623';

function getPasswordStrength(password: string): { label: string; color: string; width: string } {
  if (password.length === 0) return { label: '', color: 'transparent', width: '0%' };
  if (password.length < 6) return { label: 'Weak', color: RED, width: '33%' };
  if (password.length < 10) return { label: 'Medium', color: ORANGE, width: '66%' };
  return { label: 'Strong', color: GREEN, width: '100%' };
}

export default function RegisterScoutScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState('');
  const [county, setCounty] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = getPasswordStrength(password);

  const handleRegister = async () => {
    if (!fullName || !email || !phone || !organization || !role || !county || !password || !confirmPassword) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Terms & Conditions', 'Please agree to the terms and conditions.');
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (error) {
        Alert.alert('Registration failed', error.message);
        return;
      }

      const user = data.user;
      if (!user) {
        Alert.alert('Error', 'Something went wrong. Please try again.');
        return;
      }

      // Supabase returns a user with no identities when the email is already registered.
      if (user.identities && user.identities.length === 0) {
        Alert.alert('Account already exists', 'An account with this email already exists. Please sign in instead.', [
          { text: 'Sign in', onPress: () => router.replace('/login' as any) },
        ]);
        return;
      }

      const { error: profileError } = await supabase
        .from('scout_profiles')
        .insert({
          user_id: user.id,
          full_name: fullName,
          email: cleanEmail,
          phone,
          organization,
          role,
          county,
        });

      if (profileError) {
        Alert.alert('Error', profileError.message);
        return;
      }

      await supabase.from('profiles').insert({
        email: cleanEmail,
        full_name: fullName,
        phone,
        role: 'scout',
        county,
      });

      await logActivity('register', `New scout account — ${organization}`, {
        userId: user.id,
        email: cleanEmail,
        name: fullName,
        role: 'scout',
      });

      // With email confirmation on, Supabase emails a 6-digit code and there is
      // no session yet: send the user to enter it.
      if (!data.session) {
        router.replace({ pathname: '/verify-account' as any, params: { email: cleanEmail, userId: user.id, role: 'scout' } });
        return;
      }

      Alert.alert(
        'Account created! 🎉',
        'Your scout account is ready. Please sign in to continue.',
        [{ text: 'Sign in', onPress: () => router.replace('/login' as any) }]
      );

    } catch {
      Alert.alert('Error', 'Registration failed. Please try again.');
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
          <Text style={styles.eyebrowText}>🔍  Scout registration</Text>
        </View>

        <Text style={styles.h1}>Join as a{'\n'}scout</Text>
        <Text style={styles.subtitle}>Discover the next generation of Kenyan football talent</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full name</Text>
          <TextInput style={styles.input} placeholder="e.g. David Ochieng" placeholderTextColor="#4a6070" value={fullName} onChangeText={setFullName} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email address</Text>
          <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor="#4a6070" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput style={styles.input} placeholder="07XX XXX XXX" placeholderTextColor="#4a6070" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Club / Organization</Text>
          <TextInput style={styles.input} placeholder="e.g. Gor Mahia FC, AFC Leopards" placeholderTextColor="#4a6070" value={organization} onChangeText={setOrganization} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Your role</Text>
          <TextInput style={styles.input} placeholder="e.g. Head Scout, Talent Coordinator" placeholderTextColor="#4a6070" value={role} onChangeText={setRole} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>County of operation</Text>
          <TextInput style={styles.input} placeholder="e.g. Kisumu" placeholderTextColor="#4a6070" value={county} onChangeText={setCounty} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, { paddingRight: 70 }]}
              placeholder="Min. 8 characters"
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
          {password.length > 0 && (
            <View style={styles.strengthWrap}>
              <View style={styles.strengthBarBg}>
                <View style={[styles.strengthBarFill, { width: strength.width as any, backgroundColor: strength.color }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Confirm password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, { paddingRight: 70 }, confirmPassword.length > 0 && password !== confirmPassword && styles.inputError]}
              placeholder="Re-enter your password"
              placeholderTextColor="#4a6070"
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TouchableOpacity style={styles.showBtn} onPress={() => setShowConfirmPassword(v => !v)}>
              <Text style={styles.showBtnText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <Text style={styles.errorText}>Passwords do not match</Text>
          )}
          {confirmPassword.length > 0 && password === confirmPassword && (
            <Text style={styles.successText}>✓ Passwords match</Text>
          )}
        </View>

        <TouchableOpacity style={styles.termsRow} onPress={() => setAgreedToTerms(v => !v)}>
          <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
            {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.termsText}>
            I agree to the <Text style={styles.termsLink}>Terms & Conditions</Text> and <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.registerBtn, loading && { opacity: 0.7 }]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#0d1b2a" />
            : <Text style={styles.registerBtnText}>Create scout account</Text>}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity style={styles.signinBtn} onPress={() => router.push('/login' as any)}>
          <Text style={styles.signinBtnText}>Already have an account? Sign in</Text>
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
  h1: { fontSize: 38, fontWeight: '800', color: '#fff', lineHeight: 46, marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: MUTED, marginBottom: 32 },
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 13, color: MUTED, fontWeight: '500', marginBottom: 8 },
  input: { backgroundColor: CARD, color: '#fff', fontSize: 15, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: '#1e3448' },
  inputError: { borderColor: RED },
  passwordWrap: { position: 'relative' },
  showBtn: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  showBtnText: { color: GREEN, fontSize: 13, fontWeight: '600' },
  strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  strengthBarBg: { flex: 1, height: 4, backgroundColor: '#1e3448', borderRadius: 2, overflow: 'hidden' },
  strengthBarFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '600', width: 50 },
  errorText: { color: RED, fontSize: 12, marginTop: 6 },
  successText: { color: GREEN, fontSize: 12, marginTop: 6 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 24 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#1e3448', alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkboxChecked: { backgroundColor: GREEN, borderColor: GREEN },
  checkmark: { color: NAVY, fontSize: 13, fontWeight: '800' },
  termsText: { flex: 1, color: MUTED, fontSize: 13, lineHeight: 20 },
  termsLink: { color: GREEN, fontWeight: '600' },
  registerBtn: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 24 },
  registerBtnText: { color: NAVY, fontSize: 16, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#1e3448' },
  dividerText: { color: MUTED, fontSize: 13 },
  signinBtn: { backgroundColor: CARD, borderRadius: 14, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1e3448', marginBottom: 20 },
  signinBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  backRow: { alignItems: 'center', paddingVertical: 8 },
  backText: { color: MUTED, fontSize: 13 },
});