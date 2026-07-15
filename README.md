# Bluetape

Bluetape is a household coordination app for routines, one-off tasks, household
items, rules, and a shared shopping list. Records can reference items and rules
with wiki-style links.

## Stack

- React 19, TypeScript, Vite, and Tailwind CSS v4
- Convex for realtime data, file storage, HTTP endpoints, and password auth
- `react-i18next` with English and Burmese UI locales

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

## Project documentation

- [`DESIGN.md`](DESIGN.md) — visual and interaction design system
- [`docs/plans/PLAN.md`](docs/plans/PLAN.md) — product and implementation plan
- [`docs/adr/`](docs/adr/) — architecture decision records

## Secrets

Never commit `.env.local`, API keys, passwords, private keys, or production
deployment configuration. Variables prefixed with `VITE_` are public browser
configuration, not a safe place for secrets. Server-side secrets should be set
with the Convex environment-variable commands.
