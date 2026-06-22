import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";

// ── Token helpers ─────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem("sc_token");
const getUser  = () => { try { return JSON.parse(localStorage.getItem("sc_user")); } catch { return null; } }
const clearAuth = () => { localStorage.removeItem("sc_token"); localStorage.removeItem("sc_user"); };

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const MAX_SECONDS = 300;

// ── Palette (purple monochrome) ───────────────────────────────────────────────
const P = {
  deep:    "#0B3650",   // darkest — sidebar, page bg
  dark:    "#174F77",   // cards, borders
  mid:     "#2B82B7",   // accents, active states, highlights
  gold:    "#D4AF37",   // gold accent
  light:   "#E9E2C9",   // muted text, subtle elements
  white:   "#F9F5E1",   // headings, primary text
  card:    "#103850",   // card background
  border:  "#4F7B9C",   // borders
  muted:   "#AFC9D5",   // secondary text
};

const FONT = "Georgia, 'Times New Roman', serif";
const GRAD  = `linear-gradient(135deg, ${P.deep}, ${P.dark}, ${P.gold})`;
const GRAD2 = `linear-gradient(135deg, ${P.dark}, ${P.mid})`;
const GRAD_BG = `linear-gradient(160deg, #082238 0%, ${P.deep} 45%, ${P.gold} 100%)`;

// ── Score colour (purple monochrome scale) ────────────────────────────────────
const scoreColor = (n) => {
  if (n >= 80) return P.gold;
  if (n >= 60) return P.mid;
  if (n >= 40) return P.dark;
  return P.border;
};

const archetypeEmoji = {
  Storyteller:"📖", Analyst:"📊", Motivator:"🔥",
  Educator:"🎓", Conversationalist:"💬", Commander:"⚡", Empath:"🤝",
};
const feedbackEmoji = { good:"👍", average:"😐", bad:"👎", worst:"💀" };

// ── Gauge ─────────────────────────────────────────────────────────────────────
function Gauge({ value, label, size = 120 }) {
  const r = 44, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  const dash  = (value / 100) * circ;
  const col   = scoreColor(value);
  return (
    <div style={{ textAlign:"center", width:size }}>
      <svg width={size} height={size} viewBox="0 0 120 120">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={P.border} strokeWidth="10"/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 60 60)" style={{transition:"stroke-dasharray 1s ease"}}/>
        <text x={cx} y={cy+5} textAnchor="middle" fill={col}
          fontSize="22" fontFamily={FONT} fontWeight="800">{value}</text>
      </svg>
      <div style={{fontSize:10, color:P.muted, marginTop:-4, letterSpacing:2, textTransform:"uppercase", fontFamily: FONT}}>{label}</div>
    </div>
  );
}

// ── Bar ───────────────────────────────────────────────────────────────────────
function Bar({ label, score, tip }) {
  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex", justifyContent:"space-between", marginBottom:5}}>
        <span style={{fontSize:13, color:P.white, fontWeight:700, fontFamily: FONT}}>{label}</span>
        <span style={{fontSize:13, color:scoreColor(score), fontFamily: FONT, fontWeight:800}}>{score}/100</span>
      </div>
      <div style={{background:P.border, borderRadius:999, height:7, overflow:"hidden"}}>
        <div style={{width:`${score}%`, height:"100%",
          background:`linear-gradient(90deg, ${P.mid}, ${P.dark})`,
          borderRadius:999, transition:"width 1s ease"}}/>
      </div>
      {tip && <div style={{fontSize:11, color:P.muted, marginTop:5, lineHeight:1.5, fontFamily: FONT}}>💡 {tip}</div>}
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ text, color }) {
  return (
    <span style={{
      background: color || `linear-gradient(135deg, ${P.deep}55, ${P.dark}33)`,
      color: P.gold, fontSize:11, padding:"4px 12px",
      borderRadius:999, display:"inline-block", marginRight:6, marginBottom:6,
      border:`1px solid ${P.border}`, fontFamily: FONT, fontWeight:600,
    }}>{text}</span>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function Card({ title, children, accent }) {
  return (
    <div style={{
      background: P.card, border:`1px solid ${P.border}`, borderRadius:18,
      padding:24, marginBottom:20,
      borderTop:`3px solid ${accent || P.dark}`,
    }}>
      <h3 style={{margin:"0 0 16px", color:P.white, fontSize:15, letterSpacing:.5, fontFamily: FONT, fontWeight:800}}>{title}</h3>
      {children}
    </div>
  );
}

// ── Gradient Button ───────────────────────────────────────────────────────────
function GradBtn({ onClick, children, grad, style: extra = {} }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: grad || GRAD,
        color:"#fff", border:"none", borderRadius:12,
        padding:"13px 30px", fontSize:14, fontWeight:800, cursor:"pointer",
        fontFamily: FONT, letterSpacing:.6,
        boxShadow: hov ? `0 8px 32px ${P.dark}66` : `0 4px 16px ${P.deep}44`,
        transform: hov ? "translateY(-2px)" : "translateY(0)",
        transition:"all .2s",
        ...extra,
      }}>{children}</button>
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
    an.fftSize = 256; src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const draw = () => {
      an.getByteFrequencyData(data);
      const canvas = canvasRef.current; if (!canvas) return;
      const c = canvas.getContext("2d");
      c.clearRect(0, 0, canvas.width, canvas.height);
      const bw = canvas.width / data.length;
      data.forEach((v, i) => {
        const h = (v / 255) * canvas.height;
        const hue = 280 + (i / data.length) * 60;
        c.fillStyle = `hsl(${hue}, 80%, 65%)`;
        c.fillRect(i * bw, canvas.height - h, bw - 1, h);
      });
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(rafRef.current); ctx.close(); };
  }, [stream]);
  return <canvas ref={canvasRef} width={560} height={60}
    style={{width:"100%", height:60, borderRadius:10, background:P.dark}}/>;
}

// ── Feedback ──────────────────────────────────────────────────────────────────
const FEEDBACK_OPTIONS = [
  { label:"👍 GOOD",    value:"good",    from:P.deep,  to:P.gold },
  { label:"😐 AVERAGE", value:"average", from:P.card,    to:P.deep  },
  { label:"👎 BAD",     value:"bad",     from:P.deep,   to:P.mid   },
  { label:"💀 WORST",   value:"worst",   from:P.dark,   to:P.deep },
];

function FeedbackPanel({ feedback, onFeedback }) {
  return (
    <Card title="🗳 RATE THIS ASSESSMENT" accent={P.mid}>
      <p style={{fontSize:12, color:P.muted, margin:"0 0 16px", fontFamily: FONT}}>
        HOW ACCURATE WAS THIS ANALYSIS?
      </p>
      <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
        {FEEDBACK_OPTIONS.map((opt) => {
          const isActive = feedback === opt.value;
          return (
            <button key={opt.value} onClick={() => onFeedback(opt.value)} style={{
              background: isActive ? `linear-gradient(135deg,${opt.from},${opt.to})` : `${P.border}`,
              color:"#fff", border:`2px solid ${isActive ? opt.to : P.border}`,
              borderRadius:10, padding:"10px 20px", fontSize:12,
              fontWeight:800, cursor:"pointer", transition:"all .2s",
              fontFamily: FONT, letterSpacing:.5,
              transform: isActive ? "scale(1.06)" : "scale(1)",
            }}>{opt.label}</button>
          );
        })}
      </div>
      {feedback && (
        <div style={{marginTop:14, fontSize:12, color:P.gold, fontFamily: FONT, fontWeight:700}}>
          ✅ FEEDBACK RECORDED: {feedback.toUpperCase()}
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
  const fmt = (ms) => ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${ms}ms`;
  return (
    <Card title="⚡ ANALYSIS METRICS" accent={P.deep}>
      <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20}}>
        {[
          {label:"TOTAL TIME", value:fmt(total_ms),   color:P.gold},
          {label:"WHISPER",    value:fmt(whisper_ms), color:P.gold},
          {label:"LLM",        value:fmt(llm_ms),     color:P.mid},
        ].map(({label,value,color}) => (
          <div key={label} style={{background:P.deep, borderRadius:12, padding:"14px 16px", textAlign:"center", border:`1px solid ${P.border}`}}>
            <div style={{fontSize:22, fontFamily: FONT, color, fontWeight:800}}>{value}</div>
            <div style={{fontSize:10, color:P.muted, marginTop:4, textTransform:"uppercase", letterSpacing:1, fontFamily: FONT}}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:10, color:P.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:1, fontFamily: FONT}}>TIME BREAKDOWN</div>
        <div style={{display:"flex", borderRadius:8, overflow:"hidden", height:22}}>
          <div style={{width:`${breakdown?.whisper_percent}%`, background:`linear-gradient(90deg,${P.deep},${P.dark})`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", fontWeight:800, fontFamily: FONT}}>
            {breakdown?.whisper_percent}%
          </div>
          <div style={{width:`${breakdown?.llm_percent}%`, background:`linear-gradient(90deg,${P.mid},${P.dark})`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", fontWeight:800, fontFamily: FONT}}>
            {breakdown?.llm_percent}%
          </div>
          <div style={{flex:1, background:P.border, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:10, color:P.muted, fontFamily: FONT}}>OTHER</div>
        </div>
        <div style={{display:"flex", gap:16, marginTop:6}}>
          <span style={{fontSize:11, color:P.deep, fontFamily: FONT}}>■ WHISPER</span>
          <span style={{fontSize:11, color:P.mid, fontFamily: FONT}}>■ LLM</span>
        </div>
      </div>
      {ram && (
        <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12}}>
          {[
            {label:"CPU USAGE",   value:`${ram.cpu_percent}%`,      color: ram.cpu_percent > 80 ? P.mid : P.gold},
            {label:"PROCESS RAM", value:`${ram.process_ram_mb} MB`, color:P.gold},
            {label:"RAM Δ",       value:`${ramDelta>0?"+":""}${ramDelta} MB`, color:ramDelta>20?P.mid:P.muted},
          ].map(({label,value,color}) => (
            <div key={label} style={{background:P.deep, borderRadius:12, padding:"14px 16px", textAlign:"center", border:`1px solid ${P.border}`}}>
              <div style={{fontSize:18, fontFamily: FONT, color, fontWeight:800}}>{value}</div>
              <div style={{fontSize:10, color:P.muted, marginTop:4, textTransform:"uppercase", letterSpacing:1, fontFamily: FONT}}>{label}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:10, color:P.border, marginTop:12, fontFamily: FONT}}>ℹ️ CPU-ONLY SERVER — NO GPU ON RENDER FREE TIER</div>
    </Card>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color=P.gold, width=200, height=50 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v,i) => {
    const x = (i/(data.length-1))*width;
    const y = height - ((v-min)/range)*(height-8) - 4;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{overflow:"visible"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {data.map((v,i) => {
        const x = (i/(data.length-1))*width;
        const y = height - ((v-min)/range)*(height-8) - 4;
        return <circle key={i} cx={x} cy={y} r="3.5" fill={color}/>;
      })}
    </svg>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("assessments").select("*")
        .order("created_at", { ascending: false }).limit(50);
      if (error) setError(error.message);
      else setSessions(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{textAlign:"center", padding:"60px 0", color:P.muted, fontFamily: FONT}}>
      <div style={{fontSize:36, animation:"spin 1.5s linear infinite", display:"inline-block"}}>⚙️</div>
      <div style={{marginTop:12, fontWeight:700, letterSpacing:2}}>LOADING HISTORY…</div>
    </div>
  );

  if (error) return (
    <div style={{background:P.deep, border:`1px solid ${P.mid}`, borderRadius:12,
      padding:16, color:P.light, fontSize:13, fontFamily: FONT}}>⚠️ {error}</div>
  );

  if (sessions.length === 0) return (
    <Card title="📭 NO SESSIONS YET" accent={P.border}>
      <p style={{color:P.muted, fontSize:13, fontFamily: FONT}}>
        COMPLETE YOUR FIRST ANALYSIS AND IT WILL APPEAR HERE AUTOMATICALLY.
      </p>
    </Card>
  );

  const avg = (key) => Math.round(sessions.reduce((s,r) => s+(r[key]||0), 0) / sessions.length);
  const scores     = sessions.map(r=>r.overall_score).reverse();
  const grammarArr = sessions.map(r=>r.grammar_score).reverse();
  const confArr    = sessions.map(r=>r.confidence_score).reverse();
  const vocabArr   = sessions.map(r=>r.vocabulary_score).reverse();
  const best       = Math.max(...sessions.map(r=>r.overall_score));
  const avgTime    = Math.round(sessions.reduce((s,r)=>s+(r.analysis_total_ms||0),0)/sessions.length);
  const feedbackCounts = sessions.reduce((acc,r) => {
    if (r.user_feedback) acc[r.user_feedback]=(acc[r.user_feedback]||0)+1;
    return acc;
  }, {});

  return (
    <>
      <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20}}>
        {[
          {label:"SESSIONS",      value:sessions.length,        color:P.gold},
          {label:"AVG SCORE",     value:avg("overall_score"),   color:scoreColor(avg("overall_score"))},
          {label:"BEST SCORE",    value:best,                   color:P.gold},
          {label:"AVG ANALYSIS",  value:avgTime>=1000?`${(avgTime/1000).toFixed(1)}s`:`${avgTime}ms`, color:P.mid},
        ].map(({label,value,color}) => (
          <div key={label} style={{background:P.card, border:`1px solid ${P.border}`,
            borderRadius:14, padding:16, textAlign:"center"}}>
            <div style={{fontSize:26, fontFamily: FONT, color, fontWeight:800}}>{value}</div>
            <div style={{fontSize:10, color:P.muted, marginTop:4, textTransform:"uppercase", letterSpacing:1, fontFamily: FONT}}>{label}</div>
          </div>
        ))}
      </div>

      <Card title="📈 SCORE TRENDS" accent={P.deep}>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20}}>
          {[
            {label:"OVERALL SCORE", data:scores,     color:P.dark},
            {label:"GRAMMAR",       data:grammarArr, color:P.deep},
            {label:"CONFIDENCE",    data:confArr,    color:P.mid},
            {label:"VOCABULARY",    data:vocabArr,   color:P.gold},
          ].map(({label,data,color}) => (
            <div key={label} style={{background:P.deep, borderRadius:12, padding:16, border:`1px solid ${P.border}`}}>
              <div style={{display:"flex", justifyContent:"space-between", marginBottom:8}}>
                <span style={{fontSize:11, color:P.muted, fontFamily: FONT, fontWeight:700, letterSpacing:1}}>{label}</span>
                <span style={{fontSize:12, color, fontFamily: FONT, fontWeight:800}}>
                  AVG {Math.round(data.reduce((a,b)=>a+b,0)/data.length)}
                </span>
              </div>
              <Sparkline data={data} color={color} width={220} height={48}/>
            </div>
          ))}
        </div>
        <div style={{fontSize:10, color:P.border, marginTop:12, fontFamily: FONT}}>
          ← OLDEST · NEWEST → · {scores.length} SESSION{scores.length!==1?"S":""}
        </div>
      </Card>

      {Object.keys(feedbackCounts).length > 0 && (
        <Card title="🗳 FEEDBACK DISTRIBUTION" accent={P.mid}>
          <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
            {["good","average","bad","worst"].map((k) => {
              const count = feedbackCounts[k]||0;
              const total = sessions.filter(s=>s.user_feedback).length;
              const pct   = Math.round((count/total)*100)||0;
              const colors = {good:P.gold, average:P.deep, bad:P.mid, worst:P.dark};
              return (
                <div key={k} style={{background:P.deep, borderRadius:12, padding:"14px 20px",
                  textAlign:"center", flex:1, minWidth:80, border:`1px solid ${P.border}`}}>
                  <div style={{fontSize:24}}>{feedbackEmoji[k]}</div>
                  <div style={{fontSize:22, fontFamily: FONT, color:colors[k], fontWeight:800}}>{count}</div>
                  <div style={{fontSize:10, color:P.muted, textTransform:"uppercase", fontFamily: FONT}}>{k} · {pct}%</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="🗂 SESSION HISTORY" accent={P.dark}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily: FONT}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${P.border}`}}>
                {["DATE","SCORE","WPM","FILLERS","ARCHETYPE","TIME","FEEDBACK","TRANSCRIPT"].map(h=>(
                  <th key={h} style={{padding:"8px 12px", textAlign:"left", color:P.muted,
                    fontWeight:800, textTransform:"uppercase", letterSpacing:1, fontSize:10}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} style={{borderBottom:`1px solid ${P.deep}`, transition:"background .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=P.deep}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"10px 12px", color:P.muted, whiteSpace:"nowrap"}}>
                    {new Date(s.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                  </td>
                  <td style={{padding:"10px 12px"}}>
                    <span style={{color:scoreColor(s.overall_score), fontWeight:800}}>{s.overall_score}</span>
                  </td>
                  <td style={{padding:"10px 12px", color:P.white}}>{s.pace_wpm}</td>
                  <td style={{padding:"10px 12px", color:s.filler_total>5?P.mid:P.muted}}>{s.filler_total}</td>
                  <td style={{padding:"10px 12px", color:P.gold}}>
                    {archetypeEmoji[s.voice_archetype]||""} {s.voice_archetype||"—"}
                  </td>
                  <td style={{padding:"10px 12px", color:P.mid, whiteSpace:"nowrap"}}>
                    {s.analysis_total_ms>=1000?`${(s.analysis_total_ms/1000).toFixed(1)}s`:`${s.analysis_total_ms}ms`}
                  </td>
                  <td style={{padding:"10px 12px"}}>
                    {s.user_feedback?`${feedbackEmoji[s.user_feedback]} ${s.user_feedback.toUpperCase()}`:<span style={{color:P.border}}>—</span>}
                  </td>
                  <td style={{padding:"10px 12px", color:P.muted, maxWidth:180,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                    {s.transcript_snippet||"—"}
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
  const [session,    setSession]   = useState(() => {
    const token = getToken();
    const user  = getUser();
    return token && user ? { token, user } : null;
  });
  const [tab,        setTab]       = useState("coach");
  const [sideOpen,   setSideOpen]  = useState(false);
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

  // ── Auth: read from localStorage on load ─────────────────────────────────
  useEffect(() => {
    const token = getToken();
    const user  = getUser();
    if (token && user) setSession({ token, user });
    else setSession(null);
  }, []);

  const handleLogout = () => {
    clearAuth();
    setSession(null);
  };

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const saveToSupabase = async (data, fb=null) => {
    const { analysis, pace, filler_words, transcript, duration_seconds, performance, system_metrics } = data;
    const a = analysis||{};
    const row = {
      user_id:              session?.user?.id      ??null,
      overall_score:       a.overall_score         ??null,
      grammar_score:       a.grammar?.score        ??null,
      confidence_score:    a.confidence?.score     ??null,
      vocabulary_score:    a.vocabulary?.score     ??null,
      structure_score:     a.structure?.score      ??null,
      pronunciation_score: a.pronunciation?.score  ??null,
      accent_clarity:      a.accent?.clarity       ??null,
      pace_wpm:            pace?.wpm               ??null,
      pace_label:          pace?.label             ??null,
      filler_total:        filler_words?.total     ??null,
      voice_archetype:     a.voice_archetype?.type ??null,
      analysis_total_ms:   performance?.total_ms   ??null,
      whisper_ms:          performance?.whisper_ms  ??null,
      llm_ms:              performance?.llm_ms      ??null,
      ram_after_mb:        system_metrics?.after?.process_ram_mb??null,
      cpu_percent:         system_metrics?.after?.cpu_percent   ??null,
      user_feedback:       fb,
      transcript_snippet:  transcript?.slice(0,120)??null,
      duration_seconds:    duration_seconds??null,
    };
    const { data:inserted, error } = await supabase.from("assessments").insert([row]).select();
    if (error) console.error("Supabase save error:", error.message);
    else if (inserted?.[0]?.id) setSavedId(inserted[0].id);
  };

  const updateFeedback = async (fb) => {
    setFeedback(fb);
    if (savedId) await supabase.from("assessments").update({user_feedback:fb}).eq("id",savedId);
  };

  const startRecording = async () => {
    setError(null); setResult(null); setAudioBlob(null);
    setAudioUrl(null); setElapsed(0); setUploadName(null); setSavedId(null);
    chunksRef.current=[];
    try {
      const s = await navigator.mediaDevices.getUserMedia({audio:true});
      setStream(s);
      const mr = new MediaRecorder(s, {mimeType:"audio/webm"});
      mediaRef.current=mr;
      mr.ondataavailable=(e)=>{if(e.data.size) chunksRef.current.push(e.data);};
      mr.onstop=()=>{
        const blob=new Blob(chunksRef.current,{type:"audio/webm"});
        setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob)); setPhase("done");
      };
      mr.start(250); setRecording(true); setPhase("recording");
      timerRef.current=setInterval(()=>{
        setElapsed((e)=>{
          if(e+1>=MAX_SECONDS){stopRecording();return MAX_SECONDS;}
          return e+1;
        });
      },1000);
    } catch { setError("MICROPHONE ACCESS DENIED."); }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if(mediaRef.current?.state!=="inactive") mediaRef.current?.stop();
    stream?.getTracks().forEach(t=>t.stop());
    setStream(null); setRecording(false);
  };

  const handleUpload = (e) => {
    const file=e.target.files?.[0]; if(!file) return;
    setError(null); setResult(null); setElapsed(0); setSavedId(null);
    setAudioBlob(file); setAudioUrl(URL.createObjectURL(file));
    setUploadName(file.name); setPhase("done");
  };

  const analyse = async () => {
    if(!audioBlob) return;
    setLoading(true); setError(null); setFeedback(null); setSavedId(null);
    setPhase("analysing");
    const fd=new FormData();
    fd.append("audio",audioBlob,uploadName||"recording.webm");
    try {
      const res=await fetch(`${API}/transcribe-and-assess`,{method:"POST", headers:{"Authorization":`Bearer ${getToken()}`}, body:fd});
      if(!res.ok){const t=await res.text();throw new Error(t);}
      const data=await res.json();
      setResult(data); setPhase("result");
      await saveToSupabase(data,null);
    } catch(e) {
      setError(`ANALYSIS FAILED: ${e.message}`); setPhase("done");
    } finally { setLoading(false); }
  };

  const reset = () => {
    setResult(null); setAudioBlob(null); setAudioUrl(null);
    setElapsed(0); setError(null); setPhase("idle");
    setFeedback(null); setUploadName(null); setSavedId(null);
  };

  const { analysis, pace, filler_words, transcript, duration_seconds, performance, system_metrics } = result||{};
  const a = analysis||{};

  const NAV_ITEMS = [
    {id:"coach",     icon:"🎙", label:"SPEECH COACH"},
    {id:"dashboard", icon:"📊", label:"DASHBOARD"},
  ];

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (!session) {
    return <Auth onAuthed={setSession} />;
  }

  return (
    <div style={{minHeight:"100vh", background:GRAD_BG, color:P.white,
      fontFamily: FONT, display:"flex"}}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width:220, minHeight:"100vh", background:`${P.deep}EE`,
        borderRight:`1px solid ${P.border}`,
        display:"flex", flexDirection:"column",
        position:"fixed", top:0, left:0, zIndex:100,
        transform: sideOpen ? "translateX(0)" : "translateX(-100%)",
        transition:"transform .3s",
      }} className={`sidebar${sideOpen?" open":""}`}>
        {/* Logo */}
        <div style={{padding:"32px 24px 24px"}}>
          <div style={{
            fontSize:22, fontWeight:900, fontFamily: FONT,
            background:GRAD, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            letterSpacing:1, lineHeight:1.2,
          }}>SPEECH<br/>COACH</div>
          <div style={{fontSize:10, color:P.muted, letterSpacing:3, marginTop:4}}>VOICE ANALYTICS</div>
        </div>

        {/* Divider */}
        <div style={{height:1, background:P.border, margin:"0 24px 20px"}}/>

        {/* Nav */}
        <nav style={{flex:1, padding:"0 12px"}}>
          {NAV_ITEMS.map(({id,icon,label}) => {
            const active = tab===id;
            return (
              <button key={id} onClick={()=>{setTab(id);setSideOpen(false);}} style={{
                display:"flex", alignItems:"center", gap:12, width:"100%",
                padding:"12px 16px", borderRadius:12, border:"none", cursor:"pointer",
                background: active ? `linear-gradient(135deg,${P.dark}33,${P.deep}33)` : "transparent",
                borderLeft: active ? `3px solid ${P.dark}` : "3px solid transparent",
                color: active ? P.white : P.muted,
                fontFamily: FONT, fontWeight:800, fontSize:12,
                letterSpacing:1, marginBottom:4, transition:"all .2s",
                textAlign:"left",
              }}>
                <span style={{fontSize:18}}>{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div style={{padding:"0 24px 12px"}}>
          <div style={{height:1, background:P.border, margin:"0 0 16px"}}/>
          <div style={{fontSize:10, color:P.muted, letterSpacing:1, marginBottom:8,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
            {session.user?.email?.toUpperCase()}
          </div>
          <button onClick={handleLogout} style={{
            width:"100%", background:"transparent", border:`1px solid ${P.border}`,
            borderRadius:10, padding:"9px 0", color:P.muted, fontSize:11,
            fontWeight:800, letterSpacing:1, cursor:"pointer", fontFamily: FONT,
            transition:"all .2s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.color=P.white; e.currentTarget.style.borderColor=P.mid;}}
          onMouseLeave={e=>{e.currentTarget.style.color=P.muted; e.currentTarget.style.borderColor=P.border;}}
          >↪ LOG OUT</button>
        </div>

        {/* Bottom tag */}
        <div style={{padding:"4px 24px 20px", fontSize:10, color:P.border, letterSpacing:1}}>
          GROQ · WHISPER · LLAMA 3
        </div>
      </aside>

      {/* Sidebar overlay for mobile */}
      {sideOpen && (
        <div onClick={()=>setSideOpen(false)} style={{
          position:"fixed", inset:0, background:"#00000088", zIndex:99,
        }}/>
      )}

      {/* ── MAIN CONTENT ── */}
      <main style={{marginLeft:220, flex:1, padding:"40px 40px 60px"}} className="main-content">

        {/* Mobile hamburger */}
        <button onClick={()=>setSideOpen(v=>!v)} className="hamburger" style={{
          display:"none", background:GRAD, border:"none", borderRadius:10,
          padding:"10px 14px", cursor:"pointer", marginBottom:24,
          fontSize:18, color:"#fff", fontWeight:800,
        }}>☰</button>

        {/* ── COACH TAB ── */}
        {tab==="coach" && (
          <>
            {(phase==="idle"||phase==="recording"||phase==="done") && (
              <Card title="🎙 RECORD OR UPLOAD AUDIO" accent={P.dark}>
                {phase==="recording" && (
                  <>
                    <WaveViz stream={stream}/>
                    <div style={{textAlign:"center", marginTop:16}}>
                      <div style={{
                        fontSize:48, fontFamily: FONT, fontWeight:900,
                        background:GRAD, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                        letterSpacing:4,
                      }}>{fmt(elapsed)}</div>
                      <div style={{fontSize:12, color:P.muted, letterSpacing:2}}>
                        {fmt(MAX_SECONDS-elapsed)} REMAINING
                      </div>
                      <div style={{background:P.border, borderRadius:999, height:5, overflow:"hidden", maxWidth:300, margin:"10px auto"}}>
                        <div style={{
                          width:`${(elapsed/MAX_SECONDS)*100}%`, height:"100%",
                          background:GRAD, transition:"width 1s linear",
                        }}/>
                      </div>
                    </div>
                  </>
                )}
                {phase==="idle" && (
                  <div style={{textAlign:"center", padding:"32px 0"}}>
                    <div style={{fontSize:72, marginBottom:16}}>🎤</div>
                    <p style={{color:P.muted, fontSize:14, margin:"0 0 8px", letterSpacing:1, fontWeight:700}}>
                      CLICK TO START RECORDING.
                    </p>
                    <p style={{color:P.border, fontSize:12, margin:0, letterSpacing:1}}>
                      SPEAK NATURALLY — IMAGINE YOU'RE PRESENTING TO AN AUDIENCE.
                    </p>
                    <p style={{color:P.border, fontSize:11, margin:"8px 0 0", letterSpacing:1}}>
                      OR UPLOAD AN EXISTING FILE (.WEBM, .MP3, .WAV, .M4A)
                    </p>
                  </div>
                )}
                {phase==="done" && audioUrl && (
                  <div style={{marginBottom:20}}>
                    <div style={{
                      background:GRAD, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                      textAlign:"center", marginBottom:12, fontSize:14, fontWeight:800, letterSpacing:1,
                    }}>
                      {uploadName?`✅ UPLOADED: ${uploadName.toUpperCase()}`:`✅ RECORDING SAVED — ${fmt(elapsed)}`}
                    </div>
                    <audio src={audioUrl} controls style={{width:"100%", borderRadius:10}}/>
                  </div>
                )}
                <div style={{display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap", marginTop:phase==="recording"?20:0}}>
                  {phase==="idle" && (
                    <>
                      <GradBtn onClick={startRecording}>● START RECORDING</GradBtn>
                      <input ref={fileInputRef} type="file" accept=".webm,.mp3,.wav,.m4a,audio/*"
                        style={{display:"none"}} onChange={handleUpload}/>
                      <GradBtn onClick={()=>fileInputRef.current?.click()} grad={GRAD2}>📂 UPLOAD AUDIO</GradBtn>
                    </>
                  )}
                  {phase==="recording" && (
                      <GradBtn onClick={stopRecording} grad={`linear-gradient(135deg,${P.deep},${P.gold})`}>
                      ■ STOP RECORDING
                    </GradBtn>
                  )}
                  {phase==="done" && (
                    <>
                      <GradBtn onClick={reset} grad={`linear-gradient(135deg,${P.card},${P.deep})`}>
                        ↺ START OVER
                      </GradBtn>
                      <GradBtn onClick={analyse}>🔍 ANALYSE SPEECH</GradBtn>
                    </>
                  )}
                </div>
              </Card>
            )}

            {phase==="analysing" && (
              <Card title="ANALYSING YOUR SPEECH…" accent={P.deep}>
                <div style={{textAlign:"center", padding:"48px 0"}}>
                  <div style={{fontSize:52, animation:"spin 1.5s linear infinite", display:"inline-block"}}>⚙️</div>
                  <div style={{marginTop:16, color:P.muted, fontSize:13, letterSpacing:2, fontWeight:700}}>
                    TRANSCRIBING WITH WHISPER · ANALYSING WITH LLAMA…
                  </div>
                </div>
              </Card>
            )}

            {error && (
              <div style={{background:P.deep, border:`1px solid ${P.mid}`, borderRadius:14,
                padding:16, marginBottom:20, color:P.light, fontSize:13, fontWeight:700, letterSpacing:.5}}>
                ⚠️ {error}
              </div>
            )}

            {result && phase==="result" && (
              <>
                <Card title="📊 OVERALL SCORE" accent={P.deep}>
                  <div style={{display:"flex", gap:24, flexWrap:"wrap", justifyContent:"center", marginBottom:20}}>
                    <Gauge value={a.overall_score??0} label="OVERALL" size={130}/>
                    <Gauge value={a.grammar?.score??0} label="GRAMMAR"/>
                    <Gauge value={a.confidence?.score??0} label="CONFIDENCE"/>
                    <Gauge value={a.vocabulary?.score??0} label="VOCABULARY"/>
                    <Gauge value={a.structure?.score??0} label="STRUCTURE"/>
                  </div>
                  <p style={{color:P.muted, fontSize:13, lineHeight:1.8, margin:0}}>{a.summary}</p>
                </Card>

                <Card title="⏱ PACE & FILLER WORDS" accent={P.mid}>
                  <div style={{display:"flex", gap:24, flexWrap:"wrap"}}>
                    <div style={{flex:1, minWidth:200}}>
                      <div style={{fontSize:36, fontWeight:900, background:GRAD,
                        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent"}}>
                        {pace?.wpm} <span style={{fontSize:14, color:P.muted, WebkitTextFillColor:P.muted}}>WPM</span>
                      </div>
                      <Chip text={pace?.label}/>
                      <p style={{color:P.muted, fontSize:12, marginTop:8}}>💡 {pace?.tip}</p>
                    </div>
                    <div style={{flex:1, minWidth:200}}>
                      <div style={{fontSize:36, fontWeight:900, color:scoreColor(filler_words?.score??100)}}>
                        {filler_words?.total} <span style={{fontSize:14, color:P.muted}}>FILLERS</span>
                      </div>
                      <div style={{marginTop:8, display:"flex", flexWrap:"wrap"}}>
                        {Object.entries(filler_words?.counts||{}).map(([w,n])=><Chip key={w} text={`${w.toUpperCase()} ×${n}`}/>)}
                        {!filler_words?.total && <Chip text="NONE DETECTED 🎉"/>}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="📝 GRAMMAR" accent={P.dark}>
                  <Bar label="GRAMMAR SCORE" score={a.grammar?.score??0} tip={a.grammar?.tip}/>
                  {a.grammar?.issues?.length>0 && (
                    <div>
                      <div style={{fontSize:11, color:P.muted, marginBottom:8, letterSpacing:1}}>ISSUES FOUND:</div>
                      {a.grammar.issues.map((i,idx)=>(
                        <div key={idx} style={{fontSize:12, color:P.light, padding:"5px 0",
                          borderBottom:`1px solid ${P.border}`}}>▸ {i}</div>
                      ))}
                    </div>
                  )}
                </Card>

                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20}}>
                  <Card title="🗣 PRONUNCIATION" accent={P.gold}>
                    <Bar label="PRONUNCIATION" score={a.pronunciation?.score??0}/>
                    <p style={{fontSize:12, color:P.muted, lineHeight:1.6, margin:"8px 0 4px"}}>{a.pronunciation?.notes}</p>
                    <p style={{fontSize:11, color:P.border, margin:0}}>💡 {a.pronunciation?.tip}</p>
                  </Card>
                  <Card title="🌍 ACCENT" accent={P.mid}>
                    <div style={{fontSize:20, fontWeight:900, background:GRAD,
                      WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:8}}>
                      {a.accent?.detected}
                    </div>
                    <Bar label="CLARITY" score={a.accent?.clarity??0}/>
                    <p style={{fontSize:12, color:P.muted, margin:0}}>{a.accent?.notes}</p>
                  </Card>
                </div>

                <Card title="💪 CONFIDENCE" accent={P.mid}>
                  <Bar label="CONFIDENCE" score={a.confidence?.score??0} tip={a.confidence?.tip}/>
                  <div style={{display:"flex", flexWrap:"wrap", marginTop:8}}>
                    {a.confidence?.signals?.map((s,i)=><Chip key={i} text={s.toUpperCase()}/>)}
                  </div>
                </Card>

                {a.voice_archetype && (
                  <Card title="🎭 VOICE ARCHETYPE" accent={P.dark}>
                    <div style={{display:"flex", gap:16, alignItems:"flex-start"}}>
                      <div style={{fontSize:52}}>{archetypeEmoji[a.voice_archetype.type]||"🎤"}</div>
                      <div>
                        <div style={{fontSize:22, fontWeight:900, background:GRAD,
                          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:4}}>
                          {a.voice_archetype.type?.toUpperCase()}
                        </div>
                        <p style={{fontSize:13, color:P.muted, lineHeight:1.6, margin:"0 0 12px"}}>{a.voice_archetype.description}</p>
                        <div style={{fontSize:10, color:P.gold, marginBottom:4, letterSpacing:2}}>STRENGTHS</div>
                        {a.voice_archetype.strengths?.map((s,i)=><div key={i} style={{fontSize:12, color:P.gold}}>✓ {s}</div>)}
                        <div style={{fontSize:10, color:P.mid, marginBottom:4, marginTop:10, letterSpacing:2}}>GROWTH AREAS</div>
                        {a.voice_archetype.growth_areas?.map((s,i)=><div key={i} style={{fontSize:12, color:P.mid}}>→ {s}</div>)}
                      </div>
                    </div>
                  </Card>
                )}

                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20}}>
                  <Card title="⭐ TOP STRENGTHS" accent={P.gold}>
                    {a.top_strengths?.map((s,i)=>(
                      <div key={i} style={{fontSize:13, color:P.gold, padding:"6px 0",
                        borderBottom:`1px solid ${P.border}`}}>✓ {s}</div>
                    ))}
                  </Card>
                  <Card title="🚀 KEY IMPROVEMENTS" accent={P.mid}>
                    {a.top_improvements?.map((s,i)=>(
                      <div key={i} style={{fontSize:13, color:P.mid, padding:"6px 0",
                        borderBottom:`1px solid ${P.border}`}}>→ {s}</div>
                    ))}
                  </Card>
                </div>

                <PerfMetrics performance={performance} system_metrics={system_metrics}/>
                <FeedbackPanel feedback={feedback} onFeedback={updateFeedback}/>

                <Card title="📄 TRANSCRIPT" accent={P.border}>
                  <div style={{fontSize:13, color:P.muted, lineHeight:1.8, maxHeight:200,
                    overflowY:"auto", background:P.deep, padding:16, borderRadius:10}}>
                    {transcript}
                  </div>
                  <div style={{fontSize:11, color:P.border, marginTop:8, letterSpacing:1}}>
                    DURATION: {duration_seconds}S · WORDS: ~{transcript?.split(" ").length}
                  </div>
                </Card>

                <div style={{textAlign:"center", marginTop:8}}>
                  <GradBtn onClick={reset}>+ NEW RECORDING</GradBtn>
                </div>
              </>
            )}
          </>
        )}

        {tab==="dashboard" && <Dashboard/>}
      </main>

      <style>{`
                @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing:border-box; }
        audio { accent-color:${P.dark}; }
        .sidebar { transform: translateX(0) !important; }
        .hamburger { display: none !important; }
        @media (max-width: 768px) {
          .sidebar { transform: translateX(-100%) !important; }
          .sidebar.open { transform: translateX(0) !important; }
          .main-content { margin-left: 0 !important; padding: 20px !important; }
          .hamburger { display: block !important; }
        }
      `}</style>
    </div>
  );
}
