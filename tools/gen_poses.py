#!/usr/bin/env python3
"""Generate the extra fighter poses with a local ComfyUI image-edit model (FLUX.2 klein).

  COMFY_CLIENT_DIR=<folder holding comfy_client.py> python tools/gen_poses.py [fighter] [pose] [seed]

Reads art-src/poses/<fighter>_base.png (written by `sprites.py bases`) and writes
art-src/poses/<fighter>_<pose>.png. Existing files are kept unless a pose is named.
Needs the interpreter that has comfy_client's deps (cv2, numpy).
"""
import os
import sys
import time
from pathlib import Path

client_dir = os.environ.get("COMFY_CLIENT_DIR", "")
if not client_dir or not (Path(client_dir) / "comfy_client.py").exists():
    sys.exit("gen_poses: set COMFY_CLIENT_DIR to the folder that holds comfy_client.py")
sys.path.insert(0, client_dir)
import cv2  # noqa: E402
import comfy_client  # noqa: E402

POSES = Path(__file__).resolve().parent.parent / "art-src" / "poses"
HEAD = ("Redraw this exact same character, same pixel-art fighting game sprite style, same face, "
        "same clothes, bags, glasses, hair and colors, same size, facing right, in a new pose: ")
TAIL = (" Full body visible. Keep the flat solid magenta background. "
        "No text, no effects, no shadow, no ground line.")
PROMPTS = {
    "walk_0": "walking forward in a fighting guard, mid-stride with the back foot stepping forward and lifted off the ground, fists up.",
    "walk_1": "walking forward in a fighting guard, legs close together passing each other, standing taller, fists up.",
    "jump": "jumping in the air, both knees tucked up high, feet off the ground, fists up, body compact.",
    "crouch": "crouching very low, squatting with knees deeply bent, fists guarding the face, head much lower than before.",
    "punch": "throwing a straight right punch, arm fully extended forward to the right at shoulder height, other fist guarding the chin, front knee bent, leaning into the punch. Feet on the same ground position.",
    "kick": "high side kick, one leg fully extended horizontally to the right at chest height, standing on the other leg, torso leaning back, fists up.",
    "special": "both open palms thrust forward together to the right at chest height as if pushing an invisible energy blast, legs braced wide, shouting.",
    "block": "defensive blocking pose, both forearms raised together covering the face, leaning slightly back, knees bent.",
    "hit": "recoiling from a punch to the face: head snapped back, torso bent backward, arms flung loose, pained grimace, stumbling backward.",
    "ko": "knocked out, lying flat on the back on the ground, body horizontal, head on the left and feet on the right, arms limp, eyes closed.",
}

if __name__ == "__main__":
    who = [sys.argv[1]] if len(sys.argv) > 1 else sorted(p.name[:-9] for p in POSES.glob("*_base.png"))
    which = [sys.argv[2]] if len(sys.argv) > 2 else list(PROMPTS)
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    if not comfy_client.available("klein"):
        sys.exit(1)
    for c in who:
        base = cv2.imread(str(POSES / f"{c}_base.png"))
        for p in which:
            out = POSES / f"{c}_{p}.png"
            if out.exists() and len(sys.argv) <= 2:
                continue
            t = time.time()
            cv2.imwrite(str(out), comfy_client.edit(base, HEAD + PROMPTS[p] + TAIL, "klein", seed))
            print(f"{out.name} ({time.time() - t:.0f}s)", flush=True)
