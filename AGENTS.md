<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# agents.md

Operating rules for AI agents (and human contributors) working in this repo.

## Project Context

Bluetape is a household coordination web app — household users in Singapore coordinate routines, one-off tasks, household notes (with optional photos + local-language names), rules, and a shared shopping list. Everything is interconnected by wiki-style `[[links]]`.

- **Stack:** React 19 + Vite + TypeScript (frontend), Convex (backend / DB / realtime / file storage / auth), Tailwind CSS v4, `react-i18next`, `markdown-it` with a custom `[[wiki link]]` plugin.
- **Hosting:** Convex deployment + Cloudflare Pages, auto-deploy on push to `main` via GitHub integration.
- **Reference timezone:** Asia/Singapore (client-computed "today", sent to Convex as `YYYY-MM-DD`; instants stored as Unix timestamps UTC).
- **Auth:** per-user accounts (admin + user) via `@convex-dev/auth` password provider. App-level profile fields (locale, timezone, displayName) live in `userProfiles`; roles live in `familyMembers` — never modify the auth provider's `users` table.
- **The two source-of-truth docs are `DESIGN.md` and `docs/plans/PLAN.md`. Read both before making changes.**

## Planning

- When planning work, organize it in phases (as `docs/plans/PLAN.md` already does — Phase 0 through Phase 4).
- Do not organize plans by days, weeks, or other time-based buckets unless the user explicitly asks for that format.
- The top-level plan lives at `docs/plans/PLAN.md`. Per-phase or per-feature implementation plans also go in `docs/plans/`.
- Store major architecture decisions in `docs/adr/` (Architecture Decision Records), one Markdown file per decision. The decisions already captured in `docs/plans/PLAN.md` §10 (Resolved Decisions) should be the first ADRs if we backfill.
- When a decision in `docs/plans/PLAN.md` §10 changes, update the plan in place rather than leaving a stale record scattered elsewhere.

## Dependency Management

- Never edit dependency manifest files directly to add, remove, or change packages.
- For JavaScript or TypeScript projects, always use the repo's package manager commands. This repo uses **npm** (`npm install <package>`, `npm install -D <package>`, `npm uninstall <package>`).
- Do not hand-edit `package.json` or `package-lock.json` for dependency installation work unless the user explicitly asks for manual edits.
- This avoids stale version guesses and mismatches with the active package registry or toolchain.
- **Frontend**: Do NOT modify `package.json` or `package-lock.json` directly. Always use `npm install <package>`.

## Git Safety

- Never revert or overwrite user changes you did not make unless explicitly asked.
- Never use destructive git commands (`git push --force`, `git reset --hard` to a remote ref, `git clean -fd`, etc.) unless explicitly asked.
- Do not commit unless the user asks for a commit.
- Do not amend commits unless the user explicitly asks for it.
- When committing, use [Conventional Commits](https://www.conventionalcommits.org/) so release-please can determine the release type and generate release notes. Use `feat:` for user-facing features (minor release), `fix:` for bug fixes (patch release), and add `!` or a `BREAKING CHANGE:` footer for breaking changes (major release). Use an appropriate scope when it adds clarity, e.g. `fix(shopping): preserve pending items`.

## Design System

- UI and visual design rules live in [DESIGN.md](DESIGN.md) (repo root).
- Treat `DESIGN.md` as the source of truth for colors, typography, layout, components, states, and interaction patterns.
- `DESIGN.md` follows the `design.md` spec format (YAML frontmatter tokens + Markdown prose sections). The tokens in the frontmatter are normative; the prose provides application guidance.
- Tailwind v4 theme tokens are derived from `DESIGN.md` — when a token changes, update `DESIGN.md` first, then regenerate the Tailwind theme, not the other way around.
- Hard rules from `DESIGN.md` that are easy to violate by reflex: no nested containers (no card-in-card), orange/blue accent restrained to ≤8% of any screen, white reserved for overlays only (search bar, command palette, modals, dropdowns), warm-shifted grays (never cool `#7C838B`/`#B2B7BE`), radii ≤20px on normal cards.

## Core Rules

- Build as if the project is an MVP, proof of concept, or new product that still needs production-grade fundamentals.
- Prefer approaches that are common in real production systems over hobby-project shortcuts.
- Production-ready does not mean enterprise-heavy. Choose the simplest design that is still credible in a real production system.
- Prefer small, production-ready changes that are easy to remove or replace later.
- Keep code loosely coupled so features can be changed or deleted without wide rewrites.
- Do not over-engineer, but do not choose designs that make future expansion unnecessarily difficult.
- Implement code in a way that is extractable and reusable across projects when there is a natural boundary for reuse.
- Avoid god functions, oversized classes, and tightly bound modules.
- Keep functions lean and focused on one responsibility.
- Before launch, do not preserve backward compatibility unless there is a concrete need, such as persisted data, shipped behavior, external consumers, or an explicit user requirement.
- Prefer improving the design directly over carrying temporary compatibility layers for unshipped code.
- Do not ship placeholders, mock integrations, fake implementations, or hard-coded data unless the user explicitly asks for them.
- Match existing repo patterns unless there is a clear reason to improve them.

## Bluetape-specific Hard Rules

These come from `PLAN.md` and are non-negotiable for V1. Violating them undoes decisions the user explicitly made.

- **Permissions are enforced in Convex mutations, not just the UI.** Check `ctx.auth.getUserIdentity()` → `userProfiles.role` before every write. UI hides controls per role via `RoleGate`, but the server is the real gate.
- **Delete is limited to rules and routines (admin/owner), one-off tasks (creator/admin/owner), and shopping rows (creator/admin/owner), all hard delete.** Deleting a routine also deletes its completion history. Household note pages persist. Bought shopping rows normally leave the active list by date/status query.
- **One-off task titles and notes are editable by admins/owners**, while completion can toggle between `pending` and `done` for any family member. Due dates remain fixed after creation. The creator or a family admin/owner can hard-delete a task.
- **Rules are admin-only full CRUD.** User is view-only.
- **Notes: anyone can create, admin-only edits, no delete in V1.** Notes remain stored as `pages.type === "item"` internally. User-created notes go live immediately (no review queue).
- **Shopping: pending items stay until bought.** No daily reset or carry-over. Bought rows remain visible through the current Singapore day. The row creator or an admin/owner may delete.
- **Wiki links are a feature, not the product.** No Pages index, no browse-all surface, no graph view in V1. Pages are reached by `[[link]]` or by Search (modal command palette). The user's daily surface is Today.
- **i18n by default for UI strings** — every component renders text through `react-i18next`'s `t()`. No hard-coded English in components, even though V1 ships only `en.json`.
- **"Today" is client-computed in Asia/Singapore.** Pass `YYYY-MM-DD` to Convex queries; never let Convex decide what "today" means in UTC.
- **Follow the official Convex + React integration pattern** (https://docs.convex.dev/quickstart/react): `ConvexProvider` + `ConvexReactClient` in `src/main.tsx`, schema + queries in `convex/`, `useQuery`/`useMutation` in components. File storage uploads use the 3-step `generateUpload URL → POST → save storageId` flow.
