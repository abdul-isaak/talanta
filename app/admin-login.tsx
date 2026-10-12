import { logActivity } from '@/lib/activityLog';
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
import { SafeAreaView } from 'react-native-safe-area-context';

const GREEN = '#3BE097';
const NAVY = '#0d1b2a';
const CARD = '#132233';
const MUTED = '#7a99b0';
const GOLD = '#f5a623';

export default function AdminLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Enter the administrator email and password.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (error) {
        Alert.alert('Access denied', 'Invalid administrator credentials.');
        return;
      }

      const userId = data?.user?.id;
      if (!userId) {
        Alert.alert('Access denied', 'Could not verify this account.');
        return;
      }

      // Must exist in the admins table — a normal user signing in here gets rejected
      const { data: adminRow } = await supabase
        .from('admins')
        .select('id, full_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (!adminRow) {
        await supabase.auth.signOut();
        Alert.alert(
          'Access denied',
          'This account does not have administrator privileges.'
        );
        return;
      }

      await logActivity('login', 'Administrator signed in');
      router.replace('/admin-dashboard' as any);

    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.lockWrap}>
            <Text style={styles.lockIcon}>🔐</Text>
          </View>

          <Text style={styles.h1}>Administrator{'\n'}Access</Text>
          <Text style={styles.subtitle}>
            Restricted area. Authorised personnel only.
          </Text>

          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              ⚠️  All access attempts are logged.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Administrator email</Text>
            <TextInput
              style={styles.input}
              placeholder="admin@talanta.com"
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
            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleAdminLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={NAVY} />
              : <Text style={styles.loginBtnText}>🔓  Access Admin Panel</Text>
            }
          </TouchableOpacity>

          <Text style={styles.footNote}>
            Talanta System Administration
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#071d33' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48 },
  backRow: { paddingVertical: 8, marginBottom: 20 },
  backText: { color: MUTED, fontSize: 14, fontWeight: '600' },

  lockWrap: { alignItems: 'center', marginBottom: 20 },
  lockIcon: { fontSize: 52 },

  h1: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 40,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 24,
  },

  warnBox: {
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.3)',
  },
  warnText: { color: GOLD, fontSize: 12, textAlign: 'center', fontWeight: '600' },

  inputGroup: { marginBottom: 18 },
  label: { fontSize: 13, color: MUTED, fontWeight: '500', marginBottom: 8 },
  input: {
    backgroundColor: CARD,
    color: '#fff',
    fontSize: 15,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#1e3448',
  },
  passwordWrap: { position: 'relative' },
  showBtn: { position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' },
  showBtnText: { color: GREEN, fontSize: 13, fontWeight: '600' },

  loginBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  loginBtnText: { color: NAVY, fontSize: 15, fontWeight: '800' },

  footNote: {
    color: '#2e4a5e',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 40,
  },
});