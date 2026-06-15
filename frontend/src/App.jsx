import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_SECONDS = 300;

// ── Colour helpers ────────────────────────────────────────────────────────────
const scoreColor = (n) => {
  if (n >= 80) return "#4ade80";
  if (n >= 60) return "#facc15";
  if (n >= 40) return "#fb923c";
  return "#f87171";
};

const archetypeEmoji = {
  Storyteller: "📖", Analyst: "📊", Motivator: "🔥",
  Educator: "🎓", Conversationalist: "💬", Commander: "⚡", Empath: "🤝",
};

const feedbackEmoji = { good: "👍", average: "😐", bad: "👎", worst: "💀" };

// ── Radial gauge ──────────────────────────────────────────────────────────────
function Gauge({ value, label, size = 120 }) {
  const r = 44, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  const dash  = (value / 100) * circ;
  const col   = scoreColor(value);
  return (
    <div style={{ textAlign: "center", width: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray 1s ease" }} />
        <text x={cx} y={cy + 5} textAnchor="middle" fill={col}
          fontSize="22" fontFamily="'DM Mono', monospace" fontWeight="700">{value}</text>
      </svg>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: -4, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function Bar({ label, score, tip }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#cbd5e1", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: scoreColor(score), fontFamily: "'DM Mono', monospace" }}>{score}/100</span>
      </div>
      <div style={{ background: "#1e293b", borderRadius: 999, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: scoreColor(score), borderRadius: 999, transition: "width 1s ease" }} />
      </div>
      {tip && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, lineHeight: 1.5 }}>💡 {tip}</div>}
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ text, color = "#334155" }) {
  return (
    <span style={{ background: color, color: "#e2e8f0", fontSize: 11, padding: "3px 10px",
      borderRadius: 999, display: "inline-block", marginRight: 6, marginBottom: 6 }}>{text}</span>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ title, children, accent = "#0ea5e9" }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16,
      padding: 24, marginBottom: 20, borderTop: `3px solid ${accent}` }}>
      <h3 style={{ margin: "0 0 16px", color: "#f1f5f9", fontSize: 15, letterSpacing: .5 }}>{title}</h3>
      {children}
    </div>
  );
}

// ── Waveform ──────────────────────────────────────────────────────────────────
function WaveViz({ stream }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an  = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const draw = () => {
      an.getByteFrequencyData(data);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext("2d");
      c.clearRect(0, 0, canvas.width, canvas.height);
      const bw = canvas.width / data.length;
      data.forEach((v, i) => {
        const h = (v / 255) * canvas.height;
        c.fillStyle = `hsl(${200 + i}, 80%, 55%)`;
        c.fillRect(i * bw, canvas.height - h, bw - 1, h);
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); ctx.close(); };
  }, [stream]);
  return <canvas ref={canvasRef} width={560} height={60}
    style={{ width: "100%", height: 60, borderRadius: 8, background: "#0a0f1e" }} />;
}

// ── Feedback panel ────────────────────────────────────────────────────────────
const FEEDBACK_OPTIONS = [
  { label: "👍 Good",    value: "good",    bg: "#14532d", active: "#4ade80", text: "#86efac" },
  { label: "😐 Average", value: "average", bg: "#1e3a5f", active: "#60a5fa", text: "#93c5fd" },
  { label: "👎 Bad",     value: "bad",     bg: "#4c1d1d", active: "#f87171", text: "#fca5a5" },
  { label: "💀 Worst",   value: "worst",   bg: "#3b0a0a", active: "#dc2626", text: "#fca5a5" },
];

function FeedbackPanel({ feedback, onFeedback }) {
  return (
    <Card title="🗳 Rate This Assessment" accent="#f59e0b">
      <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>
        How accurate was this analysis? Your rating helps improve the model.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {FEEDBACK_OPTIONS.map((opt) => {
          const isActive = feedback === opt.value;
          return (
            <button key={opt.value} onClick={() => onFeedback(opt.value)} style={{
              background: isActive ? opt.active : opt.bg,
              color: isActive ? "#0f172a" : opt.text,
              border: `2px solid ${isActive ? opt.active : "transparent"}`,
              borderRadius: 10, padding: "10px 20px", fontSize: 13,
              fontWeight: isActive ? 800 : 600, cursor: "pointer",
              transition: "all .2s", transform: isActive ? "scale(1.06)" : "scale(1)",
            }}>{opt.label}</button>
          );
        })}
      </div>
      {feedback && (
        <div style={{ marginTop: 14, fontSize: 12, color: "#4ade80" }}>
          ✅ Feedback recorded: <strong>{feedback}</strong>
        </div>
      )}
    </Card>
  );
}

// ── Perf metrics ──────────────────────────────────────────────────────────────
function PerfMetrics({ performance, system_metrics }) {
  if (!performance) return null;
  const { total_ms, whisper_ms, llm_ms, breakdown } = performance;
  const ram = system_metrics?.after;
  const ramDelta = system_metrics?.ram_delta_mb;
  const fmt = (ms) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  return (
    <Card title="⚡ Analysis Metrics" accent="#0ea5e9">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Time", value: fmt(total_ms),   color: "#0ea5e9" },
          { label: "Whisper",    value: fmt(whisper_ms), color: "#a78bfa" },
          { label: "LLM",        value: fmt(llm_ms),     color: "#f59e0b" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#0a0f1e", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontFamily: "'DM Mono', monospace", color, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Time Breakdown</div>
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 20 }}>
          <div style={{ width: `${breakdown?.whisper_percent}%`, background: "#a78bfa",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#0f172a", fontWeight: 700 }}>
            {breakdown?.whisper_percent}%
          </div>
          <div style={{ width: `${breakdown?.llm_percent}%`, background: "#f59e0b",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#0f172a", fontWeight: 700 }}>
            {breakdown?.llm_percent}%
          </div>
          <div style={{ flex: 1, background: "#1e293b", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 10, color: "#475569" }}>other</div>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "#a78bfa" }}>■ Whisper</span>
          <span style={{ fontSize: 11, color: "#f59e0b" }}>■ LLM</span>
        </div>
      </div>
      {ram && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "CPU Usage",   value: `${ram.cpu_percent}%`,      color: ram.cpu_percent > 80 ? "#f87171" : "#4ade80" },
            { label: "Process RAM", value: `${ram.process_ram_mb} MB`, color: "#60a5fa" },
            { label: "RAM Δ",       value: `${ramDelta > 0 ? "+" : ""}${ramDelta} MB`, color: ramDelta > 20 ? "#fb923c" : "#94a3b8" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#0a0f1e", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontFamily: "'DM Mono', monospace", color, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: "#334155", marginTop: 12 }}>ℹ️ {ram?.note || "CPU-only server (no GPU on Render free tier)"}</div>
    </Card>
  );
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#0ea5e9", width = 200, height = 50 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 8) - 4;
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
      })}
    </svg>
  );
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────
function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("assessments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) setError(error.message);
      else setSessions(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{ textAlign: "center", padding: "60px 0", color: "#475569" }}>
      <div style={{ fontSize: 36, animation: "spin 1.5s linear infinite", display: "inline-block" }}>⚙️</div>
      <div style={{ marginTop: 12 }}>Loading history…</div>
    </div>
  );

  if (error) return (
    <div style={{ background: "#3f1010", border: "1px solid #f87171", borderRadius: 12,
      padding: 16, color: "#fca5a5", fontSize: 13 }}>⚠️ {error}</div>
  );

  if (sessions.length === 0) return (
    <Card title="📭 No Sessions Yet" accent="#334155">
      <p style={{ color: "#475569", fontSize: 13 }}>
        Complete your first analysis and it will appear here automatically.
      </p>
    </Card>
  );

  const avg = (key) => Math.round(sessions.reduce((s, r) => s + (r[key] || 0), 0) / sessions.length);
  const scores     = sessions.map(r => r.overall_score).reverse();
  const grammarArr = sessions.map(r => r.grammar_score).reverse();
  const confArr    = sessions.map(r => r.confidence_score).reverse();
  const vocabArr   = sessions.map(r => r.vocabulary_score).reverse();
  const best       = Math.max(...sessions.map(r => r.overall_score));
  const avgTime    = Math.round(sessions.reduce((s, r) => s + (r.analysis_total_ms || 0), 0) / sessions.length);

  const feedbackCounts = sessions.reduce((acc, r) => {
    if (r.user_feedback) acc[r.user_feedback] = (acc[r.user_feedback] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Sessions",     value: sessions.length,        color: "#0ea5e9" },
          { label: "Avg Score",    value: avg("overall_score"),   color: scoreColor(avg("overall_score")) },
          { label: "Best Score",   value: best,                   color: "#4ade80" },
          { label: "Avg Analysis", value: avgTime >= 1000 ? `${(avgTime/1000).toFixed(1)}s` : `${avgTime}ms`, color: "#f59e0b" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#0f172a", border: "1px solid #1e293b",
            borderRadius: 12, padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontFamily: "'DM Mono', monospace", color, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      <Card title="📈 Score Trends" accent="#6366f1">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {[
            { label: "Overall Score", data: scores,     color: "#6366f1" },
            { label: "Grammar",       data: grammarArr, color: "#a78bfa" },
            { label: "Confidence",    data: confArr,    color: "#f87171" },
            { label: "Vocabulary",    data: vocabArr,   color: "#facc15" },
          ].map(({ label, data, color }) => (
            <div key={label} style={{ background: "#0a0f1e", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
                <span style={{ fontSize: 12, color, fontFamily: "'DM Mono', monospace" }}>
                  avg {Math.round(data.reduce((a, b) => a + b, 0) / data.length)}
                </span>
              </div>
              <Sparkline data={data} color={color} width={240} height={48} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#334155", marginTop: 12 }}>
          ← oldest · newest → · {scores.length} session{scores.length !== 1 ? "s" : ""}
        </div>
      </Card>

      {Object.keys(feedbackCounts).length > 0 && (
        <Card title="🗳 Feedback Distribution" accent="#f59e0b">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["good", "average", "bad", "worst"].map((k) => {
              const count = feedbackCounts[k] || 0;
              const total = sessions.filter(s => s.user_feedback).length;
              const pct   = Math.round((count / total) * 100) || 0;
              const colors = { good: "#4ade80", average: "#60a5fa", bad: "#f87171", worst: "#dc2626" };
              return (
                <div key={k} style={{ background: "#0a0f1e", borderRadius: 10, padding: "12px 20px",
                  textAlign: "center", flex: 1, minWidth: 80 }}>
                  <div style={{ fontSize: 24 }}>{feedbackEmoji[k]}</div>
                  <div style={{ fontSize: 22, fontFamily: "'DM Mono', monospace", color: colors[k], fontWeight: 700 }}>{count}</div>
                  <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase" }}>{k} · {pct}%</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="🗂 Session History" accent="#0ea5e9">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                {["Date", "Score", "WPM", "Fillers", "Archetype", "Time", "Feedback", "Transcript"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#475569",
                    fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, fontSize: 10 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #0f172a" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#0a0f1e"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ color: scoreColor(s.overall_score), fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                      {s.overall_score}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#94a3b8", fontFamily: "'DM Mono', monospace" }}>{s.pace_wpm}</td>
                  <td style={{ padding: "10px 12px", color: s.filler_total > 5 ? "#f87171" : "#94a3b8", fontFamily: "'DM Mono', monospace" }}>{s.filler_total}</td>
                  <td style={{ padding: "10px 12px", color: "#e879f9" }}>
                    {archetypeEmoji[s.voice_archetype] || ""} {s.voice_archetype || "—"}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#f59e0b", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
                    {s.analysis_total_ms >= 1000 ? `${(s.analysis_total_ms/1000).toFixed(1)}s` : `${s.analysis_total_ms}ms`}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {s.user_feedback ? `${feedbackEmoji[s.user_feedback]} ${s.user_feedback}` : <span style={{ color: "#334155" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", color: "#475569", maxWidth: 200,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.transcript_snippet || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,        setTab]       = useState("coach");
  const [recording,  setRecording] = useState(false);
  const [elapsed,    setElapsed]   = useState(0);
  const [stream,     setStream]    = useState(null);
  const [audioBlob,  setAudioBlob] = useState(null);
  const [audioUrl,   setAudioUrl]  = useState(null);
  const [loading,    setLoading]   = useState(false);
  const [result,     setResult]    = useState(null);
  const [error,      setError]     = useState(null);
  const [phase,      setPhase]     = useState("idle");
  const [feedback,   setFeedback]  = useState(null);
  const [uploadName, setUploadName]= useState(null);
  const [savedId,    setSavedId]   = useState(null);

  const mediaRef    = useRef(null);
  const chunksRef   = useRef([]);
  const timerRef    = useRef(null);
  const fileInputRef= useRef(null);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const saveToSupabase = async (data, fb = null) => {
    const { analysis, pace, filler_words, transcript, duration_seconds, performance, system_metrics } = data;
    const a = analysis || {};
    const row = {
      overall_score:       a.overall_score         ?? null,
      grammar_score:       a.grammar?.score        ?? null,
      confidence_score:    a.confidence?.score     ?? null,
      vocabulary_score:    a.vocabulary?.score     ?? null,
      structure_score:     a.structure?.score      ?? null,
      pronunciation_score: a.pronunciation?.score  ?? null,
      accent_clarity:      a.accent?.clarity       ?? null,
      pace_wpm:            pace?.wpm               ?? null,
      pace_label:          pace?.label             ?? null,
      filler_total:        filler_words?.total     ?? null,
      voice_archetype:     a.voice_archetype?.type ?? null,
      analysis_total_ms:   performance?.total_ms   ?? null,
      whisper_ms:          performance?.whisper_ms  ?? null,
      llm_ms:              performance?.llm_ms      ?? null,
      ram_after_mb:        system_metrics?.after?.process_ram_mb ?? null,
      cpu_percent:         system_metrics?.after?.cpu_percent    ?? null,
      user_feedback:       fb,
      transcript_snippet:  transcript?.slice(0, 120) ?? null,
      duration_seconds:    duration_seconds ?? null,
    };
    const { data: inserted, error } = await supabase.from("assessments").insert([row]).select();
    if (error) console.error("Supabase save error:", error.message);
    else if (inserted?.[0]?.id) setSavedId(inserted[0].id);
  };

  const updateFeedback = async (fb) => {
    setFeedback(fb);
    if (savedId) {
      await supabase.from("assessments").update({ user_feedback: fb }).eq("id", savedId);
    }
  };

  const startRecording = async () => {
    setError(null); setResult(null); setAudioBlob(null);
    setAudioUrl(null); setElapsed(0); setUploadName(null); setSavedId(null);
    chunksRef.current = [];
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(s);
      const mr = new MediaRecorder(s, { mimeType: "audio/webm" });
      mediaRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setPhase("done");
      };
      mr.start(250);
      setRecording(true);
      setPhase("recording");
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= MAX_SECONDS) { stopRecording(); return MAX_SECONDS; }
          return e + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (mediaRef.current?.state !== "inactive") mediaRef.current?.stop();
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setRecording(false);
  };

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setResult(null); setElapsed(0); setSavedId(null);
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
    setUploadName(file.name);
    setPhase("done");
  };

  const analyse = async () => {
    if (!audioBlob) return;
    setLoading(true); setError(null); setFeedback(null); setSavedId(null);
    setPhase("analysing");
    const fd = new FormData();
    fd.append("audio", audioBlob, uploadName || "recording.webm");
    try {
      const res = await fetch(`${API}/transcribe-and-assess`, { method: "POST", body: fd });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const data = await res.json();
      setResult(data);
      setPhase("result");
      await saveToSupabase(data, null);
    } catch (e) {
      setError(`Analysis failed: ${e.message}`);
      setPhase("done");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null); setAudioBlob(null); setAudioUrl(null);
    setElapsed(0); setError(null); setPhase("idle");
    setFeedback(null); setUploadName(null); setSavedId(null);
  };

  const { analysis, pace, filler_words, transcript, duration_seconds, performance, system_metrics } = result || {};
  const a = analysis || {};

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Inter', sans-serif", padding: "0 0 60px" }}>

      {/* Header + tabs */}
      <div style={{ background: "linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)", padding: "32px 40px 0", marginBottom: 0 }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,.7)", textTransform: "uppercase", marginBottom: 6 }}>AI-Powered</div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>Speech Coach</h1>
          <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,.75)", fontSize: 14 }}>
            Record up to 5 minutes · Upload audio · Get deep analysis on 7+ dimensions
          </p>
          <div style={{ display: "flex", gap: 0, marginTop: 24 }}>
            {[{ id: "coach", label: "🎙 Speech Coach" }, { id: "dashboard", label: "📊 Dashboard" }].map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                background: tab === id ? "#020817" : "transparent",
                color: tab === id ? "#e2e8f0" : "rgba(255,255,255,.65)",
                border: "none", borderRadius: "10px 10px 0 0",
                padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .2s",
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 0" }}>

        {/* ── COACH TAB ── */}
        {tab === "coach" && (
          <>
            {(phase === "idle" || phase === "recording" || phase === "done") && (
              <Card title="🎙 Record or Upload Audio" accent="#0ea5e9">
                {phase === "recording" && (
                  <>
                    <WaveViz stream={stream} />
                    <div style={{ textAlign: "center", marginTop: 16 }}>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 40,
                        color: elapsed >= MAX_SECONDS - 30 ? "#f87171" : "#4ade80", letterSpacing: 2 }}>{fmt(elapsed)}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{fmt(MAX_SECONDS - elapsed)} remaining</div>
                      <div style={{ background: "#1e293b", borderRadius: 999, height: 4, overflow: "hidden", maxWidth: 300, margin: "8px auto" }}>
                        <div style={{ width: `${(elapsed / MAX_SECONDS) * 100}%`, height: "100%",
                          background: elapsed >= MAX_SECONDS - 30 ? "#f87171" : "#0ea5e9", transition: "width 1s linear" }} />
                      </div>
                    </div>
                  </>
                )}
                {phase === "idle" && (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <div style={{ fontSize: 64, marginBottom: 12 }}>🎤</div>
                    <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>
                      Record live or upload an existing audio file (.webm, .mp3, .wav, .m4a).
                    </p>
                  </div>
                )}
                {phase === "done" && audioUrl && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ color: "#4ade80", textAlign: "center", marginBottom: 12, fontSize: 14 }}>
                      {uploadName ? `✅ Uploaded: ${uploadName}` : `✅ Recording saved — ${fmt(elapsed)}`}
                    </div>
                    <audio src={audioUrl} controls style={{ width: "100%", borderRadius: 8 }} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: phase === "recording" ? 20 : 0 }}>
                  {phase === "idle" && (
                    <>
                      <button onClick={startRecording} style={btnStyle("#0ea5e9")}>● Start Recording</button>
                      <input ref={fileInputRef} type="file" accept=".webm,.mp3,.wav,.m4a,audio/*"
                        style={{ display: "none" }} onChange={handleUpload} />
                      <button onClick={() => fileInputRef.current?.click()} style={btnStyle("#475569")}>📂 Upload Audio</button>
                    </>
                  )}
                  {phase === "recording" && <button onClick={stopRecording} style={btnStyle("#f87171")}>■ Stop Recording</button>}
                  {phase === "done" && (
                    <>
                      <button onClick={reset} style={btnStyle("#64748b")}>↺ Start Over</button>
                      <button onClick={analyse} style={btnStyle("#6366f1")}>🔍 Analyse Speech</button>
                    </>
                  )}
                </div>
              </Card>
            )}

            {phase === "analysing" && (
              <Card title="Analysing your speech…" accent="#6366f1">
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 48, animation: "spin 1.5s linear infinite", display: "inline-block" }}>⚙️</div>
                  <div style={{ marginTop: 16, color: "#94a3b8", fontSize: 14 }}>Transcribing with Whisper · Analysing with LLaMA…</div>
                </div>
              </Card>
            )}

            {error && (
              <div style={{ background: "#3f1010", border: "1px solid #f87171", borderRadius: 12,
                padding: 16, marginBottom: 20, color: "#fca5a5", fontSize: 13 }}>⚠️ {error}</div>
            )}

            {result && phase === "result" && (
              <>
                <Card title="📊 Overall Score" accent="#6366f1">
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center", marginBottom: 20 }}>
                    <Gauge value={a.overall_score ?? 0} label="Overall" size={130} />
                    <Gauge value={a.grammar?.score ?? 0} label="Grammar" />
                    <Gauge value={a.confidence?.score ?? 0} label="Confidence" />
                    <Gauge value={a.vocabulary?.score ?? 0} label="Vocabulary" />
                    <Gauge value={a.structure?.score ?? 0} label="Structure" />
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{a.summary}</p>
                </Card>

                <Card title="⏱ Pace & Filler Words" accent="#0ea5e9">
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 36, fontFamily: "'DM Mono', monospace", color: scoreColor(pace?.wpm > 80 && pace?.wpm < 180 ? 80 : 40) }}>
                        {pace?.wpm} <span style={{ fontSize: 14, color: "#64748b" }}>WPM</span>
                      </div>
                      <Chip text={pace?.label} color={pace?.label === "Ideal" ? "#14532d" : pace?.label?.includes("Slow") ? "#1e3a5f" : "#4c1d1d"} />
                      <p style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>💡 {pace?.tip}</p>
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 36, fontFamily: "'DM Mono', monospace", color: scoreColor(filler_words?.score ?? 100) }}>
                        {filler_words?.total} <span style={{ fontSize: 14, color: "#64748b" }}>fillers</span>
                      </div>
                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap" }}>
                        {Object.entries(filler_words?.counts || {}).map(([w, n]) => <Chip key={w} text={`${w} ×${n}`} color="#292524" />)}
                        {!filler_words?.total && <Chip text="None detected 🎉" color="#14532d" />}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="📝 Grammar" accent="#a78bfa">
                  <Bar label="Grammar Score" score={a.grammar?.score ?? 0} tip={a.grammar?.tip} />
                  {a.grammar?.issues?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Issues found:</div>
                      {a.grammar.issues.map((i, idx) => (
                        <div key={idx} style={{ fontSize: 12, color: "#fca5a5", padding: "4px 0", borderBottom: "1px solid #1e293b" }}>▸ {i}</div>
                      ))}
                    </div>
                  )}
                </Card>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                  <Card title="🗣 Pronunciation" accent="#34d399">
                    <Bar label="Pronunciation" score={a.pronunciation?.score ?? 0} />
                    <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, margin: "8px 0 4px" }}>{a.pronunciation?.notes}</p>
                    <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>💡 {a.pronunciation?.tip}</p>
                  </Card>
                  <Card title="🌍 Accent" accent="#f59e0b">
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>{a.accent?.detected}</div>
                    <Bar label="Clarity" score={a.accent?.clarity ?? 0} />
                    <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{a.accent?.notes}</p>
                  </Card>
                </div>

                <Card title="💪 Confidence" accent="#f87171">
                  <Bar label="Confidence" score={a.confidence?.score ?? 0} tip={a.confidence?.tip} />
                  <div style={{ display: "flex", flexWrap: "wrap", marginTop: 8 }}>
                    {a.confidence?.signals?.map((s, i) => <Chip key={i} text={s} />)}
                  </div>
                </Card>

                {a.voice_archetype && (
                  <Card title="🎭 Voice Archetype" accent="#e879f9">
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <div style={{ fontSize: 52 }}>{archetypeEmoji[a.voice_archetype.type] || "🎤"}</div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#e879f9", marginBottom: 4 }}>{a.voice_archetype.type}</div>
                        <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: "0 0 12px" }}>{a.voice_archetype.description}</p>
                        <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 4 }}>STRENGTHS</div>
                        {a.voice_archetype.strengths?.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#86efac" }}>✓ {s}</div>)}
                        <div style={{ fontSize: 11, color: "#fb923c", marginBottom: 4, marginTop: 8 }}>GROWTH AREAS</div>
                        {a.voice_archetype.growth_areas?.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#fdba74" }}>→ {s}</div>)}
                      </div>
                    </div>
                  </Card>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                  <Card title="⭐ Top Strengths" accent="#4ade80">
                    {a.top_strengths?.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, color: "#86efac", padding: "6px 0", borderBottom: "1px solid #1e293b" }}>✓ {s}</div>
                    ))}
                  </Card>
                  <Card title="🚀 Key Improvements" accent="#fb923c">
                    {a.top_improvements?.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, color: "#fdba74", padding: "6px 0", borderBottom: "1px solid #1e293b" }}>→ {s}</div>
                    ))}
                  </Card>
                </div>

                <PerfMetrics performance={performance} system_metrics={system_metrics} />
                <FeedbackPanel feedback={feedback} onFeedback={updateFeedback} />

                <Card title="📄 Transcript" accent="#334155">
                  <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.8, maxHeight: 200,
                    overflowY: "auto", background: "#0a0f1e", padding: 16, borderRadius: 8 }}>{transcript}</div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>
                    Duration: {duration_seconds}s · Words: ~{transcript?.split(" ").length}
                  </div>
                </Card>

                <div style={{ textAlign: "center", marginTop: 8 }}>
                  <button onClick={reset} style={btnStyle("#0ea5e9")}>+ New Recording</button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── DASHBOARD TAB ── */}
        {tab === "dashboard" && <Dashboard />}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        * { box-sizing: border-box; }
        audio { accent-color: #0ea5e9; }
      `}</style>
    </div>
  );
}

const btnStyle = (bg) => ({
  background: bg, color: "#fff", border: "none", borderRadius: 10,
  padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  letterSpacing: .4, transition: "opacity .2s",
});
