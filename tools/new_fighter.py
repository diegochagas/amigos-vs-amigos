#!/usr/bin/env python3
"""Make a whole new fighter from one photo, using only local AI (ComfyUI FLUX.2 klein).

  COMFY_CLIENT_DIR=<folder holding comfy_client.py> python tools/new_fighter.py <id> <photo> \\
      --look "<what the person wears and looks like>" [--dance robot] [--seed 4] [--step base|frames|all]

  base    photo -> art-src/poses/<id>_base.png (the idle frame on magenta, in the house style);
          look at it, rerun with another --seed until it is right
  frames  the other 3 idle frames, the 10 combat poses and 6 dance frames, keyed into
          art-src/frames/<id>/ (then run sprites.py atlas)

Style and size come from art-src/poses/<template>_base.png (default diego): the model is
told to swap the character for the person in the photo and keep everything else.
"""
import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

client_dir = os.environ.get("COMFY_CLIENT_DIR", "")
if not client_dir or not (Path(client_dir) / "comfy_client.py").exists():
    sys.exit("new_fighter: set COMFY_CLIENT_DIR to the folder that holds comfy_client.py")
sys.path.insert(0, client_dir)
import cv2  # noqa: E402
import comfy_client  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_poses  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
POSES = ROOT / "art-src" / "poses"
STYLE = ("bold thick black outlines, smooth cel-shaded semi-realistic comic illustration with high detail, "
         "vivid colours, NOT low-resolution pixel art")
IDLE = {
    "idle_1": "the same fighting guard but bouncing: body a little lower, knees more bent, fists slightly raised.",
    "idle_2": "the same fighting guard but bouncing: body a little higher, weight on the toes, fists slightly lower.",
    "idle_3": "the same fighting guard with the weight shifted onto the back foot, front fist a bit further forward.",
}
# Six frames per style, each a stiff, readable pose; pick a style no other fighter uses.
DANCES = {
    "robot": [
        "robot dance: both arms bent at sharp 90-degree angles, upper arms out to the sides, forearms pointing straight up, head tilted stiffly, legs straight.",
        "robot dance: right arm stretched straight out to the side, left arm bent at a sharp right angle with the forearm up, head turned stiffly to one side.",
        "robot dance: both arms straight out to the sides at shoulder height like a letter T, stiff straight legs, head tilted.",
        "robot dance: left arm stretched straight up, right arm bent at a sharp right angle in front of the chest, stiff straight legs.",
        "robot dance: both forearms stacked flat in front of the chest at right angles, one knee lifted stiffly, head tilted the other way.",
        "robot dance: both arms bent at sharp angles with fists at the hips, elbows out, head turned, legs apart and rigid.",
    ],
    "disco": [
        "disco dance: right arm pointing diagonally up to the sky, left hand on the hip, legs apart.",
        "disco dance: right arm pointing diagonally down to the floor, left hand on the hip, hips swung to one side.",
        "disco dance: both arms pointing up diagonally, body leaning back, one foot crossed in front.",
        "disco dance: both hands clapping over the head, knees bent, hips swung to the other side.",
        "disco dance: left arm pointing diagonally up, right hand on the hip, legs apart.",
        "disco dance: a spin, arms out wide, one foot on its toes.",
    ],
    "floss": [
        "floss dance: both arms swung far to the right side with fists clenched, hips pushed far to the left.",
        "floss dance: both arms swung far to the left side with fists clenched, hips pushed far to the right.",
        "floss dance: both arms swung far to the right side with fists clenched, hips pushed far to the left, knees bent.",
        "floss dance: both arms swung far to the left side with fists clenched, hips pushed far to the right, knees bent.",
        "floss dance: both arms crossed in front of the chest, both knees bent, leaning forward.",
        "floss dance: both fists pumped in the air above the head, knees bent.",
    ],
}


def swap_in_photo(photo, look, seed, template):
    base = cv2.imread(str(POSES / f"{template}_base.png"))
    prompt = (f"Replace the character in the first image with the person from the reference photo, keeping the first image's "
              f"exact art style: {STYLE}. Same fighting guard pose, same size, same position, facing right. {look} "
              "Full body, flat solid magenta background, no text, no backpack unless described.")
    return comfy_client.edit(base, prompt, "klein", seed, refs=[cv2.imread(str(photo))])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("photo")
    ap.add_argument("--look", default="", help="clothes, hair, glasses, beard, expression")
    ap.add_argument("--dance", default="robot", choices=sorted(DANCES))
    ap.add_argument("--seed", type=int, default=4)
    ap.add_argument("--template", default="diego")
    ap.add_argument("--step", default="all", choices=["base", "frames", "all"])
    a = ap.parse_args()
    if not comfy_client.available("klein"):
        sys.exit(1)
    POSES.mkdir(parents=True, exist_ok=True)
    base_path = POSES / f"{a.id}_base.png"
    if a.step in ("base", "all"):
        cv2.imwrite(str(base_path), swap_in_photo(a.photo, a.look, a.seed, a.template))
        print(f"wrote {base_path} - check it before the frames", flush=True)
        if a.step == "base":
            return
    base = cv2.imread(str(base_path))
    todo = {**{k: v for k, v in IDLE.items()}, **gen_poses.PROMPTS,
            **{f"dance_{i}": p for i, p in enumerate(DANCES[a.dance])}}
    for name, text in todo.items():
        out = POSES / f"{a.id}_{name}.png"
        if out.exists():
            continue
        t = time.time()
        cv2.imwrite(str(out), comfy_client.edit(base, gen_poses.HEAD + text + gen_poses.TAIL, "klein", a.seed))
        print(f"{out.name} ({time.time() - t:.0f}s)", flush=True)
    py = [sys.executable, str(ROOT / "tools" / "sprites.py")]
    subprocess.run(py + ["pose", a.id, "idle_0", str(base_path)], check=True)
    for name in todo:
        subprocess.run(py + ["pose", a.id, name, str(POSES / f"{a.id}_{name}.png")], check=True)
    print("frames keyed; now: sprites.py atlas")


if __name__ == "__main__":
    main()
