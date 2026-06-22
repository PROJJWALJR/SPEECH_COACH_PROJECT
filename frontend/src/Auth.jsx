import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const P = {
  deep:   "#0B3650",
  dark:   "#174F77",
  mid:    "#2B82B7",
  gold:   "#D4AF37",
  light:  "#E9E2C9",
  white:  "#F9F5E1",
  card:   "#103850",
  border: "#4F7B9C",
  muted:  "#AFC9D5",
};
const FONT = "Georgia, 'Times New Roman', serif";
const GRAD    = `linear-gradient(135deg, ${P.deep}, ${P.dark}, ${P.gold})`;
const GRAD_BG = `linear-gradient(160deg, #082238 0%, ${P.deep} 45%, ${P.gold} 100%)`;

export default function Auth({ onAuthed }) {
  const [mode,     setMode]     = useState("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const inputStyle = {
    width: "100%", background: P.deep, border: `1px solid ${P.border}`,
    borderRadius: 12, padding: "14px 16px", color: P.white, fontSize: 14,
    fontFamily: FONT, fontWeight: 600, outline: "none",
    marginBottom: 16, boxSizing: "border-box",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null); setLoading(true);
    const endpoint = mode === "login" ? "/login" : "/signup";
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "SOMETHING WENT WRONG");
      // Store token + user in localStorage
      localStorage.setItem("sc_token", data.token);
      localStorage.setItem("sc_user",  JSON.stringify(data.user));
      onAuthed({ token: data.token, user: data.user });
    } catch (err) {
      setError(err.message?.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: GRAD_BG, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: FONT, padding: 20,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: P.card,
        border: `1px solid ${P.border}`, borderRadius: 20, padding: 36,
        boxShadow: `0 20px 60px #1a003388`,
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            fontSize: 26, fontWeight: 900,
            background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: 1, lineHeight: 1.2,
          }}>SPEECH COACH</div>
          <div style={{ fontSize: 11, color: P.muted, letterSpacing: 3, marginTop: 6 }}>VOICE ANALYTICS</div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, background: P.deep, borderRadius: 12, padding: 4 }}>
          {[{ id: "login", label: "LOG IN" }, { id: "signup", label: "SIGN UP" }].map(({ id, label }) => (
            <button key={id} onClick={() => { setMode(id); setError(null); }} style={{
              flex: 1, padding: "10px 0", borderRadius: 9, border: "none", cursor: "pointer",
              background: mode === id ? GRAD : "transparent",
              color: mode === id ? "#fff" : P.muted,
              fontFamily: FONT, fontWeight: 800, fontSize: 12,
              letterSpacing: 1, transition: "all .2s",
            }}>{label}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 11, color: P.muted, letterSpacing: 1, fontWeight: 700, display: "block", marginBottom: 6 }}>
            EMAIL
          </label>
          <input type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle} />

          <label style={{ fontSize: 11, color: P.muted, letterSpacing: 1, fontWeight: 700, display: "block", marginBottom: 6 }}>
            PASSWORD {mode === "signup" && <span style={{ color: P.border }}>(MIN 6 CHARS)</span>}
          </label>
          <input type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" minLength={6}
            style={inputStyle} />

          {error && (
            <div style={{
              background: P.deep, border: `1px solid ${P.mid}`, borderRadius: 10,
              padding: 12, marginBottom: 16, color: P.light, fontSize: 12, fontWeight: 700,
            }}>⚠️ {error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", background: GRAD, color: "#fff", border: "none",
            borderRadius: 12, padding: "14px 0", fontSize: 14, fontWeight: 800,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: FONT,
            letterSpacing: 1, opacity: loading ? 0.6 : 1, transition: "opacity .2s",
          }}>
            {loading ? "LOADING…" : mode === "login" ? "LOG IN" : "CREATE ACCOUNT"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: P.muted, letterSpacing: 1 }}>
          {mode === "login" ? "DON'T HAVE AN ACCOUNT? " : "ALREADY HAVE AN ACCOUNT? "}
          <span onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
            style={{ color: P.mid, fontWeight: 800, cursor: "pointer" }}>
            {mode === "login" ? "SIGN UP" : "LOG IN"}
          </span>
        </div>
      </div>
    </div>
  );
}
