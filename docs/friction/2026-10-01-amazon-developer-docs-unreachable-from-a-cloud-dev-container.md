# Amazon developer docs are unreachable from a cloud dev container

Task attempted: Open every cited Amazon page before coding the LING-007 integrations (IAP, RVS, App Tester, Content Launcher).
Again on 2026-10-02 for the LING-005 review fix H1 (per-install device id kept in MMKV on Vega) and for the LING-008 plan (Vega SDK,
supported libraries, AWS pricing pages).
Steps:
  1. `curl -s -o /dev/null -w '%{http_code}' https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html`
  2. The same for the Vega appstore-integrations overview and the community.amazondeveloper.com thread.
  3. 2026-10-02: the same for https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html (react-native-mmkv's entry),
     https://developer.amazon.com/docs/vega/0.22/focus-management, https://aws.amazon.com/bedrock/pricing/ and
     https://docs.aws.amazon.com/transcribe/latest/dg/diarization.html.
Expected: HTTP 200.
Actual: `000` (the connection is refused by the container's egress policy) for developer.amazon.com and
community.amazondeveloper.com. npm (registry.npmjs.org) is reachable. On 2026-10-02 all four URLs in step 3 also return `000`;
the LING-008 plan records the same for developer.amazon.com and aws.amazon.com (docs/plans/LING-008.md §13). www.npmjs.com answers
403, so package READMEs come from the registry tarball, not the npm website.
Severity: Low for this ticket, because the published npm typings answered the API questions. Page-only facts stay unverified:
App Tester file locations, the RVS JSON field list and the cancel URL. For the Vega MMKV store (review-005 H1), the API
(`new MMKV({ id })`, `getString`, `set`) comes from the `@amazon-devices/react-native-mmkv` package's `README.kepler.md`, and the claim
that react-native-mmkv is on Vega's supported list rests on the page URL alone until someone opens it.
Workaround: Read `@amazon-devices/keplerscript-appstore-iap-lib@2.13.0`, `@amazon-devices/kepler-media-content-launcher@2.0.22`,
`@amazon-devices/react-native-mmkv@~1.0.11` and `react-native-iap@16.7.2` from npm. Open the pages on a workstation before the device
checklists.
Suggestion: Publish the Vega API reference with the npm packages (README or typedoc in the tarball), so agents and CI can read it
offline.
Environment: Platform: Amazon developer documentation (Vega OS, Fire OS, AWS). Claude Code cloud container, 2026-10-01 and 2026-10-02.
Links:
  - https://developer.amazon.com/docs/vega/0.22/appstore-integrations-overview.html
  - https://developer.amazon.com/docs/in-app-purchasing/rvs-cloud-sandbox.html
  - https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html
  - `apps/vega/src/App.tsx:21-23` (MMKV store and its source), `apps/vega/README.md` (file map), commit a6ef6f8
