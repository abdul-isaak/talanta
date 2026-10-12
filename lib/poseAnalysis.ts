/**
 * MediaPipe Pose Analysis Engine for Talanta
 *
 * Google's MediaPipe Pose Landmarker runs inside a long-lived WebView (see
 * lib/analysis/AnalysisProvider.tsx). It extracts 33 body landmarks per
 * sampled frame and derives objective performance metrics from how those
 * landmarks move.
 *
 * Why it is faster than the first version:
 *  - The model and WASM runtime are loaded once and kept warm between jobs,
 *    and loading starts before the user taps "Analyze".
 *  - Only the section the player selected is sampled, at a fixed rate,
 *    instead of 60 frames spread over the whole clip.
 *  - Frames are downscaled to 480px on a canvas before inference. MediaPipe
 *    resizes to 256px internally anyway, so accuracy is unchanged while the
 *    per-frame GPU upload of 1080p/4K frames is avoided.
 *  - The video is preloaded and seeks always move forward, so the decoder
 *    rarely has to restart from an earlier keyframe.
 *  - Freshly uploaded clips are read from the local file, skipping the network.
 *  - Video elements are torn down after each job to release decoder memory.
 *
 * MediaPipe landmark indices used:
 *   11 = left shoulder    12 = right shoulder
 *   23 = left hip         24 = right hip
 *   25 = left knee        26 = right knee
 *   27 = left ankle       28 = right ankle
 */

/** Target sampling rate inside the selected section. */
export const SAMPLE_FPS = 5;
export const MIN_FRAMES = 24;
export const MAX_FRAMES = 72;
/** Kept for older call sites. */
export const SAMPLE_FRAMES = MAX_FRAMES;

export type AnalysisResult = {
  activity_intensity: number;
  sprint_speed_score: number;
  vertical_leap_score: number;
  agility_score: number;
  balance_score: number;
  symmetry_score: number;
  overall_rating: number;
  detection_confidence: number;
  frames_analyzed: number;
  frames_with_detection: number;
  analysis_notes: string;
  /** Estimates in real-world units (assume a fixed camera). Optional columns. */
  est_distance_m?: number | null;
  est_top_speed_kmh?: number | null;
  est_jump_cm?: number | null;
  analyzed_seconds?: number | null;
};

export type EngineStage =
  | 'preparing'
  | 'processing'
  | 'detecting'
  | 'tracking'
  | 'calculating'
  | 'generating'
  | 'done';

export const STAGE_LABEL: Record<EngineStage, string> = {
  preparing: 'Preparing AI model',
  processing: 'Processing video',
  detecting: 'Detecting player',
  tracking: 'Tracking movement',
  calculating: 'Calculating metrics',
  generating: 'Generating results',
  done: 'Analysis complete',
};

export const STAGE_ORDER: EngineStage[] = ['preparing', 'processing', 'detecting', 'tracking', 'calculating', 'generating', 'done'];

export type EngineJob = { id: string; url: string; fallbackUrl?: string | null; start?: number | null; end?: number | null };

export type EngineMessage =
  | { type: 'ready'; delegate: string }
  | { type: 'fatal'; message: string }
  | { type: 'progress'; id: string; stage: EngineStage; progress: number; current?: number; total?: number }
  | { type: 'done'; id: string; result: AnalysisResult }
  | { type: 'error'; id: string; message: string };

const MP_VERSION = '0.10.14';

export const buildEngineHtml = () => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>html,body{margin:0;background:#000;overflow:hidden} video,canvas{position:absolute;width:2px;height:2px;opacity:0}</style>
</head>
<body>
<script type="module">
  const post = (p) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));
  window.onerror = (msg) => post({ type: 'fatal', message: String(msg) });

  const L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;
  const L_KNEE = 25, R_KNEE = 26, L_ANKLE = 27, R_ANKLE = 28;
  const SAMPLE_FPS = ${SAMPLE_FPS}, MIN_FRAMES = ${MIN_FRAMES}, MAX_FRAMES = ${MAX_FRAMES};
  const MAX_SIDE = 480;
  // Average shoulder-to-hip length of a teenage/adult player, used to turn
  // body-relative movement into rough real-world estimates.
  const TORSO_M = 0.5;
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  let fileset = null;
  let modelBytes = null;
  let PoseLandmarkerCls = null;
  let delegate = 'GPU';
  const cancelled = new Set();

  // Built from the cached model bytes. A fresh landmarker is created for each
  // job so tracking state never leaks between videos, which keeps the scores
  // for the same clip repeatable.
  const make = (d) => PoseLandmarkerCls.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: new Uint8Array(modelBytes), delegate: d },
    runningMode: 'VIDEO',
    numPoses: 1,
  });

  const ready = (async () => {
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}');
    PoseLandmarkerCls = vision.PoseLandmarker;
    const [fsr, bytes] = await Promise.all([
      vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm'),
      fetch(MODEL_URL).then((r) => r.arrayBuffer()),
    ]);
    fileset = fsr;
    modelBytes = bytes;
    let probe;
    try {
      probe = await make('GPU');
    } catch (e) {
      delegate = 'CPU';
      probe = await make('CPU');
    }
    probe.close();
    post({ type: 'ready', delegate });
  })().catch((e) => { post({ type: 'fatal', message: (e && e.message) || String(e) }); throw e; });

  // Download the whole clip once so every seek is served from memory instead
  // of a separate network range request. Falls back to streaming if needed.
  async function toLocalUrl(url, onProgress) {
    if (!/^https?:/.test(url)) return null;
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) return null;
      const total = Number(res.headers.get('content-length')) || 0;
      if (total > 120 * 1024 * 1024) return null;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total) onProgress(got / total);
      }
      return URL.createObjectURL(new Blob(chunks, { type: res.headers.get('content-type') || 'video/mp4' }));
    } catch (e) {
      return null;
    }
  }

  function loadVideo(url) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      if (/^https?:/.test(url)) v.crossOrigin = 'anonymous';
      const t = setTimeout(() => { cleanup(v); reject(new Error('Video load timed out')); }, 45000);
      v.onloadeddata = () => { clearTimeout(t); resolve(v); };
      v.onerror = () => { clearTimeout(t); cleanup(v); reject(new Error('Video failed to load')); };
      v.src = url;
      document.body.appendChild(v);
      v.load();
    });
  }

  function cleanup(v) {
    try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch (e) {}
  }

  function seek(v, t) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; v.removeEventListener('seeked', finish); resolve(); } };
      v.addEventListener('seeked', finish);
      setTimeout(finish, 5000);
      v.currentTime = t;
    });
  }

  async function analyze(job) {
    const id = job.id;
    const progress = (stage, p, extra) => post({ type: 'progress', id, stage, progress: p, ...(extra || {}) });

    progress('preparing', 0.02);
    await ready;
    if (cancelled.has(id)) return;

    progress('processing', 0.04);
    // Build the landmarker while the video downloads.
    const landmarkerPromise = make(delegate);
    let landmarker = null;
    let vid = null;
    let blobUrl = null;
    try {
      blobUrl = await toLocalUrl(job.url, (p) => progress('processing', 0.04 + p * 0.1));
      if (cancelled.has(id)) return;
      try {
        vid = await loadVideo(blobUrl || job.url);
      } catch (e) {
        if (!blobUrl && !job.fallbackUrl) throw e;
        vid = await loadVideo(blobUrl ? job.url : job.fallbackUrl);
      }
      landmarker = await landmarkerPromise;
      const duration = vid.duration;
      if (!isFinite(duration) || duration <= 0) throw new Error('Video failed to load: unknown duration');

      let start = Math.max(0, Math.min(job.start || 0, duration));
      let end = job.end && job.end > start ? Math.min(job.end, duration) : duration;
      if (end - start < 1) { start = 0; end = duration; }
      const segDur = end - start;
      const total = Math.max(MIN_FRAMES, Math.min(MAX_FRAMES, Math.round(segDur * SAMPLE_FPS)));
      const step = segDur / total;

      const scale = Math.min(1, MAX_SIDE / Math.max(vid.videoWidth || MAX_SIDE, vid.videoHeight || MAX_SIDE));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round((vid.videoWidth || MAX_SIDE) * scale));
      canvas.height = Math.max(2, Math.round((vid.videoHeight || MAX_SIDE) * scale));
      const ctx = canvas.getContext('2d', { alpha: false });

      progress('processing', 0.14);

      const frames = [];
      let detected = 0, confidenceSum = 0, firstHit = -1;

      for (let i = 0; i < total; i++) {
        if (cancelled.has(id)) return;
        const t = start + step * i + step / 2;
        await seek(vid, t);
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const res = landmarker.detectForVideo(canvas, Math.round((t - start) * 1000) + 1);

        if (res.landmarks && res.landmarks.length > 0) {
          const pts = res.landmarks[0];
          const vis = pts.reduce((s, p) => s + (p.visibility ?? 0), 0) / pts.length;
          detected++;
          confidenceSum += vis;
          if (firstHit < 0) firstHit = i;
          frames.push({
            t,
            hip: mid(pts[L_HIP], pts[R_HIP]),
            shoulder: mid(pts[L_SHOULDER], pts[R_SHOULDER]),
            lAnkle: pts[L_ANKLE], rAnkle: pts[R_ANKLE],
            lKnee: pts[L_KNEE], rKnee: pts[R_KNEE],
            torsoLen: dist(mid(pts[L_SHOULDER], pts[R_SHOULDER]), mid(pts[L_HIP], pts[R_HIP])),
            vis,
          });
        }

        const stage = firstHit < 0 || i < total * 0.15 ? 'detecting' : 'tracking';
        progress(stage, 0.15 + 0.75 * ((i + 1) / total), { current: i + 1, total });
      }

      progress('calculating', 0.92);

      if (frames.length < 5) {
        throw new Error('Not enough poses detected. Make sure the player is clearly visible in the video.');
      }

      const avgTorso = frames.reduce((s, f) => s + f.torsoLen, 0) / frames.length;
      const bodyScale = avgTorso > 0.01 ? avgTorso : 0.25;

      // 1. Activity intensity: total body movement per second
      let totalMove = 0, hipTravel = 0;
      for (let i = 1; i < frames.length; i++) {
        const dt = frames[i].t - frames[i-1].t || 0.001;
        const d = dist(frames[i].hip, frames[i-1].hip)
                + dist(frames[i].lAnkle, frames[i-1].lAnkle)
                + dist(frames[i].rAnkle, frames[i-1].rAnkle);
        totalMove += (d / bodyScale) / dt;
        hipTravel += dist(frames[i].hip, frames[i-1].hip) / bodyScale;
      }
      const avgMove = totalMove / (frames.length - 1);
      const activity_intensity = clamp(avgMove * 22);

      // 2. Sprint speed: peak sustained horizontal hip velocity
      const hSpeeds = [];
      for (let i = 1; i < frames.length; i++) {
        const dt = frames[i].t - frames[i-1].t || 0.001;
        hSpeeds.push(Math.abs(frames[i].hip.x - frames[i-1].hip.x) / bodyScale / dt);
      }
      hSpeeds.sort((a, b) => b - a);
      const topSpeeds = hSpeeds.slice(0, Math.max(3, Math.floor(hSpeeds.length * 0.15)));
      const peakSpeed = topSpeeds.reduce((s, v) => s + v, 0) / topSpeeds.length;
      const sprint_speed_score = clamp(peakSpeed * 42);

      // 3. Vertical leap: largest upward hip displacement (image y grows downwards)
      const hipYs = frames.map(f => f.hip.y);
      const baselineY = [...hipYs].sort((a, b) => b - a)[Math.floor(hipYs.length * 0.2)];
      const peakY = Math.min(...hipYs);
      const leapRaw = Math.max(0, (baselineY - peakY) / bodyScale);
      const vertical_leap_score = clamp(leapRaw * 130);

      // 4. Agility: direction changes per second. The movement threshold is a
      //    velocity so the score does not depend on the sampling rate.
      let dirChanges = 0, prevDir = 0;
      for (let i = 1; i < frames.length; i++) {
        const dt = frames[i].t - frames[i-1].t || 0.001;
        const dx = frames[i].hip.x - frames[i-1].hip.x;
        if (Math.abs(dx) / dt > 0.008) {
          const dir = dx > 0 ? 1 : -1;
          if (prevDir !== 0 && dir !== prevDir) dirChanges++;
          prevDir = dir;
        }
      }
      const agility_score = clamp((dirChanges / segDur) * 45);

      // 5. Balance: consistency of torso vertical alignment
      const tilts = frames.map(f => Math.abs(f.shoulder.x - f.hip.x) / bodyScale);
      const meanTilt = tilts.reduce((s, v) => s + v, 0) / tilts.length;
      const tiltVar = tilts.reduce((s, v) => s + (v - meanTilt) ** 2, 0) / tilts.length;
      const balance_score = clamp(100 - (Math.sqrt(tiltVar) * 145) - (meanTilt * 45));

      // 6. Symmetry: left vs right leg activity
      let lMove = 0, rMove = 0;
      for (let i = 1; i < frames.length; i++) {
        lMove += dist(frames[i].lAnkle, frames[i-1].lAnkle) + dist(frames[i].lKnee, frames[i-1].lKnee);
        rMove += dist(frames[i].rAnkle, frames[i-1].rAnkle) + dist(frames[i].rKnee, frames[i-1].rKnee);
      }
      const totalLimb = lMove + rMove;
      const ratio = totalLimb > 0 ? Math.min(lMove, rMove) / Math.max(lMove, rMove) : 1;
      const symmetry_score = clamp(ratio * 100);

      progress('generating', 0.97);

      const overall_rating = clamp(
        activity_intensity * 0.20 + sprint_speed_score * 0.25 + vertical_leap_score * 0.15 +
        agility_score * 0.20 + balance_score * 0.12 + symmetry_score * 0.08
      );
      const detection_confidence = (confidenceSum / detected) * 100;
      const dominantFoot = lMove > rMove ? 'left' : 'right';

      // Real-world estimates. Meaningful when the camera is mostly still.
      const est_distance_m = +(hipTravel * TORSO_M).toFixed(1);
      const est_top_speed_kmh = +Math.min(40, peakSpeed * TORSO_M * 3.6).toFixed(1);
      const est_jump_cm = +Math.min(120, leapRaw * TORSO_M * 100).toFixed(0);

      const notes = [];
      if (sprint_speed_score > 65) notes.push('Strong acceleration and top-end pace.');
      else if (sprint_speed_score < 35) notes.push('Limited sprinting observed in this clip.');
      if (agility_score > 60) notes.push('Frequent direction changes indicating good agility.');
      if (vertical_leap_score > 55) notes.push('Notable vertical explosiveness — useful in aerial duels.');
      if (balance_score > 70) notes.push('Maintains stable body posture through movement.');
      else if (balance_score < 40) notes.push('Body stability could be improved.');
      if (symmetry_score > 80) notes.push('Well-balanced use of both legs.');
      else notes.push('Shows a ' + dominantFoot + '-side preference in movement.');
      if (avgTorso < 0.06) notes.push('The player appears small in the frame; filming closer will improve accuracy.');
      notes.push('Analysis based on ' + detected + ' of ' + total + ' sampled frames over ' + segDur.toFixed(1) + 's at ' + detection_confidence.toFixed(1) + '% landmark confidence.');

      post({
        type: 'done', id,
        result: {
          activity_intensity: +activity_intensity.toFixed(1),
          sprint_speed_score: +sprint_speed_score.toFixed(1),
          vertical_leap_score: +vertical_leap_score.toFixed(1),
          agility_score: +agility_score.toFixed(1),
          balance_score: +balance_score.toFixed(1),
          symmetry_score: +symmetry_score.toFixed(1),
          overall_rating: +overall_rating.toFixed(1),
          detection_confidence: +detection_confidence.toFixed(1),
          frames_analyzed: total,
          frames_with_detection: detected,
          analysis_notes: notes.join(' '),
          est_distance_m, est_top_speed_kmh, est_jump_cm,
          analyzed_seconds: +segDur.toFixed(1),
        },
      });
    } finally {
      if (vid) cleanup(vid);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      landmarkerPromise.then((l) => l.close()).catch(() => {});
    }
  }

  window.__talantaAnalyze = (job) => {
    cancelled.delete(job.id);
    analyze(job).catch((e) => post({ type: 'error', id: job.id, message: (e && e.message) || String(e) }));
  };
  window.__talantaCancel = (id) => cancelled.add(id);
</script>
</body>
</html>
`;

// ── Helpers for the UI ──

export const ratingLabel = (score: number): string => {
  if (score >= 80) return 'Elite';
  if (score >= 65) return 'Excellent';
  if (score >= 50) return 'Good';
  if (score >= 35) return 'Developing';
  return 'Needs work';
};

export const ratingColor = (score: number): string => {
  if (score >= 65) return '#3BE097';
  if (score >= 45) return '#f5a623';
  return '#ff6b6b';
};

export const METRIC_INFO: Record<string, { label: string; icon: string; ion: string; desc: string }> = {
  overall_rating:     { label: 'Overall Rating', icon: '⭐', ion: 'star',              desc: 'Weighted composite of all metrics' },
  sprint_speed_score: { label: 'Sprint Speed',   icon: '⚡', ion: 'flash',             desc: 'Peak horizontal movement velocity' },
  agility_score:      { label: 'Agility',        icon: '🔄', ion: 'git-compare',       desc: 'Frequency of direction changes' },
  activity_intensity: { label: 'Work Rate',      icon: '🔥', ion: 'flame',             desc: 'Total body movement per second' },
  vertical_leap_score:{ label: 'Vertical Leap',  icon: '🦘', ion: 'trending-up',       desc: 'Maximum upward displacement' },
  balance_score:      { label: 'Balance',        icon: '⚖️', ion: 'body',              desc: 'Postural stability during motion' },
  symmetry_score:     { label: 'Body Symmetry',  icon: '🔀', ion: 'swap-horizontal',   desc: 'Left vs right limb usage balance' },
};

export const METRIC_KEYS = [
  'sprint_speed_score',
  'agility_score',
  'activity_intensity',
  'vertical_leap_score',
  'balance_score',
  'symmetry_score',
] as const;
