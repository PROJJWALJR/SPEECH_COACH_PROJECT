"""
Speech Assessment API
Groq Cloud (Whisper + Llama 3) — fully cloud hosted, no local models needed
"""

import os
import re
import json
import tempfile
import traceback
from pathlib import Path

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

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "backend": "groq"}

@app.post("/transcribe-and-assess")
async def transcribe_and_assess(audio: UploadFile = File(...)):
    tmp_path = None
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
        with open(tmp_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                file=(Path(tmp_path).name, f.read()),
                model="whisper-large-v3",
                response_format="verbose_json",
            )
        transcript = transcription.text.strip()
        duration = getattr(transcription, "duration", None) or max(os.path.getsize(tmp_path) / 32000, 1)
        print(f"Transcript: {transcript[:100]}...")
        print(f"Duration: {duration}s")

        # 2. Local metrics
        pace    = estimate_pace(transcript, duration)
        fillers = count_fillers(transcript)
        print(f"Pace: {pace['wpm']} WPM, Fillers: {fillers}")

        # 3. Groq LLM analysis
        print("Analysing with Groq LLM...")
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": build_prompt(transcript, pace, fillers)}],
            temperature=0.2,
            max_tokens=2048,
        )
        raw = response.choices[0].message.content.strip()
        print(f"LLM response (first 200): {raw[:200]}")

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
