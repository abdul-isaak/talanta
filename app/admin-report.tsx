import { supabase } from '@/lib/supabase';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
const DEEP = '#071d33';
const CARD = '#132233';
const MUTED = '#7a99b0';
const GOLD = '#f5a623';

export default function AdminReportScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    buildReport();
  }, []);

  const buildReport = async () => {
    try {
      const [players, scouts, videos, analyses, shortlists, invitations, messages, logs] =
        await Promise.all([
          supabase.from('player_profiles').select('*'),
          supabase.from('scout_profiles').select('*'),
          supabase.from('videos').select('*'),
          supabase.from('video_analysis').select('*').order('created_at', { ascending: true }),
          supabase.from('shortlists').select('*'),
          supabase.from('invitations').select('*'),
          supabase.from('messages').select('id'),
          supabase.from('activity_logs').select('*').order('created_at', { ascending: false }),
        ]);

      // One report per video (the newest), so re-analysed videos are not counted twice.
      const latest = new Map<string, any>();
      (analyses.data || []).forEach((x: any) => latest.set(x.video_id, x));
      const a = [...latest.values()];
      const invs = invitations.data || [];
      const pl = players.data || [];
      const lg = logs.data || [];

      const counties: Record<string, number> = {};
      pl.forEach((p: any) => {
        const c = p.county || 'Unspecified';
        counties[c] = (counties[c] || 0) + 1;
      });

      const positions: Record<string, number> = {};
      pl.forEach((p: any) => {
        const pos = p.position || 'Unspecified';
        positions[pos] = (positions[pos] || 0) + 1;
      });

      const actions: Record<string, number> = {};
      lg.forEach((l: any) => {
        actions[l.action] = (actions[l.action] || 0) + 1;
      });

      const confidences = a.map((x: any) => Number(x.detection_confidence));
      const ratings = a.map((x: any) => Number(x.overall_rating));

      const mean = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
      const stdev = (arr: number[]) => {
        if (arr.length < 2) return 0;
        const m = mean(arr);
        return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
      };
      const median = (arr: number[]) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((x, y) => x - y);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
      };

      // Mean of each individual metric across all analyses
      const metricMeans = {
        sprint: mean(a.map((x: any) => Number(x.sprint_speed_score))),
        agility: mean(a.map((x: any) => Number(x.agility_score))),
        activity: mean(a.map((x: any) => Number(x.activity_intensity))),
        leap: mean(a.map((x: any) => Number(x.vertical_leap_score))),
        balance: mean(a.map((x: any) => Number(x.balance_score))),
        symmetry: mean(a.map((x: any) => Number(x.symmetry_score))),
      };

      setReport({
        generated: new Date(),
        totals: {
          players: pl.length,
          scouts: scouts.data?.length || 0,
          videos: videos.data?.length || 0,
          analyses: a.length,
          shortlists: shortlists.data?.length || 0,
          invitations: invs.length,
          accepted: invs.filter((i: any) => i.status === 'accepted').length,
          declined: invs.filter((i: any) => i.status === 'declined').length,
          pending: invs.filter((i: any) => i.status === 'pending').length,
          messages: messages.data?.length || 0,
          logins: actions['login'] || 0,
          registrations: actions['register'] || 0,
          totalEvents: lg.length,
        },
        ai: {
          count: a.length,
          meanConfidence: mean(confidences),
          medianConfidence: median(confidences),
          minConfidence: confidences.length ? Math.min(...confidences) : 0,
          maxConfidence: confidences.length ? Math.max(...confidences) : 0,
          sdConfidence: stdev(confidences),
          meanRating: mean(ratings),
          minRating: ratings.length ? Math.min(...ratings) : 0,
          maxRating: ratings.length ? Math.max(...ratings) : 0,
          sdRating: stdev(ratings),
          totalFrames: a.reduce((s: number, x: any) => s + Number(x.frames_analyzed || 0), 0),
          detectedFrames: a.reduce((s: number, x: any) => s + Number(x.frames_with_detection || 0), 0),
          metricMeans,
        },
        counties: Object.entries(counties).sort((x: any, y: any) => y[1] - x[1]),
        positions: Object.entries(positions).sort((x: any, y: any) => y[1] - x[1]),
        actions: Object.entries(actions).sort((x: any, y: any) => y[1] - x[1]),
        analyses: a,
        recentLogs: lg.slice(0, 40),
      });
    } catch (err) {
      console.log('Report error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────
  //  PDF HTML
  // ─────────────────────────────────────────────
  const buildHtml = () => {
    const r = report;
    const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);
    const date = r.generated.toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const rows = (pairs: [string, any][]) =>
      pairs.map(([l, v]) => `<tr><td class="lbl">${l}</td><td class="val">${v}</td></tr>`).join('');

    const analysisRows = r.analyses.map((x: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td>${Number(x.overall_rating).toFixed(1)}</td>
        <td>${Number(x.sprint_speed_score).toFixed(1)}</td>
        <td>${Number(x.agility_score).toFixed(1)}</td>
        <td>${Number(x.balance_score).toFixed(1)}</td>
        <td class="hl">${Number(x.detection_confidence).toFixed(1)}%</td>
        <td>${x.frames_with_detection}/${x.frames_analyzed}</td>
      </tr>`).join('');

    const logRows = r.recentLogs.map((l: any) => `
      <tr>
        <td>${new Date(l.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
        <td>${l.user_name || '—'}</td>
        <td>${l.user_role || '—'}</td>
        <td>${l.action}</td>
        <td class="small">${l.details || '—'}</td>
      </tr>`).join('');

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    font-size: 10.5pt;
    line-height: 1.45;
    margin: 0;
  }

  .cover { text-align: center; padding: 40px 0 28px; border-bottom: 3px solid #0a2540; margin-bottom: 26px; }
  .brand { font-size: 34pt; font-weight: 800; letter-spacing: 3px; color: #0a2540; margin: 0; }
  .brand span { color: #1a9c68; }
  .tagline { font-size: 11pt; color: #555; margin: 6px 0 18px; }
  .doctype { font-size: 15pt; font-weight: 700; color: #0a2540; margin: 0; }
  .gen { font-size: 9.5pt; color: #777; margin-top: 6px; }

  h2 {
    font-size: 11.5pt;
    font-weight: 800;
    color: #0a2540;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    border-bottom: 2px solid #1a9c68;
    padding-bottom: 5px;
    margin: 26px 0 12px;
  }
  h3 { font-size: 10pt; color: #444; margin: 16px 0 7px; font-weight: 700; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #e4e4e4; }
  th {
    background: #0a2540; color: #fff; font-size: 8.5pt;
    text-transform: uppercase; letter-spacing: 0.4px; text-align: left;
    border-bottom: none;
  }
  td { font-size: 10pt; }
  td.lbl { color: #555; width: 62%; }
  td.val { font-weight: 700; text-align: right; }
  td.hl { color: #1a9c68; font-weight: 700; }
  td.small { font-size: 8.5pt; color: #666; }
  tr:nth-child(even) td { background: #fafafa; }

  .kpis { display: flex; gap: 10px; margin-bottom: 14px; }
  .kpi { flex: 1; border: 1.5px solid #ddd; border-radius: 6px; padding: 12px 8px; text-align: center; }
  .kpi .n { font-size: 20pt; font-weight: 800; color: #0a2540; display: block; }
  .kpi .l { font-size: 8pt; color: #777; text-transform: uppercase; letter-spacing: 0.4px; }

  .highlight {
    border: 2px solid #1a9c68;
    border-radius: 6px;
    padding: 14px;
    background: #f4fdf9;
    margin-bottom: 10px;
  }
  .note { font-size: 9pt; color: #666; font-style: italic; margin-top: 6px; }

  .bar-wrap { margin-bottom: 9px; }
  .bar-top { display: flex; justify-content: space-between; font-size: 9.5pt; margin-bottom: 3px; }
  .bar-bg { height: 9px; background: #e8e8e8; border-radius: 5px; overflow: hidden; }
  .bar-fill { height: 100%; background: #1a9c68; }

  .page-break { page-break-before: always; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; text-align: center; font-size: 8.5pt; color: #888; }
</style>
</head>
<body>

  <div class="cover">
    <p class="brand">TALAN<span>TA</span></p>
    <p class="tagline">AI-Powered Sports Talent Scouting Platform</p>
    <p class="doctype">System Analytics Report</p>
    <p class="gen">Generated ${date}</p>
  </div>

  <div class="kpis">
    <div class="kpi"><span class="n">${r.totals.players}</span><span class="l">Players</span></div>
    <div class="kpi"><span class="n">${r.totals.scouts}</span><span class="l">Scouts</span></div>
    <div class="kpi"><span class="n">${r.totals.videos}</span><span class="l">Videos</span></div>
    <div class="kpi"><span class="n">${r.totals.analyses}</span><span class="l">AI Analyses</span></div>
  </div>

  <h2>1. User Statistics</h2>
  <table>
    ${rows([
      ['Registered players', r.totals.players],
      ['Registered scouts', r.totals.scouts],
      ['Total registered users', r.totals.players + r.totals.scouts],
      ['Login events recorded', r.totals.logins],
      ['Registration events recorded', r.totals.registrations],
      ['Total system events logged', r.totals.totalEvents],
    ] as any)}
  </table>

  <h2>2. Content Statistics</h2>
  <table>
    ${rows([
      ['Highlight videos uploaded', r.totals.videos],
      ['Videos processed by AI', r.totals.analyses],
      ['AI analysis coverage', pct(r.totals.analyses, r.totals.videos) + '%'],
      ['Messages exchanged', r.totals.messages],
      ['Average videos per player', r.totals.players ? (r.totals.videos / r.totals.players).toFixed(2) : '0'],
    ] as any)}
  </table>

  <h2>3. Scouting Activity</h2>
  <table>
    ${rows([
      ['Players shortlisted by scouts', r.totals.shortlists],
      ['Trial invitations sent', r.totals.invitations],
      ['Invitations accepted', `${r.totals.accepted} (${pct(r.totals.accepted, r.totals.invitations)}%)`],
      ['Invitations declined', r.totals.declined],
      ['Invitations pending', r.totals.pending],
    ] as any)}
  </table>

  <div class="page-break"></div>

  <h2>4. AI System Performance</h2>

  <div class="highlight">
    <strong>Model:</strong> Google MediaPipe Pose Landmarker (Lite, float16)<br>
    <strong>Landmarks detected:</strong> 33 per frame &nbsp;·&nbsp;
    <strong>Sampling:</strong> 5 frames per second of the selected section (24–72 frames per video)<br>
    <strong>Execution:</strong> On-device via WebView (GPU delegate)
    <p class="note">
      Detection confidence is the mean landmark visibility score returned by the model,
      and is used as the primary accuracy measure for this system.
    </p>
  </div>

  <h3>Processing volume</h3>
  <table>
    ${rows([
      ['Total analyses performed', r.ai.count],
      ['Total frames processed', r.ai.totalFrames],
      ['Frames with pose detected', r.ai.detectedFrames],
      ['Frame detection rate', pct(r.ai.detectedFrames, r.ai.totalFrames) + '%'],
    ] as any)}
  </table>

  <h3>Detection confidence (accuracy measure)</h3>
  <table>
    ${rows([
      ['Mean', r.ai.meanConfidence.toFixed(2) + '%'],
      ['Median', r.ai.medianConfidence.toFixed(2) + '%'],
      ['Minimum', r.ai.minConfidence.toFixed(2) + '%'],
      ['Maximum', r.ai.maxConfidence.toFixed(2) + '%'],
      ['Standard deviation', r.ai.sdConfidence.toFixed(2)],
      ['Sample size (n)', r.ai.count],
    ] as any)}
  </table>

  <h3>Overall player ratings</h3>
  <table>
    ${rows([
      ['Mean rating', r.ai.meanRating.toFixed(2) + ' / 100'],
      ['Minimum', r.ai.minRating.toFixed(2)],
      ['Maximum', r.ai.maxRating.toFixed(2)],
      ['Standard deviation', r.ai.sdRating.toFixed(2)],
    ] as any)}
  </table>

  <h3>Mean score by performance metric</h3>
  ${[
    ['Sprint speed', r.ai.metricMeans.sprint],
    ['Agility', r.ai.metricMeans.agility],
    ['Work rate', r.ai.metricMeans.activity],
    ['Vertical leap', r.ai.metricMeans.leap],
    ['Balance', r.ai.metricMeans.balance],
    ['Body symmetry', r.ai.metricMeans.symmetry],
  ].map(([l, v]: any) => `
    <div class="bar-wrap">
      <div class="bar-top"><span>${l}</span><strong>${v.toFixed(1)}</strong></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(v, 100)}%"></div></div>
    </div>`).join('')}

  <div class="page-break"></div>

  <h2>5. Player Distribution by County</h2>
  <table>
    <tr><th>County</th><th style="text-align:right">Players</th></tr>
    ${r.counties.map(([c, n]: any) =>
      `<tr><td class="lbl">${c}</td><td class="val">${n}</td></tr>`).join('') ||
      '<tr><td colspan="2">No data</td></tr>'}
  </table>

  <h2>6. Player Distribution by Position</h2>
  <table>
    <tr><th>Position</th><th style="text-align:right">Players</th></tr>
    ${r.positions.map(([p, n]: any) =>
      `<tr><td class="lbl">${p}</td><td class="val">${n}</td></tr>`).join('') ||
      '<tr><td colspan="2">No data</td></tr>'}
  </table>

  <h2>7. System Activity Breakdown</h2>
  <table>
    <tr><th>Action</th><th style="text-align:right">Count</th></tr>
    ${r.actions.map(([a, n]: any) =>
      `<tr><td class="lbl">${a.replace(/_/g, ' ')}</td><td class="val">${n}</td></tr>`).join('') ||
      '<tr><td colspan="2">No activity logged</td></tr>'}
  </table>

  <div class="page-break"></div>

  <h2>8. Per-Analysis Record</h2>
  <table>
    <tr>
      <th>#</th><th>Overall</th><th>Sprint</th><th>Agility</th>
      <th>Balance</th><th>Confidence</th><th>Frames</th>
    </tr>
    ${analysisRows || '<tr><td colspan="7">No analyses recorded</td></tr>'}
  </table>

  <h2>9. Recent Activity Log</h2>
  <table>
    <tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Details</th></tr>
    ${logRows || '<tr><td colspan="5">No activity logged</td></tr>'}
  </table>

  <div class="footer">
    Talanta System Analytics Report &nbsp;·&nbsp; Generated ${date}<br>
    Confidential — for internal and academic use
  </div>

</body>
</html>`;
  };

  const generatePdf = async (share: boolean) => {
    setGenerating(true);
    try {
      const { uri } = await Print.printToFileAsync({
        html: buildHtml(),
        base64: false,
      });

      if (share) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Talanta System Report',
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('Saved', `PDF created at:\n${uri}`);
        }
      } else {
        await Print.printAsync({ uri });
      }
    } catch (err: any) {
      Alert.alert('PDF failed', err.message || 'Could not generate the report.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={styles.loadingText}>Compiling report data...</Text>
      </SafeAreaView>
    );
  }

  const r = report;
  const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) : 0);

  return (
    <SafeAreaView style={styles.root}>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>System Report</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.docHeader}>
          <Text style={styles.docTitle}>TALANTA</Text>
          <Text style={styles.docSub}>System Analytics Report</Text>
          <View style={styles.docRule} />
          <Text style={styles.docMeta}>{r.generated.toLocaleString('en-GB')}</Text>
        </View>

        {/* PDF actions up top — the main point of this screen */}
        <TouchableOpacity
          style={[styles.pdfBtn, generating && { opacity: 0.6 }]}
          onPress={() => generatePdf(true)}
          disabled={generating}
        >
          {generating
            ? <ActivityIndicator color={NAVY} />
            : <Text style={styles.pdfBtnText}>📄  Download PDF</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.printBtn, generating && { opacity: 0.6 }]}
          onPress={() => generatePdf(false)}
          disabled={generating}
        >
          <Text style={styles.printBtnText}>🖨️  Print report</Text>
        </TouchableOpacity>

        <Text style={styles.previewLabel}>Report preview</Text>

        {/* Preview */}
        <Text style={styles.secNum}>1 — USER STATISTICS</Text>
        <View style={styles.card}>
          {[
            ['Registered players', r.totals.players],
            ['Registered scouts', r.totals.scouts],
            ['Total users', r.totals.players + r.totals.scouts],
            ['Login events', r.totals.logins],
            ['Total events logged', r.totals.totalEvents],
          ].map(([l, v]: any, i) => (
            <View key={i} style={[styles.row, i < 4 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{l}</Text>
              <Text style={styles.rowValue}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.secNum}>2 — CONTENT & SCOUTING</Text>
        <View style={styles.card}>
          {[
            ['Videos uploaded', r.totals.videos],
            ['Videos analyzed', r.totals.analyses],
            ['Analysis coverage', `${pct(r.totals.analyses, r.totals.videos)}%`],
            ['Players shortlisted', r.totals.shortlists],
            ['Invitations sent', r.totals.invitations],
            ['Invitations accepted', `${r.totals.accepted} (${pct(r.totals.accepted, r.totals.invitations)}%)`],
          ].map(([l, v]: any, i) => (
            <View key={i} style={[styles.row, i < 5 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{l}</Text>
              <Text style={styles.rowValue}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.secNum}>3 — AI PERFORMANCE</Text>
        <View style={[styles.card, { borderColor: GREEN, borderWidth: 2 }]}>
          <Text style={styles.modelLine}>
            MediaPipe Pose Landmarker · 33 landmarks · 24–72 frames/video
          </Text>
          {[
            ['Analyses performed', r.ai.count],
            ['Frames processed', r.ai.totalFrames],
            ['Frame detection rate', `${pct(r.ai.detectedFrames, r.ai.totalFrames)}%`],
            ['Mean confidence', `${r.ai.meanConfidence.toFixed(2)}%`],
            ['Median confidence', `${r.ai.medianConfidence.toFixed(2)}%`],
            ['Std deviation', r.ai.sdConfidence.toFixed(2)],
            ['Mean player rating', r.ai.meanRating.toFixed(2)],
          ].map(([l, v]: any, i) => (
            <View key={i} style={[styles.row, i < 6 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{l}</Text>
              <Text style={[styles.rowValue, (i === 3 || i === 4) && { color: GREEN }]}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.secNum}>4 — DISTRIBUTION</Text>
        <View style={styles.card}>
          <Text style={styles.subHead}>By county</Text>
          {r.counties.length === 0
            ? <Text style={styles.emptyText}>No data</Text>
            : r.counties.slice(0, 6).map(([c, n]: any, i: number) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.rowLabel}>{c}</Text>
                  <Text style={styles.rowValue}>{n}</Text>
                </View>
              ))}
          <Text style={styles.subHead}>By position</Text>
          {r.positions.length === 0
            ? <Text style={styles.emptyText}>No data</Text>
            : r.positions.slice(0, 6).map(([p, n]: any, i: number) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.rowLabel}>{p}</Text>
                  <Text style={styles.rowValue}>{n}</Text>
                </View>
              ))}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            The PDF contains 9 full sections including the complete per-analysis
            table and activity log — more detail than shown in this preview.
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DEEP },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: MUTED, fontSize: 13, marginTop: 14 },
  scroll: { paddingHorizontal: 16, paddingBottom: 50, paddingTop: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1e3448',
  },
  backBtn: { color: GOLD, fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  docHeader: {
    backgroundColor: CARD, borderRadius: 14, padding: 22,
    alignItems: 'center', marginBottom: 18,
    borderWidth: 1, borderColor: '#1e3448',
  },
  docTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  docSub: { color: GREEN, fontSize: 12, marginTop: 4 },
  docRule: { height: 1, backgroundColor: '#1e3448', alignSelf: 'stretch', marginVertical: 14 },
  docMeta: { color: MUTED, fontSize: 11 },

  pdfBtn: {
    backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 10,
  },
  pdfBtnText: { color: NAVY, fontSize: 15, fontWeight: '800' },
  printBtn: {
    backgroundColor: CARD, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginBottom: 26,
    borderWidth: 1.5, borderColor: GOLD,
  },
  printBtnText: { color: GOLD, fontSize: 14, fontWeight: '700' },

  previewLabel: {
    color: MUTED, fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },

  secNum: { color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10 },
  card: {
    backgroundColor: CARD, borderRadius: 12, padding: 16,
    marginBottom: 22, borderWidth: 1, borderColor: '#1e3448',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  rowLabel: { color: MUTED, fontSize: 12.5, flex: 1 },
  rowValue: { color: '#fff', fontSize: 12.5, fontWeight: '700' },

  modelLine: { color: GREEN, fontSize: 11, fontWeight: '700', marginBottom: 10, fontStyle: 'italic' },
  subHead: {
    color: MUTED, fontSize: 10, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4,
  },
  emptyText: { color: MUTED, fontSize: 12, paddingVertical: 8 },

  infoBox: {
    backgroundColor: 'rgba(245,166,35,0.08)', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: 'rgba(245,166,35,0.25)', marginBottom: 20,
  },
  infoText: { color: GOLD, fontSize: 11.5, lineHeight: 18 },
});