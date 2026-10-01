# amazon developer docs unreachable from a cloud dev container

Task attempted: Open every cited Amazon page before coding the LING-007 integrations (IAP, RVS, App Tester, Content Launcher).
Steps:
  1. `curl -s -o /dev/null -w '%{http_code}' https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html`
  2. The same for the Vega appstore-integrations overview and the community.amazondeveloper.com thread.
Expected: HTTP 200.
Actual: `000` (the connection is refused by the container's egress policy) for developer.amazon.com and
community.amazondeveloper.com. npm (registry.npmjs.org) is reachable.
Severity: Low for this ticket, because the published npm typings answered the API questions. Page-only facts stay unverified:
App Tester file locations, the RVS JSON field list and the cancel URL.
Workaround: Read `@amazon-devices/keplerscript-appstore-iap-lib@2.13.0`, `@amazon-devices/kepler-media-content-launcher@2.0.22`
and `react-native-iap@16.7.2` from npm. Open the pages on a workstation before the device checklists.
Suggestion: Publish the Vega API reference with the npm packages (README or typedoc in the tarball), so agents and CI can read it
offline.
Environment: Claude Code cloud container, 2026-10-01.
Links:
  - https://developer.amazon.com/docs/vega/0.22/appstore-integrations-overview.html
  - https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html
