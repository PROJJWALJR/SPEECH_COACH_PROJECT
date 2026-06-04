"""
Speech Assessment API
Whisper (local, HuggingFace) + Ollama (local LLM) — no API keys needed
"""

import os
import re
import json
import tempfile
import traceback
from pathlib import Path

import requests
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Point Python directly to ffmpeg
os.environ["PATH"] = "C:\\ffmpeg;" + os.environ.get("PATH", "")

# ── Whisper (lazy-loaded) ─────────────────────────────────────────────────────
_whisper_pipe = None

def get_whisper():
    global _whisper_pipe
    if _whisper_pipe is None:
        from transformers import pipeline
        print("Loading Whisper model...")
        _whisper_pipe = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-small",
            return_timestamps=True,
            device=-1,
        )
        print("Whisper ready.")
    return _whisper_pipe

# ── Ollama helper ─────────────────────────────────────────────────────────────
OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.2"

def ask_ollama(prompt: str) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2},
    }
    try:
        r = requests.post(OLLAMA_URL, json=payload, timeout=180)
        r.raise_for_status()
        return r.json()["response"].strip()
    except requests.exceptions.ConnectionError:
        raise HTTPException(500, "Cannot reach Ollama. Run: ollama serve")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Speech Coach — Local AI")

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
    return f"""Speech coach. Analyse transcript. Return ONLY raw JSON, no markdown.

Transcript: {transcript}
Pace: {pace["wpm"]} WPM ({pace["label"]}). Fillers: {filler_summary}

JSON:
{{"overall_score":0,"grammar":{{"score":0,"issues":[],"tip":""}},"pronunciation":{{"score":0,"notes":"","tip":""}},"accent":{{"detected":"","clarity":0,"notes":""}},"confidence":{{"score":0,"signals":[],"tip":""}},"voice_archetype":{{"type":"","description":"","strengths":[],"growth_areas":[]}},"vocabulary":{{"score":0,"level":"","notable_words":[]}},"structure":{{"score":0,"has_clear_opening":false,"has_clear_closing":false,"tip":""}},"top_strengths":[],"top_improvements":[],"summary":""}}

Fill in all values based on the transcript. Return only the filled JSON."""

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "llm": OLLAMA_MODEL}

@app.post("/transcribe-and-assess")
async def transcribe_and_assess(audio: UploadFile = File(...)):
    tmp_path = None
    try:
        # Save audio to temp file
        suffix = Path(audio.filename).suffix if audio.filename else ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name
        print(f"Audio saved to: {tmp_path} ({os.path.getsize(tmp_path)} bytes)")

        # 1. Transcribe with Whisper
        print("Transcribing...")
        whisper = get_whisper()
        result  = whisper(tmp_path)
        transcript = result["text"].strip()
        print(f"Transcript: {transcript[:100]}")

        # Estimate duration
        chunks   = result.get("chunks", [])
        duration = None
        if chunks:
            last_ts  = chunks[-1].get("timestamp", [None, None])
            duration = last_ts[1] if last_ts and last_ts[1] else None
        if not duration:
            duration = max(os.path.getsize(tmp_path) / 32000, 1)
        print(f"Duration: {duration}s")

        # 2. Local metrics
        pace    = estimate_pace(transcript, duration)
        fillers = count_fillers(transcript)
        print(f"Pace: {pace}, Fillers: {fillers}")

        # 3. Ollama analysis
        print("Sending to Ollama...")
        raw = ask_ollama(build_prompt(transcript, pace, fillers))
        print(f"Ollama raw response (first 200 chars): {raw[:200]}")

        # Strip markdown fences
        raw = re.sub(r"^```[a-z]*\n?", "", raw.strip())
        raw = re.sub(r"\n?```$", "", raw)

        # Extract JSON — use json_repair to handle minor LLM formatting issues
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not match:
            raise HTTPException(500, f"LLM did not return JSON. Got: {raw[:300]}")
        json_str = match.group()
        try:
            analysis = json.loads(json_str)
        except json.JSONDecodeError:
            # Try to fix common LLM JSON issues: trailing commas, missing commas
            json_str = re.sub(r',\s*}', '}', json_str)
            json_str = re.sub(r',\s*]', ']', json_str)
            try:
                analysis = json.loads(json_str)
            except json.JSONDecodeError:
                # Last resort: install and use json_repair
                try:
                    from json_repair import repair_json
                    analysis = json.loads(repair_json(json_str))
                except Exception:
                    raise HTTPException(500, f"Could not parse LLM response. Raw: {json_str[:300]}")
        print("Analysis complete!")

        return JSONResponse({
            "transcript": transcript,
            "duration_seconds": round(duration, 1),
            "pace": pace,
            "filler_words": {
                "counts": fillers,
                "total":  sum(fillers.values()),
                "score":  max(0, 100 - sum(fillers.values()) * 5),
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
