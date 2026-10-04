# Bedrock Nova Lite: temperature range, structured outputs and lifecycle date are unclear

Task attempted: Plan LING-002 (word glosses and quiz items from Amazon Nova Lite through the Bedrock Converse API) with a
schema-checked JSON response and deterministic decoding.
Steps:
  1. Read the Nova tool-use page, the Nova complete request schema, the Bedrock structured-outputs page and the Nova Lite
     model card.
  2. Choose decoding settings and the way to force a JSON schema.
  3. Choose the model id.
Expected: One documented temperature range; structured outputs (`outputConfig`) available for a current Nova model; a model
card whose lifecycle dates match its status.
Actual:
  - Temperature: the Nova tool-definition page says "we recommend setting the temperature to 0" and its sample uses 0; the
    complete request schema page gives a valid range starting at 0.00001. It is not clear whether `temperature: 0` returns a
    `ValidationException`.
  - Structured outputs: the Bedrock structured-outputs feature (`outputConfig.textFormat`, strict tool use) exists, but the
    Nova Lite model card lists *Structured outputs* as "Not Supported". The schema has to be forced with tool use instead:
    `toolChoice: { tool: { name } }`, whose `inputSchema` top level is limited to `type`, `properties`, `required`.
  - Lifecycle: the Nova Lite v1 model card says "EOL no sooner than Dec 05, 2025"; on 2026-10-01 that date has passed and
    the model is still listed as Active. It is unclear whether to build on `amazon.nova-lite-v1:0` or Nova 2 Lite.
Severity: Low to Medium — no blocked work, but each point cost a separate doc-reading pass and left an open question for the
human (v1 or Nova 2 Lite). A wrong guess on temperature fails at runtime only.
Workaround: Forced tool use instead of `outputConfig`; the temperature is one constant in `client.ts` (0, or 0.00001 if the
spot check gets a `ValidationException`); the model id is an environment variable (default `us.amazon.nova-lite-v1:0`) and
the price constant `NOVA_LITE_USD_PER_M` is the only other value to change.
Suggestion: Align the tool-use page and the request-schema page on the temperature minimum; add a structured-outputs support
column to the model list; update the Nova Lite v1 card with a current EOL date or a successor note.
Environment: Platform: AWS (Amazon Bedrock). Amazon Bedrock Converse API, Nova Lite v1 (`us.amazon.nova-lite-v1:0`), us-east-1, docs read 2026-10-01.
Links:
  - Nova tool definition (temperature 0 recommendation): https://docs.aws.amazon.com/nova/latest/userguide/tool-use-definition.html
  - Nova complete request schema (temperature range): https://docs.aws.amazon.com/nova/latest/userguide/complete-request-schema.html
  - Nova structured output via tool choice: https://docs.aws.amazon.com/nova/latest/userguide/prompting-structured-output.html
  - Bedrock structured outputs: https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
  - Nova Lite model card: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html
  - `docs/plans/LING-002.md` §1, §11 and open question 1
