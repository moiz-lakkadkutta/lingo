# 0003 — Sharing pipeline code with Described

Status: accepted (LING-001)

Context. Described's pipeline has a Transcribe helper (03-speech), a Shaka Packager step (09-package) and an S3 publish step (10-publish). Lingo needs the same three capabilities. Options: (a) copy into packages/pipeline, (b) a shared npm package/repo, (c) put them in vega-media-kit.

Decision. (a) Copy and adapt. Each helper is ~15 lines, is coupled to Described's `Ctx` and `process.env`, and diverges immediately (Lingo: one audio rendition, one subtitle track per language, no AD, transcript fetched from Transcribe's service-managed bucket via the pre-signed TranscriptFileUri instead of `aws s3 cp`). The kit stays free of AWS clients and colours (vega-media-kit CONTRIBUTING rule); it already owns the only genuinely shared piece, the WebVTT model (`parseVtt`/`serializeVtt`/`lintCues`), which Lingo uses for every VTT it writes. A third repo would add a sibling checkout + build to both apps' CI for 40 lines of code.

Consequences. `packages/pipeline/src/steps/*.ts` carry a header comment naming the Described file they derive from. Lingo's `wordsFromTranscribe` attaches punctuation items to the preceding word (Described drops them) because Lingo's segmenter splits at sentence punctuation. Revisit when a third consumer appears or when either pipeline needs the other's change.

References. Transcribe output format https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html#how-output · StartTranscriptionJob https://docs.aws.amazon.com/transcribe/latest/APIReference/API_StartTranscriptionJob.html · Shaka Packager HLS https://shaka-project.github.io/shaka-packager/html/tutorials/hls.html · Packager options https://shaka-project.github.io/shaka-packager/html/documentation.html
