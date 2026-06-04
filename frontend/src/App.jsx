import { useState, useRef, useEffect } from "react";

const API = "http://localhost:8000";
const MAX_SECONDS = 300; // 5 minutes

// ── Colour helpers ──────────────────────────────────────────────────────────
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

// ── Radial gauge ─────────────────────────────────────────────────────────────
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

// ── Score bar ────────────────────────────────────────────────────────────────
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

// ── Chip ─────────────────────────────────────────────────────────────────────
function Chip({ text, color = "#334155" }) {
  return (
    <span style={{ background: color, color: "#e2e8f0", fontSize: 11, padding: "3px 10px",
      borderRadius: 999, display: "inline-block", marginRight: 6, marginBottom: 6 }}>{text}</span>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────
function Card({ title, children, accent = "#0ea5e9" }) {
  return (
    <div style={{ background: "#0f172a", border: `1px solid #1e293b`, borderRadius: 16,
      padding: 24, marginBottom: 20, borderTop: `3px solid ${accent}` }}>
      <h3 style={{ margin: "0 0 16px", color: "#f1f5f9", fontSize: 15, letterSpacing: .5 }}>{title}</h3>
      {children}
    </div>
  );
}

// ── Waveform visualiser ───────────────────────────────────────────────────────
function WaveViz({ stream }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const analyserRef = useRef(null);

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const an  = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    analyserRef.current = an;

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

    return () => {
      cancelAnimationFrame(rafRef.current);
      ctx.close();
    };
  }, [stream]);

  return <canvas ref={canvasRef} width={560} height={60}
    style={{ width: "100%", height: 60, borderRadius: 8, background: "#0a0f1e" }} />;
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [recording, setRecording]   = useState(false);
  const [elapsed,   setElapsed]     = useState(0);
  const [stream,    setStream]      = useState(null);
  const [audioBlob, setAudioBlob]   = useState(null);
  const [audioUrl,  setAudioUrl]    = useState(null);
  const [loading,   setLoading]     = useState(false);
  const [result,    setResult]      = useState(null);
  const [error,     setError]       = useState(null);
  const [phase,     setPhase]       = useState("idle"); // idle | recording | done | analysing

  const mediaRef   = useRef(null);
  const chunksRef  = useRef([]);
  const timerRef   = useRef(null);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const startRecording = async () => {
    setError(null);
    setResult(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
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
    } catch (err) {
      setError("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (mediaRef.current?.state !== "inactive") mediaRef.current?.stop();
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setRecording(false);
  };

  const analyse = async () => {
    if (!audioBlob) return;
    setLoading(true);
    setError(null);
    setPhase("analysing");
    const fd = new FormData();
    fd.append("audio", audioBlob, "recording.webm");
    try {
      const res = await fetch(`${API}/transcribe-and-assess`, { method: "POST", body: fd });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const data = await res.json();
      setResult(data);
      setPhase("result");
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
  };

  // ── render ────────────────────────────────────────────────────────────────
  const { analysis, pace, filler_words, transcript, duration_seconds } = result || {};
  const a = analysis || {};

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Inter', sans-serif", padding: "0 0 60px" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)",
        padding: "32px 40px 28px", marginBottom: 32 }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,.7)", textTransform: "uppercase", marginBottom: 6 }}>
            AI-Powered
          </div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
            Speech Coach
          </h1>
          <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,.75)", fontSize: 14 }}>
            Record up to 5 minutes · Get deep analysis on 7+ dimensions
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px" }}>

        {/* ── Record panel ── */}
        {(phase === "idle" || phase === "recording" || phase === "done") && (
          <Card title="🎙 Record Your Speech" accent="#0ea5e9">
            {phase === "recording" && (
              <>
                <WaveViz stream={stream} />
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 40,
                    color: elapsed >= MAX_SECONDS - 30 ? "#f87171" : "#4ade80", letterSpacing: 2 }}>
                    {fmt(elapsed)}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{fmt(MAX_SECONDS - elapsed)} remaining</div>
                  <div style={{ marginTop: 4 }}>
                    <div style={{ background: "#1e293b", borderRadius: 999, height: 4, overflow: "hidden", maxWidth: 300, margin: "8px auto" }}>
                      <div style={{ width: `${(elapsed / MAX_SECONDS) * 100}%`, height: "100%",
                        background: elapsed >= MAX_SECONDS - 30 ? "#f87171" : "#0ea5e9", transition: "width 1s linear" }} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {phase === "idle" && (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 64, marginBottom: 12 }}>🎤</div>
                <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>
                  Click to start recording. Speak naturally — imagine you're presenting to an audience.
                </p>
              </div>
            )}

            {phase === "done" && audioUrl && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "#4ade80", textAlign: "center", marginBottom: 12, fontSize: 14 }}>
                  ✅ Recording saved — {fmt(elapsed)}
                </div>
                <audio src={audioUrl} controls style={{ width: "100%", borderRadius: 8 }} />
              </div>
            )}

            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: phase === "recording" ? 20 : 0 }}>
              {phase === "idle" && (
                <button onClick={startRecording} style={btnStyle("#0ea5e9")}>
                  ● Start Recording
                </button>
              )}
              {phase === "recording" && (
                <button onClick={stopRecording} style={btnStyle("#f87171")}>
                  ■ Stop Recording
                </button>
              )}
              {phase === "done" && (
                <>
                  <button onClick={startRecording} style={btnStyle("#64748b")}>
                    ↺ Re-record
                  </button>
                  <button onClick={analyse} style={btnStyle("#6366f1")}>
                    🔍 Analyse Speech
                  </button>
                </>
              )}
            </div>
          </Card>
        )}

        {/* ── Loading ── */}
        {phase === "analysing" && (
          <Card title="Analysing your speech…" accent="#6366f1">
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 48, animation: "spin 1.5s linear infinite", display: "inline-block" }}>⚙️</div>
              <div style={{ marginTop: 16, color: "#94a3b8", fontSize: 14 }}>
                Transcribing with Whisper then running deep analysis via Claude…
              </div>
            </div>
          </Card>
        )}

        {error && (
          <div style={{ background: "#3f1010", border: "1px solid #f87171", borderRadius: 12,
            padding: 16, marginBottom: 20, color: "#fca5a5", fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Results ── */}
        {result && phase === "result" && (
          <>
            {/* Overall + gauge row */}
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

            {/* Pace + fillers */}
            <Card title="⏱ Pace & Filler Words" accent="#0ea5e9">
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 36, fontFamily: "'DM Mono', monospace", color: scoreColor(pace?.wpm > 80 && pace?.wpm < 180 ? 80 : 40) }}>
                    {pace?.wpm} <span style={{ fontSize: 14, color: "#64748b" }}>WPM</span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Chip text={pace?.label}
                      color={pace?.label === "Ideal" ? "#14532d" : pace?.label.includes("Slow") ? "#1e3a5f" : "#4c1d1d"} />
                  </div>
                  <p style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>💡 {pace?.tip}</p>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 36, fontFamily: "'DM Mono', monospace", color: scoreColor(filler_words?.score ?? 100) }}>
                    {filler_words?.total} <span style={{ fontSize: 14, color: "#64748b" }}>fillers</span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap" }}>
                    {Object.entries(filler_words?.counts || {}).map(([w, n]) => (
                      <Chip key={w} text={`${w} ×${n}`} color="#292524" />
                    ))}
                    {!filler_words?.total && <Chip text="None detected 🎉" color="#14532d" />}
                  </div>
                </div>
              </div>
            </Card>

            {/* Grammar */}
            <Card title="📝 Grammar" accent="#a78bfa">
              <Bar label="Grammar Score" score={a.grammar?.score ?? 0} tip={a.grammar?.tip} />
              {a.grammar?.issues?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Issues found:</div>
                  {a.grammar.issues.map((i, idx) => (
                    <div key={idx} style={{ fontSize: 12, color: "#fca5a5", padding: "4px 0",
                      borderBottom: "1px solid #1e293b" }}>▸ {i}</div>
                  ))}
                </div>
              )}
            </Card>

            {/* Pronunciation + Accent side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <Card title="🗣 Pronunciation" accent="#34d399">
                <Bar label="Pronunciation" score={a.pronunciation?.score ?? 0} />
                <p style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, margin: "8px 0 4px" }}>{a.pronunciation?.notes}</p>
                <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>💡 {a.pronunciation?.tip}</p>
              </Card>
              <Card title="🌍 Accent" accent="#f59e0b">
                <div style={{ fontSize: 20, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>
                  {a.accent?.detected}
                </div>
                <Bar label="Clarity" score={a.accent?.clarity ?? 0} />
                <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{a.accent?.notes}</p>
              </Card>
            </div>

            {/* Confidence */}
            <Card title="💪 Confidence" accent="#f87171">
              <Bar label="Confidence" score={a.confidence?.score ?? 0} tip={a.confidence?.tip} />
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: 8 }}>
                {a.confidence?.signals?.map((s, i) => <Chip key={i} text={s} />)}
              </div>
            </Card>

            {/* Voice archetype */}
            {a.voice_archetype && (
              <Card title="🎭 Voice Archetype" accent="#e879f9">
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 52 }}>{archetypeEmoji[a.voice_archetype.type] || "🎤"}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#e879f9", marginBottom: 4 }}>
                      {a.voice_archetype.type}
                    </div>
                    <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: "0 0 12px" }}>
                      {a.voice_archetype.description}
                    </p>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 4 }}>STRENGTHS</div>
                      {a.voice_archetype.strengths?.map((s, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#86efac" }}>✓ {s}</div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#fb923c", marginBottom: 4, marginTop: 8 }}>GROWTH AREAS</div>
                      {a.voice_archetype.growth_areas?.map((s, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#fdba74" }}>→ {s}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Top strengths + improvements */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <Card title="⭐ Top Strengths" accent="#4ade80">
                {a.top_strengths?.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#86efac", padding: "6px 0",
                    borderBottom: "1px solid #1e293b" }}>✓ {s}</div>
                ))}
              </Card>
              <Card title="🚀 Key Improvements" accent="#fb923c">
                {a.top_improvements?.map((s, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#fdba74", padding: "6px 0",
                    borderBottom: "1px solid #1e293b" }}>→ {s}</div>
                ))}
              </Card>
            </div>

            {/* Transcript */}
            <Card title="📄 Transcript" accent="#334155">
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.8, maxHeight: 200,
                overflowY: "auto", background: "#0a0f1e", padding: 16, borderRadius: 8 }}>
                {transcript}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 8 }}>
                Duration: {duration_seconds}s · Words: ~{transcript?.split(" ").length}
              </div>
            </Card>

            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button onClick={reset} style={btnStyle("#0ea5e9")}>+ New Recording</button>
            </div>
          </>
        )}
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
