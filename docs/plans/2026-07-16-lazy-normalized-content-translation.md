# Lazy Normalized Content Translation Implementation Plan

> **For Hermes:** Use the `subagent-driven-development` skill to implement this plan task-by-task.

**Goal:** Show employer- and helper-authored household content in the viewer's selected language by normalizing informal source text, translating only fields the viewer actually fetches, caching the result, and letting Convex live queries replace the source fallback automatically.

**Architecture:** Keep every authored field as the permanent source of truth. A visible route asks a reactive Convex query for translations of only the fields it is rendering; a client hook then calls an idempotent mutation for missing or stale results. The mutation records pending work and schedules an internal action, the action protects structured syntax, normalizes and translates through the selected hosted provider, and an internal mutation writes the result only if the source hash still matches. That write invalidates the subscribed query and updates the UI without polling or refresh.

**Tech stack:** React 19, TypeScript, `react-i18next`, Convex queries/mutations/internal actions/scheduler, native `fetch`, SHA-256 source fingerprints, Vitest + `convex-test`, and a provider selected by a real English/Singlish-to-Burmese quality evaluation.

---

## Why this feature matters

Bluetape's helper-facing UI is localized, but household content remains whatever language the author typed. The practical household currently has one Burmese helper, so translating every record into every supported UI locale would waste API quota, database storage, and background work.

The source text may also be shorthand or locally phrased rather than a complete instruction. Literal translation is not enough. For example:

```text
Later take yellow cloth wipe table can
```

should first become a clear source sentence such as:

```text
Later, use the yellow cloth to wipe the table.
```

and only then be translated. Normalization must improve clarity without inventing actions or changing names, quantities, dates, negation, urgency, order, Markdown, or Bluetape's canonical `[[page:<id>|label]]` references.

The existing top-level plan (`docs/plans/PLAN.md` §6.10) says V2 translation will populate fields on save and describes `localContent`/embedded translation maps as the future design. This feature plan supersedes that direction: translation is lazy, field-level, viewer-locale-specific, and stored separately from source entities.

---

## Resolved product decisions

### 1. Translate only for a viewer who needs it

The current family uses English and Burmese. Bluetape must not generate Indonesian user-content translations merely because Indonesian UI strings exist.

Rules:

- If the viewer's locale matches the source locale, show the source and do no work.
- If a Burmese viewer fetches an English field and no current Burmese result exists, enqueue Burmese generation.
- If an English viewer fetches a Burmese field and no current English result exists, enqueue English generation.
- A locale that no family member is currently viewing receives no translations.
- If a member later selects another locale, translations are generated only as that member fetches content.

### 2. Translation is lazy, not save-triggered

Creating or editing content stores only the source. It does not fan out translation work.

Translation is requested by mounted, visible routes:

- Today requests the visible task/routine/rule fields.
- Shopping requests active row names.
- A detail route requests the fields shown on that record.
- Expanding Upcoming requests the newly visible task fields.
- Search requests searchable titles/names, not every page body.

AppShell warm subscriptions must not enqueue translation work. A data query may remain warm, but only the visible route mounts the translation-enforcement hook.

### 3. Original text is permanent

Machine output never replaces the authored field.

For each translated field retain:

- original source text on the source entity
- normalized source text in translation storage
- translated text in translation storage
- detected source language
- source fingerprint
- provider/model metadata

Editors always edit the original source. Lists show the viewer's language. Detail views offer a quiet “Show original” action when a current translation exists.

### 4. Normalization is mandatory for the production path

The production provider must turn informal phrasing into a clear, complete household instruction before or as part of translation.

Normalization must:

- preserve the exact requested action
- preserve negation (`do not`, `don't`)
- preserve names and linked household items
- preserve quantities, dates, units, sequence, and urgency
- improve grammar and sentence completeness
- avoid adding assumptions when the source is ambiguous
- leave protected tokens byte-for-byte unchanged

### 5. Browser inference is not the V1 path

Chrome's built-in Translator, Prompt, and Rewriter APIs currently do not work on Android. Chrome's built-in Translator list also does not include Burmese.

Transformers.js can technically run translation models such as NLLB-200 in a browser, but the available multilingual model is large, device-dependent, translation-only rather than a reliable instruction normalizer, and its model card describes it as research-oriented rather than intended for production deployment. Requiring the helper's phone to download and run both a translator and a normalizer would make reliability depend on device RAM, WebGPU support, battery, and model cache state.

Use a hosted backend provider for V1. Keep the provider boundary replaceable so an on-device path can be evaluated later without changing the Convex workflow or storage contract.

### 6. Provider selection is decided by a quality gate

Do not select a provider from marketing claims alone. Evaluate real household phrasing in these lanes:

1. DeepL Translate directly (free baseline).
2. DeepL Write followed by DeepL Translate (paid, English normalization only).
3. One hosted multilingual LLM returning normalized source plus target translation.
4. If needed, hosted LLM normalization followed by DeepL translation.

Current provider facts:

- DeepL API Free allows up to 500,000 translated characters per month and uses `https://api-free.deepl.com`.
- DeepL Translate can produce fluent target text but does not guarantee source normalization.
- DeepL custom translation instructions do not currently support Burmese as a target.
- DeepL Write can correct/rephrase English for clarity, but requires API Pro, is a separate request, and does not support Burmese or Indonesian as Write languages.
- The likely production winner is a hosted multilingual LLM in one structured call, but Burmese quality must be reviewed by the actual helper before this becomes a resolved provider decision.

Only implement the winning production adapter after the evaluation. Do not ship several dormant providers or expose provider selection in Settings.

---

## User experience

### Source fallback

A missing translation never blocks rendering. Show the original immediately.

Do not show row-level spinners across the daily checklist. On detail views, a small localized “Translating…” status may be shown only if testing proves the live text swap is confusing without it.

### Live replacement

When translation storage changes, the subscribed Convex query reruns and the localized selector returns the translated text. React updates the existing content in place. No polling, manual refresh, or navigation is required.

### Original access

- Lists: selected language only, with source fallback.
- Detail pages: selected language by default; show “Show original” only when a current translation differs from source.
- Editors: source text only.
- Search: match both original and translations that already exist.

### Search-specific behavior

Search is a special case because a Burmese query cannot match an English title that has never been translated.

When Search opens for a Burmese viewer:

- request title/name translations for the bounded searchable catalog currently fetched by Search
- do not request notes or page bodies
- let the live translation query expand Burmese matches as title translations arrive
- keep the original-title search path available during generation

This translates searchable labels only when Search is actually used and avoids translating full content catalogs.

---

## Data model

Add a separate `contentTranslations` table rather than embedding all locales on every source record.

Each document represents one entity field in one target locale:

```ts
{
  familyId: Id<"families">,
  entityType: "task" | "routine" | "page" | "groceryItem",
  entityId: Id<"tasks"> | Id<"routines"> | Id<"pages"> | Id<"groceryItems">,
  field: "title" | "note" | "description" | "content" | "location" | "name",
  targetLocale: string,
  sourceHash: string,
  status: "pending" | "ready" | "failed",
  normalizedText?: string,
  translatedText?: string,
  detectedSourceLocale?: string,
  provider?: string,
  model?: string,
  attempts: number,
  retryAfter?: number,
  errorCode?: string,
  updatedAt: number,
}
```

Use a discriminated-union schema validator so a `ready` document requires normalized and translated text while `pending` and `failed` documents cannot masquerade as usable results.

Indexes:

```ts
.index(
  "by_familyId_and_entityType_and_entityId_and_field_and_targetLocale",
  ["familyId", "entityType", "entityId", "field", "targetLocale"],
)
.index(
  "by_familyId_and_targetLocale_and_status",
  ["familyId", "targetLocale", "status"],
)
```

The first index is the deduplication/current-result lookup. The second supports bounded diagnostics and retry inspection.

Do not add translation arrays to source documents. Translation status is higher-churn operational data and belongs in its own table.

### Source freshness

Use SHA-256 of the exact canonical source field as `sourceHash`.

Benefits:

- no migration or version field on every existing entity
- changing one field invalidates only that field's translation
- completion/status/count changes do not invalidate text
- a delayed action can compare its original hash with the current field and discard stale output

Extract a shared Convex SHA-256 helper instead of creating a third copy beside the existing API-key hash implementations.

### Translatable field registry

Create one server-side registry that maps valid entity/field pairs and reads the authoritative source:

| Entity | Fields |
|---|---|
| Task | `title`, `note` |
| Routine | `title`, `description` |
| Page | `title`, `content`, `location` |
| Grocery item | `name` |

`pages.localName` is not translated because it may be the exact name printed on a product. Preserve `pages.localContent` as legacy stored data, but do not treat it as generated output or silently infer which locale it represents.

Names of people, family names, dates, counts, and photos are not translatable entities.

---

## Convex request lifecycle

### 1. Visible route describes the fields it renders

The route passes bounded field references to a reusable hook:

```ts
useLocalizedFields([
  { entityType: "task", entityId: task._id, field: "title" },
  { entityType: "task", entityId: task._id, field: "note" },
])
```

The hook derives the target locale from the current profile. It does not accept an arbitrary target locale from feature code.

### 2. Reactive query returns current results

`translations:getForFields`:

- requires an authenticated family member
- accepts a bounded list of field references
- loads each source entity and verifies family ownership
- computes the current source hash
- returns a ready translation only when locale and source hash match
- reports missing, pending, or failed state without side effects

Convex queries remain deterministic and never call the provider or write state.

### 3. Client hook requests missing work

A `useEffect` inside `useLocalizedFields` calls one `translations:ensure` mutation for missing/stale fields only when the route enables generation.

The effect key is based on stable entity IDs, fields, target locale, and current source hashes. Rerenders may call the mutation again, but correctness does not depend on client-side suppression.

### 4. Mutation authorizes and deduplicates

`translations:ensure`:

- requires the caller's profile locale to equal the requested target locale
- verifies every entity belongs to the caller's active family
- enforces a bounded batch size
- recomputes source hashes server-side
- skips ready results for the same hash
- skips already-pending results for the same hash
- respects `retryAfter` for failed results
- inserts or updates `pending` rows transactionally
- schedules one internal batch action for newly claimed fields

The unique logical key is family + entity type + entity ID + field + target locale. Concurrent clients converge on one pending row because the check and write happen in a Convex mutation transaction.

### 5. Internal action normalizes and translates

The action:

1. Reads all claimed source fields in one internal query.
2. Drops any field whose source hash no longer matches the claim.
3. Protects structured tokens.
4. Batches compatible fields for the selected provider within provider payload limits.
5. Requests structured output containing detected source language, normalized source, and translated text.
6. Validates provider output and protected-token integrity.
7. Writes results through one internal mutation.

Use native `fetch`; do not add a provider SDK unless the selected provider cannot be called credibly through REST.

### 6. Internal mutation writes only fresh results

Before writing `ready`, re-read each source field and recompute its hash. If it differs from the action's claim, discard the result. The viewer's still-mounted query will observe the new source hash and enqueue the newer text.

### 7. Convex updates the UI

Writing a ready translation invalidates `translations:getForFields`. The client receives the new value, `useLocalizedFields` selects `translatedText`, and the visible route updates automatically.

---

## Normalization and syntax protection

### Protected material

Before model/provider calls, protect:

- canonical wiki targets such as `page:<id>`
- unresolved wiki targets, while allowing their visible label to be translated
- Markdown link URLs
- bare URLs
- inline code and fenced code blocks
- numbers, quantities, dates, and explicit units where a change would alter instructions

For canonical wiki links:

```text
[[page:abc123|yellow cloth]]
```

represent the target separately from the translatable label:

```xml
<wiki target="page:abc123">yellow cloth</wiki>
```

A DeepL adapter can use XML tag handling. An LLM adapter can use opaque placeholders plus a structured response schema. The provider-neutral protection layer must restore the same canonical target regardless of adapter.

### Integrity checks

Reject output if:

- a protected token is missing, duplicated, or altered
- a wiki target changes
- a protected number/date/unit changes
- output fields are missing
- the target-language text is empty
- structured output cannot be parsed

Rejected output becomes a retryable failure; the UI keeps showing source text.

### Normalization instruction contract

The selected provider receives a concise instruction equivalent to:

> Rewrite the source as a clear, complete household instruction in the same source language. Preserve every action, object, name, quantity, date, unit, negation, urgency, and sequence. Do not infer missing actions or add advice. Keep every protected token unchanged. Then translate the normalized instruction into the requested target language using natural wording suitable for a household helper.

Do not store model reasoning. Store only detected source language, normalized source, translated text, and provider metadata.

---

## Failure, retry, and quota behavior

Actions are not automatically retried safely by Convex, so retries are explicit and bounded.

- Retry transient provider errors (`429`, `500`, `503`, `504`, network timeout) with scheduled backoff.
- Do not retry malformed requests, unsupported language pairs, or failed integrity checks indefinitely.
- Store a stable `errorCode`, not source text, secrets, raw provider responses, or stack traces.
- After the retry limit, keep `failed`; a later visible fetch may reclaim it after `retryAfter`.
- DeepL quota exhaustion (`456`) falls back to source and should surface in backend diagnostics.
- Saving, completing, or viewing household work must never fail because translation failed.

Add a bounded owner/admin diagnostic query for failed translation rows and provider usage metadata. Do not add a translation-provider control panel to Settings; Settings remains language-only.

---

## Security and privacy

- Provider credentials live in typed Convex environment variables declared in `convex/convex.config.ts`.
- Never expose provider keys in Vite environment variables or browser code.
- `translations:ensure` derives identity, active family, and viewer locale server-side.
- A client cannot translate another family's records or request arbitrary target locales for quota abuse.
- Send only required text fields to the provider; never send photos, family/member records, auth data, or unrelated page content as context.
- Provider logs must not contain household source text.
- DeepL's explicit no-persistent-storage/no-training statement applies to paid API plans. If API Free is chosen, document that privacy trade-off before production use.

---

## Success criteria

- An English/Singlish task fetched by the Burmese helper first shows the source, then updates live to clear Burmese without refresh.
- No translation job is created until a visible route requests the field.
- AppShell warm subscriptions do not create translation jobs.
- Indonesian content translations are not generated unless an Indonesian viewer requests them.
- Informal source text is stored unchanged while normalized source and translation are cached separately.
- A Burmese-authored field can be normalized and translated to English when the employer fetches it.
- Canonical wiki page IDs remain byte-for-byte unchanged through normalization and translation.
- URLs, code, quantities, dates, negation, and order survive the pipeline.
- Concurrent devices requesting the same field produce one logical pending translation.
- Editing the source while an action is running prevents the stale result from becoming current.
- Provider failure or quota exhaustion never blocks source rendering or ordinary mutations.
- Switching Language uses cached current results immediately and lazily requests only newly needed fields.
- Search requests title/name translations only and can match both source and ready translated labels.
- The actual Burmese helper approves the selected provider on a blind sample of real household phrases.
- After acceptance, the application version is bumped from `0.0.0` to `0.1.0`.

---

## Non-goals

- Translating all existing content in a blanket backfill.
- Translating into every locale supported by the UI.
- Running a required model in the helper's Android browser.
- Replacing authored source text with normalized or translated text.
- Manual editing of generated translations in the first iteration.
- A provider-selection UI or translation controls in Settings.
- Translating people/family names, photos, counts, or exact product `localName` values.
- Full multilingual semantic search before title-level lazy translation is proven.
- Certified, legal, medical, or safety-critical translation guarantees.

---

## POC-before-expansion rule

Prove one real task end-to-end before changing routines, pages, shopping, or Search.

POC scenario:

1. Admin creates an informal English/Singlish task containing a canonical wiki link and a negation.
2. No translation row exists after save.
3. Burmese helper opens the task detail or Today.
4. Source text renders immediately.
5. The visible route requests the missing Burmese fields once logically.
6. Backend stores `pending`, runs normalization/translation, and writes `ready`.
7. Convex live query replaces the source fallback with Burmese.
8. The wiki link opens the same stable page ID.
9. Editing the source during a deliberately delayed action proves stale output is discarded.
10. A provider failure proves source rendering and normal task behavior remain intact.

Do not expand to other entities until this slice passes automated tests and human Burmese review.

---

## Task 1: Build the translation quality corpus and select a provider

**Objective:** Decide the production provider using real household language rather than assumptions.

**Files:**

- Create: `docs/translation-evaluation.md`
- Create: `scripts/evaluate-translations.mjs`
- Create: `scripts/fixtures/translation-corpus.json`
- Modify: `.gitignore`

**Steps:**

1. Collect a small redacted corpus covering:
   - informal English/Singlish fragments
   - complete English instructions
   - Burmese-authored instructions for English output
   - negation, quantities, dates, sequence, and urgency
   - wiki links, URLs, and Markdown
2. Record expected preserved facts for every example, not one “correct” prose output.
3. Implement a script that reads credentials from environment variables, protects tokens, and writes provider outputs to an ignored local results file.
4. Add that local results path to `.gitignore`; never commit raw household examples or provider credentials.
5. Evaluate direct DeepL Translate, DeepL Write → Translate if Pro credentials are available, and one hosted multilingual LLM with structured output.
6. Blind the provider names and have the Burmese helper assess clarity, naturalness, and operational correctness.
7. Record the selected provider, model/version, known weaknesses, and rejection rationale for alternatives in `docs/translation-evaluation.md`.
8. Stop if no candidate preserves meaning reliably. Do not compensate with prompt complexity before reviewing bad examples.

**Verification:** The evaluation document names one production adapter and includes helper-reviewed examples without storing private household text in Git.

**Suggested commit:**

```bash
git add .gitignore docs/translation-evaluation.md scripts/evaluate-translations.mjs scripts/fixtures/translation-corpus.json

git commit -m "test: evaluate normalized Burmese translation providers"
```

---

## Task 2: Establish Convex translation test infrastructure

**Objective:** Add repeatable backend tests before schema or workflow implementation.

**Files:**

- Modify via npm: `package.json`, `package-lock.json`
- Create: `convex/test.setup.ts`
- Create: `convex/translations.test.ts`

**Steps:**

1. Install current test dependencies through npm:

   ```bash
   npm install -D vitest convex-test @edge-runtime/vm
   npm pkg set scripts.test="vitest run"
   ```

2. Configure `convex-test` with the repository schema and `import.meta.glob` module map.
3. Add authenticated family fixtures for owner, admin, helper, English profile, and Burmese profile.
4. Write a baseline test proving a helper cannot read another family's task.
5. Run `npm test` and confirm the harness passes before feature code begins.

**Suggested commit:**

```bash
git add package.json package-lock.json convex/test.setup.ts convex/translations.test.ts

git commit -m "test: add Convex translation regression harness"
```

---

## Task 3: Implement and test source protection primitives

**Objective:** Make normalization/translation safe for Bluetape syntax before calling any model.

**Files:**

- Create: `convex/translation/protection.ts`
- Create: `convex/translation/protection.test.ts`
- Create: `convex/lib/sha256.ts`
- Modify: `convex/apiKeys.ts`
- Modify: `convex/http.ts`

**Steps:**

1. Write failing tests for canonical wiki links, unresolved links, labeled links, multiple links, URLs, Markdown links, inline/fenced code, numbers, dates, quantities, and malformed provider output.
2. Extract the existing SHA-256 implementation into `convex/lib/sha256.ts` and keep API-key behavior unchanged.
3. Implement `protectTranslatableText` returning protected text plus a restoration manifest.
4. Implement `restoreTranslatedText` with strict one-to-one token validation.
5. Verify canonical wiki targets are identical after restoration while visible labels may change.
6. Verify restoration rejects missing, duplicated, reordered where prohibited, or altered protected tokens.
7. Run targeted tests and the full suite.

**Suggested commit:**

```bash
git add convex/translation/protection.ts convex/translation/protection.test.ts convex/lib/sha256.ts convex/apiKeys.ts convex/http.ts

git commit -m "feat: protect structured content during translation"
```

---

## Task 4: Add field-level translation storage

**Objective:** Store lazy operational state separately from source entities.

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/admin.ts`
- Create: `convex/translation/validators.ts`
- Modify: `convex/translations.test.ts`

**Steps:**

1. Write failing schema tests for pending, ready, and failed documents.
2. Add the `contentTranslations` discriminated-union table and indexes specified above.
3. Add reusable validators for entity type, entity ID union, field, target locale, and bounded field-reference arrays.
4. Add the table to dev-only wipe support without changing production wipe protections.
5. Test the logical uniqueness lookup and family/field validation.
6. Run `npm test` and `npx convex dev --once`.

**Suggested commit:**

```bash
git add convex/schema.ts convex/admin.ts convex/translation/validators.ts convex/translations.test.ts

git commit -m "feat: add lazy content translation storage"
```

---

## Task 5: Add the authoritative source-field registry

**Objective:** Centralize valid entity/field pairs, authorization boundaries, and source hashing.

**Files:**

- Create: `convex/translation/sourceFields.ts`
- Create: `convex/translation/sourceFields.test.ts`

**Steps:**

1. Write failing tests for every valid and invalid entity/field combination.
2. Implement a typed discriminated reference validator.
3. Implement one batched source reader that:
   - resolves typed IDs
   - verifies each entity exists in the active family
   - reads only the requested source field
   - treats absent optional fields as non-translatable
   - computes SHA-256 over the exact canonical source
4. Verify `localName`, `localContent`, status fields, counts, people, and photos cannot be requested.
5. Bound the number of references accepted per call.
6. Run targeted and full tests.

**Suggested commit:**

```bash
git add convex/translation/sourceFields.ts convex/translation/sourceFields.test.ts

git commit -m "feat: register translatable source fields"
```

---

## Task 6: Implement the selected provider adapter

**Objective:** Convert protected source text into validated normalized source and target translation through one replaceable boundary.

**Files:**

- Create: `convex/translation/provider.ts`
- Create: `convex/translation/provider.test.ts`
- Modify: `convex/convex.config.ts`

**Steps:**

1. Define a narrow provider interface returning:
   - detected source locale
   - normalized source text
   - translated target text
   - provider/model identifiers
2. Add typed environment variables only for the provider selected in Task 1.
3. Implement the adapter with native `fetch`, explicit timeout, bounded payload size, and structured response validation.
4. Keep provider credentials and source text out of logs and errors.
5. Feed protected tokens through the provider and restore/validate both normalized and translated outputs.
6. Unit-test success, timeout, rate limit, quota exhaustion, malformed output, unsupported locale, and token-integrity failure using mocked network responses.
7. Run the provider against the redacted evaluation corpus in development.

**Suggested commit:**

```bash
git add convex/translation/provider.ts convex/translation/provider.test.ts convex/convex.config.ts

git commit -m "feat: add normalized translation provider adapter"
```

---

## Task 7: Build the reactive get/ensure/process workflow

**Objective:** Implement pure reads, idempotent claiming, scheduled provider work, retries, and freshness-safe writes.

**Files:**

- Create: `convex/translations.ts`
- Create: `convex/translationActions.ts`
- Modify: `convex/translations.test.ts`

**Steps:**

1. Write failing tests for missing, pending, ready, stale, failed, unauthorized, cross-family, arbitrary-locale, and duplicate-concurrent requests.
2. Implement `translations:getForFields` as a pure authenticated query returning current state for a bounded field list.
3. Implement `translations:ensure` as a public mutation that derives family and locale from the caller, validates sources, deduplicates claims, and schedules only newly pending fields.
4. Implement one internal query that loads a claimed batch and drops stale hashes.
5. Implement one internal action that calls the provider for a bounded batch.
6. Implement one internal mutation that revalidates all source hashes and writes ready/failed results transactionally.
7. Implement explicit bounded retries for transient failures using `ctx.scheduler.runAfter`.
8. Verify two clients claiming the same field result in one logical pending row and no duplicate current result.
9. Verify an edit during a delayed action prevents stale output from being returned as current.
10. Run `npm test` and `npx convex dev --once`.

**Suggested commit:**

```bash
git add convex/translations.ts convex/translationActions.ts convex/translations.test.ts

git commit -m "feat: add reactive lazy translation workflow"
```

---

## Task 8: Add the client localization hook

**Objective:** Let visible routes subscribe to cached translations and enqueue missing work without making warm queries generate jobs.

**Files:**

- Create: `src/data/useLocalizedFields.ts`
- Create: `src/lib/localized-content.ts`
- Create: `src/lib/localized-content.test.ts`
- Modify: `src/data/hooks.ts`

**Steps:**

1. Write failing selector tests for source locale, missing, pending, ready-current, ready-stale, failed, and “show original”.
2. Implement `selectLocalizedText` as a pure source-fallback helper.
3. Implement `useLocalizedFields` with stable memoized field references and the current profile locale.
4. Keep the Convex translation query subscribed while the visible route is mounted.
5. Trigger `translations:ensure` from an effect only when `generate: true`; warmup callers use source data without mounting this hook.
6. Ensure rerenders do not create client request storms while server deduplication remains the correctness boundary.
7. Run unit tests, lint, and build.

**Suggested commit:**

```bash
git add src/data/useLocalizedFields.ts src/lib/localized-content.ts src/lib/localized-content.test.ts src/data/hooks.ts

git commit -m "feat: add reactive localized-content hook"
```

---

## Task 9: Prove the task vertical slice

**Objective:** Complete one real English/Singlish-to-Burmese task flow through Today and task detail.

**Files:**

- Modify: `src/routes/tasks.tsx`
- Modify: `src/routes/task-view.tsx`
- Modify: `src/components/Markdown.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/id.json`
- Modify: `src/locales/my.json`
- Modify: `convex/translations.test.ts`

**Steps:**

1. Add failing tests for task title/note translation and stable wiki targets.
2. On the visible Tasks/Today route, request title and visible note fields for rendered task rows.
3. On task detail, request title and note and support a localized “Show original” action.
4. Keep task editing bound to `task.title` and `task.note`, never generated values.
5. Ensure marking done/undone does not invalidate text translation.
6. Test source-first rendering, live replacement, provider failure fallback, source edit invalidation, and link navigation.
7. Have the Burmese helper review the real POC on Android before expansion.
8. Run all validation commands.

**Suggested commit:**

```bash
git add src/routes/tasks.tsx src/routes/task-view.tsx src/components/Markdown.tsx src/locales/en.json src/locales/id.json src/locales/my.json convex/translations.test.ts

git commit -m "feat: translate fetched task content reactively"
```

---

## Task 10: Extend lazy translation to routines and Shopping

**Objective:** Apply the proven path to recurring instructions and active shopping rows.

**Files:**

- Modify: `src/routes/routines/index.tsx`
- Modify: `src/routes/routines/view.tsx`
- Modify: `src/routes/shopping.tsx`
- Modify: `src/routes/shopping-view.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/id.json`
- Modify: `src/locales/my.json`
- Modify: `convex/translations.test.ts`

**Steps:**

1. Add routine title/description and grocery name test cases.
2. Request only visible routine fields on the index and detail routes.
3. Request only active Shopping row names.
4. Preserve source values in every create/edit control.
5. Confirm count/status updates do not create new translation requests.
6. Verify helper-authored Burmese shopping names can appear in English when fetched by the employer.
7. Run tests, i18n validation, lint, and build.

**Suggested commit:**

```bash
git add src/routes/routines src/routes/shopping.tsx src/routes/shopping-view.tsx src/locales convex/translations.test.ts

git commit -m "feat: translate fetched routines and shopping items"
```

---

## Task 11: Extend lazy translation to pages, Today rules, and Search

**Objective:** Localize rule/item content and searchable labels without translating entire page bodies eagerly.

**Files:**

- Modify: `src/routes/pages/view.tsx`
- Modify: `src/routes/items.tsx`
- Modify: `src/routes/rules.tsx`
- Modify: `src/routes/search.tsx`
- Modify: `src/components/WikiLinkSuggestions.tsx`
- Modify: `src/components/LinkAutocomplete.tsx`
- Modify: `src/data/hooks.ts`
- Modify: `convex/today.ts`
- Modify: `convex/pages.ts`
- Modify: `convex/translations.test.ts`

**Steps:**

1. Add page title/content/location and canonical-link preservation tests.
2. Translate title/location on catalogs and title/content/location on detail.
3. Translate visible pinned-rule title/content on Today.
4. Leave `localName` and legacy `localContent` unchanged.
5. When Search opens, request only title/name fields for its bounded catalog; search both source and ready translations.
6. Show localized wiki suggestion labels while inserting the same stable page identity.
7. Keep list/search queries from returning every translated page body.
8. Verify a Burmese wiki label still navigates to the original page ID.
9. Run tests, Convex sync, i18n validation, lint, and build.

**Suggested commit:**

```bash
git add src/routes/pages/view.tsx src/routes/items.tsx src/routes/rules.tsx src/routes/search.tsx src/components/WikiLinkSuggestions.tsx src/components/LinkAutocomplete.tsx src/data/hooks.ts convex/today.ts convex/pages.ts convex/translations.test.ts

git commit -m "feat: translate fetched pages and searchable labels"
```

---

## Task 12: Add diagnostics, update architecture docs, and release

**Objective:** Close operational gaps, replace stale plan decisions, and release the accepted feature as `0.1.0`.

**Files:**

- Modify: `convex/translations.ts`
- Modify: `docs/plans/PLAN.md`
- Create: `docs/adr/002-lazy-normalized-content-translation.md` (or next available ADR number)
- Modify via npm: `package.json`, `package-lock.json`

**Steps:**

1. Add an owner/admin bounded query for failed translation metadata and usage diagnostics without returning secrets.
2. Update `docs/plans/PLAN.md` V1/V2 and §6.10 statements that claim translation happens on save or uses only embedded/manual fields.
3. Record the final provider, privacy posture, lazy lifecycle, field-level table, and browser-model decision in an ADR.
4. Verify no blanket translation/backfill command exists.
5. Run the complete acceptance matrix on development with English and Burmese accounts.
6. Verify on the helper's Android phone that source fallback, live replacement, Noto Sans rendering, links, and language switching behave correctly.
7. Set the version through npm rather than hand-editing manifests:

   ```bash
   npm version 0.1.0 --no-git-tag-version
   ```

8. Run:

   ```bash
   npm test
   npm run check:i18n
   npm run lint
   npm run build
   npx convex dev --once
   git diff --check
   ```

9. Review provider usage/quota and confirm no household source text or credentials appear in logs.
10. Commit the release only after user acceptance.

**Suggested commit:**

```bash
git add convex/translations.ts docs/plans/PLAN.md docs/adr package.json package-lock.json

git commit -m "docs: finalize lazy translation architecture"
```

---

## Reference documentation

- Convex queries and reactivity: <https://docs.convex.dev/functions/query-functions>
- Convex actions: <https://docs.convex.dev/functions/actions>
- DeepL API Free usage limits: <https://developers.deepl.com/docs/resources/usage-limits>
- DeepL Translate API: <https://developers.deepl.com/api-reference/translate>
- DeepL Write API: <https://developers.deepl.com/api-reference/improve-text>
- DeepL supported languages/features: <https://developers.deepl.com/docs/getting-started/supported-languages>
- Chrome built-in Translator API: <https://developer.chrome.com/docs/ai/translator-api>
- Chrome Prompt API requirements: <https://developer.chrome.com/docs/ai/prompt-api>
- Transformers.js browser inference: <https://huggingface.co/docs/transformers.js/main/en/index>
- NLLB-200 distilled model card: <https://huggingface.co/facebook/nllb-200-distilled-600M>
