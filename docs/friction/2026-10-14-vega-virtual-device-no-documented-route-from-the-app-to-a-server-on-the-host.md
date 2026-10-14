# Vega Virtual Device: no documented route from the app to a server on the host, and `--forward true|false` is undefined

Task attempted: Point Lingo's Vega app on the Vega Virtual Device at the Lingo API running on the same Mac (`pnpm api`, localhost:4000) and
take screenshots of Home and Words (LING-008, VVD checklist steps 4–5).
Steps:
  1. Searched the 0.21–0.24 docs for how an app on the VVD reaches the host: run-apps, fast-refresh, cli-tools, vda-tools, network-proxy.
  2. Read the fast-refresh page: start the VVD, `npm start`, then
     `vega device start-port-forwarding --device VirtualDevice -p 8081 --forward false`; for a custom Metro port
     `npm start -- --port=<new_port>` and `vda reverse tcp:8081 tcp:<new_port>`.
  3. Read the cli-tools page for `start-port-forwarding --device --port <n> --forward <true|false>`.
Expected: A sentence such as "the host is reachable from the virtual device at <address>" or "reverse-forward any port with …", and a
definition of `--forward true` vs `false`.
Actual:
  - No page says what `localhost` means inside the VVD or gives a host alias (Android's `10.0.2.2` has no documented Vega equivalent).
    The only host↔device plumbing documented is for Metro on 8081, via `start-port-forwarding … --forward false` and `vda reverse`.
  - The cli-tools page says `start-port-forwarding` and `stop-port-forwarding` "start or reverse" forwarding and does not define which
    value of `--forward` is which; the fast-refresh page uses `--forward false` for Metro, which implies `false` = reverse (device port →
    host port), but that is inference.
  - The vda-tools page documents `vega exec vda shell gwsi-tool-screenshooter <file.png>` + `vega exec vda pull` for a screenshot, and
    nothing for a screen recording; the run-apps page has neither.
  - Consequence for Lingo: `apps/vega/src/config.ts` has a placeholder LAN address. The untested plan is `--forward false` on port 4000 with
    `API_BASE_URL = 'http://localhost:4000'`, falling back to the Mac's LAN address (`ipconfig getifaddr en0`). Not verified: the SDK did
    not install this session.
Severity: Medium. Every TV app under development talks to a dev server; without the rule it is trial and error on first run (minutes TBD by human).
Workaround: Try `vega device start-port-forwarding --device VirtualDevice -p 4000 --forward false` with `localhost:4000` first; if the
request fails, use the host LAN IP in `src/config.ts`. Screenshot with `gwsi-tool-screenshooter`; record the VVD window with macOS
Screenshot (Shift-Cmd-5) since no device recorder is documented.
Suggestion: Add a "Reach your development server" section to run-apps (host alias or the reverse-forward recipe for any port); define
`--forward true|false` on the cli-tools page (or rename to `--direction host-to-device|device-to-host`); document a VVD screen-recording
command next to the screenshot one.
Environment: Platform: Vega OS. Docs 0.24 read 2026-10-14 from macOS 26.2 (arm64); Vega SDK not installed, so the forwarding behaviour
is unverified.
Links:
  - https://developer.amazon.com/docs/vega/0.24/fast-refresh
  - https://developer.amazon.com/docs/vega/0.24/cli-tools
  - https://www.developer.amazon.com/docs/vega/0.24/vda-tools.html
  - https://developer.amazon.com/docs/vega/0.24/run-apps.html
  - apps/vega/src/config.ts, docs/spikes/2026-10-14-vega-vvd.md
