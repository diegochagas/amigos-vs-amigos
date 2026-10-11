#!/usr/bin/env python3
"""Make the shout a fighter yells when their hyper cut-in appears, with a local TTS (Piper).

  python tools/voice.py <id> [--text "Toma!"] [--voice male|female|deep|pt] [--pitch 1.0]
  python tools/voice.py --all

Piper voices (onnx + json) are read from $PIPER_VOICES (default ~/.local/share/piper-voices):
  female  en_US-hfc_female-medium     male  en_US-hfc_male-medium
  deep    en_US-ryan-high             pt    pt_BR-faber-medium
Pipeline: piper -> ffmpeg (trim, pitch, compressor, slap-back echo, soft clip) -> assets/voice/<id>.mp3
(mono 32 kb/s, under 15 KB). Needs `uv tool install piper-tts` and ffmpeg on PATH.
"""
import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "voice"
VOICE_DIR = Path(os.environ.get("PIPER_VOICES", "~/.local/share/piper-voices")).expanduser()
MODELS = {"female": "en_US-hfc_female-medium", "male": "en_US-hfc_male-medium",
          "deep": "en_US-ryan-high", "pt": "pt_BR-faber-medium"}
# Defaults for the roster; a new fighter passes --text/--voice/--pitch instead (or gets added here).
SHOUTS = {
    "jose": dict(text="Toma!", voice="male", pitch=0.95),
    "rachel": dict(text="Hyah!", voice="female", pitch=1.08),   # female voice, must sound clearly female
    "diego": dict(text="Vai!", voice="pt", pitch=1.0),
    "erick": dict(text="Haaah!", voice="deep", pitch=0.86),
}


def make(fid, text, voice, pitch):
    model = VOICE_DIR / f"{MODELS[voice]}.onnx"
    if not model.exists():
        sys.exit(f"voice: missing Piper model {model} (download it from rhasspy/piper-voices on Hugging Face)")
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "raw.wav"
        subprocess.run(["piper", "-m", str(model), "-f", str(wav), "--length-scale", "0.75", "--sentence-silence", "0"],
                       input=text.encode(), check=True, capture_output=True)
        rate = 22050
        # asetrate shifts pitch (and speed) at once, like a sampler playing the clip faster/slower.
        af = (f"silenceremove=start_periods=1:start_threshold=-40dB,"
              f"asetrate={int(rate * pitch)},aresample={rate},"
              "acompressor=threshold=-18dB:ratio=6:attack=3:release=80:makeup=6,"
              "aecho=0.8:0.5:45:0.25,"
              "highpass=f=120,treble=g=4,"
              "alimiter=limit=0.9:level=false,"
              "silenceremove=stop_periods=1:stop_threshold=-45dB:stop_duration=0.15,"
              "afade=t=out:st=0.55:d=0.2,atrim=0:0.75,loudnorm=I=-12:TP=-1")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", af,
                        "-ac", "1", "-ar", "22050", "-b:a", "32k", str(OUT / f"{fid}.mp3")], check=True)
    print(f"wrote {OUT / f'{fid}.mp3'} ({(OUT / f'{fid}.mp3').stat().st_size} B)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id", nargs="?")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--text")
    ap.add_argument("--voice", choices=sorted(MODELS))
    ap.add_argument("--pitch", type=float)
    a = ap.parse_args()
    ids = sorted(SHOUTS) if a.all else [a.id]
    if not ids[0]:
        sys.exit(__doc__)
    for fid in ids:
        d = dict(SHOUTS.get(fid, {}))
        for k in ("text", "voice", "pitch"):
            if getattr(a, k) is not None:
                d[k] = getattr(a, k)
        if not {"text", "voice"} <= set(d):
            sys.exit(f"voice: {fid} is not in SHOUTS; pass --text and --voice (female for a woman)")
        make(fid, d["text"], d["voice"], d.get("pitch", 1.0))


if __name__ == "__main__":
    main()
