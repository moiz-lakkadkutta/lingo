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
| Elastic IP 51.102.187.91 | allocation `$EIP_ALLOC` |
| Security group `lingo-api` (default VPC) | `$SG_ID` |
| Key pair (ED25519) | `lingo-api`, private key at `~/.ssh/lingo-api.pem` on the developer Mac only |
| AMI | `ami-044997d5724281990` (`ubuntu-noble-24.04-arm64-server-20261017`) |

Security group: TCP 80 and 443 (and UDP 443 for HTTP/3) from anywhere; TCP 22 from the developer's IP only (an /32, set on
2026-10-22). Postgres listens on 127.0.0.1 only and has no rule; ports 4000/4001 have no rule either (Caddy proxies to them).
No IAM role is attached: the APIs make no AWS call (media comes from CloudFront, receipts from the Amazon Appstore RVS).

## On the box

- Swap: 2 GB `/swapfile` (in `/etc/fstab`), `vm.swappiness=10`.
- Node 22 (NodeSource), pnpm 9.15.9, PostgreSQL 16 (Ubuntu), Caddy 2 (official apt repo).
- Code: `/opt/lingo/app`, a shallow clone owned by the system user `lingo`. Only `@lingo/api...` dependencies are installed.
  Since 2026-10-22 it runs branch `fix/api-trust-proxy` (PR #19, commit `1c8ee2d`: `trust proxy`, so the session-code miss limit
  counts each client, not Caddy) until that PR merges; see [Back to main](#back-to-main-after-pr-19-merges).
- The API runs from TypeScript through tsx (`node --import tsx src/index.ts`): `pnpm build` (`tsc`) emits extensionless ESM imports
  and `@lingo/contracts` points at `.ts` source, so the emitted JS does not run under plain Node. Each process uses about 130–140 MB.
- Env: `/etc/lingo/db.env` (`DATABASE_URL` with a random password for role `lingo`; only on the box), `/etc/lingo/iap.env`,
  `/etc/lingo/demo.env` (mode 640, root:lingo). Both: `NODE_ENV=production`, `CLOUDFRONT_DOMAIN=d15iq6m6ohqp4j.cloudfront.net`,
  `RVS_ENV=sandbox`, `LINGO_ALLOW_UNSAFE_PLUS=true` (on purpose: a sandbox RVS on a deploy; the API logs an `UNSAFE` warning at start).
  iap adds `LINGO_PLUS_MODE=iap`, `RVS_SHARED_SECRET=sandbox`, `PORT=4000`; demo adds `LINGO_PLUS_MODE=demo`, `PORT=4001`.
  **These env files are for judging only and must never be reused for production** (sandbox receipts pass, demo gives everyone Plus).
- systemd unit `lingo-api@.service` (copy in `infra/ec2/`): runs as `lingo`, `ProtectSystem=strict` with no writable path (the API
  writes nothing to disk; tsx caches in the private `/tmp`), plus `PrivateDevices`, `ProtectKernelTunables`, `ProtectControlGroups`,
  `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX` and an empty `CapabilityBoundingSet`. `systemd-analyze security` rates it 4.7 OK.
- Caddy (copy in `infra/ec2/Caddyfile`): API hosts are a plain `reverse_proxy` with no `trusted_proxies`, so Caddy drops a client's own
  `X-Forwarded-For` and sends the connecting address (https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults); the
  API trusts that header from loopback only. Phone hosts: `/_expo/static/*` files that exist get `Cache-Control: public,
  max-age=31536000, immutable` and a missing one is a 404; every other path serves the file or `index.html` with `no-cache`.
  Both phone hosts send `Strict-Transport-Security: max-age=31536000` and `X-Content-Type-Options: nosniff`.
- Static phone builds: `/srv/lingo/phone-iap` and `/srv/lingo/phone-demo`, owned `ubuntu:ubuntu` (mode 755), so `rsync` as `ubuntu` works.
- Data: the 12 published clips (with cues, highlights, quiz items) were copied from the developer's local database with
  `pg_dump --data-only` of `Clip`, `Cue`, `Highlight`, `QuizItem`; draft clips were deleted. No learner data was copied.
  `pnpm clips:import` was not used: it reads `packages/pipeline/work/`, which is not in git.

Two processes on one database: fine. pg-boss only creates its schema at start (no workers are registered). Learners, saved words and
session codes are rows, shared by both APIs: the same TV device id gets the same learner and session code on either API.
Socket.IO rooms and the code-miss rate limiter are in memory per process, so a TV and its phone must use the same API, which they do
because each phone page is built for one API.

Known limit: `POST /sessions` and the `x-device-id` learner upsert are unauthenticated and have no general rate limit (only wrong
session codes are limited, 20 a minute per client), so anyone can grow the database. Low risk for a few days of judging; watch disk
with `df -h /` and `sudo -u postgres psql lingo -c 'SELECT count(*) FROM "Learner"'`.

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

All four services are enabled and come back after a reboot (checked 2026-10-22 with `sudo reboot`, before the hardened unit and the
new Caddyfile; not re-run since). The previous unit and Caddyfile are at `/var/tmp/*.bak` on the box.

## Redeploy the API

```sh
ssh -i ~/.ssh/lingo-api.pem ubuntu@51.102.187.91
sudo -u lingo -H bash -c 'cd /opt/lingo/app && git pull --ff-only && CI=1 pnpm install --frozen-lockfile --filter @lingo/api... \
  && cd apps/api && set -a && . /etc/lingo/db.env && set +a && pnpm exec prisma generate && pnpm exec prisma migrate deploy'
sudo systemctl restart lingo-api@iap lingo-api@demo
```

How the box was moved to the fix branch (no dependency or schema change, so no install):

```sh
sudo -u lingo -H bash -c 'cd /opt/lingo/app \
  && git fetch --depth=1 origin fix/api-trust-proxy:refs/remotes/origin/fix/api-trust-proxy \
  && git checkout -B fix/api-trust-proxy origin/fix/api-trust-proxy'
sudo systemctl restart lingo-api@iap lingo-api@demo
```

### Back to main after PR #19 merges

```sh
sudo -u lingo -H bash -c 'cd /opt/lingo/app && git fetch --depth=1 origin main && git checkout main && git reset --hard origin/main \
  && git branch -D fix/api-trust-proxy && git log --oneline -1'
sudo systemctl restart lingo-api@iap lingo-api@demo
```

Then check `git log` shows the merge of #19 (or a later commit) and run the [Checks](#checks).

## Update the Caddyfile or the unit

```sh
scp -i ~/.ssh/lingo-api.pem infra/ec2/Caddyfile infra/ec2/lingo-api@.service ubuntu@51.102.187.91:/tmp/
# on the box
caddy validate --adapter caddyfile --config /tmp/Caddyfile && sudo install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
sudo install -m 644 /tmp/lingo-api@.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart lingo-api@iap lingo-api@demo
```

## Redeploy the phone web app (on the Mac)

The API URL is baked in at build time. Metro caches the bundle, so pass `--clear` or the second build keeps the first URL.

```sh
cd apps/phone
for m in iap demo; do
  out=$(mktemp -d)
  CI=1 EXPO_PUBLIC_API_URL=https://$m-51-102-187-91.sslip.io npx expo export -p web --clear --output-dir "$out"
  rsync -a --delete -e "ssh -i ~/.ssh/lingo-api.pem" "$out/" ubuntu@51.102.187.91:/srv/lingo/phone-$m/
  rm -rf "$out"
done
```

Caddy serves `index.html` for any unknown path, so `/join/<code>` loads the app, which joins by itself.

## Reload the clips

> **Warning: `TRUNCATE "Clip" CASCADE` deletes every learner's progress and saved words on both APIs (they share one database).
> Never run it during judging.** Learners and session codes stay, so paired TVs and phones still connect, but their word lists are empty.

On the Mac (the dump is wrapped so the load is one transaction; pg_dump empties `search_path`, hence `public."Clip"`):

```sh
f=$(mktemp)
{ echo 'TRUNCATE public."Clip" CASCADE;'
  pg_dump --data-only --no-owner -t '"Clip"' -t '"Cue"' -t '"Highlight"' -t '"QuizItem"' \
    postgresql://postgres:postgres@localhost:5432/lingo
  echo "DELETE FROM public.\"Clip\" WHERE status <> 'published';"; } > "$f"
scp -i ~/.ssh/lingo-api.pem "$f" ubuntu@51.102.187.91:/tmp/content.sql && rm "$f"
```

On the box:

```sh
sudo -u lingo bash -c 'set -a; . /etc/lingo/db.env; set +a
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/content.sql
  psql "$DATABASE_URL" -c "SELECT status, count(*) FROM public.\"Clip\" GROUP BY 1"'
sudo rm /tmp/content.sql
```

`--single-transaction` with `ON_ERROR_STOP` means a failed load leaves the old clips in place.

## Checks

```sh
H=51-102-187-91.sslip.io
curl -s https://iap-$H/health
curl -s "https://iap-$H/catalog?learning=de&level=B2" -H 'x-device-id: tv-check-1'
curl -s "https://iap-$H/socket.io/?EIO=4&transport=polling"         # 0{"sid":...,"upgrades":["websocket"]...}
curl -s https://iap-$H/iap/status -H 'x-device-id: tv-check-1'      # "plus":false
curl -s https://demo-$H/iap/status -H 'x-device-id: tv-check-1'     # "plus":true
for p in / /join/ABC123 /_expo/static/does-not-exist.js; do                # no-cache, no-cache, 404
  curl -sI https://phone-iap-$H$p | grep -iE '^HTTP|cache-control|strict-transport'; done
```

Per-client miss limit (on the box; 203.0.113.7 and 198.51.100.20 are documentation addresses, so no real client is blocked):

```sh
for i in $(seq 21); do curl -s -o /dev/null -w '%{http_code} ' 127.0.0.1:4001/me -H 'x-forwarded-for: 203.0.113.7' -H 'x-session-code: ABC10O'; done
curl -s 127.0.0.1:4001/me -H 'x-forwarded-for: 198.51.100.20' -H 'x-session-code: ABC10O'   # UNKNOWN_CODE, not RATE_LIMITED
sudo journalctl -u lingo-api@demo --since -1min -o cat | grep '"/me"' | grep -o '"clientIp":"[^"]*"' | sort | uniq -c
```

Results on 2026-10-22: both health checks `{"ok":true}`; 12 clips (6 de, 6 en) with poster and `manifestUrl` on
`d15iq6m6ohqp4j.cloudfront.net`; Socket.IO polling and WebSocket (101) through Caddy; a scripted TV + phone pair on each API got
`phone:connected` and `word:saved` about 200 ms after `POST /me/words`; both phone pages opened `/join/<code>` in a 412×915 browser
and showed "Connected to your TV" with no console errors; iap `plus:false`, demo `plus:true` for a fresh device.

Results after moving to PR #19 and the new Caddyfile and unit (2026-10-22): both health checks `{"ok":true}`; Socket.IO polling and
WebSocket 101 on both; scripted pair + word save on both (`word:saved` after 200 ms on iap, 184 ms on demo, over WebSocket); iap
`plus:false`, demo `plus:true`. Phone hosts: `/` and `/join/ABC123` 200 `no-cache`; `/_expo/static/does-not-exist.js` 404 with no
`Cache-Control`; the real hashed bundle 200 `public, max-age=31536000, immutable`; HSTS and `nosniff` on every response. Limiter:
client A got 404 ×20 then 429; client B then got 404 `UNKNOWN_CODE`; the logs show `clientIp` 203.0.113.7 (×21) and 198.51.100.20
with `remoteAddress` `::ffff:127.0.0.1`. A request from the Mac through Caddy with a forged `X-Forwarded-For: 203.0.113.7` got 404
`UNKNOWN_CODE` (not 429) and was logged with the Mac's own address: Caddy replaced the header.

## Cost

- t4g.small: listed as free-tier eligible for this account (`aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true`,
  2026-10-22). That is not $0: for accounts created on or after 15 July 2025, free-tier-eligible usage is paid from the account's
  free-plan credits, which it draws down, and is billed at the normal rate once they run out or the plan ends
  (https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html,
  https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier.html). The normal rate is about $0.0192/h in eu-central-1,
  about $14 a month. Unverified price; check the EC2 pricing page.
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

Check nothing is left (each should print nothing, or only `terminated` for the instance, which AWS lists for about an hour):

```sh
aws ec2 describe-addresses --query 'Addresses[].[PublicIp,AllocationId]' --output text
aws ec2 describe-volumes --filters Name=tag:Project,Values=lingo --query 'Volumes[].[VolumeId,State]' --output text
aws ec2 describe-snapshots --owner-ids self --query 'Snapshots[].[SnapshotId,Description]' --output text
aws ec2 describe-instances --filters Name=tag:Project,Values=lingo --query 'Reservations[].Instances[].[InstanceId,State.Name]' --output text
aws ec2 describe-security-groups --filters Name=group-name,Values=lingo-api --query 'SecurityGroups[].GroupId' --output text
```

The TV builds (`EXPO_PUBLIC_API_URL`) and the phone pages hard-code these sslip.io URLs: after tear-down those builds can't reach
an API until they are rebuilt against a new one.

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
- DescribeAddresses: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeAddresses.html
- DescribeVolumes: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeVolumes.html
- DescribeSnapshots: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeSnapshots.html
- DescribeInstances: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeInstances.html
- DescribeSecurityGroups: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeSecurityGroups.html
- ReleaseAddress: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_ReleaseAddress.html
- DeleteSecurityGroup: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DeleteSecurityGroup.html
- DeleteKeyPair: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DeleteKeyPair.html
- Ubuntu AMI id from SSM (`/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id`):
  https://documentation.ubuntu.com/aws/aws-how-to/instances/find-ubuntu-images/
