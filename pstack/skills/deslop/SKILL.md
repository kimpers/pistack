---
name: deslop
description: Remove AI-generated code slop and clean up code style
---

Read [the Pi integration contract](../../../pi/references/integration.md) before executing this skill.

# Remove AI code slop

Check the caller-scoped diff against the verified base branch (do not assume main) and remove AI-generated slop introduced in the branch.

## Focus Areas

- Extra comments that are unnecessary or inconsistent with local style
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

## Guardrails

- Keep behavior unchanged; a discovered bug requires an explicitly scoped fix. Never remove required boundary/security checks.
- Prefer minimal, focused edits over broad rewrites.
- Keep the final summary concise (1-3 sentences).

Imported from cursor-team-kit at `93b00b89ef425a9c1bac0d0b317dfc49c930ac99`. MIT, Copyright (c) 2026 Cursor. See [LICENSE](LICENSE). Pi changes add authority/base selection and preserve security validation.
