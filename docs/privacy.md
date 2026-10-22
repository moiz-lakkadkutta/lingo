# Lingo privacy policy

Applies to the Lingo apps on Fire TV ("Lingo", `dev.moizp.lingo`, and "Lingo Plus Demo", `dev.moizp.lingo.demo`) and the Lingo phone
page you open from the TV's pairing QR code. Last updated 2026-10-22.

Lingo is a hackathon project, built for the Build, Ship, Shape: Amazon Developer Hackathon and run for its judging period. The source
code is public: https://github.com/moiz-lakkadkutta/lingo.

## In short

- No account. Lingo never asks for your name, email address, phone number or location.
- No ads, no analytics, no tracking libraries. Nothing is sold or shared for advertising.
- The app stores what it needs to teach you: your settings, the words you save and your review schedule, keyed by a random id.

## What is collected, and why

| Data | Where it comes from | Why |
|---|---|---|
| A random install id (a UUID made by the app on first launch; the phone page makes its own) | Stored on the TV and in the phone browser's local storage, sent with each request | To keep your words and settings together without an account |
| Learning settings: language you learn, your own language, level (approximate CEFR), subtitle options | You choose them on the TV | To pick clips and words at your level |
| Saved words, review results and their schedule; quiz scores; how far you got in each clip; study days | Created as you use the app | Spaced review on the phone, "continue watching", your progress screen |
| A six-character session code | Made by the server when you pair a phone | To connect your phone to your TV |
| Your phone's name, if the phone reports one | Sent by the phone page when it joins | Shown on the TV so you know which phone is connected. Held in memory only, not stored |
| Lingo Plus purchase receipt: Amazon receipt id, Amazon user id (an id Amazon passes to the app for purchases; not your name or email), product, dates, and the receipt details Amazon returns | Amazon Appstore, when you buy Lingo Plus in the "Lingo" app | To check the purchase with Amazon and turn on Plus. The demo app has no purchases |
| IP address and request details (time, address, response code) | Every request to the server | Server logs, for fixing problems and limiting repeated tries of session codes that do not exist |

The camera on your phone is used only to scan the TV's QR code, in the browser; no image leaves the phone. "Hear it" uses your phone's own
text-to-speech. Video and subtitles are streamed from Amazon CloudFront; the clips are the same for everyone.

## Where it is stored

On one server in Amazon Web Services (AWS), region eu-central-1 (Frankfurt, Germany), in a PostgreSQL database and the server's system
logs. Both apps use the same database. Connections use HTTPS.

## Who else receives data

- **Amazon Appstore** (purchases in the "Lingo" app only). The purchase itself happens in Amazon's own screens. To check it, the server sends
  the receipt id and the Amazon user id to Amazon's Receipt Verification Service. Amazon's handling of your purchase is covered by Amazon's
  own privacy notice.
- **Amazon Web Services**, which hosts the server and delivers the video (CloudFront), and processes data only to provide that service.

No other third party receives your data.

## How long it is kept

For the hackathon judging period. After judging, the server is shut down and its disk, with the database and the logs, is deleted.
Nothing is copied off the server.

## Your choices

- To start fresh on a TV, clear the app's data (Fire TV Settings → Applications → Manage Installed Applications → Lingo → Clear data) or
  uninstall it. This drops the install id; the old rows stay on the server until it is shut down, or until you ask us to delete them.
- To ask for your data to be deleted, or to ask what is stored, open an issue at https://github.com/moiz-lakkadkutta/lingo/issues. You don't
  need to post anything personal there: mention roughly when you used Lingo and, if you can, the session code shown on your TV, and we
  will reply on the issue.

## Children

Lingo is not directed at children under 13 and does not knowingly collect data about them.

## Changes

Changes to this policy are made in this file; its history is on GitHub.
