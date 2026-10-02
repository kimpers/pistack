# piStack

Pi-native [pstack](https://github.com/cursor/plugins/tree/c47b12849e43f18d5c374c7069c744cc55b0ea00/pstack/) engineering workflows for deliberate planning, implementation, review, and verification.

piStack brings pstack's skills and playbooks into Pi, with opt-in session guidance, persistent checklists, and packaged agents. It uses Pi's existing subagent, goal, and terminal extensions instead of adding another executor. Mode never starts workers or goals on its own.

## Install

Use an existing Pi installation. Source and fixture checks use Pi 0.85.1 on macOS; the 0.15.5 refresh still needs parent installation smoke checks. Review package code before loading it.

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

Use `/pistack off` to stop future guidance. Use `/skill:poteto-mode` for one task without enabling persistent mode. New sessions start with mode off.

See [Pi usage and setup details](pi/README.md) and [verification limits and upstream changes](pi/UPSTREAM.md). Personal local setup and installed helper checks are not clean-host, Linux, or live workflow qualification.

## Upstream and licenses

Adapted from Lauren Tan's pstack 0.15.5 under the [MIT license](pstack/LICENSE). The attributed deslop skill retains [Cursor's MIT license](pstack/skills/deslop/LICENSE).

The [original plugin catalog](https://github.com/cursor/plugins/tree/c47b12849e43f18d5c374c7069c744cc55b0ea00/) and Git ancestry remain available. Other catalog plugins are not bundled in piStack.
