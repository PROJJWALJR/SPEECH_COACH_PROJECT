"""
Speech Assessment API
Groq Cloud (Whisper + Llama 3) + JWT/bcrypt Auth
"""

import os
import re
import json
import time
import tempfile
import traceback
from pathlib import Path
from datetime import datetime, timedelta

import psutil
from groq import Groq
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
import uvicorn

# ── Auth libs ─────────────────────────────────────────────────────────────────
try:
    import bcrypt
except ImportError:
    raise RuntimeError("bcrypt not installed — add to requirements.txt")

try:
    from jose import JWTError, jwt
except ImportError:
    raise RuntimeError("python-jose not installed — add to requirements.txt")

# ── Supabase (used as plain Postgres client via REST) ─────────────────────────
try:
    from supabase import create_client, Client
except ImportError:
    raise RuntimeError("supabase not installed — add to requirements.txt")

def get_supabase() -> Client:
    url  = os.environ.get("SUPABASE_URL")
    key  = os.environ.get("SUPABASE_SERVICE_KEY")  # service role key (bypasses RLS)
    if not url or not key:
        raise HTTPException(500, "SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
    return create_client(url, key)

# ── JWT config ────────────────────────────────────────────────────────────────
JWT_SECRET    = os.environ.get("JWT_SECRET", "change-this-in-production-please")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72  # token valid for 3 days

def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")

# ── Auth dependency ───────────────────────────────────────────────────────────
bearer = HTTPBearer()

def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    return verify_token(creds.credentials)

# ── Groq client ───────────────────────────────────────────────────────────────
def get_groq():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise HTTPException(500, "GROQ_API_KEY not set")
    return Groq(api_key=key)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Speech Coach — Groq Cloud + JWT Auth")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request schemas ───────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

# ── Local helpers ─────────────────────────────────────────────────────────────
FILLER_WORDS = [
    "um", "uh", "ah", "like", "you know", "basically", "literally",
    "actually", "so", "right", "okay", "well", "kind of", "sort of",
    "i mean", "you see", "essentially",
]

def count_fillers(text: str) -> dict:
    text_lower = text.lower()
    counts = {}
    for fw in FILLER_WORDS:
        n = len(re.findall(r'\b' + re.escape(fw) + r'\b', text_lower))
        if n:
            counts[fw] = n
    return counts

def estimate_pace(text: str, duration_seconds: float) -> dict:
    words = text.split()
    wpm = (len(words) / duration_seconds) * 60 if duration_seconds else 0
    if wpm < 110:
        label, tip = "Too Slow", "Try to speak a bit faster to keep listeners engaged."
    elif wpm <= 150:
        label, tip = "Ideal", "Perfect conversational pace — clear and comfortable."
    elif wpm <= 180:
        label, tip = "Slightly Fast", "Deliberate pauses would help comprehension."
    else:
        label, tip = "Too Fast", "Slow down; listeners may struggle to follow."
    return {"wpm": round(wpm), "label": label, "tip": tip}

def build_prompt(transcript: str, pace: dict, filler_counts: dict) -> str:
    filler_summary = json.dumps(filler_counts) if filler_counts else "None"
    return f"""You are an expert speech coach. Analyse this transcript and return ONLY a valid JSON object. No markdown, no code fences, just raw JSON.

Transcript: {transcript}

Already computed:
- Pace: {pace['wpm']} WPM ({pace['label']})
- Filler words: {filler_summary}

Return this exact JSON structure with all fields filled:
{{
  "overall_score": <0-100>,
  "grammar": {{"score": <0-100>, "issues": ["<issue1>", "<issue2>"], "tip": "<tip>"}},
  "pronunciation": {{"score": <0-100>, "notes": "<notes>", "tip": "<tip>"}},
  "accent": {{"detected": "<accent>", "clarity": <0-100>, "notes": "<notes>"}},
  "confidence": {{"score": <0-100>, "signals": ["<signal1>", "<signal2>"], "tip": "<tip>"}},
  "voice_archetype": {{"type": "<Storyteller|Analyst|Motivator|Educator|Conversationalist|Commander|Empath>", "description": "<2 sentences>", "strengths": ["<s1>", "<s2>", "<s3>"], "growth_areas": ["<g1>", "<g2>"]}},
  "vocabulary": {{"score": <0-100>, "level": "<Basic|Intermediate|Advanced|Expert>", "notable_words": ["<w1>", "<w2>"]}},
  "structure": {{"score": <0-100>, "has_clear_opening": <true|false>, "has_clear_closing": <true|false>, "tip": "<tip>"}},
  "top_strengths": ["<s1>", "<s2>", "<s3>"],
  "top_improvements": ["<i1>", "<i2>", "<i3>"],
  "summary": "<3-4 sentence coaching summary>"
}}"""

def get_system_metrics() -> dict:
    process = psutil.Process(os.getpid())
    ram_mb = process.memory_info().rss / (1024 * 1024)
    system_ram_mb = psutil.virtual_memory().used / (1024 * 1024)
    cpu_percent = psutil.cpu_percent(interval=0.1)
    return {
        "process_ram_mb": round(ram_mb, 1),
        "system_ram_used_mb": round(system_ram_mb, 1),
        "system_ram_total_mb": round(psutil.virtual_memory().total / (1024 * 1024), 1),
        "cpu_percent": round(cpu_percent, 1),
        "note": "CPU-only server (no GPU on Render free tier)",
    }

# ── Auth routes ───────────────────────────────────────────────────────────────
@app.post("/signup")
async def signup(req: SignupRequest):
    sb = get_supabase()

    # Check if email already exists
    existing = sb.table("users").select("id").eq("email", req.email.lower()).execute()
    if existing.data:
        raise HTTPException(400, "EMAIL ALREADY REGISTERED")

    # Hash password
    pw_hash = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()

    # Insert user
    result = sb.table("users").insert({
        "email": req.email.lower(),
        "password_hash": pw_hash,
    }).execute()

    user = result.data[0]
    token = create_token(user["id"], user["email"])

    return {"token": token, "user": {"id": user["id"], "email": user["email"]}}


@app.post("/login")
async def login(req: LoginRequest):
    sb = get_supabase()

    # Fetch user
    result = sb.table("users").select("*").eq("email", req.email.lower()).execute()
    if not result.data:
        raise HTTPException(401, "INVALID EMAIL OR PASSWORD")

    user = result.data[0]

    # Verify password
    if not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
        raise HTTPException(401, "INVALID EMAIL OR PASSWORD")

    token = create_token(user["id"], user["email"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"]}}


@app.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {"user": {"id": current_user["sub"], "email": current_user["email"]}}


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "backend": "groq", "auth": "jwt+bcrypt"}


# ── Main protected route ──────────────────────────────────────────────────────
@app.post("/transcribe-and-assess")
async def transcribe_and_assess(
    audio: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),   # ← JWT required
):
    tmp_path = None
    analysis_start = time.time()
    metrics_before = get_system_metrics()

    try:
        suffix = Path(audio.filename).suffix if audio.filename else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name
        print(f"Audio saved: {tmp_path} ({os.path.getsize(tmp_path)} bytes)")

        client = get_groq()

        # 1. Transcribe
        print("Transcribing with Groq Whisper...")
        whisper_start = time.time()
        with open(tmp_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                file=(Path(tmp_path).name, f.read()),
                model="whisper-large-v3",
                response_format="verbose_json",
            )
        whisper_ms = round((time.time() - whisper_start) * 1000)

        transcript = transcription.text.strip()
        duration = getattr(transcription, "duration", None) or max(os.path.getsize(tmp_path) / 32000, 1)
        print(f"Transcript: {transcript[:100]}... | Whisper: {whisper_ms}ms")

        # 2. Local metrics
        pace    = estimate_pace(transcript, duration)
        fillers = count_fillers(transcript)

        # 3. LLM analysis
        print("Analysing with Groq LLM...")
        llm_start = time.time()
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": build_prompt(transcript, pace, fillers)}],
            temperature=0.2,
            max_tokens=2048,
        )
        llm_ms = round((time.time() - llm_start) * 1000)

        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not match:
            raise HTTPException(500, f"LLM did not return JSON: {raw[:300]}")

        json_str = match.group()
        try:
            analysis = json.loads(json_str)
        except json.JSONDecodeError:
            json_str = re.sub(r',\s*}', '}', json_str)
            json_str = re.sub(r',\s*]', ']', json_str)
            try:
                analysis = json.loads(json_str)
            except json.JSONDecodeError:
                try:
                    from json_repair import repair_json
                    analysis = json.loads(repair_json(json_str))
                except Exception:
                    raise HTTPException(500, f"Could not parse JSON: {json_str[:300]}")

        total_ms = round((time.time() - analysis_start) * 1000)
        metrics_after = get_system_metrics()
        print(f"Total: {total_ms}ms | User: {current_user['email']}")

        return JSONResponse({
            "transcript": transcript,
            "duration_seconds": round(float(duration), 1),
            "pace": pace,
            "filler_words": {
                "counts": fillers,
                "total": sum(fillers.values()),
                "score": max(0, 100 - sum(fillers.values()) * 5),
            },
            "analysis": analysis,
            "performance": {
                "total_ms": total_ms,
                "whisper_ms": whisper_ms,
                "llm_ms": llm_ms,
                "breakdown": {
                    "whisper_percent": round(whisper_ms / total_ms * 100, 1),
                    "llm_percent": round(llm_ms / total_ms * 100, 1),
                },
            },
            "system_metrics": {
                "before": metrics_before,
                "after": metrics_after,
                "ram_delta_mb": round(metrics_after["process_ram_mb"] - metrics_before["process_ram_mb"], 1),
            },
        })

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
