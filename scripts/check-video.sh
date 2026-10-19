#!/usr/bin/env bash
# Pre-upload check for the Lingo demo video (LING-009). See docs/video/edit-sheet.md.
#
#   scripts/check-video.sh <video> [captions.srt]   # full check (default captions: docs/video/lingo.srt)
#   scripts/check-video.sh --srt <captions.srt>     # caption rules only, no video needed
#
# Checks:
#   1. Duration via ffprobe. FAILS (exit 1) at 180 s or more (rule: "<3 minute demo video"); warns outside the 2:40–2:55 target.
#   2. Integrated loudness via ffmpeg loudnorm (first pass). Prints I / TP / LRA; warns if I is outside -15..-13 LUFS.
#   3. Prints a ready-to-run second loudnorm pass (measured values filled in) that lands on -14 LUFS, TP -1.5 dBTP.
#   4. Prints the ffmpeg command that burns the captions in (needs an ffmpeg built with libass; checked here).
#   5. Caption rules on the .srt: <= 42 characters a line, <= 2 lines, <= 20 characters a second,
#      and the words blocked by docs/decisions/0002-wording.md. Warnings only.
# Exit: 0 ok (warnings allowed) · 1 too long or unreadable · 2 usage / missing tools.

set -euo pipefail

TARGET_I=-14
TARGET_TP=-1.5
TARGET_LRA=11
MAX_S=180
CUT_MIN_S=160   # 2:40
CUT_MAX_S=175   # 2:55

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
default_srt="$repo_root/docs/video/lingo.srt"
warnings=0

warn() { printf 'WARN  %s\n' "$*"; warnings=$((warnings + 1)); }
ok()   { printf 'OK    %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; }

usage() {
  sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

# --- caption rules -------------------------------------------------------------------------------
check_srt() {
  local srt="$1"
  if [[ ! -f "$srt" ]]; then warn "captions file not found: $srt"; return; fi
  echo "== Captions: $srt"
  # Character counts are bytes in BSD awk: non-ASCII letters (ä, ¹) count double, which only errs on the strict side.
  local out
  out="$(tr -d '\r' < "$srt" | awk '
    function ts(s,   h, m, rest, sec, ms) {
      split(s, a, ":"); h = a[1]; m = a[2]; split(a[3], b, ","); sec = b[1]; ms = b[2]
      return h * 3600 + m * 60 + sec + ms / 1000
    }
    function flush(   cps, chars, i) {
      if (id == "") return
      chars = 0
      for (i = 1; i <= n; i++) chars += length(line[i])
      if (n > 2) printf "cue %s: %d lines (max 2)\n", id, n
      for (i = 1; i <= n; i++) if (length(line[i]) > 42) printf "cue %s: line %d has %d characters (max 42): %s\n", id, i, length(line[i]), line[i]
      if (dur <= 0) printf "cue %s: end is not after start\n", id
      else { cps = chars / dur; if (cps > 20) printf "cue %s: %.1f characters a second (max 20)\n", id, cps }
      if (start < prev_end) printf "cue %s: starts before cue %s ends\n", id, prev_id
      prev_end = end; prev_id = id; cues++
      id = ""; n = 0
    }
    /^[0-9]+$/ && id == "" { id = $0; n = 0; next }
    / --> / { start = ts($1); end = ts($3); dur = end - start; last_end = end; next }
    /^$/ { flush(); next }
    { line[++n] = $0
      low = tolower($0)
      if (low ~ /streak broken|failed|wrong/) printf "cue %s: wording rule (decision 0002): %s\n", id, $0 }
    END { flush(); printf "__SUMMARY__ %d cues, last ends at %.1f s\n", cues, last_end }
  ')"
  local summary problems
  summary="$(printf '%s\n' "$out" | grep '^__SUMMARY__' | sed 's/^__SUMMARY__ //')"
  problems="$(printf '%s\n' "$out" | grep -v '^__SUMMARY__' || true)"
  if [[ -n "$problems" ]]; then
    while IFS= read -r p; do warn "$p"; done <<< "$problems"
  else
    ok "caption rules hold ($summary)"
  fi
}

# --- arguments -----------------------------------------------------------------------------------
[[ $# -ge 1 ]] || usage
if [[ "$1" == "--srt" ]]; then
  [[ $# -eq 2 ]] || usage
  check_srt "$2"
  echo "== Done: $warnings warning(s)"
  exit 0
fi
[[ "$1" == "-h" || "$1" == "--help" ]] && usage

video="$1"
srt="${2:-$default_srt}"

for tool in ffmpeg ffprobe; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR $tool not found. Install it (macOS: brew install ffmpeg) and run again." >&2
    exit 2
  fi
done
if [[ ! -f "$video" ]]; then echo "ERROR no such file: $video" >&2; exit 1; fi

echo "== Video: $video"

# --- 1. duration ---------------------------------------------------------------------------------
duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video" || true)"
if [[ -z "$duration" || "$duration" == "N/A" ]]; then
  fail "ffprobe could not read a duration"; exit 1
fi
mmss="$(awk -v d="$duration" 'BEGIN { printf "%d:%04.1f", int(d / 60), d - 60 * int(d / 60) }')"
echo "Duration: ${duration} s (${mmss})"
too_long=0
if awk -v d="$duration" -v m="$MAX_S" 'BEGIN { exit !(d >= m) }'; then
  fail "duration is ${duration} s; the rules need under ${MAX_S} s (3:00). Cut before upload."
  too_long=1
elif awk -v d="$duration" -v lo="$CUT_MIN_S" -v hi="$CUT_MAX_S" 'BEGIN { exit !(d < lo || d > hi) }'; then
  warn "duration is outside the 2:40–2:55 target (allowed, but under 3:00 is the hard rule)"
else
  ok "duration is inside the 2:40–2:55 target"
fi

vinfo="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -of csv=p=0 "$video" || true)"
echo "Video stream (codec,width,height,fps): ${vinfo:-none}"
case "$vinfo" in
  h264,1920,1080,*) ok "1080p H.264" ;;
  "") warn "no video stream found" ;;
  *) warn "export target is 1920x1080 H.264 (docs/video-script.md §5)" ;;
esac

# --- 2. loudness (first pass) --------------------------------------------------------------------
has_audio="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$video" || true)"
mI=""; mTP=""; mLRA=""; mThresh=""; mOffset=""
if [[ -z "$has_audio" ]]; then
  warn "no audio stream; skipping loudness"
else
  echo "Measuring loudness (one decode of the whole file)..."
  json="$(ffmpeg -hide_banner -nostats -i "$video" -map 0:a:0 \
    -af "loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json" -f null - 2>&1 \
    | awk '/^\{/ { on = 1 } on { print } /^\}/ { on = 0 }')"
  field() { printf '%s\n' "$json" | sed -n "s/.*\"$1\" : \"\\([^\"]*\\)\".*/\\1/p" | head -1; }
  mI="$(field input_i)"; mTP="$(field input_tp)"; mLRA="$(field input_lra)"
  mThresh="$(field input_thresh)"; mOffset="$(field target_offset)"
  if [[ -z "$mI" ]]; then
    warn "loudnorm printed no measurement"
  else
    echo "Integrated loudness I: ${mI} LUFS   True peak TP: ${mTP} dBTP   Loudness range LRA: ${mLRA} LU"
    if [[ "$mI" == "-inf" ]] || awk -v i="$mI" 'BEGIN { exit !(i < -15 || i > -13) }'; then
      warn "I is outside -15..-13 LUFS; run the second pass below"
    else
      ok "I is within -15..-13 LUFS"
    fi
    if [[ "$mTP" != "-inf" ]] && awk -v t="$mTP" 'BEGIN { exit !(t > -1) }'; then
      warn "true peak above -1 dBTP; the second pass limits it to ${TARGET_TP}"
    fi
  fi
fi

# --- 3. second pass command ----------------------------------------------------------------------
base="${video%.*}"
q() { printf '%q' "$1"; }
if [[ -n "$mI" && "$mI" != "-inf" ]]; then
  echo
  echo "== Second loudnorm pass to ${TARGET_I} LUFS (video copied, audio re-encoded AAC 48 kHz):"
  echo "ffmpeg -hide_banner -i $(q "$video") -map 0:v:0 -map 0:a:0 -c:v copy \\"
  echo "  -af \"loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:measured_I=${mI}:measured_TP=${mTP}:measured_LRA=${mLRA}:measured_thresh=${mThresh}:offset=${mOffset}:linear=true:print_format=summary\" \\"
  echo "  -ar 48000 -c:a aac -b:a 192k -movflags +faststart $(q "${base}-14lufs.mp4")"
  echo "Then run this script again on ${base}-14lufs.mp4 to confirm."
fi

# --- 4. burn-in command --------------------------------------------------------------------------
echo
echo "== Burn the captions in (re-encodes video; run it on the -14 LUFS file so the audio is final):"
rel_srt="$srt"
case "$srt" in "$repo_root"/*) rel_srt="${srt#"$repo_root"/}" ;; esac
echo "(cd $(q "$repo_root") && ffmpeg -hide_banner -i $(q "${base}-14lufs.mp4") \\"
echo "  -vf \"subtitles=${rel_srt}:force_style='FontName=Helvetica Neue,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=36'\" \\"
echo "  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart $(q "${base}-final.mp4"))"
if ffmpeg -hide_banner -filters 2>/dev/null | grep -qE '^ *[A-Z.]+ +subtitles '; then
  ok "this ffmpeg has the subtitles filter (libass)"
else
  warn "this ffmpeg has no 'subtitles' filter (built without libass), so the burn-in command above will not run here. Either burn the captions in the editor (import ${rel_srt} as a caption track), or install an ffmpeg with libass: brew tap homebrew-ffmpeg/ffmpeg && brew install homebrew-ffmpeg/ffmpeg/ffmpeg, then check: ffmpeg -filters | grep subtitles"
fi
echo "Upload ${rel_srt} to YouTube as well (Subtitles → English → Upload file → With timing)."

# --- 5. captions ---------------------------------------------------------------------------------
echo
check_srt "$srt"

echo
if [[ $too_long -eq 1 ]]; then
  echo "== Result: FAIL (too long), $warnings warning(s)"
  exit 1
fi
echo "== Result: OK, $warnings warning(s)"
