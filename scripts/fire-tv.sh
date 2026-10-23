#!/usr/bin/env bash
# Install and drive the Lingo Fire TV apps on a Fire TV Stick over adb. For people and for AI coding agents.
# Guide: docs/filming/new-stick-guide.md, section "For an AI agent: run it over adb".
#
#   bash scripts/fire-tv.sh doctor                 # what is present and missing (adb, curl, shasum/sha256sum, unzip)
#   bash scripts/fire-tv.sh setup                  # install what is missing (adb: Homebrew cask, else ~/.lingo/platform-tools)
#   bash scripts/fire-tv.sh connect <tv-ip>        # adb connect <tv-ip>:5555, then print model and Fire OS version
#   bash scripts/fire-tv.sh install [demo|iap]     # download from the latest release, check sha256, adb install -r
#   bash scripts/fire-tv.sh launch [demo|iap]      # start the app
#   bash scripts/fire-tv.sh clip [demo|iap] [t]    # deep link: open the Margot Friedländer clip at t seconds (after first launch)
#   bash scripts/fire-tv.sh key <name>... [xN]     # up down left right select back home play menu; "key down x3" repeats
#   bash scripts/fire-tv.sh shot [file]            # screenshot, default ./lingo-shots/<timestamp>.png; prints the path
#   bash scripts/fire-tv.sh ui                     # labels and text on screen; the focused one is marked with >
#   bash scripts/fire-tv.sh record [seconds]       # screen recording (default 30, at most 180), pulled into ./lingo-shots
#   bash scripts/fire-tv.sh logs [crash]           # app log (follows; Ctrl-C to stop), or the crash buffer
#   bash scripts/fire-tv.sh reset|uninstall [demo|iap]
#   bash scripts/fire-tv.sh health                 # both servers' /health
#
# Several devices attached? Set LINGO_TV=<tv-ip>:5555 (or ANDROID_SERIAL).
# This script never runs "adb kill-server": on macOS the adb server must be the one the human started in Terminal.
set -euo pipefail

REPO=https://github.com/moiz-lakkadkutta/lingo
SLUG=terra-x-friedlaender  # "Interview mit Holocaust-Überlebender Margot Friedländer (Terra X)", about B1
PT_DIR="$HOME/.lingo/platform-tools"
APK_DIR="$HOME/.lingo/apks"
SHOT_DIR="./lingo-shots"
[[ -n "${LINGO_TV:-}" ]] && export ANDROID_SERIAL="$LINGO_TV"

say() { printf '%s\n' "$*"; }
die() { printf 'fire-tv: %s\n' "$*" >&2; exit 1; }
os() { case "$(uname -s)" in Darwin) echo mac ;; Linux) echo linux ;; MINGW* | MSYS* | CYGWIN*) echo windows ;; *) echo other ;; esac; }

# Per app: package, APK file name, deep-link scheme, build 2 sha256 (release fire-tv-judging-2).
app() {
  case "${1:-demo}" in
    demo) PKG=dev.moizp.lingo.demo APK=lingo-demo.apk SCHEME=lingodemo
          SHA=a274df46b867ec993bcc2f1f5802838ca16fc2c5ddd71a87b0701c543e326928 ;;
    iap)  PKG=dev.moizp.lingo APK=lingo-iap.apk SCHEME=lingo
          SHA=ca033426bc9a5464ee48223b1a3c65568039e8f8c7f7b9a23e5d8bbcc44c06f9 ;;
    *) die "unknown app '$1' (use demo or iap)" ;;
  esac
}

adb_path() {
  if command -v adb >/dev/null 2>&1; then command -v adb
  elif [[ -x "$PT_DIR/adb" ]]; then echo "$PT_DIR/adb"
  else return 1; fi
}
ADB() {
  local a; a="$(adb_path)" || die "adb not found. Run: bash scripts/fire-tv.sh setup"
  "$a" "$@"
}
sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1; else sha256sum "$1" | cut -d' ' -f1; fi; }

cmd_doctor() {
  local missing=0 t
  say "OS: $(uname -s) $(uname -m)"
  if a="$(adb_path)"; then say "ok       adb: $a ($("$a" version | head -1))"; else say "missing  adb"; missing=1; fi
  for t in curl unzip; do
    if command -v "$t" >/dev/null 2>&1; then say "ok       $t"; else say "missing  $t"; missing=1; fi
  done
  if command -v shasum >/dev/null 2>&1 || command -v sha256sum >/dev/null 2>&1; then say "ok       shasum/sha256sum"
  else say "missing  shasum or sha256sum"; missing=1; fi
  if adb_path >/dev/null; then say "devices:"; ADB devices -l | tail -n +2 | sed '/^$/d; s/^/  /'; fi
  if [[ $missing == 0 ]]; then say "All tools present."; else say "Run: bash scripts/fire-tv.sh setup"; fi
}

cmd_setup() {
  local o; o="$(os)"
  if [[ $o == windows || $o == other ]]; then
    say "Use WSL, or install platform-tools by hand: https://developer.android.com/tools/releases/platform-tools"; exit 1
  fi
  if adb_path >/dev/null; then say "adb present: $(adb_path)"
  elif [[ $o == mac ]] && command -v brew >/dev/null 2>&1; then
    say "Installing adb: brew install --cask android-platform-tools"
    brew install --cask android-platform-tools
  else
    if ! command -v curl >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then die "need curl and unzip first (Linux: sudo apt-get install curl unzip)"; fi
    local plat=darwin; [[ $o == linux ]] && plat=linux
    local url="https://dl.google.com/android/repository/platform-tools-latest-$plat.zip" tmp
    tmp="$(mktemp -d)"
    say "Downloading Google's platform-tools: $url"
    if curl -fL --retry 3 -o "$tmp/pt.zip" "$url" && unzip -q -o "$tmp/pt.zip" -d "$tmp"; then
      mkdir -p "$HOME/.lingo" && rm -rf "$PT_DIR" && mv "$tmp/platform-tools" "$PT_DIR"
      say "adb installed: $PT_DIR/adb (this script finds it there; add it to PATH to use it directly)"
    elif [[ $o == linux ]] && command -v apt-get >/dev/null 2>&1; then
      say "The download did not work. Fallback (needs sudo, may be an older adb): sudo apt-get install -y adb"
    else die "could not download platform-tools"; fi
    rm -rf "$tmp"
  fi
  local t
  for t in curl unzip; do command -v "$t" >/dev/null 2>&1 || say "Still missing: $t (Linux: sudo apt-get install $t)"; done
  cmd_doctor
}

cmd_connect() {
  local ip="${1:-}" out state i
  [[ -n $ip ]] || die "usage: connect <tv-ip>   (TV: Settings > My Fire TV > About > Network)"
  [[ $ip == *:* ]] || ip="$ip:5555"
  export ANDROID_SERIAL="$ip"
  out="$(ADB connect "$ip" 2>&1 || true)"; say "$out"
  if [[ $out != *"connected to"* ]]; then
    if [[ $(os) == mac ]]; then
      say ""
      say "macOS can block an adb server started by a sandboxed tool (Local Network privacy, \"No route to host\")."
      say "Fix: in your own Terminal app run once:   adb kill-server; adb connect $ip"
      say "then run this again. Also check: same network as the TV, ADB debugging on, the IP is current."
    else
      say "Check: same network as the TV, Settings > My Fire TV > Developer options > ADB debugging ON, the IP is current."
    fi
    exit 1
  fi
  for i in $(seq 1 30); do
    state="$(ADB devices | awk -v d="$ip" '$1==d {print $2}')"
    [[ $state == device ]] && break
    [[ $state == unauthorized && $i == 1 ]] && say "On the TV: allow USB debugging (tick \"Always allow from this computer\")."
    sleep 1
  done
  [[ $state == device ]] || die "device state is '${state:-none}' after 30 s"
  say "Model: $(ADB shell getprop ro.product.model | tr -d '\r')"
  say "Fire OS: $(ADB shell getprop ro.build.version.name | tr -d '\r') (Android $(ADB shell getprop ro.build.version.release | tr -d '\r'))"
  say "Use LINGO_TV=$ip if more than one device is attached."
}

cmd_install() {
  app "${1:-demo}"
  local f="$APK_DIR/$APK"
  mkdir -p "$APK_DIR"
  if [[ ! -f $f || $(sha256 "$f") != "$SHA" ]]; then
    say "Downloading $REPO/releases/latest/download/$APK"
    curl -fL --retry 3 -o "$f" "$REPO/releases/latest/download/$APK"
  fi
  local got; got="$(sha256 "$f")"
  if [[ $got != "$SHA" ]]; then
    rm -f "$f"
    die "sha256 is $got, expected $SHA (build 2). The latest release may be newer than this script; check $REPO/releases/latest"
  fi
  say "sha256 ok: $SHA"
  ADB install -r "$f"
  say "Installed $PKG $(ADB shell dumpsys package "$PKG" | grep -m1 versionName | tr -d ' \r')"
}

cmd_launch() { app "${1:-demo}"; ADB shell am start -n "$PKG/$PKG.MainActivity"; }

cmd_clip() {
  app "${1:-demo}"
  local t="${2:-0}"
  [[ $t =~ ^[0-9]+$ ]] || die "t must be whole seconds"
  ADB shell "am start -a android.intent.action.VIEW -d '$SCHEME://clip/$SLUG?t=$t'"
}

cmd_key() {
  [[ $# -gt 0 ]] || die "usage: key <up|down|left|right|select|back|home|play|menu>... [xN after a name repeats it]"
  local names=() n code k
  for n in "$@"; do
    if [[ $n =~ ^x([0-9]+)$ ]]; then
      [[ ${#names[@]} -gt 0 ]] || die "x${BASH_REMATCH[1]} needs a key before it"
      for ((k = 1; k < BASH_REMATCH[1]; k++)); do names+=("${names[${#names[@]}-1]}"); done
    else names+=("$n"); fi
  done
  for n in "${names[@]}"; do
    case "$n" in
      up) code=KEYCODE_DPAD_UP ;; down) code=KEYCODE_DPAD_DOWN ;; left) code=KEYCODE_DPAD_LEFT ;; right) code=KEYCODE_DPAD_RIGHT ;;
      select | ok | center) code=KEYCODE_DPAD_CENTER ;; back) code=KEYCODE_BACK ;; home) code=KEYCODE_HOME ;;
      play | pause) code=KEYCODE_MEDIA_PLAY_PAUSE ;; menu) code=KEYCODE_MENU ;;
      *) die "unknown key '$n'" ;;
    esac
    ADB shell input keyevent "$code"
    sleep 0.6
  done
}

cmd_shot() {
  local f="${1:-}"
  if [[ -z $f ]]; then mkdir -p "$SHOT_DIR"; f="$SHOT_DIR/$(date +%Y%m%d-%H%M%S).png"; fi
  sleep 0.5
  ADB exec-out screencap -p >"$f"
  say "$f"
}

cmd_ui() {
  ADB shell uiautomator dump /sdcard/lingo-ui.xml >/dev/null || die "uiautomator dump did not work (busy screen, e.g. video playing?). Use: shot"
  ADB exec-out cat /sdcard/lingo-ui.xml | tr '>' '\n' | awk '
    /<node / {
      d = ""; t = ""; f = " "
      if (match($0, /content-desc="[^"]*"/)) d = substr($0, RSTART + 14, RLENGTH - 15)
      if (match($0, / text="[^"]*"/)) t = substr($0, RSTART + 7, RLENGTH - 8)
      if ($0 ~ /focused="true"/) f = ">"
      gsub(/&apos;/, "\047", d); gsub(/&apos;/, "\047", t); gsub(/&quot;/, "\"", d); gsub(/&quot;/, "\"", t); gsub(/&amp;/, "\\&", d); gsub(/&amp;/, "\\&", t)
      if (d != "" || t != "") { line = f " "; if (d != "") line = line "[" d "]"; if (t != "" && t != d) line = line " " t; print line }
    }'
}

cmd_record() {
  local s="${1:-30}" f
  [[ $s =~ ^[0-9]+$ && $s -ge 1 && $s -le 180 ]] || die "seconds: 1 to 180"
  mkdir -p "$SHOT_DIR"; f="$SHOT_DIR/$(date +%Y%m%d-%H%M%S).mp4"
  say "Recording $s s..."
  ADB shell screenrecord --time-limit "$s" /sdcard/lingo-take.mp4
  ADB pull /sdcard/lingo-take.mp4 "$f" >/dev/null && ADB shell rm /sdcard/lingo-take.mp4
  say "$f"
}

cmd_logs() {
  if [[ ${1:-} == crash ]]; then ADB logcat -d -b crash; else ADB logcat -s ReactNativeJS:V ReactNative:V; fi
}

cmd_health() {
  local u rc=0
  for u in https://demo-51-102-187-91.sslip.io https://iap-51-102-187-91.sslip.io; do
    printf '%s/health  ' "$u"
    curl -fsS --max-time 15 "$u/health" || { printf 'NOT REACHABLE'; rc=1; }
    printf '\n'
  done
  return $rc
}

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

case "${1:-}" in
  doctor) cmd_doctor ;;
  setup) cmd_setup ;;
  connect) shift; cmd_connect "$@" ;;
  install) shift; cmd_install "$@" ;;
  launch) shift; cmd_launch "$@" ;;
  clip) shift; cmd_clip "$@" ;;
  key) shift; cmd_key "$@" ;;
  shot) shift; cmd_shot "$@" ;;
  ui) cmd_ui ;;
  record) shift; cmd_record "$@" ;;
  logs) shift; cmd_logs "$@" ;;
  reset) shift; app "${1:-demo}"; ADB shell pm clear "$PKG" ;;
  uninstall) shift; app "${1:-demo}"; ADB uninstall "$PKG" ;;
  health) cmd_health ;;
  -h | --help | help | "") usage ;;
  *) usage; die "unknown command '$1'" ;;
esac
