#!/usr/bin/env bash
# EAS npm hook (runs before install): https://docs.expo.dev/build-reference/npm-hooks/
# The root package.json overrides @moizp/vega-media-kit to link:../vega-media-kit, a sibling checkout that does not exist
# on an EAS builder. The phone never imports the kit, so give the link a stub target before pnpm install.
set -euo pipefail
[ "${EAS_BUILD:-}" = "true" ] || exit 0
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
KIT="$ROOT/../vega-media-kit"
if [ ! -f "$KIT/package.json" ]; then
  mkdir -p "$KIT"
  printf '{"name":"@moizp/vega-media-kit","version":"0.1.0-alpha.0","main":"index.js"}\n' > "$KIT/package.json"
  printf 'module.exports = {}\n' > "$KIT/index.js"
  echo "eas-pre-install: stubbed $KIT (phone does not use the kit)"
fi
