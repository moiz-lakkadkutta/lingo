# Vega install doc: Rosetta 2 is a prerequisite, the installer refuses to run under Rosetta, and macOS needs eight GNU packages

Task attempted: Prepare an Apple Silicon Mac for the Vega SDK per the install page (LING-008, VVD checklist step 0).
Steps:
  1. Read https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html, "Development utilities":
     `[[ $(arch) == "arm64" ]] && softwareupdate --install-rosetta --agree-to-license; brew update && brew install binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman`.
  2. Checked the Mac: Rosetta already installed (`pgrep oahd`), `lz4` present, the other eight Homebrew packages missing.
  3. Read `get_vvm.sh` lines 1360–1366: "Installer appears to be running under Rosetta on Mac arm64. Please ensure your bash is native
     arm64 (try /bin/bash) or that your terminal is not opened using Rosetta." — the installer exits in that case.
  4. `brew install binutils coreutils gawk findutils grep jq gnu-sed watchman` → OK in about 4 minutes (binutils 2.47, coreutils 9.12,
     gawk 5.4.1, findutils 4.11.0, grep 3.12, jq 1.8.2, gnu-sed 4.10, watchman 2026.10.12.00).
Expected: The page says why Rosetta is needed (which SDK tools are x86_64) and that the installer itself must run in a native arm64 shell;
a macOS install uses the system `sed`, `grep`, `find` and `awk`, or the page says which SDK tools need the GNU versions and whether
they must be first on `PATH`.
Actual:
  - The page installs Rosetta without saying what for; Lingo's own README and plan read it as "install under Rosetta 2" (apps/vega/README.md
    step 0: "Rosetta 2 on Apple Silicon"), the opposite of what the installer enforces. A developer with an x86_64 Terminal profile
    (common for Homebrew/x86 setups) gets an abort after the download.
  - Six GNU userland packages (binutils, coreutils, gawk, findutils, grep, gnu-sed) are required on macOS with no explanation. Homebrew
    installs them with a `g` prefix (`gsed`, `ggrep`) and prints "If you need to use it as sed, add gnubin to your PATH"; the page does not
    say whether the SDK finds them by prefix or needs `gnubin` on `PATH`. Not verifiable until the SDK runs.
Severity: Low. About 10 minutes of reading plus the 4-minute `brew install`; the Rosetta abort would cost a retry.
Workaround: Run the installer from a native arm64 shell (`arch` prints `arm64`); install the Homebrew list as given; leave `PATH` alone until
a tool complains.
Suggestion: On the install page, state why Rosetta is installed and that the installer must run natively; list which SDK tools call GNU
`sed`/`grep`/`find`/`awk`/`binutils` and how they are located; move the check for a Rosetta shell before the 10 MB download.
Environment: Platform: Vega OS tooling. macOS 26.2 (arm64), Homebrew 7.0.6, native zsh (`arch` = arm64); installer script read 2026-10-14,
not run.
Links:
  - https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html
  - https://sdk-installer.vega.labcollab.net/get_vvm.sh (lines 1360–1366)
  - apps/vega/README.md (VVD checklist step 0)
