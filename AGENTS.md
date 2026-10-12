# Amigos vs. Amigos

Vanilla no-build browser fighting game (ES modules, canvas). Keep it dependency-free:
Playwright and serve are dev-only. Fight rules live in `js/match.js` and must stay pure
and deterministic (no DOM, no `Math.random`); all visible text goes through `js/i18n.js`
in both English and Portuguese. Sprites are rebuilt with `tools/sprites.py` (see README).

## Testing and shipping (dev-playbook)

This repo follows the dev-playbook (`~/.claude/skills/dev-playbook/PLAYBOOK.md`).

- One gate: `scripts/check` (lint + types + unit + build). The pre-push hook runs it
  (`git config core.hooksPath .githooks`). Never push with `--no-verify`.
- Bugs: write a failing regression test first, then fix.
- Never weaken, skip or delete a test to make it pass.
- UI changes: run the Playwright e2e and attach desktop (1280) + mobile (375)
  screenshots of every changed screen to the PR or final message.
- Risk class for this repo: none.
  Changes in that area need scenario tests and a second safeguard (see PLAYBOOK.md §3).
- DB migrations: expand-contract only, and back up the DB before migrating.
- External APIs: always mocked in tests; `--dry-run` must make zero write calls.
- No real paths, IPs, passwords or tokens in code, tests, fixtures or docs.
- Before finishing: run `/code-review` on the diff, then give the evidence package:
  summary, risk class, test results, screenshots, rollback steps.

## Clean code (dev-playbook CLEAN-CODE.md)

Language: vanilla JS ES modules (no build, no runtime deps); `tools/*.py` are Python 3.
Formatter: prettier for `js/` and ruff format for `tools/`, both dev-only; don't discuss style.

- Functions 4–20 lines; `render.js` draws one layer/scene per function. Files ≤300 lines, hard max 500.
  `scripts/clean-code-audit` (in `scripts/check`) reports violations.
- One responsibility per module: `js/match.js` rules (pure, deterministic), `js/ai.js`, `js/input.js`,
  `js/render.js`, `js/audio.js`, `js/i18n.js`, `js/rng.js`, `js/config.js`, `js/main.js` wiring only. Tests in `tests/`, `e2e/`.
- Names specific and searchable (<5 grep hits). Banned: `data`, `handler`, `utils`, `Manager`, `Service`.
- Types explicit: JSDoc `@param`/`@returns` (with `@typedef` for fighter/match state) on every exported function;
  type hints on every `def` in `tools/sprites.py`.
- Early returns, max 2 nested levels. Extract duplicated logic the second time it appears.
- Errors include the offending value and the expected shape (`unknown move "kick2": expected one of …`).
- Comments: keep the ones you find. Write WHY, cite issue numbers / SHAs. Never `// increment i`.
- Dependencies injected: `match.js` receives the RNG and config as parameters, never imports the DOM or `Math.random`;
  `main.js` is the only place that wires modules together.
- Logging: none in the game; `tools/sprites.py` prints plain text.
- Defensive code this repo needs: none beyond validating config/i18n tables at load. Flag anything else instead of adding it silently.
- README keeps the "Code" section as the architecture map (modules + data flow); update it when the shape changes.
- `scripts/check` is the single validation command (`npm run check`).
