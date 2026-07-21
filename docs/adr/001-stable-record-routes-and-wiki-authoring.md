# ADR 001: Stable record routes with title-based wiki authoring

## Status

Accepted

## Context

Bluetape already supported `[[Page Title]]` links inside item and rule content, but rendered those links through mutable slugs. Tasks, routines, and shopping rows did not all have view routes, so they could not be reliably deep-linked or shared.

Task and routine creation also treated titles as plain text even when the text mentioned an existing item or rule.

## Decision

Every household content record has a canonical, ID-based view route:

- `/items/:id`
- `/rules/:id`
- `/tasks/:id`
- `/routines/:id`
- `/shopping/:id`
- `/recipes/:id`

The existing `/p/:slug` route remains available for old links. New catalog links, search results, wiki links, and share actions use the stable route.

Wiki authoring remains human-readable: `[[Eggs]]`. While a supported text field is being entered, the client searches existing note, rule, and recipe titles. Selecting a suggestion inserts the same readable syntax. Notes, rules, and recipes are valid wiki targets; type labels disambiguate title collisions.

At the write boundary, Convex resolves each selected target within the active family and stores a canonical token: `[[page:<id>|Eggs]]` for a note/rule or `[[recipe:<id>|Chicken adobo]]` for a recipe. Renderers resolve canonical tokens by ID. Older title-only tokens remain supported and are upgraded whenever their record is saved again. Recipe ingredient and step fields use the same authoring and rendering system.

## Consequences

- Record URLs survive title and slug changes.
- Shared links reopen the exact record after authentication.
- The existing Markdown renderer and page link model remain reusable; no schema migration is required because all affected fields remain strings.
- Resolved links survive target renames because identity is stored as a page ID.
- Unresolved text such as `[[Unknown item]]` remains title-based and visibly broken until a matching note, rule, or recipe exists.
- Readers support both canonical and legacy tokens during the compatibility rollout.
