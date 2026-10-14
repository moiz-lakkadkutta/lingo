# Vega SDK installer: licence, telemetry and shell rc edits have no explicit consent step

Task attempted: Install the Vega SDK and the Vega Virtual Device on the human's Mac from an agent session (LING-008, VVD checklist step 0),
stopping wherever a licence, a login or a system change needs the human.
Steps:
  1. Read https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html: the macOS install is
     `curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env`, with three Enter prompts
     (install directory, install the SDK, install the Vega Studio extension).
  2. Downloaded `get_vvm.sh` (1 927 lines) into an isolated directory and read it instead of running it.
Expected: A step that shows the licence and asks for agreement, a telemetry choice before anything is sent, and a flag or a documented
environment variable for an unattended install.
Actual:
  - The licence is the header comment only: the script is "Program Materials" under https://developer.amazon.com/support/legal/pml, and
    "If you do not agree to the above terms and conditions, you may not use any file in this package." No prompt shows or records agreement;
    piping to `bash` is the acceptance.
  - Telemetry is on by default (`_020_metrics_notice`: "The Vega SDK and its packaged tools collect telemetry by default"). The opt-out on
    https://developer.amazon.com/docs/vega/0.24/telemetry.html is `${HOME}/vega/telemetry/config.json` → `"optIn": false`, a file that exists
    only after the install has run. The telemetry page lists `machine_id`, `directed_id` and `instance_id` among the shared properties.
  - The script appends `source "~/vega/env"` to `.bashrc`, `.zshrc`, `.bash_profile`, `.zprofile` and `.profile` (`_100_*`, rc list at
    line 1827), which the doc page mentions only as "shell configuration updates".
  - Unattended mode exists but is undocumented: `NONINTERACTIVE=true` skips every prompt and installs the latest SDK (`_060_install_sdk`);
    `SKIP_SDK_INSTALL=true`, `VEGA_SDK_VERSION=<v>` and `KEPLER_CSAT_DISABLED=true` (the post-stop feedback prompt) are also read from the
    environment. None appears on the install page. The interactive path reads from `/dev/tty`, so a session that pipes stdin cannot answer.
  - The CLI itself is a 10 MB tarball from `k-artifactory-external.labcollab.net` (KeplerVersionManager 1.4.4); the SDK download is a
    separate `vega sdk install` inside the same run.
Severity: Medium. The agent stopped before running the installer and handed the command to the human (about 45 minutes of reading the
script to find out what it does); for a human it is a one-line install, for anyone who must know what they agree to it is a 1 900-line read.
Workaround: The human runs `NONINTERACTIVE=true curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env`
themselves, then sets `"optIn": false` in `~/vega/telemetry/config.json` if they do not want telemetry.
Suggestion: Show the PML link and ask for agreement once (and accept `--accept-license` for scripted installs); ask about telemetry
before the first upload, or honour an environment variable such as `VEGA_TELEMETRY_OPT_IN=false` at install time; document
`NONINTERACTIVE`, `SKIP_SDK_INSTALL`, `VEGA_SDK_VERSION` and `KEPLER_CSAT_DISABLED` on the install page; and say which rc files are edited.
Environment: Platform: Vega OS tooling. macOS 26.2 (arm64, Apple M-series), Homebrew 7.0.6, Node 22.19, npm 10.9.3; installer script
fetched 2026-10-14 (header "Copyright 2025"); SDK not installed (stopped before the licence).
Links:
  - https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html
  - https://developer.amazon.com/docs/vega/0.24/telemetry.html
  - https://developer.amazon.com/support/legal/pml
  - https://sdk-installer.vega.labcollab.net/get_vvm.sh
  - docs/spikes/2026-10-14-vega-vvd.md
