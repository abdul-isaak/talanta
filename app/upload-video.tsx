import AppHeader from '@/components/ui/AppHeader';
import Button from '@/components/ui/Button';
import PressableScale from '@/components/ui/PressableScale';
import ProgressBar from '@/components/ui/ProgressBar';
import StateView from '@/components/ui/StateView';
import TrimEditor, { type TrimRange } from '@/components/video/TrimEditor';
import { C, R, S, T } from '@/constants/ui';
import { useAnalysis } from '@/lib/analysis/AnalysisProvider';
import { friendlyError, isCancelled } from '@/lib/errors';
import { getMyPlayerProfile } from '@/lib/session';
import { formatBytes, formatDuration } from '@/lib/videoMeta';
import {
  isCompressorAvailable,
  MAX_UPLOAD_BYTES,
  needsCompression,
  PermissionDeniedError,
  pickVideoFromGallery,
  recordVideo,
  uploadPlayerVideo,
  validateVideo,
  withFileSize,
  type PickedVideo,
  type UploadStage,
} from '@/lib/videoUpload';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Step = 'choose' | 'review' | 'uploading' | 'error' | 'done';

const QUICK_TITLES = ['Sprint Training', 'Ball Control', 'Match Highlights', 'Shooting Drill', 'Skills & Dribbling'];

const STAGES: { key: UploadStage; label: string }[] = [
  { key: 'preparing', label: 'Preparing video' },
  { key: 'compressing', label: 'Compressing' },
  { key: 'thumbnail', label: 'Creating thumbnail' },
  { key: 'uploading', label: 'Uploading' },
  { key: 'saving', label: 'Saving to your library' },
];

export default function UploadVideoScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const analysis = useAnalysis();

  const [step, setStep] = useState<Step>('choose');
  const [picking, setPicking] = useState(false);
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [trim, setTrim] = useState<TrimRange | null>(null);
  const [title, setTitle] = useState('');
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  const [stage, setStage] = useState<UploadStage>('preparing');
  const [progress, setProgress] = useState<number | null>(null);
  const [detail, setDetail] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);

  const cancelFn = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);
  const uploadingRef = useRef(false);

  // Guard against leaving the screen mid-upload.
  const confirmLeave = useCallback((leave: () => void) => {
    Alert.alert('Cancel upload?', 'Your video has not finished uploading.', [
      { text: 'Keep uploading', style: 'cancel' },
      { text: 'Cancel upload', style: 'destructive', onPress: () => { cancelUpload(); leave(); } },
    ]);
  }, []);

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      if (!uploadingRef.current) return;
      e.preventDefault();
      confirmLeave(() => navigation.dispatch(e.data.action));
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'review') { setStep('choose'); return true; }
      return false;
    });
    return () => { sub(); back.remove(); };
  }, [navigation, step, confirmLeave]);

  // Start loading the AI model early so analysis begins as soon as the upload ends.
  useEffect(() => {
    if (step === 'review' && autoAnalyze) analysis.prewarm();
  }, [step, autoAnalyze, analysis]);

  const showPermissionHelp = (e: PermissionDeniedError) => {
    const what = e.kind === 'camera' ? 'camera' : 'photos and videos';
    Alert.alert(
      e.kind === 'camera' ? 'Camera access needed' : 'Gallery access needed',
      `Talanta needs access to your ${what} so you can ${e.kind === 'camera' ? 'record' : 'choose'} a highlight video. ${e.canAskAgain ? 'Please allow access when asked.' : 'Open Settings and allow access for Talanta.'}`,
      e.canAskAgain ? [{ text: 'OK' }] : [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
    );
  };

  const choose = async (source: 'gallery' | 'camera') => {
    setPicking(true);
    try {
      const picked = source === 'gallery' ? await pickVideoFromGallery() : await recordVideo();
      if (!picked) return;
      const full = await withFileSize(picked);
      const problem = validateVideo(full);
      if (problem) { Alert.alert('Can’t use this video', problem); return; }
      if (!isCompressorAvailable() && (full.fileSize ?? 0) > MAX_UPLOAD_BYTES) {
        Alert.alert('Video too large', `This video is ${formatBytes(full.fileSize)}. The upload limit is 50 MB. Record a shorter clip or choose a smaller video.`);
        return;
      }
      setVideo(full);
      setTrim(null);
      setTitle((t) => t || '');
      setStep('review');
    } catch (e) {
      if (e instanceof PermissionDeniedError) showPermissionHelp(e);
      else Alert.alert('Couldn’t open videos', friendlyError(e, 'picker'));
    } finally {
      setPicking(false);
    }
  };

  const cancelUpload = () => {
    cancelledRef.current = true;
    cancelFn.current?.();
  };

  const startUpload = async () => {
    if (!video) return;
    cancelledRef.current = false;
    uploadingRef.current = true;
    setError(null);
    setStep('uploading');
    setStage('preparing');
    setProgress(null);
    try {
      const trimmed = trim && (trim.start > 0.25 || trim.end < (video.duration || trim.end) - 0.25) ? trim : null;
      const res = await uploadPlayerVideo({
        video,
        title: title.trim() || 'Highlight video',
        trimStart: trimmed ? +trimmed.start.toFixed(2) : null,
        trimEnd: trimmed ? +trimmed.end.toFixed(2) : null,
        onStage: setStage,
        onProgress: (p, d) => { setProgress(p); setDetail(d); },
        registerCancel: (fn) => { cancelFn.current = fn; },
        isCancelled: () => cancelledRef.current,
      });
      setThumb(res.thumbnailLocal);
      uploadingRef.current = false;

      if (autoAnalyze) {
        const player = await getMyPlayerProfile();
        analysis.start({
          videoId: res.video.id,
          playerId: player?.id ?? res.video.player_id,
          title: res.video.title,
          url: res.video.video_url,
          start: trimmed?.start ?? null,
          end: trimmed?.end ?? null,
        });
        setStep('done');
        router.replace({ pathname: '/analyze-video' as any, params: { videoId: res.video.id } });
        return;
      }
      setStep('done');
    } catch (e) {
      uploadingRef.current = false;
      if (isCancelled(e) || cancelledRef.current) {
        setStep('review');
        return;
      }
      setError(friendlyError(e, 'upload'));
      setStep('error');
    }
  };

  const willCompress = video ? needsCompression(video) && isCompressorAvailable() : false;
  const visibleStages = STAGES.filter((s) => s.key !== 'compressing' || willCompress);
  const stageIndex = visibleStages.findIndex((s) => s.key === stage);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <AppHeader
        title={step === 'review' ? 'Prepare video' : 'Upload video'}
        onBack={step === 'review' ? () => setStep('choose') : step === 'uploading' ? () => confirmLeave(() => router.back()) : undefined}
      />

      {step === 'choose' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.h1}>Show scouts what you can do</Text>
          <Text style={styles.lead}>Choose a clip from your gallery or record one now. You can trim it to the important part before uploading.</Text>

          <PressableScale haptic onPress={() => choose('gallery')} disabled={picking} style={[styles.option, styles.optionPrimary]} accessibilityRole="button" accessibilityLabel="Choose from gallery">
            <View style={[styles.optionIcon, { backgroundColor: 'rgba(13,27,42,0.15)' }]}>
              <Ionicons name="images" size={26} color={C.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: C.onPrimary }]}>Choose from gallery</Text>
              <Text style={[styles.optionSub, { color: 'rgba(13,27,42,0.7)' }]}>Pick a video already on your phone</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.onPrimary} />
          </PressableScale>

          <PressableScale haptic onPress={() => choose('camera')} disabled={picking} style={styles.option} accessibilityRole="button" accessibilityLabel="Record a video">
            <View style={styles.optionIcon}>
              <Ionicons name="videocam" size={26} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>Record a video</Text>
              <Text style={styles.optionSub}>Film a drill or skill right now</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.muted} />
          </PressableScale>

          <View style={styles.tips}>
            <Text style={styles.tipsTitle}>For the best AI results</Text>
            {[
              ['body', 'Keep your whole body in the frame'],
              ['resize', 'Film from close range, not across the pitch'],
              ['hand-left', 'Hold the phone steady or lean it on something'],
              ['sunny', 'Film in daylight'],
              ['timer', 'Short clips of 10–30 seconds work best'],
            ].map(([icon, text]) => (
              <View key={text} style={styles.tipRow}>
                <Ionicons name={icon as any} size={16} color={C.primary} />
                <Text style={styles.tipText}>{text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {step === 'review' && video && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TrimEditor uri={video.uri} duration={video.duration} value={trim} onChange={setTrim} />

            <View style={styles.infoRow}>
              {!!video.duration && <InfoPill icon="time-outline" text={formatDuration(video.duration)} />}
              {!!video.fileSize && <InfoPill icon="document-outline" text={formatBytes(video.fileSize)} />}
              {!!video.width && !!video.height && <InfoPill icon="expand-outline" text={`${Math.max(video.width, video.height)}p`} />}
              {willCompress && <InfoPill icon="flash-outline" text="Will be optimised" tone="primary" />}
            </View>

            <Text style={styles.label}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Sprint Training"
              placeholderTextColor={C.dim}
              style={styles.input}
              maxLength={60}
              returnKeyType="done"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginTop: 10 }}>
              {QUICK_TITLES.map((q) => (
                <PressableScale key={q} onPress={() => setTitle(q)} style={[styles.chip, title === q && styles.chipActive]}>
                  <Text style={[styles.chipText, title === q && { color: C.onPrimary }]}>{q}</Text>
                </PressableScale>
              ))}
            </ScrollView>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Analyze with AI after upload</Text>
                <Text style={styles.switchSub}>Runs in the background — you can keep using the app.</Text>
              </View>
              <Switch value={autoAnalyze} onValueChange={setAutoAnalyze} trackColor={{ true: C.primary, false: C.borderStrong }} thumbColor="#fff" />
            </View>

            <Button title="Upload video" icon="cloud-upload" onPress={startUpload} style={{ marginTop: S.lg }} />
            <Button title="Choose a different video" variant="ghost" onPress={() => setStep('choose')} style={{ marginTop: 4 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {step === 'uploading' && (
        <View style={styles.progressWrap}>
          <View style={styles.progressCard}>
            <Ionicons name="cloud-upload" size={34} color={C.primary} style={{ alignSelf: 'center' }} />
            <Text style={styles.progressTitle}>{visibleStages[stageIndex]?.label ?? 'Working'}…</Text>
            <ProgressBar value={progress} height={10} />
            <View style={styles.progressMeta}>
              <Text style={styles.progressDetail}>{detail ?? ' '}</Text>
              {progress !== null && <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>}
            </View>

            <View style={{ marginTop: S.lg, gap: 10 }}>
              {visibleStages.map((s, i) => {
                const done = i < stageIndex;
                const current = i === stageIndex;
                return (
                  <View key={s.key} style={styles.stageRow}>
                    <View style={[styles.stageDot, done && styles.stageDone, current && styles.stageCurrent]}>
                      {done ? <Ionicons name="checkmark" size={12} color={C.onPrimary} /> : null}
                    </View>
                    <Text style={[styles.stageText, (done || current) && { color: C.text }, current && { fontWeight: '700' }]}>{s.label}</Text>
                  </View>
                );
              })}
              {autoAnalyze && (
                <View style={styles.stageRow}>
                  <View style={styles.stageDot} />
                  <Text style={styles.stageText}>AI analysis</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.keepOpen}>Keep Talanta open until the upload finishes.</Text>
          <Button title="Cancel upload" variant="secondary" onPress={() => confirmLeave(() => {})} />
        </View>
      )}

      {step === 'error' && (
        <View style={styles.progressWrap}>
          <StateView
            icon="cloud-offline-outline"
            tone="error"
            title="Upload didn’t finish"
            message={error ?? undefined}
            actions={[
              { title: 'Try again', icon: 'refresh', onPress: startUpload },
              { title: 'Edit video', onPress: () => setStep('review'), variant: 'secondary' },
              { title: 'Cancel', onPress: () => router.back(), variant: 'ghost' },
            ]}
          />
        </View>
      )}

      {step === 'done' && !autoAnalyze && (
        <View style={styles.progressWrap}>
          {thumb && <Image source={{ uri: thumb }} style={styles.doneThumb} contentFit="cover" />}
          <StateView
            icon="checkmark-circle"
            title="Video uploaded"
            message="It’s now in your video library and visible to scouts."
            actions={[
              { title: 'Go to my videos', icon: 'albums', onPress: () => router.replace('/my-videos' as any) },
              { title: 'Upload another', onPress: () => { setVideo(null); setTitle(''); setStep('choose'); }, variant: 'secondary' },
            ]}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function InfoPill({ icon, text, tone }: { icon: keyof typeof Ionicons.glyphMap; text: string; tone?: 'primary' }) {
  const color = tone === 'primary' ? C.primary : C.muted;
  return (
    <View style={[styles.pill, tone === 'primary' && { backgroundColor: C.primarySoft }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: S.lg, paddingBottom: 48 },
  h1: { color: C.text, fontSize: T.h2, fontWeight: '800', marginTop: S.sm },
  lead: { color: C.muted, fontSize: T.body, lineHeight: 20, marginTop: 6, marginBottom: S.xl },
  option: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.lg, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: S.md },
  optionPrimary: { backgroundColor: C.primary, borderColor: C.primary },
  optionIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { color: C.text, fontSize: T.bodyLg, fontWeight: '800' },
  optionSub: { color: C.muted, fontSize: T.small, marginTop: 2 },
  tips: { marginTop: S.lg, padding: S.lg, borderRadius: R.lg, backgroundColor: C.surfaceAlt, gap: 10 },
  tipsTitle: { color: C.text, fontSize: T.body, fontWeight: '700', marginBottom: 2 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipText: { color: C.textSoft, fontSize: T.small, flex: 1 },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: S.md },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: T.caption, fontWeight: '600' },
  label: { color: C.text, fontSize: T.body, fontWeight: '700', marginTop: S.xl, marginBottom: S.sm },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.md, color: C.text, fontSize: T.bodyLg, paddingHorizontal: 14, paddingVertical: 12 },
  chip: { borderRadius: R.pill, borderWidth: 1, borderColor: C.borderStrong, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.textSoft, fontSize: T.small, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginTop: S.xl, padding: S.lg, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  switchTitle: { color: C.text, fontSize: T.body, fontWeight: '700' },
  switchSub: { color: C.muted, fontSize: T.caption, marginTop: 2 },
  progressWrap: { flex: 1, justifyContent: 'center', padding: S.lg, gap: S.lg },
  progressCard: { backgroundColor: C.surface, borderRadius: R.xl, padding: S.xl, borderWidth: 1, borderColor: C.border, gap: S.md },
  progressTitle: { color: C.text, fontSize: T.title, fontWeight: '800', textAlign: 'center' },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  progressDetail: { color: C.muted, fontSize: T.small },
  progressPct: { color: C.primary, fontSize: T.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stageDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  stageDone: { backgroundColor: C.primary, borderColor: C.primary },
  stageCurrent: { borderColor: C.primary },
  stageText: { color: C.muted, fontSize: T.body },
  keepOpen: { color: C.muted, fontSize: T.small, textAlign: 'center' },
  doneThumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: R.lg },
});
