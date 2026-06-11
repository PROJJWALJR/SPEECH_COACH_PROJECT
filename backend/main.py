"""
Speech Assessment API
Groq Cloud (Whisper + Llama 3) — fully cloud hosted, no local models needed
"""

import os
import re
import json
import time
import tempfile
import traceback
from pathlib import Path

import psutil
from groq import Groq
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# ── Groq client ───────────────────────────────────────────────────────────────
def get_groq():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise HTTPException(500, "GROQ_API_KEY not set")
    return Groq(api_key=key)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Speech Coach — Groq Cloud")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# ── System metrics helper ─────────────────────────────────────────────────────
def get_system_metrics() -> dict:
    """Snapshot current process RAM and system CPU usage."""
    process = psutil.Process(os.getpid())
    ram_mb = process.memory_info().rss / (1024 * 1024)          # process RSS in MB
    system_ram_mb = psutil.virtual_memory().used / (1024 * 1024) # total system RAM used in MB
    cpu_percent = psutil.cpu_percent(interval=0.1)               # system CPU % (0.1s sample)
    return {
        "process_ram_mb": round(ram_mb, 1),
        "system_ram_used_mb": round(system_ram_mb, 1),
        "system_ram_total_mb": round(psutil.virtual_memory().total / (1024 * 1024), 1),
        "cpu_percent": round(cpu_percent, 1),
        "note": "CPU-only server (no GPU on Render free tier)",
    }

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "backend": "groq"}

@app.post("/transcribe-and-assess")
async def transcribe_and_assess(audio: UploadFile = File(...)):
    tmp_path = None

    # ── Start timing + capture baseline metrics ────────────────────────────
    analysis_start = time.time()
    metrics_before = get_system_metrics()

    try:
        # Save audio to temp file
        suffix = Path(audio.filename).suffix if audio.filename else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name
        print(f"Audio saved: {tmp_path} ({os.path.getsize(tmp_path)} bytes)")

        client = get_groq()

        # 1. Transcribe with Groq Whisper
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
        print(f"Transcript: {transcript[:100]}...")
        print(f"Duration: {duration}s | Whisper took: {whisper_ms}ms")

        # 2. Local metrics
        pace    = estimate_pace(transcript, duration)
        fillers = count_fillers(transcript)
        print(f"Pace: {pace['wpm']} WPM, Fillers: {fillers}")

        # 3. Groq LLM analysis
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
        print(f"LLM response (first 200): {raw[:200]}")
        print(f"LLM took: {llm_ms}ms")

        # Strip markdown fences
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)

        # Extract JSON
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

        # ── Final timing + metrics ─────────────────────────────────────────
        total_ms = round((time.time() - analysis_start) * 1000)
        metrics_after = get_system_metrics()

        print(f"Total analysis time: {total_ms}ms")
        print("Analysis complete!")

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
            # ── New observability fields ───────────────────────────────────
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
        print(f"\n=== ERROR ===")
        traceback.print_exc()
        print(f"=============\n")
        raise HTTPException(500, str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)