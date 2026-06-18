import { useState } from "react";
import { supabase } from "./supabaseClient";

const P = {
  deep:    "#49225B",
  dark:    "#6E3482",
  mid:     "#A56ABD",
  light:   "#E7DBEF",
  white:   "#F5EBFA",
  card:    "#3A1A4A",
  border:  "#5C2D72",
  muted:   "#C4A8D4",
};

const GRAD = `linear-gradient(135deg, ${P.deep}, ${P.dark}, ${P.mid})`;
const GRAD_BG = `linear-gradient(160deg, #2A1038 0%, ${P.deep} 50%, #3D1A50 100%)`;

export default function Auth({ onAuthed }) {
  const [mode, setMode]       = useState("login"); // login | signup
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [message, setMessage] = useState(null);

  const inputStyle = {
    width: "100%", background: P.card, border: `1px solid ${P.border}`,
    borderRadius: 12, padding: "14px 16px", color: P.white, fontSize: 14,
    fontFamily: "Nunito, sans-serif", fontWeight: 600, outline: "none",
    marginBottom: 16, boxSizing: "border-box",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); setMessage(null); setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.user && !data.session) {
          setMessage("ACCOUNT CREATED! CHECK YOUR EMAIL TO CONFIRM, THEN LOG IN.");
          setMode("login");
        } else if (data?.session) {
          onAuthed(data.session);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthed(data.session);
      }
    } catch (err) {
      setError(err.message?.toUpperCase() || "SOMETHING WENT WRONG.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: GRAD_BG, display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "Nunito, sans-serif",
      padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: P.card,
        border: `1px solid ${P.border}`, borderRadius: 20, padding: 36,
        boxShadow: `0 20px 60px ${P.deep}88`,
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            fontSize: 26, fontWeight: 900, fontFamily: "Nunito, sans-serif",
            background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: 1, lineHeight: 1.2,
          }}>SPEECH COACH</div>
          <div style={{ fontSize: 11, color: P.muted, letterSpacing: 3, marginTop: 6 }}>VOICE ANALYTICS</div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, background: P.deep, borderRadius: 12, padding: 4 }}>
          {[{ id: "login", label: "LOG IN" }, { id: "signup", label: "SIGN UP" }].map(({ id, label }) => (
            <button key={id} onClick={() => { setMode(id); setError(null); setMessage(null); }} style={{
              flex: 1, padding: "10px 0", borderRadius: 9, border: "none", cursor: "pointer",
              background: mode === id ? GRAD : "transparent",
              color: mode === id ? "#fff" : P.muted,
              fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: 12,
              letterSpacing: 1, transition: "all .2s",
            }}>{label}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 11, color: P.muted, letterSpacing: 1, fontWeight: 700, display: "block", marginBottom: 6 }}>
            EMAIL
          </label>
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="YOU@EXAMPLE.COM"
            style={inputStyle}
          />

          <label style={{ fontSize: 11, color: P.muted, letterSpacing: 1, fontWeight: 700, display: "block", marginBottom: 6 }}>
            PASSWORD
          </label>
          <input
            type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={6}
            style={inputStyle}
          />

          {error && (
            <div style={{
              background: "#2A1038", border: `1px solid ${P.mid}`, borderRadius: 10,
              padding: 12, marginBottom: 16, color: P.light, fontSize: 12, fontWeight: 700,
            }}>⚠️ {error}</div>
          )}

          {message && (
            <div style={{
              background: P.deep, border: `1px solid ${P.mid}`, borderRadius: 10,
              padding: 12, marginBottom: 16, color: P.white, fontSize: 12, fontWeight: 700,
            }}>✅ {message}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", background: GRAD, color: "#fff", border: "none",
            borderRadius: 12, padding: "14px 0", fontSize: 14, fontWeight: 800,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "Nunito, sans-serif",
            letterSpacing: 1, opacity: loading ? 0.6 : 1, transition: "opacity .2s",
          }}>
            {loading ? "LOADING…" : mode === "login" ? "LOG IN" : "CREATE ACCOUNT"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: P.muted, letterSpacing: 1 }}>
          {mode === "login" ? "DON'T HAVE AN ACCOUNT? " : "ALREADY HAVE AN ACCOUNT? "}
          <span
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setMessage(null); }}
            style={{ color: P.mid, fontWeight: 800, cursor: "pointer" }}
          >
            {mode === "login" ? "SIGN UP" : "LOG IN"}
          </span>
        </div>
      </div>
    </div>
  );
}
