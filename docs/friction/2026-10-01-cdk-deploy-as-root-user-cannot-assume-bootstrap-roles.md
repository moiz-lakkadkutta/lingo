# CDK deploy as the root user cannot assume the bootstrap roles and proceeds anyway

Task attempted: Deploy the `lingo-media-dev` stack (S3 + CloudFront for HLS media, eu-central-1) from `infra/` with the
CDK CLI, using the only credentials configured on the dev machine: the AWS account root user's access keys.
Steps:
  1. `cdk bootstrap` for the account in eu-central-1 (creates the `cdk-hnb659fds-deploy-role-*` and
     `cdk-hnb659fds-file-publishing-role-*` roles).
  2. `pnpm --filter @lingo/infra exec cdk deploy lingo-media-dev --exclusively --require-approval never`.
Expected: The CLI assumes the bootstrap deploy role and the file-publishing role, as the modern bootstrap template intends,
and deploys through them.
Actual: The CLI cannot assume either role and prints a warning per role of the form "current credentials could not be used
to assume '<role arn>' … Proceeding anyway". It then publishes assets and calls CloudFormation directly with the root
credentials. The deploy succeeds, so the bootstrap roles (and any permission boundary or trust policy set on them) are
silently bypassed. AWS STS does not let the root user assume roles, so this path can never work with root keys.
Severity: Low — the deploy completes; no minutes lost to the deploy itself. The risk is hidden: a deploy that looks
correct locally runs with full account power, and the same command would behave differently for an IAM user or in CI.
Workaround: Accepted for the hackathon dev account. Planned fix: create an IAM user or IAM Identity Center profile with
`sts:AssumeRole` on `arn:aws:iam::<account>:role/cdk-hnb659fds-*` and deploy with that profile.
Suggestion: Make the CDK CLI fail (or require `--force`) when the caller is the root user instead of "Proceeding anyway",
and say in the message that root cannot assume roles and the bootstrap roles were skipped. The CDK bootstrapping guide
could name this case explicitly.
Environment: Platform: AWS (CDK, CloudFormation). macOS 26.2, Node 22.19.0, aws-cdk CLI 2.1141.0, aws-cdk-lib 2.269.0, regions eu-central-1 and us-east-1.
Links:
  - CDK bootstrapping (bootstrap roles): https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html
  - Root user best practices (do not use root for everyday tasks): https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html
  - Infra stacks: `infra/bin/app.ts`
