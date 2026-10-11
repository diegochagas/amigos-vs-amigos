---
name: add-friend
description: Add a new playable friend to Amigos vs. Amigos from one photo and a name. Draws the arcade sprites (idle, 10 combat poses, a dance, the hyper-move cut-in portrait and its shout) with local AI only (ComfyUI FLUX.2 klein, no credits) and registers the fighter in the game. Use when Diego says "add a new player", "new friend/fighter", "adiciona o <nome> no jogo", or gives a photo plus a name for the fighting game.
---

# add-friend

Input: a photo of the friend and their name (+ optional: height relative to Diego, dance style, the word they shout).
Everything runs locally; nothing is sent to Higgsfield or any paid service. Takes ~13 min (25 klein calls of ~25 s).

## Setup (once per session)
- ComfyUI must run: `systemctl --user start comfyui` (127.0.0.1:8188, klein model installed).
- `COMFY_CLIENT_DIR` = the folder holding `comfy_client.py` (`~/Projects/comic-skills/restore-photos/scripts`).
- `art-src/` is gitignored and laptop-only; it must hold `poses/diego_base.png` (the style template).
- Python with cv2, numpy, pillow (system `python3` has them).
- Shouts: `uv tool install piper-tts`, ffmpeg, and the four Piper voices in `~/.local/share/piper-voices` (or `$PIPER_VOICES`): en_US-hfc_female-medium, en_US-hfc_male-medium, en_US-ryan-high, pt_BR-faber-medium (`.onnx` + `.onnx.json` from huggingface.co/rhasspy/piper-voices, paths `en/en_US/<name>/<quality>/` and `pt/pt_BR/...`).

## Steps
1. Pick an id (lowercase ascii, e.g. `erick`) and copy the photo to `art-src/<id>/photo.jpg`.
   Look at the photo and write `--look`: hair/bald, glasses, beard, clothes, expression, accessories. Say "no backpack" etc. if the template's accessories must not be copied.
2. Base frame (~30 s per try):
   `COMFY_CLIENT_DIR=... python3 tools/new_fighter.py <id> art-src/<id>/photo.jpg --look "..." --step base --seed 4`
   Read `art-src/poses/<id>_base.png`. It must be the person (face, clothes), the same bold-outline cel-shaded style as the others (NOT low-res pixel art), full body, facing right, no leftover template props. If wrong, rerun with another `--seed` (3, 4, 5 worked for Erick) or sharpen `--look`.
3. Frames + cut-in + shout: `python3 tools/new_fighter.py <id> art-src/<id>/photo.jpg --look "..." --step frames --dance <style> --seed 4 --shout "Toma!" --voice male`
   (draws the cut-in, step 5b, and makes the shout, step 5c, at the end). `--voice` is `female` for a woman (it must clearly sound female), `male`, `deep` or `pt`; `--pitch` below 1 deepens it. Pick a shout word no other fighter uses (José "Toma!", Rachel "Hyah!", Diego "Vai!", Erick "Haaah!").
   Dance styles live in `DANCES` in `tools/new_fighter.py` (robot, disco, floss). **Pick one no fighter uses yet** (Jose/Rachel/Diego use shuffle/point/flex, Erick robot); add a new style of 6 prompts there if all are taken.
   Existing files are kept, so to redo one frame delete `art-src/poses/<id>_<name>.png`, rerun with a different `--seed`.
4. Register in `js/config.js`: add the id to `ROSTER` and an entry in `FIGHTERS` (`name`, a unique `color` + light `glow`, `height` relative to Diego = 1; ask Diego if unknown). `sprites.py` reads the roster from there.
5. Skin tone (only if the friend's skin is darker than the template's light skin and the model drew it pale): recolour the existing frames instead of regenerating: `python3 tools/skin_tone.py <id> 0.74 --sat 1.4 --hue 12` (factor < 1 darkens, --hue sets a warm brown; these values = Erick's medium brown (0.55 + sat 1.75 and 0.67 + sat 1.5 were too dark); without --hue a plain darken just looks like a shadow, 0.78 + sat 1.3 was too light for him; starts from `art-src/frames_orig/<id>`, so rerun freely). It must run AFTER every frame is keyed, and re-keying a frame (`sprites.py pose`) needs `rm -r art-src/frames_orig/<id>` first.
5b. Cut-in check: `assets/cutin/<id>.png` is the MvC-style close-up shown for 2 s when the hyper (A+B at MAX) fires (chest up, shouting, fist at the camera, same style, keyed from magenta). Look at it next to `art-src/cutin/<id>.png`. If it is the wrong person, a full body, or pixel art, redo only it: `python3 tools/cutin.py <id> --seed <n> --look "..."`. It is drawn from the keyed `special` pose, so redo it after any change to that pose. Skin tone is NOT applied to it: put the skin colour in `--look` instead.
5c. Shout check: `assets/voice/<id>.mp3` (under 15 KB, 0.3–0.7 s). Redo it alone with `python3 tools/voice.py <id> --text "..." --voice ... --pitch ...`, then add the entry to `SHOUTS` in `tools/voice.py` so `--all` regenerates it.
6. Atlas + portrait + icon + asset version: `python3 tools/sprites.py atlas` (the version hash covers the cut-ins, so run it after every cut-in change).
7. Contact-sheet check: paste the 20 `art-src/frames/<id>/*.png` onto a dark tile and look at it (stray magenta, cut-off limbs, wrong face). Regenerate bad frames (step 3 note) and re-run `sprites.py pose <id> <name> <png>` + `atlas`.
8. Update the tests for the new roster size: the ladder e2e (`e2e/desktop-ladder.spec.js`, stage count and shadow stage index), the phone select tap offset (`e2e/phone.spec.js`), README "starring N friends". `scripts/check`, `npx playwright test`, then look at the select, title, vs and ending screenshots in `e2e/screenshots/`.
9. Tell Diego what changed; do not push (Pages deploys on push).

## Gotchas
- `sprites.py pose` shifts every idle/dance frame sideways onto idle_0's torso: the model drifts between frames and without this the fighter jumps left/right on the title screen.
- Keep the prompt "bold thick black outlines, smooth cel-shaded ... NOT low-resolution pixel art" (in `STYLE`); without it klein returns chunky pixel art that clashes with the others.
- Pure-magenta backdrop; `sprites.py` keys it out (and enclosed pockets of it, e.g. behind an elbow).
- Heights are visual only (`FIGHTERS[id].height`); hit boxes are shared.
- The cut-in is a woman trap: klein copied the template's beard onto Rachel until the `--look` said "young WOMAN, smooth feminine face, absolutely no beard, no goatee, no facial hair". Say it for every woman.
- The cut-in is drawn by `js/render.js drawCutin` from the `super` match event; nothing per-fighter to add in JS.
- Never put the real photo in git: `art-src/` stays ignored, only the atlas PNG is committed.
