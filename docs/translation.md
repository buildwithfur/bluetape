# Typed Content Translation

Bluetape can translate visible user-authored content into the signed-in
viewer’s selected language. This is an operator-controlled text feature; it is
separate from any future voice-input feature.

## Current scope

The lazy translation cache covers:

- one-off task titles and notes, including Today, Tomorrow, Upcoming, detail,
  and search-result labels
- routine titles and descriptions
- shopping item names
- note and rule titles, locations, and Markdown bodies, including pinned-rule
  callouts
- recipe titles, ingredients, steps, and notes

It does not translate account/family names, email addresses, or numeric counts.
Editors always read and write the original authored fields.

When enabled, a view renders the original text immediately. It then reads a
cached translation for the viewer's current locale or requests one missing
translation in the background. Convex reactivity replaces the displayed text
when the result becomes ready. A single app-level “Translating content…”
indicator appears only while one or more viewer-locale jobs are pending; it
does not create jobs itself. A provider failure leaves original text visible.

## Per-user feature flag

The gate is the optional boolean field below on each `userProfiles` row:

```ts
autoTranslateEnabled?: boolean
```

Only the literal value `true` enables translation. A missing field and `false`
both mean disabled. All new profiles explicitly start with `false`.

The flag is intentionally per user, not per family:

- enabling one helper does not enable their employer or another helper
- the target language comes from that same profile's `locale`
- changing the locale uses a separate translation cache for the new language
- newly invited members remain disabled until an operator enables their row

### Language codes

Bluetape stores standard ISO 639-1 language codes in `userProfiles.locale` and
uses BCP 47 tags when a regional tag helps make the provider target explicit:

| Language | ISO 639-1 | Provider tag |
|---|---:|---:|
| English | `en` | `en` |
| Burmese | `my` | `my-MM` |
| Indonesian | `id` | `id-ID` |

`my` is Burmese. Malay is `ms`; Malay as used in Malaysia would normally be
tagged `ms-MY`. In these tags, lowercase `my` is the Burmese language subtag,
uppercase `MY` is the Malaysia region code, and uppercase `MM` is the Myanmar
region code. Do not substitute `ms` for Burmese.

There is no application mutation for this field. Family owners, admins, and
ordinary users cannot change it through the UI or by directly calling a public
Convex function. The Language page only displays its current value as a
disabled switch.

### Enable or disable a profile

Use the Convex dashboard for the deployment you intend to change:

```sh
# Development deployment selected by .env.local
npx convex dashboard

# Production deployment
npx convex dashboard --prod
```

In the dashboard:

1. Open **Data** and select `userProfiles`.
2. Find the intended profile. Use `userId` to disambiguate duplicate display
   names; it can be cross-checked against the user's `familyMembers` row.
3. Edit `autoTranslateEnabled` and set it to the boolean `true` or `false`.
4. Save the row.

Do not enter the strings `"true"` or `"false"`. The field must be a Convex
boolean. Direct database changes propagate to the mounted app reactively.

Disabling the flag takes effect immediately. It stops displaying cached
translations and prevents new provider work, but deliberately retains existing
cache rows. Re-enabling the profile can therefore reuse current results.

Deployment data is isolated. Changing a development profile does not change
production, and changing production does not change development.

## Provider configuration

Translation requests use OpenRouter. Configure its server-side key separately
for every deployment where the pilot may be enabled:

```sh
# Development
npx convex env set OPENROUTER_API_KEY

# Production
npx convex env set OPENROUTER_API_KEY --prod
```

Omitting the value makes the CLI request it interactively, keeping the secret
out of the command itself. Never put this key in a `VITE_` variable or commit it
to `.env.local`; browser-visible variables cannot protect a provider secret.

The default model is:

```text
xiaomi/mimo-v2.5
```

An operator may change the model without a code deployment:

```sh
npx convex env set OPENROUTER_TRANSLATION_MODEL
npx convex env set OPENROUTER_TRANSLATION_MODEL --prod
```

The override must be a valid OpenRouter model slug that has passed the same
meaning-preservation review as the default. If the API key is absent or the
provider fails, authored source remains usable and the cache records a short
retry cooldown.

## Translation and cache behavior

Authored fields are never overwritten. A separate `contentTranslations` table
stores disposable results keyed by family, entity, field, target locale, and a
SHA-256 hash of the exact source.

The lifecycle is:

1. A gated viewer opens a supported view.
2. Bluetape shows the authored source and queries the viewer-locale cache.
3. A missing or stale field is claimed once with a short lease.
4. One OpenRouter request interprets colloquial, dialectal, incomplete, or
   locally phrased input as clear standard English and translates that intended
   meaning.
5. The result is stored only if the source entity, source hash, and claim generation are
   still current.
6. The subscribed UI displays the ready translation.

The provider call protects Markdown structure, wiki targets, URLs,
inline/fenced code, and numeric values with placeholders. A result with
missing, duplicated, or altered placeholders is rejected. Editing source text
makes the previous cached result stale; toggling task completion does not.
Deleting a translated source entity also deletes its translation rows.

## Operational checks

Before enabling a real profile:

- confirm `OPENROUTER_API_KEY` exists on the same deployment
- confirm the profile's `locale` is supported (`en`, `my`, or `id` currently)
- test representative household instructions, especially negation, quantities,
  dates, names, dialectal phrasing, fillers, fragments, and code-switching
- have a fluent speaker approve the target-language quality
- remember that content sent for translation leaves Bluetape and is processed
  through OpenRouter and its selected model provider

### Live provider smoke test

On 2026-07-22, the development deployment successfully called OpenRouter with
`deepseek/deepseek-v4-flash` for this colloquial-English-to-Burmese sample:

```text
Source:     you dont anyhow throw things around
Normalized: Don't throw things around carelessly.
Translated: ပစ္စည်းတွေကို ပေါ့ပေါ့ဆဆ မပစ်လိုက်နဲ့။
```

The first smoke attempt exposed that the model could misread bare locale code
`my` as Malay even though `my` correctly means Burmese in ISO 639-1. The
provider contract now sends the canonical BCP 47 tag `my-MM` plus an explicit
authoritative language name (`Burmese / Myanmar / မြန်မာဘာသာ; never Malay`),
with unit tests for that mapping. The smoke test proves the live provider path
and output contract work; a fluent Burmese speaker must still approve
naturalness and meaning before enabling the flag broadly.

Useful implementation references:

- `convex/translations.ts` — access gate, cache reads, claims, and completion
- `convex/translationActions.ts` — provider action and protected restoration
- `convex/translation/provider.ts` — OpenRouter request contract and default model
- `src/data/useLocalizedFields.ts` — source-first client behavior
- `docs/plans/2026-07-16-lazy-normalized-content-translation.md` — detailed design
