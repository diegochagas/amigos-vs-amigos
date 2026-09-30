# Amigos vs. Amigos

A small arcade fighting game in the style of late-90s "vs." fighters, starring three
friends. Plain HTML/CSS/JS: no build step, no runtime dependencies.

## Play

Open the hosted page on a phone (landscape works best) or a computer. To run it
locally, serve the folder with any static server:

```bash
npx serve -l 4173 .
```

You pick a fighter and beat the other two, then your own shadow. Rounds are best of three.

| Action | Touch | Keyboard |
|---|---|---|
| Walk / jump / crouch | D-pad | Arrows or WASD |
| Block | Hold the D-pad away from the opponent | Same |
| Punch | A | Z or J |
| Kick | B | X or K |
| Special (energy ball) | A + B (a thumb between the two presses both) | Z + X |
| Hyper (beam) | A + B when the meter says MAX | Z + X |
| Pause / menu | ☰ | Enter, Esc or P |

Crouching ducks under energy balls. The menu has sound, full screen and EN/PT.

URL options: `?lang=en|pt`, `?seed=<number>` (repeatable CPU behaviour), `?touch=1`
(show the on-screen controls on a computer).

## Code

- `js/match.js`, `js/ai.js`, `js/rng.js`, `js/config.js`: the fight itself. Pure and
  deterministic, advanced one 60 Hz frame at a time, tested with `node --test`.
- `js/render.js`, `js/main.js`, `js/input.js`, `js/audio.js`, `js/i18n.js`: canvas
  drawing, scenes, keyboard and touch input, synthesized sound, EN/PT strings.
- `assets/`: one sprite atlas per fighter, `sprites.json` (frame names, portraits) and the stage.

## Art pipeline

The fighters were drawn by image models on a flat magenta background and cut into
frames by `tools/sprites.py`. The raw sheets live in `art-src/`, which is not committed.

```bash
uv run --with numpy --with opencv-python-headless --with pillow tools/sprites.py bases   # idle + dance sheets -> frames
COMFY_CLIENT_DIR=<folder with comfy_client.py> python tools/gen_poses.py                  # new poses with a local ComfyUI
uv run --with numpy --with opencv-python-headless --with pillow tools/sprites.py poses
uv run --with numpy --with opencv-python-headless --with pillow tools/sprites.py stage
uv run --with numpy --with opencv-python-headless --with pillow tools/sprites.py atlas
```

## Tests

```bash
scripts/check            # logic, i18n, touch geometry and asset tests (node --test)
npm install && npx playwright install chromium
npx playwright test      # desktop + phone smoke, screenshots in e2e/screenshots
```

`git config core.hooksPath .githooks` enables the pre-push gate.
