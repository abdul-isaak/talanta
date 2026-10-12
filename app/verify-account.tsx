import { logActivity } from '@/lib/activityLog';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
const RED = '#ff6b6b';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const MAX_ATTEMPTS = 3;

const emptyDigits = () => Array(CODE_LENGTH).fill('');

export default function VerifyAccountScreen() {
  const router = useRouter();
  const { email, userId, role } = useLocalSearchParams<{
    email: string; userId: string; role: string;
  }>();

  const [digits, setDigits] = useState<string[]>(emptyDigits());
  const inputs = useRef<(TextInput | null)[]>([]);

  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const resend = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    setError(null);

    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: email as string,
    });

    if (err) {
      setError(err.message);
    } else {
      setDigits(emptyDigits());
      setAttempts(0);
      setCooldown(RESEND_COOLDOWN);
      inputs.current[0]?.focus();
      Alert.alert('Code sent', `A new verification code has been emailed to ${email}.`);
    }

    setResending(false);
  };

  const onChangeDigit = (value: string, index: number) => {
    const clean = value.replace(/[^0-9]/g, '');
    const next = [...digits];

    // Pasted the whole code
    if (clean.length > 1) {
      clean.slice(0, CODE_LENGTH).split('').forEach((c, i) => { next[i] = c; });
      setDigits(next);
      inputs.current[Math.min(clean.length, CODE_LENGTH - 1)]?.focus();
      setError(null);
      return;
    }

    next[index] = clean;
    setDigits(next);
    setError(null);

    if (clean && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const onKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const submit = async () => {
    const token = digits.join('');

    if (token.length !== CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits.`);
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      setError('Too many incorrect attempts. Request a new code.');
      return;
    }

    setVerifying(true);
    setError(null);

    const { error: err } = await supabase.auth.verifyOtp({
      email: email as string,
      token,
      type: 'signup',
    });

    if (err) {
      const next = attempts + 1;
      setAttempts(next);
      const left = MAX_ATTEMPTS - next;

      setError(
        left <= 0
          ? 'Too many incorrect attempts. Request a new code below.'
          : `Incorrect or expired code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
      );

      setDigits(emptyDigits());
      inputs.current[0]?.focus();
      setVerifying(false);
      return;
    }

    // Flag the profile as verified
    const table = role === 'scout' ? 'scout_profiles' : 'player_profiles';
    await supabase.from(table).update({ is_verified: true }).eq('email', email);

    await logActivity('register', 'Account verified via emailed code', {
      userId: userId as string,
      email: email as string,
      role: role as string,
    });

    // verifyOtp signs the user in, so go straight to their dashboard.
    setVerifying(false);
    router.replace((role === 'scout' ? '/scout-dashboard' : '/player-dashboard') as any);
  };

  const cancel = () => {
    Alert.alert(
      'Verify later?',
      'Your account exists but stays unverified. You can request a new code by signing in.',
      [
        { text: 'Keep verifying', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.replace('/login' as any) },
      ]
    );
  };

  const complete = digits.every(d => d !== '');
  const lockedOut = attempts >= MAX_ATTEMPTS;

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
          <TouchableOpacity style={styles.backRow} onPress={cancel}>
            <Text style={styles.backText}>← Verify later</Text>
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <Text style={styles.icon}>📧</Text>
          </View>

          <Text style={styles.h1}>Check your{'\n'}email</Text>
          <Text style={styles.subtitle}>
            We&apos;ve sent an {CODE_LENGTH}-digit verification code to
          </Text>
          <Text style={styles.emailLine}>{email}</Text>

          <View style={styles.hintBox}>
            <Text style={styles.hintText}>
              Can&apos;t find it? Check your spam folder. The code expires in
              {' '}<Text style={styles.hintBold}>10 minutes</Text>.
            </Text>
          </View>

          {/* Code inputs */}
          <View style={styles.digitRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(el) => { inputs.current[i] = el; }}
                style={[
                  styles.digitInput,
                  d && styles.digitInputFilled,
                  error && styles.digitInputError,
                ]}
                value={d}
                onChangeText={(v) => onChangeDigit(v, i)}
                onKeyPress={(e) => onKeyPress(e, i)}
                keyboardType="number-pad"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                textContentType={i === 0 ? 'oneTimeCode' : 'none'}
                maxLength={CODE_LENGTH}
                textAlign="center"
                selectTextOnFocus
                autoFocus={i === 0}
                editable={!lockedOut}
              />
            ))}
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.verifyBtn, (!complete || verifying || lockedOut) && styles.verifyBtnOff]}
            onPress={submit}
            disabled={!complete || verifying || lockedOut}
          >
            {verifying
              ? <ActivityIndicator color={NAVY} />
              : <Text style={styles.verifyBtnText}>Verify account</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={resend}
            disabled={cooldown > 0 || resending}
          >
            {resending ? (
              <ActivityIndicator color={GREEN} size="small" />
            ) : (
              <Text style={[styles.resendText, cooldown > 0 && { color: '#2e4a5e' }]}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.securityBox}>
            <Text style={styles.securityTitle}>Security measures</Text>
            {[
              'Code delivered by email via SMTP',
              `${CODE_LENGTH}-digit numeric code`,
              'Code expires after 10 minutes',
              `Maximum ${MAX_ATTEMPTS} verification attempts`,
              `${RESEND_COOLDOWN}-second cooldown between resends`,
              'Previous codes invalidated on resend',
            ].map((s, i) => (
              <Text key={i} style={styles.securityItem}>·  {s}</Text>
            ))}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  backRow: { paddingVertical: 8, marginBottom: 12 },
  backText: { color: MUTED, fontSize: 14, fontWeight: '600' },

  iconWrap: { alignItems: 'center', marginBottom: 18 },
  icon: { fontSize: 48 },

  h1: {
    fontSize: 30, fontWeight: '800', color: '#fff',
    textAlign: 'center', lineHeight: 38, marginBottom: 10,
  },
  subtitle: {
    fontSize: 14, color: MUTED, textAlign: 'center',
    lineHeight: 21, marginBottom: 4,
  },
  emailLine: {
    fontSize: 14, color: GREEN, textAlign: 'center',
    fontWeight: '700', marginBottom: 20,
  },

  hintBox: {
    backgroundColor: CARD, borderRadius: 10, padding: 12,
    marginBottom: 24, borderWidth: 1, borderColor: '#1e3448',
  },
  hintText: { color: MUTED, fontSize: 11.5, lineHeight: 17, textAlign: 'center' },
  hintBold: { color: '#fff', fontWeight: '700' },

  digitRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    gap: 5, marginBottom: 20,
  },
  digitInput: {
    flex: 1, minWidth: 0, height: 60,
    backgroundColor: CARD, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#1e3448',
    color: '#fff', fontSize: 19, fontWeight: '800',
    paddingHorizontal: 0,
  },
  digitInputFilled: { borderColor: GREEN, backgroundColor: '#0f2a3d' },
  digitInputError: { borderColor: RED },

  errorBox: {
    backgroundColor: 'rgba(255,107,107,0.1)', borderRadius: 10,
    padding: 12, marginBottom: 18,
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.3)',
  },
  errorText: { color: RED, fontSize: 12.5, textAlign: 'center', lineHeight: 18 },

  verifyBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginBottom: 12,
  },
  verifyBtnOff: { backgroundColor: '#1e3448' },
  verifyBtnText: { color: NAVY, fontSize: 15, fontWeight: '800' },

  resendBtn: { alignItems: 'center', paddingVertical: 14, marginBottom: 26, minHeight: 44 },
  resendText: { color: GREEN, fontSize: 13, fontWeight: '700' },

  securityBox: {
    backgroundColor: CARD, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#1e3448',
  },
  securityTitle: {
    color: MUTED, fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  securityItem: { color: MUTED, fontSize: 11.5, lineHeight: 20 },
});