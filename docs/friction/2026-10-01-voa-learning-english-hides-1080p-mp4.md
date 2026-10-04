# VOA Learning English hides the 1080p MP4 in the player configuration

Task attempted: Download the 1080p source MP4 of "Let's Learn English – Lesson 1: Welcome!" (VOA Learning English, public
domain) for the pipeline clip `voa-lets-learn-english-01`.
Steps:
  1. Open the lesson page https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html.
  2. Look for a direct file URL in the page HTML.
Expected: One video per lesson page with a visible download link for each quality.
Actual: The 1080p MP4 URL is not a plain link; it sits in the player's JSON configuration inside the page. The page also
embeds three videos, so the first video URL found is not necessarily the lesson. Numeric VOA
article URLs can also 301 to the wrong site.
Severity: Low — minutes, not hours, but scraping by "first MP4" picks the wrong file, and the lesson length (5:00 of
lesson + 2:27 speaking practice) must be checked to know the right one was taken.
Workaround: Take the canonical lesson link from the index page https://learningenglish.voanews.com/p/5644.html, read the
player JSON for the lesson's own video, pick the 1080p rendition, and confirm duration before ingest. Recorded in
`docs/content.md`.
Suggestion: VOA could expose a per-video download menu or direct links for every embedded video, labelled by title.
Environment: Platform: content source (VOA Learning English). macOS 26.2, desktop browser and curl, 2026-10-01.
Links:
  - Lesson page: https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html
  - Lesson index: https://learningenglish.voanews.com/p/5644.html
  - VOA terms (public domain): https://learningenglish.voanews.com/p/6021.html
  - `docs/content.md` (row 7, ingest notes)
