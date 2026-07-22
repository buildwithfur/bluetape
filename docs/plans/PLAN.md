# Bluetape — Build Plan

A household coordination app. A user opens it each morning on their phone to see what to do today; an admin manages routines, notes, and rules. Everything is interconnected by wiki-style `[[links]]`.

---

## 1. Product Scope

### Users
| Person | Primary use |
|---|---|
| **User** (primary) | Opens "Today" daily, marks routines/tasks done, references household notes by photo + local-language name, adds shopping items + one-off tasks |
| **Employer** (secondary) | Creates routines, notes, rules; adds tasks; reviews progress; edits rules + notes |

Each person has **their own login + password** (per-user accounts via `@convex-dev/auth`), with a family role (`admin` or `user`) stored in `familyMembers`. Enables truthful "added by" attribution + permission enforcement. See §6.11.

### V1 Features
1. **Today dashboard** — flat unified checklist of routines due today + one-off tasks due today, check-off
2. **Routines** — daily / weekly / monthly recurrence; each links to a wiki page. User view-only; future-dated tasks show in an "Upcoming" section here
3. **Tasks** — one-off todos; anyone can add and toggle done/not done; admin/owner title-note editing; creator/admin/owner delete
4. **Household notes** — wiki pages with title and optional photo; anyone can add, admin-only edits, no delete in V1. Stored internally as `pages.type === "item"` for schema compatibility.
5. **Rules** — wiki notes (e.g. "don't use kitchen cloth on toilets"); **admin-only add/edit/delete**; pinned rules surface on Today
6. **Wiki links** — `[[Record Name]]` syntax works everywhere content is edited, including recipe ingredients and steps. Notes, rules, and recipes are valid reference targets (a *feature*, not a wiki-app index).
7. **Shopping** — shared realtime list (its own tab); both users can add; pending items stay until bought; bought items remain checked for the current Singapore day, then leave the active view while remaining in history; creator/admin/owner delete
8. **i18n by default** — all UI strings use `react-i18next` with English, Indonesian, and Burmese locale files. User content uses an operator-gated, on-demand translation cache: authored text stays authoritative, visible supported fields translate into the viewer's profile locale, and failures fall back to source. Tasks are the first merged entity; PER-3 adds recipe title, ingredients, and steps.
9. **Auth** — per-user accounts, per-user password; truthful "added by"
10. **Recipes** — both roles can import a public TikTok, Instagram, YouTube, or website URL; Bluetape extracts structured ingredients + steps, preserves the source, and saves the result after review. Recipes have their own mobile tab and stable detail routes. See `docs/plans/2026-07-22-recipe-import-uiux-plan.md`.

### Explicitly out of V1
- Automatic user-content translation for routines, shopping, notes, and rules; expand only after task and recipe quality is accepted
- Additional UI/content locales beyond the currently supported set
- Barcode scanning for items/groceries
- Audio pronunciation for local-language content
- Delete for household note pages. Rules and routines can be deleted by admins/owners; deleting a routine also deletes its completion history. One-off tasks and shopping rows can be deleted by their creator or a family admin/owner.
- A browsing "Pages index" / recent-changes / orphan-page / graph views. **Wiki-style links are a feature inside the app, not the app itself.** Pages are reached by link or by search, not by browsing an index.
- Inventory/stock tracking (groceries = shopping list only)

### V2 candidates
- Controlled user-content translation expansion to routines, shopping, notes, and rules
- Additional reviewed UI/content locales
- Bidirectional backlinks / link graph view
- Recipe ingredients → Shopping list generation
- Item inventory + low-stock alerts
- Delete/archive flows for items + tasks

---

## 2. Tech Stack

- **Frontend:** React 19 + Vite
- **Backend / DB / realtime / file storage:** Convex
- **Auth:** `@convex-dev/auth` with the password provider (per-user accounts, scrypt-hashed)
- **Hosting / CI:** Convex deployment + Cloudflare Pages, auto-deploy on push to `main` via GitHub integration
- **Recipe media processing:** a Dockerized Python worker on Railway in the Indiego Lab workspace; Convex remains the durable job queue and system of record. See `docs/adr/002-external-recipe-media-worker.md`.
- **i18n:** `react-i18next` + `i18next` with English, Indonesian, and Burmese locale files. Locale resolves from the per-account profile, then browser language, then English fallback. Supported user-content fields use the operator-gated lazy `contentTranslations` cache.
- **Styling:** Tailwind CSS v4, tokens derived from `DESIGN.md`
- **Markdown + wiki links:** `markdown-it` with a custom `[[wiki link]]` plugin
- **Icons:** `@phosphor-icons/react` at `strokeWidth: 1.75`
- **Fonts:** Satoshi (Fontshare), JetBrains Mono, Noto Sans
- **Language:** TypeScript throughout

**Why Convex:** the realtime DB means a user marking a task done instantly reflects on the admin's view; file storage handles item photos without a separate bucket; per-user password auth is built in. No server to run.

**Why Tailwind v4 + `DESIGN.md` tokens:** the design spec already defines CSS variables; we map them into Tailwind's `@theme` block so components use `bg-surface text-ink` etc.

---

## 3. Data Model (Convex schema)

Single source of truth: `convex/schema.ts`. All tables use Convex IDs.

### `pages` — the universal wiki entity
```ts
{
  title: string,           // "Toilet Detergent" — also the [[link target]]
  slug: string,            // "toilet-detergent" — URL + mutation-enforced uniqueness
  type: "item" | "rule",
  content: string,         // markdown body (English) with [[wiki links]]
  // type-specific metadata (only relevant fields populated)
  localName?: string,     // items only — local-language name
  localContent?: string,  // optional markdown body in the user's preferred language
  location?: string,       // items only (e.g. "Kitchen Cabinet 3")
  photoId?: Id<"_storage">, // items only — Convex file storage ref
  pinnedToToday?: boolean,  // rules only — surfaces as a callout on Today
  createdBy: Id<"users">,
  updatedBy: Id<"users">,
  updatedAt: number,
}
```
**Indexes:** `slug` (for lookup), `title` (for link resolution), `by_type` (`type, updatedAt`), `pinned_rules` (`type, pinnedToToday` where type="rule"). Slug uniqueness is enforced in mutations by checking the indexed lookup before insert/update.

**i18n note:** `content` + `localContent` remain the manual page-translation pattern. Generated task and recipe translations live in the separate on-demand `contentTranslations` cache; authored fields remain authoritative and are never overwritten. Page-body translation is deferred until Markdown can be segmented and reconstructed safely.

### `links` — outbound wiki links from a page (for backlinks)
```ts
{
  sourcePageId: Id<"pages">,
  targetTitle: string,     // raw [[target]] text — resolved at render
  targetPageId?: Id<"pages">, // set if target exists
}
```
Rebuilt on every page save: delete all `links` where `sourcePageId === page`, parse content for `[[...]]`, insert fresh. Index `targetTitle` (for backlink lookups).

### `routines` — scheduled recurring work
```ts
{
  title: string,
  description?: string,   // short note
  frequency: "daily" | "weekly" | "monthly",
  dayOfWeek?: number,     // 0–6 (weekly only)
  dayOfMonth?: number,    // 1–31 (monthly only)
  pageId?: Id<"pages">,   // optional linked wiki page (the "details" target)
  sortOrder: number,      // within a frequency group
  isActive: boolean,
  createdBy: Id<"users">,
}
```
Index `isActive, frequency`.

### `tasks` — one-off todos (admin/owner title-note editing; creator/admin/owner hard delete)
```ts
{
  title: string,
  note?: string,
  status: "pending" | "done",
  dueDate?: string,       // ISO date "YYYY-MM-DD" (optional)
  createdBy: Id<"users">,
  completedAt?: number,
  createdAt: number,
}
```
Index `status, dueDate`.

**Lifecycle:** admins/owners can edit the title/note; any family member can toggle completion between `pending` and `done`. Toggling back clears `completedAt`. Due dates remain fixed after creation. The task creator or a family admin/owner can hard-delete a one-off task. Tasks with no `dueDate` or `dueDate === today` surface on Today; future-dated tasks live in the "Upcoming" section on the Routines screen (§6.4) until their date arrives.

### `groceryItems` — simple shopping list (no daily reset)
```ts
{
  name: string,
  count?: number,          // defaults to 1; optional during legacy-row migration
  quantity?: string,       // legacy free-text field; no longer written by the app
  status: "pending" | "bought",
  addedBy: Id<"users">,
  boughtAt?: number,      // Unix timestamp; set when marked bought
  boughtBy?: Id<"users">,
  createdAt: number,
}
```
Index `status, createdAt` (drives "show pending list" + "history").

**Simple lifecycle:**
- The Shopping screen shows pending rows plus rows bought on the current Singapore calendar date. No daily reset or carry-over job.
- Pending items **stay on the list until bought**, regardless of which day they were added or how long they've been there.
- Marking bought → `status` flips to `"bought"`, the row remains checked through the day and leaves the active view after the Singapore date changes; history is preserved.
- **No delete in V1.** Bought rows persist indefinitely. History grows; V2 adds archive/purge.

*Killed from earlier draft:* the `date` field, the per-day carry-over cron job, the date-filter gymnastics. The user's mental model is simpler than that — "if we didn't buy it, it stays on the list."

### `routineCompletions` — per-day completion log
```ts
{
  routineId: Id<"routines">,
  date: string,           // "YYYY-MM-DD" — the day it was marked done
  completedBy: Id<"users">,
}
```
Composite index `routineId, date`. This powers "show today's routines" vs "show today's *done* routines" without mutating the recurring routine row. One completion per routine/day is enforced in mutations by checking this indexed lookup before insert.

**Why a completions table instead of a `done` boolean on routines:** a daily routine resets every morning. We need history ("did she do it on Tuesday?") and today's state without overwriting yesterday's.

### `userProfiles` — app-level fields parallel to auth users
```ts
{
  userId: Id<"users">,        // matches the @convex-dev/auth user ID
  displayName: string,       // used for "added by" attribution
  locale: string,            // persisted UI locale selected in Settings
  timezone: "Asia/Singapore", // V1 hard-coded; field exists for V2 per-user override
}
```
Index `userId`; one profile per auth user is enforced in mutations by checking this indexed lookup before insert.

**Why parallel to auth users and not on the `users` table:** `@convex-dev/auth` owns the `users` table schema; we don't want to fight it on updates. A parallel table keyed by the same user ID lets us add app fields (role, locale, timezone, displayName) without touching auth internals. Created on first login if missing.

---

## 4. Time & Timezone Discipline

The reference timezone for V1 is **Asia/Singapore**. The model:

- **Instants** (`createdAt`, `updatedAt`, `completedAt`, `boughtAt`) → stored as **Unix timestamps (ms since epoch, UTC)** as numbers. Universal, sortable, no ambiguity.
- **Calendar dates** (routine due day, task due date, routine completion "for which day") → stored as **ISO date strings `"YYYY-MM-DD"`**, not timestamps. "Today" is a calendar concept, not an instant.
- **"Today" is computed on the client in Asia/Singapore**, then the date string is sent to Convex queries. This avoids the midnight-UTC bug (a routine completed at 11:55pm SG belonging to the wrong UTC day). Convex never decides what "today" means in UTC.
- **UI formatting**: all instants render to SG time via `Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', ... })`. Mono labels ("Tue · 7 Jul", "Updated 2 Jul") use this.
- **Admin's locale** is the app default. If a user travels, we add a per-user timezone setting later; V1 hard-codes SG.

This is standard timestamp-vs-date discipline. The non-obvious part is computing "today" client-side rather than server-side.

---

## 5. "Today" + "Shopping" + "Upcoming" computation

### 5.1 Today computation

A Convex query `today:list` returns the dashboard for a given date `YYYY-MM-DD`:

1. **Routines due today:**
   - `daily` → always due
   - `weekly` → due if `dayOfWeek === today.getDay()`
   - `monthly` → due if `dayOfMonth === today.getDate()`
   - Filter `isActive === true`
2. **Routine done state:** for each due routine, look up `routineCompletions` for `routineId + date === today`. Present → done.
3. **One-off tasks due today:** pending tasks due on that date (plus undated tasks on the actual Today view), together with matching tasks completed on the current Singapore date so they remain visibly checked until tomorrow.
4. **Rule reminders for today:** pages where `type === "rule"` AND `pinnedToToday === true`. (A `pinnedToToday: boolean` flag on rule pages — set by admin. Simple, no rule↔routine linking needed in V1.)
5. **Tasks with future due dates do NOT appear on Today.** They appear in the "Upcoming" section of the Routines screen (§6.4) until their date arrives.

The query is reactive — marking a routine done updates the dashboard instantly on both phones.

### 5.2 Shopping list computation

`shopping:list()` returns the active shopping list:
1. **Active rows:** pending `groceryItems` plus bought rows whose `boughtAt` falls on the current Singapore calendar date, ordered by `createdAt` asc.
2. No date filtering, no daily reset, no carry-over. Items stay pending until bought.
3. Bought rows are excluded from this query (preserved in history for V2 queries).
4. Reactive — both phones see adds + mark-bought instantly.

### 5.3 Upcoming tasks computation

`routines:upcoming()` returns tasks where `status === "pending"` AND `dueDate > today`, sorted by `dueDate` asc. Shown on the Routines screen under an "Upcoming" section header (§6.4). Surfaces future-dated one-off work in the place the user already looks for scheduled work.

---

## 6. Screen Specs

### 6.1 Today (Dashboard) — `/`
**Layout:** single column, flat (no Morning/Afternoon grouping). A unified checklist of everything due today — **recurring routines that fall on today + one-off tasks due today** — with the same checkable-row treatment throughout. The user thinks "what do I do today," not "routine vs task." Hairline-divided rows.

```
[Sticky top bar]
Tue · 7 Jul                          [search]
─────────────────────────────────────
[Warning callout — only if a rule is pinned today]
Don't use kitchen cloth on toilets. See [safety rules]
─────────────────────────────────────
Today's checklist                  ← label-caps, tertiary
─────────────────────────────────────
○  Sweep living area             ← daily routine, resets tomorrow
○  Wipe kitchen counters
     use the [[kitchen spray]]   ← wiki link resolved inline
●  Boil water for tea            ← done today (filled circle, strikethrough)
○  Clean AC filter              ← monthly routine, appears on the 1st
     details →                   ← tap row body opens the linked item/page
○  Restock pantry                ← one-off task, disappears when done
     — added by you
─────────────────────────────────────
[+ Add a one-off task]          ← inline final row of Today
```

**Row anatomy (uniform for routines + tasks):**
- 56px tall, full-width tap target. Tap **row body** → opens detail:
  - routine → its stable detail URL (`/routines/:id`); inline `[[links]]` open the linked item/rule
  - task → a minimal task detail (title, due date, added by, mark done)
- Leading: 24px circle (outline = pending, filled + green = done)
- Tap **circle** → completion action:
  - routine → mutation `routineCompletions:toggle` (resets tomorrow; logged in history)
  - task → mutation `tasks:toggleDone` (the checked row remains through the current Singapore day and can be marked not done)
- Trailing (routines only): subtle frequency label ("daily" / "1st · monthly") in `mono-sm` tertiary, so she can tell a recurring item from a one-off at a glance
- Wiki links inside a routine's `description` render inline (tappable blue)

**Interaction:**
- Add task expands inline as the final Today row. Its Date control defaults to Today and opens a popover with Today, Tomorrow, This weekend, Next week, and a compact calendar. There is no Inbox/project control.
- Mark done: filled circle in `success-accent`, text gets subtle strikethrough fading in over 150ms
- Pull to refresh: re-reads "today" (handles the case of opening past midnight)
- Empty state keeps the inline add-task row visible so either user can immediately create a task

**What is NOT on Today:** shopping list (Shopping tab), routine templates and the rule catalog (More), or the note catalog (Notes tab). Today is purely the day's checklist + pinned rule callout.

### 6.2 Note / Rule View — `/notes/:id` and `/rules/:id`
(Already prototyped — see `prototype/page.html`.)

`/p/:slug` remains a compatibility route, but all newly generated links and share actions use the stable ID route so renaming an entry does not change its URL.

- Sticky top bar: back, Edit (ghost button), overflow (Delete only for admin on rule pages, copy link)
- Photo (notes only), 4:3, hairline frame
- `label-caps` type badge + location + updated date in mono
- Local-language name inline (no box) — `label-caps` label, then 24px script
- Markdown content rendered; `[[links]]` resolved to the target's stable `/notes/:id` or `/rules/:id` URL
- Broken links: dashed underline, tertiary → tapping opens "Create this page?" prompt
- No visible backlinks section in V1; outbound link records remain stored for future backlink/graph features

### 6.3 Page Editor — `/p/:slug/edit` and `/p/new`
- Title input (label above)
- The create route fixes the type to Note or Rule from its entry point; recipes use their own structured import/editor flow rather than the generic page editor.
- Conditional fields based on type:
  - **Note:** Photo with explicit Upload photo and Take photo actions (uses Convex upload URL flow). Local-language name and location are not authored in the V1 form; legacy stored values remain readable.
  - **Rule:** a `pinToToday` toggle ("Show as reminder on Today")
- Markdown editor: a `<textarea>` with a hint banner showing `Use [[Page Name]] to link another page`. Live preview toggle.
- Link autocomplete: typing `[[` opens a dropdown of existing page titles; selecting inserts `[[Selected Title]]`.
- Sticky bottom bar: Cancel (ghost) · Save (primary). Save disabled while empty title.

### 6.4 Routines — `/routines`
**Entry point:** Routines is reached from More rather than occupying a primary tab.

**Permissions:** users can **view** this screen (tap into routines, follow inline `[[links]]`), but **cannot create/edit/delete**. Only admins manage the recurring schedule. Inline add rows and edit affordances are hidden for users; rows are tappable (read details) but not editable.

**Layout:**
- Daily / Weekly / Monthly groups are always visible, each with a `label-caps` section header
- Weekly routines are grouped under localized Monday-through-Sunday subheadings; empty days are omitted
- **Upcoming tasks section** — one-off tasks with `dueDate > today` (status pending), sorted by due date asc, shown beneath the routines. This is where future-dated tasks live until their date arrives on Today.
- Each routine row: title and frequency detail for daily/monthly entries; weekly entries inherit their weekday subheading
- Tap row → detail (`/routines/:id`) for everyone; admin can continue to `/routines/:id/edit`
- Each admin section ends with an inline add-routine row matching Tasks and Shopping:
  - Title plus optional note
  - Frequency fixed by the containing Daily / Weekly / Monthly section
  - Conditional weekday chips or day-of-month number
  - While typing a title, matching item/rule entries appear as link suggestions
  - New routines save active by default; Wiki Page and Active controls are not shown

### 6.5 Shopping — `/shopping`
**Permissions:** both users can add + mark bought. **No delete in V1.** Bought items remain checked through the day, then leave the active list while persisting in history.

- Single shared realtime list of pending items plus items bought today
- Flat list with the add-item control as the final row. Activating it opens an inline input; enter/check → mutation `groceryItems:add` (status=pending, count=1). Pending items stay on the list until bought — they don't expire, don't carry over to a new day, just sit there.
- Each row has a compact count stepper on the right: chevron up, numeric count, chevron down. Count cannot go below 1.
- Shopping names use the same item/rule wiki-link suggestions as tasks and routines. Resolved references are stored with stable page IDs and render as links in the list and detail view.
- Tap circle to mark bought → stays checked and struck through until the next Singapore date, records `boughtBy` + `boughtAt`, and can be unchecked during that window
- Both phones sync via Convex realtime
- Empty state: "Add what you need to buy."
- Each row has a stable detail URL (`/shopping/:id`) for deep linking and sharing.

### 6.6 Notes + More — `/notes` and `/more`
**Permissions:** users can view both catalogs and **add notes** (users can photograph + create notes). **Rules are admin-only** add/edit/delete. **No delete on notes in V1.**

- **Notes** is a primary tab containing a responsive photo grid of pages where `type === "item"`; both roles see `+ New note`, and user-created notes go live immediately (admin can refine).
- **More** contains:
  - **Rules** → list of pages where `type === "rule"` — admin sees FAB + edit/delete affordances; users see a read-only list
  - **Routines** → recurring schedule; users view and admins/owners manage
  - Family administration for admins/owners, language, and Sign out
- The Notes grid uses cropped 4:3 thumbnails, lazy loading, and two/three/four columns across phone/tablet/desktop widths. Rules remain a hairline-divided list. Tap either kind → wiki page view (§6.2).
- These catalogs exist so a rule/note is reachable by browsing as well as by `[[link]]`; they are not a wiki index
- More also hosts **Sign out** (a row here — simplest, no settings chrome needed)

### 6.7 Search — modal command palette (no tab)
**Scope:** searches **notes, rules, recipes, and one-off tasks**. Does **not** search routines (those are managed on the dedicated schedule screen and users don't need to find them by text). Triggered from the search icon in the top bar.

- V1: client-side filter over reactive loaded lists (pages of type item/rule + recipes + tasks)
- Results grouped by kind: Notes / Rules / Recipes / Tasks
- "Create new note: *query*" as the first result → opens the note editor prefilled
- Fits DESIGN.md rule: white (`surface-floating`) reserved for search bar / command palette / dropdowns / modals
- Replaces the need for any browse-all index

### 6.8 Auth — `/login`
- Email + password (separate accounts for admins and users)
- Submit → `@convex-dev/auth` password provider (scrypt-hashed)
- On success → redirect to Today
- Failure: inline error below input, `error-text` color
- The `users` table is managed by `@convex-dev/auth`; our app-level fields (role, locale, displayName) live in a parallel `userProfiles` table keyed by the auth user ID, so we don't fight the auth provider's schema

### 6.9 App shell
- **Bottom tab bar: Tasks · Notes · Recipes · Shopping · More** (5 tabs)
  - `Tasks` — the daily checklist (routines + tasks due today, check-off)
  - `Notes` — household reference photo grid; anyone can add
  - `Recipes` — structured family recipes plus the paste-link import entry point
  - `Shopping` — shared realtime list (both add/check)
  - `More` — Rules, Routines, family/language controls, and Sign out
- **No Search tab** — search opens as a modal from a top-bar icon
- Sticky top bar with contextual title + actions per route (search icon always present)
- On desktop (≥768px): left rail replaces bottom bar; content max-width 480px centered (keeps the editorial phone feel)

### 6.10 i18n and typed-content translation

**A. UI strings**
- All UI labels go through `react-i18next`'s `t()` — never raw strings in components.
- Locale files currently ship for English (`en`), Burmese (`my`), and Indonesian (`id`).
- Locale resolution uses the signed-in account's `userProfiles.locale`, with `en` as fallback.
- The Language screen lets users select their UI locale.

**B. User content — operator-gated lazy translation**
- Authored entity fields remain the permanent source of truth.
- `pages.localName` and `pages.localContent` remain manually authored page fields.
- One-off task titles and notes use on-demand translation backed by separate `contentTranslations` cache rows. PER-3 registers recipe titles, ingredient rows, and step rows with the same lifecycle; source fields are never replaced.
- Translation is enabled per profile only when `userProfiles.autoTranslateEnabled === true`. Missing/false is disabled, new profiles default false, and no public application mutation can change it.
- The Language screen displays the flag as a disabled switch. An operator changes it directly in the Convex database.
- A gated viewer sees source immediately; missing translations are generated for that viewer's selected locale only when supported content is viewed. Recipe review/edit always uses source, while translated recipe detail offers Show original.
- OpenRouter is the provider gateway. The default model is `deepseek/deepseek-v4-flash`; credentials remain server-side in `OPENROUTER_API_KEY`.
- Wiki identities, URLs, code, numbers, recipe quantities, and dates are protected across translation. Editing source invalidates cached results through `sourceHash`; translation never blocks save.
- Routines, shopping, Search, notes, rules, and page bodies remain source/manual-only until explicitly expanded and reviewed. Recipe search continues matching authored source fields.

Operational instructions and exact flag behavior live in `docs/translation.md`. The detailed lifecycle and safety design live in `docs/plans/2026-07-16-lazy-normalized-content-translation.md`; the recipe extension lives in `docs/plans/2026-07-22-recipe-import-uiux-plan.md`.

### 6.11 Permissions matrix

Two roles: **admin** and **user** (primary daily role), with the family creator represented as **owner** in permission checks. Hard V1 delete rules: rules and routines are admin/owner-only; one-off tasks and shopping rows are creator/admin/owner-only; household note pages cannot be deleted.

| Surface | User view | User add | User edit | User delete |
|---|---|---|---|---|
| Today checklist | ✓ | one-off tasks | mark routines/tasks done | ✗ |
| Routine completion | ✓ | — | ✓ both can mark a routine done for today | ✗ |
| Routines screen (templates) | ✓ | ✗ | ✗ admin-only | ✗ admin/owner-only |
| **Rules** (wiki pages) | ✓ | ✗ **admin-only** | ✗ **admin-only** | ✗ **admin-only** |
| Notes (wiki pages, photos) | ✓ | ✓ anyone | ✗ admin-only | ✗ never in V1 |
| Shopping list | ✓ | ✓ both | ✓ both can mark bought | creator/admin/owner |
| One-off tasks | ✓ | ✓ both | completion: anyone; title/note: admin/owner | creator/admin/owner |
| Recipes | ✓ | ✓ both import | importer/admin/owner | importer/admin/owner |
| Notes (creating) | ✓ | ✓ anyone (user can photograph + create) | — | — |
| Search | ✓ | "create note" result routes to note editor (anyone) | — | — |
| Sign out | ✓ | — | — | — |

**Hard simplifications for V1:**
- **Rules → admin-only full CRUD.** Add, edit, delete all gated to admins. Rules are household policy; users follow them and don't author them. (Confirmed by user.)
- **Delete remains unavailable for household note pages.** Routines can be hard-deleted by admins/owners together with their completion history. One-off tasks and shopping rows can be hard-deleted by their creator or a family admin/owner. Completed rows otherwise remain through the current Singapore day, then leave by date-scoped query.
- **Task title and note are admin/owner editable fields**, while completion toggles between `pending` and `done` via `tasks:toggleDone` for any family member. Due dates remain fixed.
- **Notes: anyone can create, admin-only edits.** A user can photograph something and create the note page; only the admin refines content/adds `[[links]]`. No delete in V1.
- Default-allow on day-to-day operations (tasks, shopping, note creation, marking done); default-deny on household-policy-adjacent things (routines, rules, note editing).

Enforcement: Convex mutations resolve the authenticated user and their `familyMembers` role, then reject forbidden writes before the DB touch. The UI hides/renders controls per role so users never see dead buttons.

### 6.12 Recipes — `/recipes`, `/recipes/import/:id`, and `/recipes/:id`

- `/recipes` is a first-class family recipe list and the paste-link import entry point.
- Supported sources: public TikTok, Instagram, and YouTube posts/videos plus normal website URLs.
- Social imports use caption/description text and a transcript. Website imports prefer Recipe JSON-LD/schema.org and fall back to LLM extraction from readable page content.
- An accepted URL creates a persistent import before processing. The UI shows real stages, can safely be left, and preserves failures or partial results for retry.
- Extracted title, ingredients, and ordered steps open in a structured review editor before publish. Source is read-only and always retained.
- Published recipes use stable `/recipes/:id` URLs, expose the original source near the title, and render ingredients + numbered steps in the page flow without nested cards.
- Recipes participate in `[[links]]`: they appear in authoring suggestions, resolve to stable `/recipes/:id` routes, and may themselves reference notes, rules, or other recipes from ingredient/step text.
- Both family roles may import. The importer, a family admin, or the owner may edit/delete.
- Full interaction, state, responsive, accessibility, and delivery details live in `docs/plans/2026-07-22-recipe-import-uiux-plan.md`.

---

## 7. Wiki Link Implementation

### Lexer
A `markdown-it` inline rule registered before `link`:
- Match `\[\[([^\]|]+)(?:\|([^\]]+))?\]\]`
- Captures: `target` (canonical `page:<id>`, canonical `recipe:<id>`, or legacy readable title), optional `label` (display text)
- Token type: `wiki_link`

Authors still type the readable form `[[Chicken adobo]]`. On save, Convex resolves it within the active family and writes either `[[page:<stable-id>|Label]]` for a note/rule or `[[recipe:<stable-id>|Label]]` for a recipe. A reference that cannot be resolved remains title-based and renders as a broken create-page link.

### Renderer
For each `wiki_link` token:
1. Resolve canonical `page:<id>` or `recipe:<id>` through the combined wiki target map. Legacy title tokens use a case-insensitive lookup across notes, rules, and recipes for compatibility; collisions require an explicit author selection rather than an arbitrary winner.
2. If the record exists → render its stable canonical URL: `<a href="/{notes|rules|recipes}/{id}" class="wikilink">{label || target}</a>`.
3. If an unresolved legacy title is found → render `<a href="/p/new?title={encoded}" class="wikilink broken">{label || target}</a>` (dashed underline, tertiary color). An unresolved canonical ID renders as broken text and never proposes creating a page named after an ID.

The same inline renderer is used for page bodies, task/routine/shopping text, and recipe ingredients/steps. Authoring searches notes, rules, and recipes; selecting a suggestion inserts readable `[[Record Title]]` text, which is canonicalized by the relevant mutation before storage. Existing string fields remain compatible; readers support legacy title tokens alongside both canonical forms.

### Link persistence
On `pages:save` mutation:
1. Write the page
2. Delete all `links` docs where `sourcePageId === pageId`
3. Re-parse canonical content and insert one `links` doc per unique target with `targetPageId`. Legacy unresolved titles retain only `targetTitle`.

### Backlinks view
`pages:backlinks(slug)` remains available for future backlink/graph features, but V1 does not render a "Referenced from" section on note or rule pages.

### Edge cases
- `[[Target|Display Text]]` → display text shown, target used for resolution
- Self-links (`[[my own title]]` inside a page or recipe) → rendered but excluded from backlinks
- Case-insensitive title resolution ("Toilet Detergent" matches link to `[[toilet detergent]]`)
- Renaming a resolved target does not break the link because its stored identity is the page or recipe ID
- Empty `[[ ]]` → rendered as literal text
- Links in code spans / code blocks → not parsed

---

## 8. File Structure

```
bluetape/
├── DESIGN.md                      ← done
├── PLAN.md                        ← this file
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── convex/
│   ├── auth.config.ts             ← @convex-dev/auth password provider config
│   ├── schema.ts                  ← all tables (pages, links, routines, tasks, groceryItems, routineCompletions, userProfiles)
│   ├── pages.ts                   ← mutate save (with link rebuild), stable target map, lookups, backlinks
│   ├── routines.ts                ← CRUD (admin-only writes) + upcoming tasks query
│   ├── tasks.ts                   ← add + toggleDone (anyone); update (admin/owner); remove (creator/admin/owner)
│   ├── groceryItems.ts            ← add + toggle (anyone); remove (creator/admin/owner)
│   ├── routineCompletions.ts      ← toggle + isDoneToday
│   ├── userProfiles.ts            ← get/create-on-first-login, role+locale+timezone
│   ├── permissions.ts             ← shared require-role helpers (requireAdmin, etc.)
│   └── today.ts                   ← the dashboard query (due routines + tasks + pinned rules)
├── src/
│   ├── main.tsx
│   ├── App.tsx                    ← router + ConvexAuthProvider + I18nProvider + layout
│   ├── i18n.ts                    ← i18next init, locale resolution, Suspense loader
│   ├── locales/
│   │   ├── en.json                ← active in V1
│   │   └── <locale>.json          ← added when V2 ships another UI language
│   ├── lib/
│   │   ├── wiki.ts                ← markdown-it + [[ ]] plugin
│   │   ├── slug.ts                ← slugify helper
│   │   ├── cn.ts                  ← classnames helper
│   │   └── date.ts                ← today-in-SG + Intl formatting helpers
│   ├── theme/
│   │   └── tokens.css             ← DESIGN.md tokens → CSS vars
│   ├── routes/
│   │   ├── login.tsx
│   │   ├── today.tsx              ← dashboard checklist
│   │   ├── routines/
│   │   │   ├── index.tsx          ← list + Upcoming tasks section
│   │   │   └── edit.tsx           ← admin-only
│   │   ├── shopping.tsx          ← the shared list
│   │   ├── more.tsx               ← entries to Rules + Notes catalogs + Sign out
│   │   ├── rules.tsx              ← catalog of rule pages (admin: FAB+edit+delete)
│   │   ├── items.tsx              ← responsive catalog of note pages (internal item type)
│   │   ├── pages/
│   │   │   ├── view.tsx           ← /p/:slug
│   │   │   └── edit.tsx           ← /p/new + /p/:slug/edit
│   │   └── search.tsx             ← modal command palette (rendered in a portal)
│   ├── components/
│   │   ├── AppShell.tsx           ← top bar + bottom tab bar + search trigger
│   │   ├── TopBar.tsx
│   │   ├── TabBar.tsx
│   │   ├── WikiLink.tsx
│   │   ├── Markdown.tsx           ← renderer wrapping wiki.ts
│   │   ├── CheckRow.tsx          ← uniform routine/task row + check-circle
│   │   ├── CheckCircle.tsx       ← the done toggle
│   │   ├── PhotoCapture.tsx      ← <input file capture> + Convex upload URL flow
│   │   ├── LinkAutocomplete.tsx   ← [[ trigger dropdown
│   │   ├── WarningCallout.tsx     ← pinned rules on Today
│   │   ├── EmptyState.tsx
│   │   └── RoleGate.tsx           ← hides/shows controls per userProfile.role
│   └── index.css                  ← tailwind + token import
└── prototype/
    └── page.html                  ← already built (reference)
```

Routing: `react-router` v7 (data routers) or TanStack Router. Leaning TanStack for type-safe params (`/p/:slug`, `/routines/:id`).

---

## 9. Build Phases

Each phase ends with something you can open and tap. No phase ships a half-feature.

### Phase 0 — Project scaffold (no UI)
- `npm create convex@latest` with React + Vite preset
- Add `@convex-dev/auth`, tailwind v4, phosphor, markdown-it, fonts
- Map `DESIGN.md` tokens into `src/theme/tokens.css` + Tailwind `@theme`
- Convex auth password provider wired; `/login` route with separate per-user accounts for admins and users
- `AppShell` with bottom tab bar (destinations can be empty placeholders)
- Deploy: app boots, login works, lands on empty "Today"

### Phase 1 — Wiki core (the foundation everything links to)
- `schema.ts`: `pages`, `links`
- `pages:save` with wiki-link parsing + link persistence
- `/p/:slug` view (port of `prototype/page.html` to React + real data)
- `/p/new?type=item|rule` + `/p/:slug/edit` with markdown `<textarea>` and item fields
- `Markdown` component with `[[ ]]` plugin resolving against `pages:wikiTargetMap`
- Broken-link → "Create this page?" flow
- Photos: Convex upload URL flow in the editor
- **Checkpoint:** Can create items with photos + local-language names and link them from each other. This proves the wiki works before any scheduling.

### Phase 2 — Routines + Today (the daily-use loop)
- `schema.ts` add `routines`, `routineCompletions`
- Routines CRUD + `/routines` + `/routines/:id/edit` (admin writes only)
- `today:list` query (due routines + done state)
- Today dashboard with routine rows, check-circle toggle, day-of-week/month logic
- Warning callout block (pinned rules surface here)
- One-off tasks add + `tasks:toggleDone` + Today section ("Today's tasks")
- **Checkpoint:** User can open the app, see today's routines, tap through to item pages, and mark them done. Admin can set up a weekly/monthly schedule.

### Phase 3 — Groceries + polish
- `schema.ts` add `groceryItems`
- `/shopping` with add / mark bought, realtime
- Empty states, loading skeletons
- Pull-to-refresh on Today
- Reduced-motion + a11y audit (contrast already verified in DESIGN.md)
- **Checkpoint:** The full V1 surface works. Ship to the two users.

### Phase 4 — Hardening (post-launch)
- Error states on every mutation
- Offline tolerance (Convex cache)
- Rule delete confirmations
- Export/backup (dump all pages to markdown)
- Translation hardening and controlled entity expansion after the task quality gate

### Phase 5 — Recipe import
- Add Recipes to the five-tab mobile shell and desktop rail
- Add persistent URL import jobs for social-video and website sources
- Add the external Docker media worker (`yt-dlp`, `gallery-dl`, FFmpeg/FFprobe, Deno) with authenticated Convex job claiming and stage updates
- Add structured draft review, recipe detail/edit, source provenance, retry, and delete flows
- Add recipes to global search and complete i18n/a11y/error-state coverage
- Keep an imported recipe's source-language title canonical while normalizing ingredient rows and step rows into the importer's profile locale before review; detail shows a viewer-localized title beneath the original and localizes content through the merged lazy translation cache
- **Checkpoint:** either family role can paste a supported public recipe link, review extracted ingredients + steps, save it, and reopen both the Bluetape recipe and its original source.

---

## 10. Resolved Decisions

1. **Auth model → per-user accounts.** Admins and users each have their own password + login. App-level profile fields (locale, timezone, displayName) live in `userProfiles`; family roles live in `familyMembers`. Enables truthful "added by" + permission enforcement. See §6.8.
2. **Timezone → Asia/Singapore, computed client-side.** Instants stored as Unix timestamps (UTC ms); calendar dates stored as `YYYY-MM-DD` strings; "today" computed on the client in SG, sent to queries. Full model in §4.
3. **Hosting → Convex + Cloudflare Pages, auto-deploy on push to `main` via GitHub integration.**
4. **No Pages index / wiki-app surface.** Wiki links are a *feature* (inline `[[...]]` inside tasks, routines, notes, rules, shopping, and recipes), not the product. Valid targets are notes, rules, and recipes. Records are reached through their product surface, by link, or by Search; there is no generic Pages tab.
5. **Tab bar → 5 tabs: Tasks · Notes · Recipes · Shopping · More.** Notes, Recipes, and Shopping are first-class tabs. Routines moves into More. Search opens as a modal command palette from the top bar, not a tab.
6. **Today is a flat unified checklist** — recurring routines due today + one-off tasks due today, same checkable-row treatment. No Morning/Afternoon sections. No standalone task index; individual tasks do have `/tasks/:id` detail URLs. Tasks without a due date also surface on Today, future-dated tasks don't (they live in the Routines screen's "Upcoming" section).
7. **Shopping label** = "Shopping" in the UI (table stays `groceryItems`).
8. **No settings screen in V1.** Sign-out lives in the More tab.
9. **Search scope → notes + rules + recipes + tasks.** Routines excluded.
10. **Shopping → simple active list model.** Pending items stay until bought. Bought items remain visibly checked for the rest of the current Singapore calendar day, then leave the active list the next day while persisting in history unless explicitly deleted by their creator or an admin/owner. No reset or carry-over mutation is needed; the date-scoped query controls visibility.
11. **Tasks → admin/owner title-note editing; completion is reversible; deletion is creator/admin/owner-only.** Any family member can toggle `pending ↔ done`; toggling to pending clears `completedAt`. Users cannot edit task content. Due dates remain fixed. A user may delete a task they created; admins/owners may delete any task.
12. **Rules → admin-only full CRUD** (add + edit + delete). User view-only. **(User-confirmed corrects an earlier note that said "anyone can add.")**
13. **Notes → anyone can add (user photographs + creates), admin-only edits, no delete in V1.** Notes retain the internal `item` page type to avoid a needless data migration.
14. **Future-dated tasks → show in "Upcoming" section on the Routines screen**, not on Today (until their date arrives).
15. **i18n has separate UI and user-content layers.** UI strings ship through `react-i18next` in English, Indonesian, and Burmese. Supported user-content fields use an operator-gated, on-demand `contentTranslations` cache keyed by exact source hash and viewer locale; authored source remains authoritative and visible as the fallback. Tasks are the first merged entity and recipes reuse that lifecycle for title, ingredients, and steps. See §6.10.
16. **Stable direct links and resolved wiki identity.** Canonical view routes are `/notes/:id`, `/rules/:id`, `/tasks/:id`, `/routines/:id`, `/shopping/:id`, and `/recipes/:id`. Authors type `[[Record Title]]`, but mutations resolve successful references to canonical page or recipe identities before storage. Old `/items/:id`, title-token, and `/p/:slug` routes remain readable for compatibility; all new resolved links navigate by ID.
17. **Wiki-link autocomplete uses two modes.** Passive suggestions inspect only the active trailing phrase and require a strong title match, so stale matches disappear as typing continues and replacement has an exact character range. Typing `[[` explicitly opens broad fuzzy note/rule/recipe search for intentional linking. Type labels disambiguate title collisions.
18. **Completed rows remain visible through the day.** A completed task or bought shopping row stays in its current list as a checked row until the Singapore calendar date changes. The next day's date-scoped query removes it from the active list without deleting history.
19. **Completion controls use optimistic client updates.** Tapping a task or shopping checkbox updates all relevant cached list/detail results immediately; Convex then confirms the mutation or rolls the optimistic state back on failure.
20. **Task creation is inline.** The Today list ends with an expandable add-task row, matching Shopping. Due date defaults to Today; its popover offers Today, Tomorrow, This weekend, Next week, and a calendar. No Inbox/project selector is shown.
21. **Routine creation is section-scoped and inline.** Daily, Weekly, and Monthly sections are always visible; weekly entries are grouped Monday through Sunday. Admins add from the final row of a section, which fixes the new routine's frequency to that section and saves it active by default. The inline creator and routine editor do not expose Wiki Page or Active controls.
22. **Note creation is deliberately minimal.** The note form contains title and optional photo, with separate Upload photo and Take photo actions. Local-language name and location are removed from authoring; existing stored values remain preserved and readable.
23. **Completion checkboxes stay on day/task surfaces.** Routine detail represents the reusable template and therefore has no checkbox; routine completion happens in the dated task lists. One-off task detail keeps the same check circle as its list row. One-off tasks expose a three-dot delete menu to their creator or a family admin/owner, backed by the same server check.
24. **Routine and one-off task details use inline editing.** Admins/owners edit routine and task title/note by tapping the text; users see read-only content. Routine and one-off task deletion appears in an anchored popover and requires confirmation; deleting a routine cascades to its completion history.
25. **Inline editing is the default for displayed text fields.** Editable titles, notes/content, and the family name enter an in-place editor when tapped, save on blur/Enter, and cancel on Escape. Creation remains form-based; photos, schedules, roles, dates, and rule settings remain purpose-built controls.
26. **Shopping detail mirrors task detail.** Bought state uses the same leading check control as tasks. A shopping row can be hard-deleted by the member who added it or by a family admin/owner, with matching UI visibility and server enforcement.
27. **Versioning and releases use Release Please.** Conventional commits on `main` maintain a release pull request that updates the Node package version and changelog; merging it creates the corresponding Git tag and GitHub release.
28. **Reopened family invites are navigation, not another join prompt.** If the authenticated person already belongs to the invited family, opening its invite switches that family to active and redirects directly to the app. New members still see the explicit join screen.
29. **Recipes are structured first-class records, not generic markdown pages.** Import creates a persistent draft, preserves the source, and requires a review of extracted ingredients + ordered steps before publish. Social sources use caption/description + transcript; websites prefer Recipe schema and fall back to LLM extraction.
30. **Recipe permissions follow authorship.** Both roles can import and view; the importer, a family admin, or the owner can edit/delete. Convex mutations enforce the same rules the UI presents.
31. **Recipes participate in stable wiki references without becoming generic pages.** Authors type `[[Recipe Title]]`; selection canonicalizes the target to recipe identity and renders `/recipes/:id`. Recipe ingredients and steps also support the same references.
32. **Recipe media processing runs on Railway in the Indiego Lab workspace.** Convex remains the authenticated durable queue and system of record; a Dockerized Python worker claims jobs and runs `yt-dlp`, `gallery-dl`, FFmpeg/FFprobe, Deno, transcription, and structured extraction. Caption metadata is assessed before media; `gallery-dl` is the bounded Instagram carousel-image fallback. See ADR 002.
33. **Recipe identity stays in the source language while content translates per viewer.** The worker keeps the extracted source-language title as the canonical recipe name and translates only the fixed ingredient and step fields into the importing profile's locale without changing quantities or structure. Detail always leads with the original title and, when available, shows the viewer-localized title beneath it. Other viewer-localized content uses the existing lazy cache and feature gate; Edit modifies the authoritative original title and reviewed ingredient/step text.

## 11. Still Open

- **User-created note quality** — notes a user adds go live immediately without admin review. If low-quality notes become a problem, V2 adds an approval queue. Decide by observation post-launch.
- **Rules deletion softening** — V1 hard-deletes rules (admin-only). If you want a soft-delete (rule hidden but recoverable) for accidentally-removed rules, tell me before Phase 3.
- **Translation expansion beyond tasks and recipes** — routines, shopping, notes, and rules remain source-only until each field mode and real-language quality is accepted.

---

## 12. Definition of Done (V1)

- [ ] User can log in (own password) and see Today's checklist (routines + tasks due today)
- [ ] Tap a routine row → opens its linked wiki page with photo + local + `[[links]]`
- [ ] Tap the check-circle → routine or task remains visibly done for today and clears from the active day view tomorrow
- [ ] Both users can create a note with an optional photo from the phone camera
- [ ] `[[Links]]` resolve when target exists; show as broken (dashed) when it doesn't
- [ ] Typing a task or routine title suggests matching notes/rules/recipes; selecting a result inserts a working inline `[[link]]`
- [ ] Typing a shopping item suggests matching items/rules; selected references render as working inline `[[links]]`
- [ ] Every note, rule, task, routine, and shopping row has a stable direct URL that survives title changes and can be shared
- [ ] Weekly + monthly routines appear on the correct day automatically
- [ ] Both users can add shopping items; pending items stay until bought; both phones sync in real time
- [ ] Shopping detail uses the task-style checkbox; creators/admins/owners can delete a shopping row
- [ ] Bought shopping items remain visibly checked today, leave the active list tomorrow, and persist in history
- [ ] One-off tasks can be added and toggled done/not done by either user; admins/owners can edit title/note; creators/admins/owners can delete
- [ ] Future-dated tasks appear in the "Upcoming" section on the Routines screen
- [ ] Pinned rules surface as the warning callout at the top of Today
- [ ] Rules: admin-only add/edit/delete; user cannot author rules (mutations reject; UI hides controls)
- [ ] Notes: anyone can create, admin-only edits, no one deletes in V1; catalog is a responsive photo grid
- [ ] Routines: admin/owner can delete with confirmation; completion history is deleted with the routine
- [ ] Search (modal) finds notes, rules, recipes, and tasks; offers to create a new note
- [ ] Recipes is a first-class mobile/desktop destination; either role can import a supported public social-video or website URL
- [ ] Recipe imports persist while processing, survive navigation, and retain recoverable partial/failure states
- [ ] Imported recipes require review of title, ingredients, and ordered steps before publish and always retain an openable source link
- [ ] Published recipes have stable detail URLs and appear in global search
- [ ] Recipes appear in `[[` suggestions, links to them survive renames, and recipe ingredients/steps can link to notes, rules, or recipes
- [ ] Imported recipes retain the original-language title, translate ingredients and steps into the importer's locale for review, record the external source language, and show a viewer-localized title beneath the original on detail
- [ ] All UI strings route through `react-i18next` `t()` with matching English, Indonesian, and Burmese keys; no hard-coded English appears in components
- [ ] All screens meet DESIGN.md tokens, contrast, and the no-nested-containers rule
- [ ] Passes `prefers-reduced-motion` and tap-target ≥44px checks
- [ ] Ships on Convex + Cloudflare Pages, auto-deploy on push to `main`
