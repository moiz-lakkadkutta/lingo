# Vega SDK: the docs ask for 20 GB, the installer never checks disk, and the package metadata reports a decompressed size of 0

Task attempted: Decide whether the Vega SDK and the Vega Virtual Device fit on the human's Mac before installing (LING-008, VVD checklist
step 0). The Mac's data volume had 17 GB free at the start of the session (15 GB after the Homebrew prerequisites and `apps/vega`'s
`npm install`).
Steps:
  1. `df -h /System/Volumes/Data` → 17 GB free of 1.8 TB (Docker's container data alone is 114 GB).
  2. Read the install page's requirements (0.22 and 0.24 say the same): "Disk space: 20 GB available for VDT installation and development
     environment".
  3. Read `get_vvm.sh` for a disk check: none (`grep -i -E "disk|space|df "` finds nothing).
  4. Queried the installer's own registry, `https://k-artifactory-external.labcollab.net/artifactory/api/kpm/kpm-default-prod-local/metadata/KeplerSDK?platform=darwin-aarch64`.
Expected: A stated size for the SDK and the virtual device image, or a check in the installer that stops before a full disk.
Actual:
  - The registry lists ten SDK versions (latest 0.24.12112, built 2026-09-21) at `file_size_bytes` 0.88 GB each, with
    `decompressed_size_bytes: 0` on every entry. The installed size cannot be read from the metadata; the "20 GB" figure cannot be
    attributed to the SDK, the VVD image, the build toolchain or the project's `node_modules`.
  - The installer downloads and extracts without a free-space check, so on this Mac a 20 GB install could fill the volume while the API,
    Postgres and another agent's Metro are running on it.
  - The decision therefore went to the human (free up space or accept the risk), and the install did not run this session.
Severity: Medium. Blocks the agent-driven install; a wrong guess costs a full disk on a shared machine. Minutes lost: about 20 on the
registry probe; the install itself is still pending (TBD by human).
Workaround: Ask the human to free space (Docker data, 114 GB, is the obvious candidate) or to accept running with 15 GB, and run
`vega sdk install` separately so the SDK download (0.88 GB) can be observed before the virtual device is started.
Suggestion: Publish the real numbers (CLI, SDK, VVD image, toolchain) on the install page; fill `decompressed_size_bytes` in the KPM
metadata; make `vega sdk install` check free space against the decompressed size and stop with a message.
Environment: Platform: Vega OS tooling. macOS 26.2 (arm64), 1.8 TB APFS volume with 17 GB free; SDK not installed; registry queried
2026-10-14 with curl (no login needed for the metadata endpoint).
Links:
  - https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html (the 20 GB requirement)
  - https://k-artifactory-external.labcollab.net/artifactory/api/kpm/kpm-default-prod-local/metadata/KeplerSDK?platform=darwin-aarch64
  - ../vega-media-kit/docs/decisions/0001-week0-gates.md (Gate B: "the SDK install alone is ~20 GB")
