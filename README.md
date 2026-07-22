# Bluetape

Bluetape is a household coordination app for routines, one-off tasks, household
notes, rules, and a shared shopping list. Records can reference notes and rules
with wiki-style links.

## Stack

- React 19, TypeScript, Vite, and Tailwind CSS v4
- Convex for realtime data, file storage, HTTP endpoints, and password auth
- `react-i18next` with English, Burmese, and Indonesian UI locales

## Local development

Requirements: Node.js 20+ and a Convex account.

```sh
npm install
npx convex dev
npm run dev
```

`npx convex dev` selects or creates a development deployment and writes the
public connection settings to `.env.local`. That file is ignored by Git. See
[`.env.example`](.env.example) for the expected variable names.

The React client reads `VITE_CONVEX_URL` in `src/main.tsx`. Convex functions are
defined in `convex/`, and React components call their generated references with
`useQuery` and `useMutation`.

## Checks

```sh
npm run check:i18n
npm run build
npm run lint
```

## Versioning and releases

Pushes to `main` run Release Please. Conventional commits update an automated
release pull request with the next semantic version and `CHANGELOG.md`; merging
that pull request creates the matching Git tag and GitHub release. Use `feat:`
for minor releases, `fix:` for patch releases, and a breaking-change footer for
major releases.

## Project documentation

- [`DESIGN.md`](DESIGN.md) — visual and interaction design system
- [`docs/plans/PLAN.md`](docs/plans/PLAN.md) — product and implementation plan
- [`docs/translation.md`](docs/translation.md) — translation feature flag and operator guide
- [`docs/adr/`](docs/adr/) — architecture decision records

## Deploy with Convex and Cloudflare Pages

This setup deploys the Convex backend and Vite frontend together whenever the
production branch is pushed. It uses a production Convex deploy key stored as
an encrypted Cloudflare Pages environment variable.

### 1. Create the Convex project

After cloning the repository, install dependencies and connect it to a Convex
project:

```sh
npm install
npx convex dev
```

The command creates or selects the development deployment, pushes the backend,
and writes the public development connection values to `.env.local`.

### 2. Configure production authentication

Bluetape uses Convex Auth. Initialize its production keys from the project
directory:

```sh
npx @convex-dev/auth --prod
```

When prompted for the site URL, enter the final public URL, such as
`https://bluetape.example.com`. This configures the production `SITE_URL`,
`JWT_PRIVATE_KEY`, and `JWKS` values in Convex. If you initially use the
`pages.dev` address and add a custom domain later, rerun this command with the
custom-domain URL.

Configure Resend so new accounts can verify their email and existing users can
reset forgotten passwords. The sender must be verified in the Resend account
(the `onboarding@resend.dev` test sender can only deliver to the account owner):

```sh
npx convex env set AUTH_RESEND_KEY '<resend-api-key>' --prod
npx convex env set AUTH_EMAIL_FROM 'Bluetape <auth@your-domain.example>' --prod
```

Set the same variables without `--prod` on development deployments used to
exercise real email flows. Authentication codes are six digits and expire
after 15 minutes.

To enable Google sign-in, create an OAuth 2.0 **Web application** in Google
Cloud. Add this authorized redirect URI, using the production Convex site URL
rather than the Cloudflare Pages URL:

```text
https://<production-deployment>.convex.site/api/auth/callback/google
```

Then configure its client credentials on the production Convex deployment:

```sh
npx convex env set AUTH_GOOGLE_ID '<google-client-id>' --prod
npx convex env set AUTH_GOOGLE_SECRET '<google-client-secret>' --prod
```

For development, register the equivalent development deployment callback and
set the same variables without `--prod`. Google accounts with verified email
addresses can link to an existing verified password account with the same
email, so a household member does not receive two Bluetape identities.

Create a production deploy key for Cloudflare Pages:

```sh
npx convex deployment token create cloudflare-pages --deployment prod
```

Copy the printed key. Treat it as a secret; it grants deployment access to the
production Convex backend.

### 3. Create the Cloudflare Pages project

In the Cloudflare dashboard:

1. Open **Workers & Pages** and select **Create application**.
2. Choose **Pages** and **Connect to Git**.
3. Authorize the GitHub repository and select its production branch, normally
   `main`. For an organization, limit the Cloudflare GitHub App to only the
   repositories it needs.
4. Use these build settings:

   ```text
   Framework preset: None
   Build command: npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd "npm run build"
   Build output directory: dist
   Root directory: leave blank (repository root)
   ```

5. Under **Environment variables**, add `CONVEX_DEPLOY_KEY` and paste the
   production deploy key from the previous step.
6. Select **Save and Deploy**.

The build command deploys the Convex schema and functions, supplies the
production backend URL as `VITE_CONVEX_URL`, builds the React app, and publishes
`dist/`. Subsequent pushes to the production branch repeat this process.

### 4. Add a custom domain

Complete the first Pages deployment before attaching a domain. Then:

1. Open the Pages project and select **Custom domains**.
2. Select **Set up a domain**, enter the hostname, and activate it.
3. If Cloudflare manages the DNS zone in the same account, it can create the
   required record automatically. Otherwise, add this record at the DNS
   provider:

   ```text
   Type: CNAME
   Name: bluetape
   Target: <your-pages-project>.pages.dev
   ```

4. Wait for the custom domain and TLS certificate to become active.
5. If this hostname differs from the URL used during Convex Auth setup, rerun
   `npx @convex-dev/auth --prod` with the new URL.

Associate the hostname with the Pages project before manually adding its CNAME.
Adding only the DNS record is not enough for Pages to serve the domain. Apex
domains have additional nameserver requirements; see Cloudflare's custom-domain
guide.

Useful references:

- [Convex production deployments](https://docs.convex.dev/cli/reference/deploy)
- [Convex Auth production setup](https://labs.convex.dev/auth/production)
- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## License

Bluetape is available under the [MIT License](LICENSE).
