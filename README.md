# piStack

Pi-native [pstack](https://github.com/cursor/plugins/tree/2f8377461fd533f5af782e1fd643783b1067b847/pstack/) engineering workflows for deliberate planning, implementation, review, and verification.

piStack brings pstack's skills and playbooks into Pi, with opt-in session guidance, persistent checklists, and packaged agents. It uses Pi's existing subagent, goal, and terminal extensions instead of adding another executor. Mode never starts workers or goals on its own.

## Install

Use an existing Pi installation and review package code before loading it. The 0.15.25 refresh adds Sharpen and an optional new-session mode default. Qualification is bounded to local checks; see the remaining limits below.

Install from Git:

```sh
pi install git:git@github.com:kimpers/piStack.git
```

Or install a trusted local checkout:

```sh
pi install /absolute/path/to/pistack
```

No npm package is published.

## Use

In Pi, reload to discover the package, then review the setup proposal:

```text
/reload
/pistack setup
/reload
/pistack doctor
/pistack on
```

Setup asks approval before installing missing extensions or the retained Bun helpers. Existing compatible extensions are reused. Doctor reports missing prerequisites and unverified capabilities.

Use `/skill:poteto-help` for the command map. Plain `/pistack on` and `/pistack off` change only the current session branch. Use `/pistack on --persist` or `/pistack off --persist` to also save the user-wide default for new sessions, initially off. Saved session choices take precedence. `/pistack status` shows both settings. Off stops future guidance, not shared goals or workers. Use `/skill:poteto-mode` for one task without enabling mode.

Pi buffers session choices before the first conversation. They survive in-process reload, but not a restart until Pi writes the conversation. The separate new-session default is saved immediately. See the [mode storage and failure behavior](pi/README.md#mode-storage-and-failures).

See [Pi usage and setup details](pi/README.md) and [verification limits and upstream changes](pi/UPSTREAM.md). Personal local setup and installed helper checks are not clean-host, Linux, or live workflow qualification.

## Upstream and licenses

Adapted from Lauren Tan's pstack under the [MIT license](pstack/LICENSE). The attributed deslop skill retains [Cursor's MIT license](pstack/skills/deslop/LICENSE).

The [original plugin catalog](https://github.com/cursor/plugins/tree/2f8377461fd533f5af782e1fd643783b1067b847/) and Git ancestry remain available. Other catalog plugins are not bundled in piStack.
