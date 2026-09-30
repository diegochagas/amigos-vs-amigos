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
