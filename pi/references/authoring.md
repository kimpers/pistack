# Author a Pi skill

Work only in an approved destination: project `.pi/skills/<name>/SKILL.md`, an approved personal Pi skills directory, or the development fork. Never edit package caches. Preserve existing approved local categorization. A name collision is not an override guarantee; inspect loader diagnostics and resource filters with the user rather than silently disabling another resource.

Use YAML `name` (lowercase letters, digits and hyphens, at most 64 characters) and a nonempty `description` naming the task and when to use it. Quote punctuation-heavy descriptions or use an indented block scalar. Relative links resolve from the skill directory. Keep helper invocations explicit and any new dependencies behind approval. Do not claim `paths`, `mode`, `reminder`, or `alwaysApply` metadata implements Pi triggers or persistence.

Use `disable-model-invocation: true` for explicit-only personal modes and hidden leaves. Invoke through `/skill:<name>` or read the exact file from a router. Visible descriptions support model discovery, not guaranteed automatic activation. Only `/pistack on` implements this package's persistent mode; a newly authored personal mode does not inherit that lifecycle.

Read the relevant existing skill, draft the smallest operational change, apply unslop, validate frontmatter and every link, reload at an explicit boundary and check the actual resource selected. Test structural workflows with task examples, authorization-denied cases, missing tools and proof artifacts. For subjective personal style, show a draft and iterate with the user rather than inventing a benchmark score. A failed/missing live test leaves a draft, not a proven workflow. Route authorized publication through Opening a PR; do not publish merely because authoring ended.
