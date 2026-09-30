#!/usr/bin/env python3
"""Sprite pipeline: AI sheets on magenta -> anchored frames -> one atlas per fighter.

  sprites.py bases            cut idle/dance sheets into frames + write pose bases
  sprites.py pose <c> <name> <image>   key one generated pose into a frame
  sprites.py poses            key every art-src/poses/<c>_<name>.png
  sprites.py stage            art-src/stage.png -> assets/stage.jpg
  sprites.py atlas            tile art-src/frames/<c>/*.png into assets/<c>.png + sprites.json

Every frame is a CELL_W x CELL_H RGBA image with the feet at (ANCHOR_X, ANCHOR_Y),
so the game never needs per-frame offsets.
Run with: uv run --with numpy --with opencv-python-headless --with pillow tools/sprites.py ...
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art-src"
FIGHTERS = ["jose", "rachel", "diego"]
CELL_W, CELL_H = 560, 360
ANCHOR_X, ANCHOR_Y = 280, 352
STAND_H = 264                       # standing height in game pixels
BASE_W, BASE_H, BASE_STAND = 1024, 704, 520   # canvas given to the image model
BASE_FEET = (452, 664)
# Atlas order; the game reads the same names from sprites.json.
ORDER = ["idle_0", "idle_1", "idle_2", "idle_3", "walk_0", "walk_1", "jump", "crouch",
         "punch", "kick", "special", "block", "hit", "ko",
         "dance_0", "dance_1", "dance_2", "dance_3", "dance_4", "dance_5"]


def fg_mask(rgb):
    """True where the sprite is. Magenta touching the border is background; enclosed
    magenta is background too when it is pure or large (a pin badge is neither)."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    bg = ((np.minimum(r, b) - g > 90) & (abs(r - b) < 90)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bg, connectivity=4)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    drop = np.zeros(n, bool)
    for i in range(1, n):
        drop[i] = i in edge or stats[i, cv2.CC_STAT_AREA] > 1500 or g[lab == i].mean() < 25
    fg = ~drop[lab]
    rows = fg.mean(1) > 0.85            # a drawn ground line spans the whole sheet
    rows[: int(len(rows) * 0.85)] = False
    fg[rows] = False
    fg[-15:] = False
    return fg


def keep_main(mask, side_frac=0.06):
    """Drop specks and bits of a neighbouring frame that leaked across the cut."""
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if n <= 1:
        return mask
    area = stats[:, cv2.CC_STAT_AREA].astype(float)
    area[0] = 0
    big = area.max()
    touching = set(np.unique(np.concatenate([lab[:, 0], lab[:, -1]])))
    keep = np.zeros(n, bool)
    for i in range(1, n):
        keep[i] = area[i] > big * side_frac or (area[i] > 30 and i not in touching)
    return keep[lab]


def despill(rgb, mask):
    """Pull the magenta tint out of the outline pixels only."""
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    edge = cv2.dilate((~mask).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    spill = (np.minimum(r, b) - g > 40) & edge
    out = rgb.copy()
    out[..., 0] = np.where(spill, np.minimum(r, g + 40), r)
    out[..., 2] = np.where(spill, np.minimum(b, g + 40), b)
    return out


def to_cell(rgba, scale, anchor_xy):
    """Scale an RGBA cut-out and paste it so anchor_xy lands on the cell anchor."""
    im = Image.fromarray(rgba)
    w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    im = im.resize((w, h), Image.LANCZOS)
    ox, oy = round(ANCHOR_X - anchor_xy[0] * scale), round(ANCHOR_Y - anchor_xy[1] * scale)
    tmp = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    tmp.paste(im, (ox, oy))
    a = np.array(tmp)
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)      # hard pixel edges
    a[a[..., 3] == 0] = 0
    return Image.fromarray(a)


def cut_sheet(path, n):
    rgb = np.array(Image.open(path).convert("RGB"))
    fg = fg_mask(rgb)
    cov, width, cuts = fg.sum(0), rgb.shape[1], [0]
    for k in range(1, n):
        c = k * width // n
        lo = c - 160
        cuts.append(lo + int(np.argmin(cov[lo:c + 160])))
    cuts.append(width)
    out = []
    for x0, x1 in zip(cuts, cuts[1:]):
        m = keep_main(fg[:, x0:x1])
        ys, xs = np.where(m)
        y0, y1, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        mm = m[y0:y1, xa:xb]
        px = despill(rgb[y0:y1, x0 + xa:x0 + xb], mm)
        feet = np.where(mm[int(mm.shape[0] * 0.8):])[1].mean()
        out.append((np.dstack([px, (mm * 255).astype(np.uint8)]), feet))
    return out


def bases():
    for c in FIGHTERS:
        out = SRC / "frames" / c
        out.mkdir(parents=True, exist_ok=True)
        for kind, n in (("idle", 4), ("dance", 6)):
            frames = cut_sheet(SRC / "sheets" / f"{c}_{kind}.png", n)
            heights = sorted(f.shape[0] for f, _ in frames)
            scale = STAND_H / heights[len(heights) // 4]    # one scale per sheet
            for i, (f, feet) in enumerate(frames):
                to_cell(f, scale, (feet, f.shape[0])).save(out / f"{kind}_{i}.png")
        # Canvas handed to the image model for new poses: idle frame 0 on magenta.
        cell = Image.open(out / "idle_0.png")
        s = BASE_STAND / STAND_H
        big = cell.resize((round(CELL_W * s), round(CELL_H * s)), Image.NEAREST)
        canvas = Image.new("RGB", (BASE_W, BASE_H), (255, 0, 255))
        canvas.paste(big, (round(BASE_FEET[0] - ANCHOR_X * s), round(BASE_FEET[1] - ANCHOR_Y * s)), big)
        (SRC / "poses").mkdir(exist_ok=True)
        canvas.save(SRC / "poses" / f"{c}_base.png")
        print(c, "bases done")


def pose(c, name, image):
    """The model keeps the character but drifts in position (and zooms the crouch), so
    every pose is re-anchored from its own outline instead of trusting canvas coordinates."""
    rgb = np.array(Image.open(image).convert("RGB").resize((BASE_W, BASE_H), Image.LANCZOS))
    m = keep_main(fg_mask(rgb), side_frac=0.02)
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    scale = STAND_H / BASE_STAND
    if name == "crouch":
        scale = 0.64 * STAND_H / (y1 - y0)
    elif name == "ko":
        scale = 1.05 * STAND_H / (x1 - x0)
    if name in ("ko", "jump"):
        ax = (x0 + x1) / 2
    else:                                   # feet: lowest rows of the outline
        band = m[y1 - max(4, int((y1 - y0) * 0.08)):y1]
        ax = np.where(band)[1].mean()
    rgba = np.dstack([despill(rgb, m), (m * 255).astype(np.uint8)])
    out = SRC / "frames" / c
    out.mkdir(parents=True, exist_ok=True)
    to_cell(rgba, scale, (ax, y1)).save(out / f"{name}.png")


def portrait_box(cell):
    """Square around the head of the idle frame, in cell coordinates."""
    a = np.array(cell)[..., 3] > 0
    ys, xs = np.where(a)
    top, h = ys.min(), ys.max() - ys.min()
    head = a[top:top + int(h * 0.27)]
    cx = np.where(head)[1].mean()
    size = int(h * 0.34)
    return [int(cx - size / 2 + size * 0.06), int(top - size * 0.08), size, size]


def atlas():
    cols = 5
    meta = {"cell": [CELL_W, CELL_H], "anchor": [ANCHOR_X, ANCHOR_Y], "cols": cols, "fighters": {}, "portraits": {}}
    (ROOT / "assets").mkdir(exist_ok=True)
    for c in FIGHTERS:
        names = [n for n in ORDER if (SRC / "frames" / c / f"{n}.png").exists()]
        rows = -(-len(names) // cols)
        sheet = Image.new("RGBA", (CELL_W * cols, CELL_H * rows), (0, 0, 0, 0))
        for i, n in enumerate(names):
            sheet.paste(Image.open(SRC / "frames" / c / f"{n}.png"), (i % cols * CELL_W, i // cols * CELL_H))
        # 256-colour palette: a third of the download, no visible change on pixel art.
        sheet.quantize(256, method=Image.FASTOCTREE, dither=Image.Dither.NONE).save(ROOT / "assets" / f"{c}.png", optimize=True)
        meta["fighters"][c] = names
        meta["portraits"][c] = portrait_box(Image.open(SRC / "frames" / c / "idle_0.png"))
        print(c, len(names), "frames; missing:", [n for n in ORDER if n not in names])
    (ROOT / "assets" / "sprites.json").write_text(json.dumps(meta, indent=1) + "\n")
    # Home-screen / tab icon: the three heads side by side.
    icon = Image.new("RGBA", (192, 192), (16, 16, 74, 255))
    for i, c in enumerate(FIGHTERS):
        x, y, w, h = meta["portraits"][c]
        head = Image.open(SRC / "frames" / c / "idle_0.png").crop((x, y, x + w, y + h)).resize((96, 96), Image.LANCZOS)
        icon.alpha_composite(head, [(0, 0), (96, 0), (48, 96)][i])
    icon.save(ROOT / "assets" / "icon.png", optimize=True)
    icon.resize((512, 512), Image.LANCZOS).save(ROOT / "assets" / "icon-512.png", optimize=True)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "bases":
        bases()
    elif cmd == "pose" and len(sys.argv) == 5:
        pose(*sys.argv[2:5])
    elif cmd == "poses":
        for c in FIGHTERS:
            for n in ORDER:
                src = SRC / "poses" / f"{c}_{n}.png"
                if src.exists():
                    pose(c, n, src)
    elif cmd == "stage":
        (ROOT / "assets").mkdir(exist_ok=True)
        Image.open(SRC / "stage.png").convert("RGB").resize((1180, 792), Image.LANCZOS).save(
            ROOT / "assets" / "stage.jpg", quality=88)
    elif cmd == "atlas":
        atlas()
    else:
        sys.exit(__doc__)
