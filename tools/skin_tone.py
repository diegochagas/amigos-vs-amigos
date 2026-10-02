#!/usr/bin/env python3
"""Darken (or lighten) the skin of a fighter's existing frames instead of regenerating them.

  python tools/skin_tone.py <id> <factor> [--sat 1.15] [--hue 11]     factor < 1 darkens (0.6 = medium brown)

Skin is found by colour (warm hue, some saturation), so grey beards, clothes and the black
outline stay as they are. Always starts from the untouched frames kept in art-src/frames_orig/<id>,
so rerunning with another factor never stacks. Run sprites.py atlas afterwards.
"""
import argparse
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "art-src"


def tone(rgba, factor, sat, hue=None):
    rgb, alpha = rgba[..., :3], rgba[..., 3]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    skin = ((alpha > 0) & (h <= 28) & (s >= 22) & (v >= 70)).astype(np.float32)
    w = np.clip(cv2.GaussianBlur(skin, (0, 0), 0.8), 0, 1) * (alpha > 0)
    hsv2 = hsv.copy()
    if hue is not None:
        hsv2[..., 0] = hue                # a warm brown hue, not the peach of the model's pale skin
    hsv2[..., 2] = np.clip(v * factor, 0, 255)
    hsv2[..., 1] = np.clip(s * sat + 12 * (1 - factor), 0, 255)
    out = cv2.cvtColor(hsv2.astype(np.uint8), cv2.COLOR_HSV2RGB).astype(np.float32)
    mixed = rgb * (1 - w[..., None]) + out * w[..., None]
    return np.dstack([np.clip(mixed, 0, 255).astype(np.uint8), alpha])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("factor", type=float)
    ap.add_argument("--sat", type=float, default=1.15)
    ap.add_argument("--hue", type=float, default=None, help="OpenCV hue 0-179 (11 = warm brown)")
    a = ap.parse_args()
    cur, orig = SRC / "frames" / a.id, SRC / "frames_orig" / a.id
    if not orig.exists():
        shutil.copytree(cur, orig)
    files = sorted(orig.glob("*.png"))
    if not files:
        sys.exit(f"no frames for {a.id}")
    for f in files:
        Image.fromarray(tone(np.array(Image.open(f).convert("RGBA")), a.factor, a.sat, a.hue)).save(cur / f.name)
    print(f"{len(files)} frames toned (factor {a.factor}); now: sprites.py atlas")


if __name__ == "__main__":
    main()
