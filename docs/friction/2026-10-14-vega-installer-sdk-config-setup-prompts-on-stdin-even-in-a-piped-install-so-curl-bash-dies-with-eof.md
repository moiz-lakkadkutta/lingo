# Vega installer: `vega sdk config setup` prompts on stdin even in a piped install, so `curl | bash` dies with EOF

Task attempted: Install the Vega CLI and SDK on the human's Mac with the documented one-liner, unattended where possible (LING-008,
VVD checklist step 0; the human ran the command from the agent session).
Steps:
  1. `NONINTERACTIVE=true curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash` (the variable was meant for `bash`; in a
     pipeline it reaches only `curl`, so the installer logged `NONINTERACTIVE=false` — our mistake, see Workaround).
  2. The CLI download and install succeeded (Vega CLI 1.4.4 → `~/vega/bin/vega`, log `~/vega/vvm/vvm-2026-10-14.log`).
  3. Step `_035_setup_vvm` ran `~/vega/bin/vega sdk config setup --verbose` and failed:
     `Error: Failed to get SDK path from user input` (exit 1). The installer stopped there: no SDK, no `~/vega/env`, no shell rc edits.
  4. Recovery by the human: `printf '\n' | ~/vega/bin/vega sdk config setup` (accepted the default `~/vega/sdk`), then the SDK install
     continued by hand with `~/vega/bin/vega sdk install 0.24.12112 --non-interactive`.
Expected: A `curl | bash` installer (the only documented macOS path) never reads a prompt answer from stdin, because stdin *is* the script; and
`NONINTERACTIVE=true`, which the script understands, propagates to the one subcommand that prompts.
Actual:
  - The installer's own prompts read from `/dev/tty` (`read_input`, line 520), which works in a pipe. But `_035_setup_vvm` calls
    `vega sdk config setup` with "default interactive mode" (comment at line 1494) and no `--non-interactive`, and that Go binary reads
    stdin, which is at EOF. The install dies after the download regardless of `NONINTERACTIVE`, unless a TTY happens to be stdin.
  - Before failing, the CLI also logs `Failed to build the telemetry client … Unable to find a valid Telemetry directory` and
    `Error getting opt in status from telemetry` for `~/vega/telemetry`, which does not exist yet (noise, but it hides the real error).
  - Both subcommands have the flags the installer needed and did not use: `vega sdk install --non-interactive`, and
    `vega sdk config setup --non-interactive` / `--component-path <dir>` ("Use defaults without prompts", per `--help`).
  - Consequence: `~/vega/env` was never written (`_090_write_vega_env` runs after `_060`), so `vega` is not on `PATH` and must be called as
    `~/vega/bin/vega`; nothing in the docs explains the half-installed state.
Severity: Medium. About 20 minutes for the human and the agent to read the log and finish by hand; a first-time developer sees
"Failed to get SDK path from user input" after a successful-looking download and has no next step.
Workaround: `printf '\n' | ~/vega/bin/vega sdk config setup`, then `~/vega/bin/vega sdk install <version> --non-interactive`; call the CLI
by absolute path (or `export PATH="$HOME/vega/bin:$PATH"` per shell). To pass the variable to bash in the one-liner, write
`curl -fsSL … | NONINTERACTIVE=true bash`.
Suggestion: In `_035_setup_vvm`, pass `--non-interactive` (or `--component-path "$default"`) when `NONINTERACTIVE=true` or when stdin is
not a TTY; otherwise make `vega sdk config setup` read its answer from `/dev/tty` like the shell script does; print the recovery command on
failure; suppress the telemetry-directory debug lines before the telemetry directory exists; and document the env variables and the
`| NONINTERACTIVE=true bash` form on the install page.
Environment: Platform: Vega OS tooling. macOS 26.2 (arm64), zsh, Vega CLI 1.4.4 (installer header "Copyright 2025"), 2026-10-14 14:30 local;
log `~/vega/vvm/vvm-2026-10-14.log` lines 16, 52–70.
Links:
  - https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html
  - https://sdk-installer.vega.labcollab.net/get_vvm.sh (lines 492–535 `read_input`, 1490–1510 `_035_setup_vvm`)
  - docs/friction/2026-10-14-vega-sdk-installer-licence-telemetry-and-shell-rc-edits-have-no-explicit-consent-step.md
  - docs/spikes/2026-10-14-vega-vvd.md
