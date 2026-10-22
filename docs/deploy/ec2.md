# EC2 deploy runbook (judging server)

One always-on EC2 box runs two Lingo APIs on one Postgres database, plus the phone web app for each, so judges can use the Fire TV
app without the developer's laptop. Set up 2026-10-22. Config files in this repo: `infra/ec2/Caddyfile`, `infra/ec2/lingo-api@.service`.

## Hosts

| What | URL | Behind it |
|---|---|---|
| API, Plus via IAP (RVS sandbox) | https://iap-51-102-187-91.sslip.io | `lingo-api@iap`, port 4000 |
| API, Plus on for everyone | https://demo-51-102-187-91.sslip.io | `lingo-api@demo`, port 4001 |
| Phone web app for the iap API | https://phone-iap-51-102-187-91.sslip.io | `/srv/lingo/phone-iap` (static) |
| Phone web app for the demo API | https://phone-demo-51-102-187-91.sslip.io | `/srv/lingo/phone-demo` (static) |

The TV app picks its API at build time (`EXPO_PUBLIC_API_URL`), so a TV build points at one of the two API URLs. Each API's
`PHONE_URL` is its own phone host + `/join`, so the TV's pair QR (`POST /sessions` → `joinUrl`) opens the matching phone page.
sslip.io resolves `<name>-51-102-187-91.sslip.io` to 51.102.187.91; Caddy gets Let's Encrypt certificates for each host itself.

## Resources (eu-central-1, all tagged `Name=lingo-api`, `Project=lingo`)

| Resource | ID (real values: `infra/ec2-resources.local.md`, git-ignored, on the developer Mac) |
|---|---|
| Instance (t4g.small, arm64, Ubuntu 24.04, 20 GB gp3 encrypted, CPU credits standard) | `$INSTANCE_ID` |
| Elastic IP 51.102.187.91 | allocation `$EIP_ALLOC`, association `$EIP_ASSOC` |
| Security group `lingo-api` (default VPC) | `$SG_ID` |
| Key pair (ED25519) | `lingo-api`, private key at `~/.ssh/lingo-api.pem` on the developer Mac only |
| AMI | `ami-044997d5724281990` (`ubuntu-noble-24.04-arm64-server-20261017`) |

Security group: TCP 80 and 443 (and UDP 443 for HTTP/3) from anywhere; TCP 22 from the developer's IP only (an /32, set on
2026-10-22). Postgres listens on 127.0.0.1 only and has no rule; ports 4000/4001 have no rule either (Caddy proxies to them).
No IAM role is attached: the APIs make no AWS call (media comes from CloudFront, receipts from the Amazon Appstore RVS).

## On the box

- Swap: 2 GB `/swapfile` (in `/etc/fstab`), `vm.swappiness=10`.
- Node 22 (NodeSource), pnpm 9.15.9, PostgreSQL 16 (Ubuntu), Caddy 2 (official apt repo).
- Code: `/opt/lingo/app`, a shallow clone of `main` owned by the system user `lingo`. Only `@lingo/api...` dependencies are installed.
- The API runs from TypeScript through tsx (`node --import tsx src/index.ts`): `pnpm build` (`tsc`) emits extensionless ESM imports
  and `@lingo/contracts` points at `.ts` source, so the emitted JS does not run under plain Node. Each process uses about 130–140 MB.
- Env: `/etc/lingo/db.env` (`DATABASE_URL` with a random password for role `lingo`; only on the box), `/etc/lingo/iap.env`,
  `/etc/lingo/demo.env` (mode 640, root:lingo). Both: `NODE_ENV=production`, `CLOUDFRONT_DOMAIN=d15iq6m6ohqp4j.cloudfront.net`,
  `RVS_ENV=sandbox`, `LINGO_ALLOW_UNSAFE_PLUS=true` (on purpose: a sandbox RVS on a deploy; the API logs an `UNSAFE` warning at start).
  iap adds `LINGO_PLUS_MODE=iap`, `RVS_SHARED_SECRET=sandbox`, `PORT=4000`; demo adds `LINGO_PLUS_MODE=demo`, `PORT=4001`.
- Data: the 12 published clips (with cues, highlights, quiz items) were copied from the developer's local database with
  `pg_dump --data-only` of `Clip`, `Cue`, `Highlight`, `QuizItem`; draft clips were deleted. No learner data was copied.
  `pnpm clips:import` was not used: it reads `packages/pipeline/work/`, which is not in git.

Two processes on one database: fine. pg-boss only creates its schema at start (no workers are registered). Learners, saved words and
session codes are rows, shared by both APIs: the same TV device id gets the same learner and session code on either API.
Socket.IO rooms and the code-miss rate limiter are in memory per process, so a TV and its phone must use the same API, which they do
because each phone page is built for one API.

## SSH

```sh
ssh -i ~/.ssh/lingo-api.pem ubuntu@51.102.187.91
```

When the developer's IP changes, replace the SSH rule:

```sh
export AWS_REGION=eu-central-1
OLD=<previous-ip>/32; NEW=$(curl -s https://checkip.amazonaws.com)/32
aws ec2 revoke-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr $OLD
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr $NEW
```

## Status, logs, restart

```sh
systemctl status lingo-api@iap lingo-api@demo caddy postgresql
sudo journalctl -u lingo-api@iap -f          # or lingo-api@demo, caddy
sudo systemctl restart lingo-api@iap lingo-api@demo
sudo systemctl reload caddy                   # after editing /etc/caddy/Caddyfile
```

All four services are enabled and come back after a reboot (checked 2026-10-22 with `sudo reboot`).

## Redeploy the API

```sh
ssh -i ~/.ssh/lingo-api.pem ubuntu@51.102.187.91
sudo -u lingo -H bash -c 'cd /opt/lingo/app && git pull --ff-only && CI=1 pnpm install --frozen-lockfile --filter @lingo/api... \
  && cd apps/api && set -a && . /etc/lingo/db.env && set +a && pnpm exec prisma generate && pnpm exec prisma migrate deploy'
sudo systemctl restart lingo-api@iap lingo-api@demo
```

## Redeploy the phone web app (on the Mac)

The API URL is baked in at build time. Metro caches the bundle, so pass `--clear` or the second build keeps the first URL.

```sh
cd apps/phone
for m in iap demo; do
  CI=1 EXPO_PUBLIC_API_URL=https://$m-51-102-187-91.sslip.io npx expo export -p web --clear --output-dir /tmp/phone-$m
  rsync -a --delete -e "ssh -i ~/.ssh/lingo-api.pem" /tmp/phone-$m/ ubuntu@51.102.187.91:/srv/lingo/phone-$m/
done
```

Caddy serves `index.html` for any unknown path, so `/join/<code>` loads the app, which joins by itself.

## Reload the clips

```sh
pg_dump --data-only --no-owner -t '"Clip"' -t '"Cue"' -t '"Highlight"' -t '"QuizItem"' \
  postgresql://postgres:postgres@localhost:5432/lingo > /tmp/content.sql
scp -i ~/.ssh/lingo-api.pem /tmp/content.sql ubuntu@51.102.187.91:/tmp/
# on the box, as lingo with db.env loaded: empty the four tables first (TRUNCATE "Clip" CASCADE also clears progress and saved words),
# then psql "$DATABASE_URL" -f /tmp/content.sql and DELETE FROM "Clip" WHERE status <> 'published'
```

## Checks

```sh
H=51-102-187-91.sslip.io
curl -s https://iap-$H/health
curl -s "https://iap-$H/catalog?learning=de&level=B2" -H 'x-device-id: tv-check-1'
curl -s "https://iap-$H/socket.io/?EIO=4&transport=polling"         # 0{"sid":...,"upgrades":["websocket"]...}
curl -s https://iap-$H/iap/status -H 'x-device-id: tv-check-1'      # "plus":false
curl -s https://demo-$H/iap/status -H 'x-device-id: tv-check-1'     # "plus":true
```

Results on 2026-10-22: both health checks `{"ok":true}`; 12 clips (6 de, 6 en) with poster and `manifestUrl` on
`d15iq6m6ohqp4j.cloudfront.net`; Socket.IO polling and WebSocket (101) through Caddy; a scripted TV + phone pair on each API got
`phone:connected` and `word:saved` about 200 ms after `POST /me/words`; both phone pages opened `/join/<code>` in a 412×915 browser
and showed "Connected to your TV" with no console errors; iap `plus:false`, demo `plus:true` for a fresh device.

## Cost

- t4g.small: listed as free-tier eligible for this account (`aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true`,
  2026-10-22); otherwise about $0.0192/h in eu-central-1, about $14 a month. Unverified price; check the EC2 pricing page.
- Public IPv4 (the Elastic IP): $0.005/h whether attached or not, about $3.60 a month (https://aws.amazon.com/vpc/pricing/).
- EBS 20 GB gp3: within the 30 GB free tier, else about $1.90 a month. Unverified price.
- CPU credits are `standard`, so a busy box slows down instead of billing surplus credits.

## Tear down (after judging)

```sh
export AWS_REGION=eu-central-1
aws ec2 terminate-instances --instance-ids $INSTANCE_ID
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID
aws ec2 release-address --allocation-id $EIP_ALLOC    # the EIP bills until released
aws ec2 delete-security-group --group-id $SG_ID
aws ec2 delete-key-pair --key-name lingo-api && rm ~/.ssh/lingo-api.pem
```

The volume is deleted with the instance (`DeleteOnTermination=true`). Learner data on the box goes with it.

## AWS APIs used (docs)

- RunInstances: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_RunInstances.html
- DescribeInstanceTypes (free-tier filter): https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeInstanceTypes.html
- CreateKeyPair (`--key-type ed25519`): https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateKeyPair.html
- CreateSecurityGroup: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateSecurityGroup.html
- AuthorizeSecurityGroupIngress: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_AuthorizeSecurityGroupIngress.html
- RevokeSecurityGroupIngress: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_RevokeSecurityGroupIngress.html
- AllocateAddress: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_AllocateAddress.html
- AssociateAddress: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_AssociateAddress.html
- Elastic IP addresses: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html
- TerminateInstances: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_TerminateInstances.html
- ReleaseAddress: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_ReleaseAddress.html
- DeleteSecurityGroup: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DeleteSecurityGroup.html
- DeleteKeyPair: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DeleteKeyPair.html
- Ubuntu AMI id from SSM (`/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id`):
  https://documentation.ubuntu.com/aws/aws-how-to/instances/find-ubuntu-images/
