# Vega Virtual Device: `start` symlinks the cwd into the SDK workspace and crashes with a Python traceback when a build races it; the GUI emulator crashes on this Mac, headless boots in 8 s

Task attempted: Start the Vega Virtual Device at 1920×1080 while `npm run build:release` ran in another shell (LING-008, VVD checklist step 4).
Steps:
  1. `vega virtual-device start --display-res=1920,1080` (cwd: the repo root) in parallel with `npm run build:release` (cwd: apps/vega).
  2. Retried alone with `--timeout 180`; then `--no-gui`.
Expected: `start` launches the simulator, waits for boot, returns "Virtual device ready"; it does not depend on the current directory and
does not touch the SDK tree.
Actual:
  - Attempt 1 died before launching anything, with a Python traceback from `tools/bin/dutyfree-vega` → `config.py:447
    setup_packagelink_in_workspace` → `FileExistsError: [Errno 17] File exists: '~/hackathon/lingo' ->
    '~/vega/sdk/vega-sdk/main/0.24.12112/workspace/App/lingo'`. The CLI symlinks the *current directory* into the SDK's `workspace/App/<basename>`
    on every command, and two commands at once race on the link (the build had just created it). `workspace/App/` now holds `lingo` and `vega`.
    Also `[WARN] vvman command not found … Attempting fallback to kepler --v`: the installer's `vvman`/`kepler` symlinks were never created because
    the install aborted earlier (separate log), and the fallback reports "SDK Version obtained: 0.200.0", which is not a real version.
  - Attempt 2 (GUI): the emulator window opened (`CMD_SETUP_SUBWINDOW … 960x540 dpr 2`), then the qemu process crashed within seconds;
    crashpad wrote `/tmp/android-moizp/emu-crash-34.1.15.db/completed/<id>.dmp`, stderr ends with
    `sPrepareTexImage2D:3614 failed validation` and `UniversalExceptionRaise: (os/kern) failure (5)`; `virtual-device status` stays
    `{"running":false,"process_ids":{"qemu":-1}}` while `start` waits the full timeout and then prints "Deadline reached (180s) but virtual
    device unresponsive". No pointer to the instance's `virtual_device.err`/`.out` or to the crash database.
  - Attempt 3 (`--no-gui`): "Virtual device ready" after 8 s, `vega exec vda devices` lists `emulator-5554`, apps install and run. Headless
    is enough for `inputd-cli` and logs, but the device-side screenshot tool (`gwsi-tool-screenshooter`) wrote a 0-byte file and hung —
    there is no compositor output to capture — so no screenshot or recording is possible without the GUI on this machine.
  - The `--gl-accel` help says it "can only be turned off on linux", so the host-GPU path cannot be bypassed on macOS.
Severity: High for this spike: the deliverable (a filmed Home/Words on the simulator) is blocked by the GUI crash on macOS 26.2 / Apple
Silicon; the race and the traceback cost about 15 minutes.
Workaround: Run `vega` commands one at a time; use `--no-gui` for installs, logs and remote-key automation (`inputd-cli button_press`);
for a visual, film the Fire TV Stick instead, or try the GUI on another Mac / macOS version. `rm ~/vega/sdk/vega-sdk/main/<v>/workspace/App/<name>`
clears a stale link.
Suggestion: Make the workspace link idempotent (`os.path.islink` → skip) and lock it; keep the SDK workspace out of the cwd's business, or
document it; have `start` detect a dead qemu immediately (it has the pid) and print the `.err` tail and the crash-dump path instead of
waiting for the timeout; publish the emulator's macOS support matrix (macOS 26 / Apple Silicon) and offer a software renderer
(`swangle`) on macOS; let `gwsi-tool-screenshooter` fail fast when there is no display rather than hang.
Environment: Platform: Vega OS tooling. Vega CLI 1.4.4, SDK 0.24.12112 (VVD emulator 34.1.15, TV image), macOS 26.2 (25C56), Apple Silicon,
2026-10-14. Logs: `~/vega/sdk/vega-sdk/main/0.24.12112/vvd/virtual_device.log`, `…/vvd/instances/<id>/virtual_device.{out,err}`,
`/tmp/android-moizp/emu-crash-34.1.15.db`.
Links:
  - https://developer.amazon.com/docs/vega/0.24/run-apps.html (`vega virtual-device start`, `--no-gui`, `--display-res`)
  - https://www.developer.amazon.com/docs/vega/0.24/vda-tools.html (screenshot command)
  - docs/spikes/2026-10-14-vega-vvd.md
