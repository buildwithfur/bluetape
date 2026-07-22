# On-Demand Normalized Text Translation Implementation Plan

**Goal:** Translate user-typed household content into the viewer's selected language while preserving the authored text, interpreting colloquial or locally phrased input as clear standard English, and doing no translation work until that locale is actually needed.

**Core decision:** Use one opt-in read-through translation cache. Saving content stores only the authored source. When the signed-in viewer's database-controlled flag is enabled, a visible route shows the source immediately, reads any cached result for the viewer's locale, and requests one missing result in the background. There is no save-triggered translation, blanket backfill, locale fan-out, or separate voice pipeline.

**First release scope:** Prove colloquial English task text, including Singlish examples, to Burmese on Today and task detail. Do not expand to other entities or languages until the Burmese helper accepts the result.

---

## 1. Product behavior

### Typed text only

This feature starts from text entered into existing Bluetape forms. Voice capture and speech transcription are separate future features.

Example source:

```text
this one ah, the clothes in washer, you dont forget to hang later
```

The provider interprets it as:

```text
Don't forget to hang the clothes in the washing machine later.
```

It then translates that intended meaning into natural Burmese in the same provider call.

### Source text remains authoritative

- Save exactly what the author typed on the task, routine, page, or shopping row.
- Never replace the authored field with normalized or translated output.
- Editors always edit the authored field.
- A generated result is a disposable cache derived from the source.
- Detail views may offer a quiet localized “Show original” action.

### One on-demand rule

When auto-translation is enabled for the viewer, each visible field follows one rule:

1. Show the authored source immediately.
2. Look for a current cached result for the viewer's profile locale.
3. If one exists for the current source hash, use it.
4. If none exists, include it in one bounded background generation batch.
5. When the result is stored, Convex reactivity updates the mounted view.

Do not translate on save. Do not pre-translate for every family member. Do not backfill when a member joins or changes language.

### Database-controlled feature gate

Add `autoTranslateEnabled` to `userProfiles` as an optional boolean. Treat absence and `false` identically; new profiles explicitly write `false`.

The Language page displays a localized “Auto-translate content” switch beneath language selection, but the switch is read-only and visually disabled. A localized hint explains that the feature is managed by the database administrator.

Rules:

- Users, family owners, and family admins cannot change this value through the application.
- Do not add it to `userProfiles:update` or any other public mutation arguments.
- It may be changed only by the operator directly in the Convex database/dashboard.
- Client code checks `profile.autoTranslateEnabled === true`; absence never enables the feature.
- Convex translation queries and mutations independently enforce the same check.
- When disabled, show exact authored source even if cached translations already exist.
- When disabled, do not claim jobs or call the provider.
- Disabling the flag keeps cached rows but stops displaying or generating translations immediately.
- Re-enabling the flag reuses any current cached result and resumes on-demand generation.

### Language changes and new helpers

The target locale is always derived from the signed-in viewer's current profile.

- If a user changes from Burmese to Filipino, visible content begins requesting Filipino results as it is opened.
- Existing Burmese results stay cached and are reused if the user switches back.
- A newly added Filipino helper sees source fallbacks first; only content they view is translated into Filipino.
- Every new helper starts with auto-translation disabled until the operator enables their profile directly in the database.
- New locale rows coexist because cache identity includes `targetLocale`.
- Adding a locale requires separate UI-string localization and provider quality acceptance; content translation alone does not localize navigation or controls.

This behavior is the reason to keep the system purely on demand. It handles language changes without eager fan-out or a migration workflow.

### Unknown source language is acceptable

Do not add an input-language selector and do not infer source language from the author's UI locale. The provider detects the source language during the first requested generation.

If the detected source language already matches the target locale:

- store a current `source_is_target` result
- continue displaying the exact authored source
- do not display the normalized text
- reuse that result so the same source/locale pair is not analyzed again

This may spend one call on a same-language cache miss. That is a deliberate simplicity trade-off.

---

## 2. Transformation contract

### One structured text-model call

For a translated field, the selected hosted multilingual model returns:

```ts
{
  detectedSourceLocale: string,
  normalizedSource: string,
  translatedText: string,
  sourceIsTarget: boolean,
}
```

The model must normalize and translate together. Do not create an independent rewrite call followed by a translation call.

The normalized source is stored for evaluation and diagnostics, but it is not a second editable field and is not shown in normal UI.

### Field-specific modes

Not every field is an instruction. The server-side source registry assigns one mode to every supported entity/field pair:

| Mode | Initial fields | Behavior |
|---|---|---|
| `instruction` | task title/note; later routine title/description and rule instructions | Resolve informal grammar and fillers while preserving the intended action. |
| `label` | later page title/location and shopping name | Translate concisely; never expand a noun phrase into an instruction. |
| `prose` | later item/rule body content | Preserve paragraph meaning and structure without inventing advice. |

The initial POC registers only task `title` and `note` as `instruction` fields.

### Meaning-preservation requirements

For instruction fields, preserve:

- every action and object
- negation
- names and stable wiki targets
- quantities, numeric values, dates, sequence, and urgency
- URLs and code
- the distinction between an instruction and a suggestion

Do not add missing actions or make an instruction stricter or weaker.

Numbers must preserve their semantic value. Canonical wiki IDs, URLs, and code must remain byte-for-byte identical. Human-readable unit words may be translated when their value is preserved.

### Provider selection

The initial adapter uses OpenRouter with `xiaomi/mimo-v2.5` as its
default model. `OPENROUTER_TRANSLATION_MODEL` may override the model at the
deployment level without adding provider-selection UI or changing client code.
The server credential is `OPENROUTER_API_KEY`.

Evaluate at most two credible hosted multilingual models using a small redacted corpus of real-style household phrases. The corpus must include varied colloquial and dialectal phrasing (including Singlish), incomplete grammar, code-switching, negation, quantities, wiki links, and Burmese-authored text for English output.

Choose one provider only after:

- automated checks confirm required facts survive
- provider names are blinded
- the Burmese helper approves clarity, naturalness, and operational correctness

Do not build multiple dormant provider adapters or a provider-selection screen. If no candidate is reliable, stop the feature rather than adding prompt complexity indefinitely.

---

## 3. Data model

Add a separate `contentTranslations` table. It contains operational cache state, not authored content.

Extend `userProfiles` with:

```ts
autoTranslateEnabled?: boolean // absent/false means disabled
```

Profile creation writes `false`. No public profile validator or mutation accepts this field.

Logical identity:

```text
familyId + entityType + entityId + field + targetLocale
```

Common fields:

```ts
{
  familyId: Id<"families">,
  entityType: "task", // add other types only after the task POC
  entityId: Id<"tasks">,
  field: "title" | "note",
  targetLocale: string,
  sourceHash: string,
  generation: number,
  updatedAt: number,
}
```

Use a discriminated-union schema for states:

- `pending`: includes `leaseExpiresAt`
- `ready`: includes detected locale, normalized source, translated text, provider, and model
- `source_is_target`: includes detected locale, provider, and model; no generated text is displayed
- `failed`: includes a stable error code and `retryAfter`

Indexes:

```ts
.index(
  "by_entity_field_locale",
  ["familyId", "entityType", "entityId", "field", "targetLocale"],
)
.index(
  "by_locale_status",
  ["familyId", "targetLocale", "status"],
)
```

Use SHA-256 of the exact canonical source field as `sourceHash`. Editing source text makes the old cache entry unusable without requiring translation work inside the source mutation.

When a supported source entity is hard-deleted, delete its translation rows in the same source mutation using the entity-prefix index and an explicit maximum `.take(...)`. Tasks, shopping rows, and rules must not leave orphaned cache entries.

---

## 4. Minimal Convex lifecycle

### Reactive read

`translations:getForFields` is a pure authenticated query.

It:

- derives the viewer locale and current family server-side
- returns a disabled result without reading translation rows unless `autoTranslateEnabled === true`
- rejects a profile locale that is not on the server content-locale allowlist
- accepts a bounded discriminated list of entity/field references
- verifies every source entity belongs to that family
- reads and hashes each current source field
- returns only current cache states for the viewer locale
- has no side effects

One mounted route sends one bounded batch, not one query per row.

### Idempotent claim

`translations:ensure` is a public mutation accepting only bounded field references. It does not accept `familyId`, `userId`, or `targetLocale` from the client.

For each field it:

- derives identity, active family, and target locale server-side
- returns without writes unless the caller's `autoTranslateEnabled === true`
- rejects a target locale that is not on the server content-locale allowlist
- validates the entity/field pair through the source registry
- recomputes the current source hash
- skips a current `ready` or `source_is_target` result
- skips a current pending result whose lease has not expired
- skips a failed result until `retryAfter`
- otherwise increments `generation` and writes `pending`

After all references are processed, the mutation schedules one internal batch action containing only newly claimed fields.

The mutation transaction is the deduplication boundary. Client memoization reduces noise but is not relied on for correctness.

### Provider action

One internal action receives a bounded list of claimed row IDs, source hashes, and generations.

It:

1. Loads the current claimed sources through one internal query.
2. Drops any claim whose source hash, generation, or pending state no longer matches.
3. Protects structured syntax for each remaining field.
4. Calls the selected provider once with a bounded structured batch and timeout.
5. Validates every returned result and its protected material independently.
6. Writes through one internal mutation.

Use native `fetch` unless the chosen provider genuinely requires an SDK.

### Freshness-safe completion

The completion mutation rechecks:

- the translation row is still pending
- `generation` matches the action claim
- the entity still exists in the same family
- the source hash still matches

Only then may it write `ready`, `source_is_target`, or `failed`. An older action can never overwrite a newer claim.

### Simple failure behavior

Do not build a retry scheduler for the first release.

- Provider failure records `failed` with a short `retryAfter`.
- Source text remains visible and normal app behavior continues.
- A later route mount may reclaim the failed row after the cooldown.
- An expired pending lease may also be reclaimed.
- Keep source text, provider bodies, credentials, and stack traces out of application logs.

This deliberately avoids a background retry subsystem before real usage proves one is needed.

---

## 5. Syntax handling

### Task POC

For task title and note, protect:

- canonical `[[page:<id>|label]]` targets
- unresolved wiki targets
- Markdown link URLs and bare URLs
- inline and fenced code
- numeric values and explicit dates

Wiki labels may be translated, but stable targets must not change.

Reject a provider result when a protected token is missing, duplicated, or altered. Rejection becomes `failed`; it never replaces the source fallback.

### Page bodies are deferred

Do not translate arbitrary Markdown page bodies in the first slice. Before page translation is added, implement structural segmentation that sends translatable text nodes with stable segment IDs and reconstructs the original Markdown/wiki structure afterward.

Do not rely on a prompt alone to preserve headings, lists, emphasis, or custom wiki syntax.

---

## 6. Client behavior

Create one reusable `useLocalizedFields` hook for visible routes.

The hook:

- derives the current profile locale
- returns authored source and skips translation queries/effects unless `profile.autoTranslateEnabled === true`
- subscribes to `translations:getForFields`
- selects translated text only from a current `ready` row
- returns the exact source for missing, pending, failed, and `source_is_target`
- calls `translations:ensure` once logically for claimable fields
- supports a detail-view “Show original” override

Do not show spinners on Today rows. A small localized “Translating…” message on task detail is optional and should be added only if the live replacement is confusing in real testing.

AppShell warm data subscriptions do not mount this hook and therefore cannot create translation jobs.

The Language page renders the disabled/read-only switch from the live profile value. Direct database changes update the switch and translation behavior reactively; there is no client toggle handler.

---

## 7. Implementation phases

### Phase 0 — Quality gate

**Objective:** Decide whether normalized colloquial-English-to-Burmese translation is good enough to ship.

- Create a small redacted evaluation corpus with expected preserved facts.
- Evaluate no more than two hosted multilingual models.
- Use the same field-mode prompt and output schema intended for production.
- Blind outputs for helper review.
- Record one selected model, known weaknesses, privacy/retention posture, and approximate observed cost.
- Stop if the helper does not approve the output.

Deliverables:

- `docs/translation-evaluation.md`
- `scripts/evaluate-translations.mjs`
- `scripts/fixtures/translation-corpus.json`
- ignored local result files

### Phase 1 — Task backend POC

**Objective:** Implement the smallest reliable cache lifecycle for task title and note.

- Install and configure `vitest`, `convex-test`, and `@edge-runtime/vm` through npm if not already present.
- Add the discriminated translation table and indexes.
- Add optional `userProfiles.autoTranslateEnabled`, default it to false on profile creation, and keep it out of public update arguments.
- Add the task-only source registry with `instruction` mode.
- Add SHA-256 source hashing using the existing shared implementation.
- Add task syntax protection and restoration tests.
- Add the selected provider adapter with mocked network tests.
- Implement the bounded get, ensure, action, and completion functions.
- Add lease, generation, stale-source, cross-family, and arbitrary-locale tests.
- Add tests proving disabled profiles cannot read cached translations or create translation jobs, including direct public-function calls.
- Delete task translation rows when a task is hard-deleted.

Do not add routines, pages, shopping, Search, automatic retries, or diagnostics UI in this phase.

### Phase 2 — Task UI POC

**Objective:** Prove one real typed instruction from save to Burmese display.

- Add `useLocalizedFields` and a pure localized-text selector.
- Add the read-only disabled auto-translate switch and localized administrator-managed hint to the Language page.
- Request only visible task title/note fields on Today and task detail.
- Keep editing bound exclusively to authored task fields.
- Add localized “Show original” on detail.
- Verify completion toggles do not invalidate translation.
- Test source-first rendering, live replacement, failure fallback, stale edit rejection, and stable wiki navigation.
- Have the Burmese helper test the POC on the actual Android phone.

Do not continue until the helper accepts this slice.

### Phase 3 — Controlled expansion

**Objective:** Extend the proven mechanism without changing its lifecycle.

Expand one entity group at a time:

1. Routines using `instruction` mode.
2. Shopping names using `label` mode.
3. Rule and item titles/locations using `label` mode.
4. Rule and item bodies using structural Markdown segmentation plus the appropriate `instruction` or `prose` mode.

For every group:

- add registry entries and validators
- add source-hash and syntax tests
- add bounded route field batches
- preserve source-only editors
- add deletion cleanup where deletion is allowed
- verify with real content before expanding again

### Phase 4 — Operational closure

**Objective:** Document and release only what proved necessary.

- Add a bounded owner/admin query for failed cache metadata if failures need operational inspection.
- Update `docs/plans/PLAN.md` statements that still describe manual or save-triggered translation.
- Record the accepted architecture and provider decision in an ADR.
- Verify provider credentials use typed Convex environment variables and never reach browser code.
- Verify there is no public function capable of changing `autoTranslateEnabled`.
- Run the full test, i18n, lint, build, Convex sync, and diff checks.
- Change the application version only as part of an explicitly requested release.

---

## 8. Search and locale rollout

Multilingual Search is not part of the first translation release.

- Existing Search continues matching authored source fields.
- Do not translate an entire catalog merely because Search opens.
- Ready cached labels may be incorporated later, but Burmese queries will not be promised until a bounded multilingual Search design is approved.

Before enabling a new content locale such as Filipino:

1. Add and review the UI locale file separately.
2. Add that locale to the server allowlist.
3. Run a small language-specific content evaluation with a fluent reviewer.
4. Enable it only after acceptance.

Changing a profile to an allowed locale requires no data migration or backfill.

---

## 9. Security, privacy, and limits

- Provider credentials live only in typed Convex environment variables.
- Public functions derive identity, active family, and target locale server-side.
- Translation reads and writes require the authenticated profile flag to equal `true`; client gating is only a UX optimization.
- Clients cannot request arbitrary families, users, locales, entity types, or fields.
- Every list and batch is explicitly bounded.
- Send only the requested text fields and transformation mode to the provider.
- Never send photos, member records, auth data, or unrelated page content.
- Store stable error codes, not provider response bodies.
- Document the selected provider's retention and training terms before production use.

---

## 10. Acceptance criteria

- Informal, colloquial, or locally phrased typed input is normalized into clear standard English and translated into helper-approved Burmese without losing actions, objects, negation, quantities, dates, order, or urgency.
- Every existing and newly created profile has auto-translation effectively disabled by default.
- The Language page shows the current state but provides no working toggle action.
- Only a direct database edit can enable or disable the profile flag.
- A disabled profile always sees exact source, cannot read cached translation output, and cannot trigger provider work.
- Saving content never waits for translation.
- No provider call occurs until a visible route needs a missing locale result.
- The source renders immediately during missing, pending, or failed states.
- One source hash and target locale produce one logical generation claim.
- A crashed action cannot leave a permanently unclaimable pending row.
- An older action cannot overwrite a newer generation or edited source.
- Same-language detection is cached without replacing the exact source.
- Canonical wiki targets, URLs, code, and numeric values survive translation.
- Changing locale or adding a helper causes no eager backfill; visible content translates on demand.
- Existing locale caches remain reusable after switching away and back.
- Provider failure never blocks saving, viewing, completing, or deleting household work.
- The Burmese helper approves the task POC before any entity expansion.

---

## Non-goals

- Voice input, speech transcription, or TTS
- Translation on save
- Blanket or member-join backfills
- Translating every UI-supported locale
- Automatic background retry chains
- Provider-selection or translation-control UI
- Any application mutation for changing the auto-translation feature flag
- Manual editing of generated translations in the first release
- Arbitrary Markdown page translation before structural segmentation exists
- Multilingual semantic Search in the first release
- Certified translation for legal, medical, or safety-critical content

---

## Reference documentation

- Convex queries and reactivity: <https://docs.convex.dev/functions/query-functions>
- Convex actions: <https://docs.convex.dev/functions/actions>
- Convex scheduled functions: <https://docs.convex.dev/scheduling/scheduled-functions>
- Convex testing: <https://docs.convex.dev/testing/convex-test>
