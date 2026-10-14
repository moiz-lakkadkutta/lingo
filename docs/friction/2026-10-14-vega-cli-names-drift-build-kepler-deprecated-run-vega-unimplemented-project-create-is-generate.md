# Vega CLI names drift: `build-kepler` is deprecated, `run-vega` is unimplemented, `project create` is `project generate`

Task attempted: Write the exact commands to build Lingo's Vega app and run it on the Vega Virtual Device (LING-008, VVD checklist steps 1–4),
from the 0.24 docs and the React Native CLI plugin that `apps/vega` already installs.
Steps:
  1. Read https://developer.amazon.com/docs/vega/0.24/cli-tools and https://www.developer.amazon.com/docs/vega/0.24/build-an-app.html.
  2. `cd apps/vega && npm install` (779 packages, 7 s from the npm cache, 493 MB), then
     `npx react-native build-vega --help`, `npx react-native build-kepler --help`, `npx react-native run-vega --help`
     (`@amazon-devices/kepler-cli-platform` 0.22.14, npm `latest`).
Expected: One set of command names across the docs, the samples and the installed plugin.
Actual:
  - Project creation is `vega project generate --template <name> --name <APPNAME> --packageId <id> [--outputDir <dir>]`; the cli-tools page
    says there is no `vega project create`. Lingo's plan and README (written from the older docs and samples) say `vega project create`.
  - The cli-tools page documents `npx react-native build-vega`; the installed plugin registers `build-vega`, `bundle-vega`, `run-vega`.
    `build-kepler` still exists but its help says "[DEPRECATED] Please use 'build-vega' instead". Lingo's `package.json` (`build:release`,
    `build:debug`) and Amazon's two samples use `build-kepler`; the fast-refresh page uses the template's `npm run build:debug`.
  - `npx react-native run-vega --help`: "Placeholder for later implementation - this command is currently unimplemented". Running is
    `vega run-app <vpkg> <component-id> -d VirtualDevice` from the SDK's CLI, not from the RN plugin.
  - The cli-tools help example mentions `vega build`, for which the page has no section.
  - The 0.24 hello-world tutorial is Vega Studio only; the CLI route is split across build-an-app, run-apps and fast-refresh.
Severity: Low to Medium. About 30 minutes reconciling names; a script that follows the README's `vega project create` fails at the first
command.
Workaround: Use `vega project generate`, keep `build-kepler` (works, warns) until the plugin's `build-vega` is verified on this project, and
run with `vega run-app build/aarch64-release/lingo_aarch64.vpkg dev.moizp.lingo.main -d VirtualDevice`. README and the spike doc updated.
Suggestion: Rename once and keep aliases with a dated removal; update the two GitHub samples to `build-vega`; remove `run-vega` from the
plugin until it does something, or make it call `vega run-app`; give the hello-world page a CLI tab.
Environment: Platform: Vega OS tooling. macOS 26.2 (arm64), Node 22.19, npm 10.9.3, @amazon-devices/kepler-cli-platform 0.22.14,
@react-native-community/cli 20; docs 0.24 read 2026-10-14; SDK not installed (the `--help` output needs no SDK).
Links:
  - https://developer.amazon.com/docs/vega/0.24/cli-tools
  - https://www.developer.amazon.com/docs/vega/0.24/build-an-app.html
  - https://developer.amazon.com/docs/vega/0.24/run-apps.html
  - https://developer.amazon.com/docs/vega/0.24/fast-refresh
  - https://github.com/AmazonAppDev/vega-video-sample/blob/main/package.json · https://github.com/AmazonAppDev/react-native-multi-tv-app-sample/blob/main/apps/vega/package.json
  - apps/vega/package.json, apps/vega/README.md, docs/plans/LING-008.md §3.6
