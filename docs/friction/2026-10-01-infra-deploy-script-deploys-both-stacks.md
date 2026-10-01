# infra deploy script deploys both stacks

Task attempted: Deploy only the media stack (`lingo-media-dev`, eu-central-1) for LING-001, without touching the Bedrock
stack that LING-002 owns.
Steps:
  1. `infra/bin/app.ts` defines two stacks: `lingo-media-dev` (eu-central-1) and `lingo-nova-dev` (us-east-1).
  2. `infra/package.json` has `"deploy": "cdk deploy --require-approval never"`.
  3. Run `pnpm --filter @lingo/infra deploy`.
Expected: The project's deploy script deploys the stack the ticket needs, or asks which one.
Actual: A bare `cdk deploy --require-approval never` in a multi-stack app targets every stack, so the script would deploy
both `lingo-media-dev` and `lingo-nova-dev` (two regions) with no approval prompt. Deploying only the media stack needs
the stack name plus `--exclusively` (so CDK does not pull in dependencies):
`cdk deploy lingo-media-dev --exclusively --require-approval never`. The CLI also printed a warning that 83 feature flags
were not configured in `cdk.json`.
Severity: Medium — caught before running; an unattended run would have created resources in a second region that belong to
another ticket. The feature-flag warning adds noise to every synth and deploy and gives no hint which flags matter.
Workaround: Deploy with the explicit stack name and `--exclusively`. Feature flags left at their defaults for now.
Suggestion: Project: split the script into `deploy:media` and `deploy:nova` with explicit stack names. CDK: require a stack
selector (or `--all`) when an app has more than one stack and `--require-approval never` is set; group the feature-flag
warning by impact so a new app knows which of the 83 to set.
Environment: macOS 26.2, Node 22.19.0, pnpm 9.15.9, aws-cdk CLI 2.1141.0, aws-cdk-lib 2.269.0.
Links:
  - `cdk deploy` options (stack selection, `--exclusively`, `--all`): https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-deploy.html
  - CDK feature flags: https://docs.aws.amazon.com/cdk/v2/guide/featureflags.html
  - `infra/package.json`, `infra/bin/app.ts`
