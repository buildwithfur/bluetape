---
name: bluetape-deploy-previews
description: Use when deploying Bluetape, creating or reviewing Cloudflare Pages branch previews, changing Convex deployment targets, or diagnosing a Pages build. Keeps previews on the shared Convex dev deployment and production on its separate production deployment.
license: MIT
compatibility: Requires npm, Convex CLI access, Wrangler/Cloudflare Pages access, and GitHub CLI access for deployment-status checks.
metadata:
  author: Bluetape
  tags: [bluetape, cloudflare-pages, convex, deployment, preview]
---

# Bluetape Deployments and Previews

## Purpose

Bluetape is a React/Vite frontend hosted on **Cloudflare Pages** with a Convex backend. Its deployment policy is deliberately simple:

| Surface | Git source | Convex target | Data scope |
| --- | --- | --- | --- |
| Production | `main` | production deployment | real household data |
| Cloudflare Pages preview branches | any non-`main` branch | shared Convex `dev` deployment | shared development data |

This is **not** one isolated Convex backend per branch. Preview deployments are safe from production, but previews share the same dev schema, functions, users, and data with each other.

## When to Use

Use this skill when you need to:

- push a Bluetape feature branch and obtain its Pages preview URL;
- verify that a preview is using Convex dev rather than production;
- diagnose a Cloudflare Pages Git build;
- change the Pages deployment configuration or Convex target;
- deploy a one-off recovery preview after an automatic Git build fails.

Do not use this skill for normal frontend or Convex feature work. First follow [`AGENTS.md`](../../../AGENTS.md), read [`DESIGN.md`](../../../DESIGN.md) and [`docs/plans/PLAN.md`](../../../docs/plans/PLAN.md), and for any Convex code read [`convex/_generated/ai/guidelines.md`](../../../convex/_generated/ai/guidelines.md).

## Architecture and Required Configuration

### Cloudflare Pages project

- Project name: `bluetape`
- Production branch: `main`
- Pages is Git-integrated; a push to `main` produces production, while a non-`main` push produces a branch preview.
- The Pages build command is:

```sh
npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd "npm run build"
```

`convex deploy` pushes the Convex code first, supplies the target deployment URL as `VITE_CONVEX_URL` to `npm run build`, and Pages publishes `dist/`.

### Environment separation

Cloudflare Pages has separate **Production** and **Preview** environment-variable scopes:

- **Production** `CONVEX_DEPLOY_KEY` targets the production Convex deployment.
- **Preview** `CONVEX_DEPLOY_KEY` targets Bluetape's shared Convex **dev** deployment.

Never copy the production key into Preview or hard-code a production `VITE_CONVEX_URL` to make a preview build pass. That turns an apparently safe branch preview into a production-data client.

Do not use `wrangler pages secret put` to change this setup: it cannot select the Pages Preview scope. Use the Cloudflare dashboard or the Pages project API to update only `deployment_configs.preview.env_vars.CONVEX_DEPLOY_KEY`, and store it as `secret_text`.

## Standard Branch Preview Workflow

1. Work on a non-`main` branch. Do not commit or push unless the requester asked for it.
2. Validate before pushing:

```sh
npm run build
npm run check:i18n
npm run lint
```

3. Push the branch. Git-integrated Pages starts a Preview deployment automatically.
4. Check the deployment and its Git status. Do not trust a new Pages URL until the build is confirmed successful:

```sh
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  wrangler pages deployment list --project-name bluetape

gh api "repos/buildwithfur/bluetape/commits/$(git rev-parse HEAD)/check-runs" \
  --jq '.check_runs[] | select(.name == "Cloudflare Pages") | [.status, .conclusion, .details_url] | @tsv'
```

5. From the Pages deployment list, share both URLs:
   - **Stable branch alias:** `https://<branch>.bluetape-6xq.pages.dev` — follows the latest successful deployment for that branch.
   - **Immutable deployment URL:** `https://<deployment-id>.bluetape-6xq.pages.dev` — permanently identifies one deployed artifact.

6. Verify both return the app before sharing:

```sh
for url in \
  "https://<deployment-id>.bluetape-6xq.pages.dev" \
  "https://<branch>.bluetape-6xq.pages.dev"; do
  printf '%s ' "$url"
  curl -sS -L -o /dev/null -w '%{http_code}\n' --max-time 30 "$url"
done
```

## Verify the Convex Target in a Preview

A `200` only proves Pages served static files. Confirm the deployed JavaScript is wired to dev, not production:

```sh
export DEPLOYMENT_URL="https://<deployment-id>.bluetape-6xq.pages.dev"

python3 - <<'PY'
import re
import subprocess
import os
from pathlib import Path

base = os.environ["DEPLOYMENT_URL"]
env = dict(
    line.split("=", 1)
    for line in Path(".env.local").read_text().splitlines()
    if line and not line.startswith("#") and "=" in line
)
expected = env["VITE_CONVEX_URL"]
html = subprocess.check_output(["curl", "-fsSL", "--max-time", "45", base], text=True)
script, = re.findall(r'src="([^\"]+\.js)"', html)
js = subprocess.check_output(
    ["curl", "-fsSL", "--max-time", "45", base + script], text=True
)
assert expected in js, f"Preview bundle does not use expected dev endpoint: {expected}"
print(f"Deployed bundle uses Convex dev: {expected}")
PY
```

For a local reference to the currently selected dev deployment:

```sh
# Public endpoint only; never print CONVEX_DEPLOY_KEY.
python3 - <<'PY'
from pathlib import Path
for line in Path(".env.local").read_text().splitlines():
    if line.startswith("VITE_CONVEX_URL="):
        print(line)
        break
PY
```

A preview may create or change **dev** data. Use test accounts and test household records; never test writes against production through a preview.

## Failed Git Preview Build

A Pages deployment can initially appear in a list and later fail. Treat a failed GitHub `Cloudflare Pages` check or a `404` deployment URL as failure.

First diagnose these in order:

1. Confirm the branch is not `main` and the Git check is complete.
2. Confirm the Pages **Preview** scope—not merely Production—has `CONVEX_DEPLOY_KEY`.
3. Confirm the Preview key is valid and scoped to Bluetape's shared Convex `dev` deployment.
4. Read the Pages build log. Do not replace a failing preview with a production-backed static deploy.
5. After fixing configuration, create a new branch commit or use the Pages dashboard to retry, then re-run the standard verification steps.

## One-Off Recovery Preview

Use a direct Pages deployment only when Git preview is blocked and the requester explicitly needs a temporary preview. Build it with the **dev** endpoint, attach the branch/commit metadata, and verify both URLs:

```sh
# Vite reads the dev endpoint from ignored .env.local.
npm run build

CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  wrangler pages deploy dist \
  --project-name bluetape \
  --branch "$(git branch --show-current)" \
  --commit-hash "$(git rev-parse HEAD)" \
  --commit-message "$(git log -1 --format=%s)"
```

Do not make direct deployment the normal path; Git previews are the source of truth for branch builds.

## Common Pitfalls

1. **Using production Convex for a preview.** The UI appears to work but can mutate real household data. Preview must use the shared dev deploy key.
2. **Configuring a key only in Production.** Non-`main` Pages builds fail because Preview has a separate environment-variable scope.
3. **Treating an initial Pages URL as success.** Check the eventual Pages/Git build status and HTTP response.
4. **Assuming branch previews are independent databases.** They all share dev data. Coordinate destructive schema or test-data changes.
5. **Exposing `CONVEX_DEPLOY_KEY`.** Never print it, put it in source, commit `.env.local`, or paste it into logs.
6. **Pushing an arbitrary empty commit.** Only do this to retrigger Pages after a configuration repair; label it clearly as a preview trigger.

## Completion Checklist

- [ ] The change passed build, lint, and i18n checks relevant to its scope.
- [ ] Branch preview is **Git-built**, not merely an old direct deployment.
- [ ] Cloudflare Pages check concluded `success`.
- [ ] Stable and immutable preview URLs return HTTP 200.
- [ ] Deployed bundle uses Convex dev, not production.
- [ ] Shared-dev-data caveat is stated to the reviewer if the preview permits writes.
