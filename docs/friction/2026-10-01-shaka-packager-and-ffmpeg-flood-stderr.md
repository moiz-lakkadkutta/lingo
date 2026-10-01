# shaka packager and ffmpeg flood stderr

Task attempted: Run the media pipeline (`pnpm pipeline prepare …`) on a real clip and follow its progress in the terminal:
ffmpeg makes the mezzanine and renditions, Shaka Packager writes HLS, then Transcribe, Translate and Bedrock run.
Steps:
  1. The pipeline spawns `ffmpeg` and `packager` with stdio inherited.
  2. Run `prepare` on `terra-x-friedlaender`.
Expected: One line per pipeline step, errors visible.
Actual: ffmpeg prints its banner and a continuously updated `frame= … fps= … time= … speed=` progress line to stderr; Shaka
Packager prints glog `I…` INFO lines to stderr for every input and stream. The pipeline's own step lines and warnings scroll
away, and there are no per-step timings to see where the time goes.
Severity: Low — no data lost, but warnings were easy to miss on the first real run, and comparing runs needed manual
scrolling.
Workaround (decision 0008 §12): ffmpeg runs with `-hide_banner -loglevel error -nostats`; Packager runs with `--quiet`;
each pipeline step logs its elapsed time.
Suggestion: Shaka Packager could default INFO logging off for non-interactive use, or document `--quiet` / glog's
`--minloglevel` on the main usage page.
Environment: macOS 26.2, Node 22.19.0, ffmpeg, Shaka Packager.
Links:
  - ffmpeg generic options (`-loglevel`, `-hide_banner`): https://ffmpeg.org/ffmpeg.html#Generic-options
  - ffmpeg main options (`-nostats`): https://ffmpeg.org/ffmpeg.html#Main-options
  - Shaka Packager documentation (`--quiet`): https://shaka-project.github.io/shaka-packager/html/documentation.html
  - `docs/decisions/0008-upstream-quality.md` §12
