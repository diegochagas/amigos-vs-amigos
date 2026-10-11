#!/usr/bin/env python3
"""Draw the Marvel-vs-Capcom style cut-in portrait shown when a fighter fires a hyper (A+B at MAX).

  COMFY_CLIENT_DIR=<folder holding comfy_client.py> python tools/cutin.py <id> [--seed 4] [--look "..."]
  python tools/cutin.py <id> --key                     only re-key an existing art-src/cutin/<id>.png

Base image: the fighter's own `special` pose (art-src/poses/<id>_special.png, on magenta), so
the model keeps the character, style and clothes; the photo in art-src/<id>/photo.jpg is the
identity reference. Writes art-src/cutin/<id>.png (raw, magenta) and assets/cutin/<id>.png
(keyed, trimmed, 256 colours). Run sprites.py atlas afterwards so sprites.json's version changes.
"""
import argparse
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sprites  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art-src" / "cutin"
OUT = ROOT / "assets" / "cutin"
SIZE = 896                      # square canvas handed to the model
MAX_OUT = 640                   # longest side of the keyed PNG shipped with the game

PROMPT = ("Redraw this exact same character as a dramatic close-up for a fighting game super move cut-in: "
          "chest up, filling the whole frame, body turned three-quarters toward the viewer, "
          "shouting with the mouth wide open, one fist punched straight at the camera in strong foreshortening, "
          "intense eyes. Same face, hair, glasses, beard, clothes and colours as the character. "
          "Same bold thick black outlines, smooth cel-shaded semi-realistic comic illustration with high detail, "
          "vivid colours, NOT low-resolution pixel art. {look} "
          "Flat solid magenta background, nothing else behind the character, no text, no effects.")


def base_canvas(fid):
    """The special pose, cropped to its upper two thirds and enlarged onto a square magenta canvas."""
    src = np.array(Image.open(ROOT / "art-src" / "poses" / f"{fid}_special.png").convert("RGB"))
    m = sprites.keep_main(sprites.fg_mask(src), side_frac=0.02)
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    h = y1 - y0
    crop = src[y0:y0 + int(h * 0.62), max(0, x0 - 40):x1 + 40]
    im = Image.fromarray(crop)
    s = SIZE * 0.92 / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), (255, 0, 255))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
    return cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)


def key(fid):
    rgb = np.array(Image.open(RAW / f"{fid}.png").convert("RGB"))
    m = sprites.keep_main(sprites.fg_mask(rgb), side_frac=0.02)
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([sprites.despill(rgb, m), (m * 255).astype(np.uint8)])[y0:y1, x0:x1]
    im = Image.fromarray(rgba)
    s = min(1, MAX_OUT / max(im.size))
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    a = np.array(im)
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    a[a[..., 3] == 0] = 0
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a).quantize(256, method=Image.FASTOCTREE, dither=Image.Dither.NONE).save(OUT / f"{fid}.png", optimize=True)
    print(f"wrote {OUT / f'{fid}.png'} {im.size}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("--seed", type=int, default=4)
    ap.add_argument("--look", default="", help="extra identity hints (e.g. 'long straight brown hair')")
    ap.add_argument("--key", action="store_true", help="skip the model, only key the existing raw image")
    a = ap.parse_args()
    if not a.key:
        client_dir = os.environ.get("COMFY_CLIENT_DIR", "")
        if not client_dir or not (Path(client_dir) / "comfy_client.py").exists():
            sys.exit("cutin: set COMFY_CLIENT_DIR to the folder that holds comfy_client.py")
        sys.path.insert(0, client_dir)
        import comfy_client
        if not comfy_client.available("klein"):
            sys.exit(1)
        photo = cv2.imread(str(ROOT / "art-src" / a.id / "photo.jpg"))
        refs = [photo] if photo is not None else []
        RAW.mkdir(parents=True, exist_ok=True)
        out = comfy_client.edit(base_canvas(a.id), PROMPT.format(look=a.look), "klein", a.seed, refs=refs)
        cv2.imwrite(str(RAW / f"{a.id}.png"), out)
    key(a.id)


if __name__ == "__main__":
    main()
