# Bluetape CLI Device Authorization Implementation Plan

> **For Hermes:** Use the `subagent-driven-development` skill to implement this plan task-by-task.

**Goal:** Add a Railway-style `bluetape login` flow that prints an eight-character code and browser URL, lets a signed-in family owner approve the device, and returns a revocable family-bound Bluetape API key to the CLI.

**Architecture:** Implement the OAuth 2.0 Device Authorization Grant *pattern* without turning Bluetape into a general OAuth provider. The CLI receives a high-entropy opaque device secret plus a human-readable `XXXX-XXXX` code, polls Convex while the owner approves in the existing React app, and exchanges the approved request exactly once for the same family-bound bearer key already accepted by `/api/*`. The eight-character code is an identifier, not the credential; no plaintext API key or device secret is stored in Convex.

**Tech Stack:** Node.js 20+ CLI using built-in APIs, React 19, React Router, Convex, `@convex-dev/auth`, TypeScript, `react-i18next`, Vitest + `convex-test` for backend tests, Node's built-in test runner for the dependency-free CLI.

---

## 1. Product Contract

### CLI experience

```text
$ bluetape login

Your authentication code is: B7KQ-MR2V
Please visit:
  https://<bluetape-app>/activate

Waiting for authentication...
Logged in to Furqaan's household
```

The URL and code must always be printed, even when the CLI also attempts to open the browser. `bluetape login --browserless` skips browser opening and otherwise uses the identical flow.

### Authorization screen

The browser page must show:

- device name, supplied by the CLI and escaped/rendered as text;
- requested access: **full read/write access to one household**;
- the family selector when the user owns more than one family;
- explicit **Approve** and **Deny** actions;
- expiry, invalid-code, already-used, and denied states.

Only the family owner may approve. Admin and helper membership is insufficient because existing API keys grant broad family-level read/write access.

### V1 access model

Do not add decorative OAuth scopes that the HTTP API does not enforce. V1 grants the existing family-bound API-key capability in full and says so plainly. Fine-grained read/write scopes are a separate feature requiring enforcement in every `/api/*` handler.

### Non-goals

- General OAuth/OIDC provider support.
- Google, GitHub, or other social login.
- Refresh tokens.
- Helper/admin approval.
- Multiple API scopes.
- Moving existing browser sessions into the CLI.
- Replacing manually created API keys; both flows continue to work.

---

## 2. Protocol Contract

### Start authorization

```http
POST /cli/device/start
Content-Type: application/json

{
  "deviceName": "hermes-server",
  "clientVersion": "0.1.0"
}
```

```json
{
  "deviceCode": "bt_dc_<256-bit-random-secret>",
  "userCode": "B7KQ-MR2V",
  "verificationUri": "https://<PUBLIC_APP_URL>/activate",
  "expiresIn": 600,
  "interval": 5
}
```

Rules:

- `deviceName`: trimmed, 1–80 characters.
- `clientVersion`: optional, trimmed, maximum 40 characters.
- `userCode`: eight characters from an unambiguous uppercase alphabet, displayed as `XXXX-XXXX`.
- `deviceCode`: at least 256 bits of cryptographic randomness with a `bt_dc_` prefix.
- Expiry: 10 minutes.
- Minimum polling interval: 5 seconds.
- `PUBLIC_APP_URL` comes from typed Convex environment configuration; the endpoint returns `503` when it is missing rather than inventing a host.

### Poll/exchange authorization

```http
POST /cli/device/token
Content-Type: application/json

{
  "deviceCode": "bt_dc_<secret>"
}
```

Responses:

| State | HTTP | Body |
|---|---:|---|
| Pending | `202` | `{ "error": "authorization_pending", "interval": 5 }` |
| Polling too quickly | `429` | `{ "error": "slow_down", "interval": 5 }` |
| Denied | `403` | `{ "error": "access_denied" }` |
| Expired | `410` | `{ "error": "expired_token" }` |
| Unknown secret | `400` | `{ "error": "invalid_device_code" }` |
| Already exchanged | `409` | `{ "error": "already_consumed" }` |
| Approved | `200` | token response below |

Successful one-time response:

```json
{
  "accessToken": "bt_<family-api-key>",
  "tokenType": "Bearer",
  "family": {
    "id": "<convex-id>",
    "name": "Furqaan's household"
  },
  "apiUrl": "https://<deployment>.convex.site/api"
}
```

The exchange mutation creates the API-key row and marks the device request consumed in one Convex transaction. If the success response is lost after consumption, the user runs `bluetape login` again; V1 does not persist reversible plaintext tokens merely to support replay.

---

## 3. Security Invariants

1. The human code is never accepted by the token endpoint. Only the high-entropy device secret can poll and receive the API token.
2. Store `SHA-256(deviceCode)`, never the plaintext device secret.
3. Store `SHA-256(accessToken)` in `apiKeys`, preserving the existing bearer-key model.
4. Generate the API token only during successful exchange, not during browser approval, so no plaintext API key waits in the database.
5. Approval calls `requireFamilyOwner(ctx, familyId)` server-side.
6. The approval mutation derives `approvedBy` from browser auth; it never accepts a user ID from the client.
7. A request can transition only `pending → approved|denied → consumed`; terminal states cannot be approved again.
8. Expired requests cannot be inspected, approved, denied, or exchanged.
9. Polling faster than `interval` returns `slow_down` and never changes approval state.
10. A coarse bounded start-rate circuit breaker permits at most 100 starts per rolling 60 seconds per deployment; use the indexed recent-start query with `.take(101)`, not an unbounded collect.
11. Each request schedules bounded cleanup after 24 hours. Authorization logic still checks `expiresAt`; cleanup is storage hygiene, not security enforcement.
12. Device names and client versions are data only—never rendered as HTML.
13. The browser page clearly states that approval grants full household read/write API access.
14. Existing manual API keys remain valid and revocable.

---

## Phase 1 — Test Harness and Shared Token Primitives

### Task 1: Add backend and CLI test commands

**Objective:** Establish repeatable tests before implementing authorization behavior.

**Files:**

- Modify through npm commands: `package.json`, `package-lock.json`
- Create: `convex/deviceAuthorizations.test.ts`
- Create: `cli/bluetape.test.mjs`

**Steps:**

1. Install backend test dependencies using npm, never by hand-editing manifests:

   ```bash
   npm install -D vitest convex-test
   npm pkg set scripts.test="vitest run"
   npm pkg set scripts.test:cli="node --test cli/*.test.mjs"
   ```

2. Add a minimal failing Convex test proving `api.deviceAuthorizations.inspect` does not yet exist.
3. Add a minimal failing CLI test proving the future argument parser recognizes `login --browserless`.
4. Run:

   ```bash
   npm test
   npm run test:cli
   ```

   Expected: both suites fail for missing implementation, not configuration errors.

5. Commit:

   ```bash
   git add package.json package-lock.json convex/deviceAuthorizations.test.ts cli/bluetape.test.mjs
   git commit -m "test: add device authorization harness"
   ```

### Task 2: Extract shared secret generation and hashing

**Objective:** Use one implementation for manual API keys and device-issued API keys.

**Files:**

- Create: `convex/lib/tokenSecrets.ts`
- Modify: `convex/apiKeys.ts`
- Test: `convex/deviceAuthorizations.test.ts`

**Steps:**

1. Test that generated API keys have a `bt_` prefix, contain at least 256 bits of randomness, and produce stable lowercase SHA-256 hashes.
2. Test that generated user codes are formatted as `XXXX-XXXX` and every character belongs to the exact alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excluding `0`, `1`, `I`, and `O`).
3. Move `generateKey` and `sha256Hex` out of `convex/apiKeys.ts` into shared helpers.
4. Preserve validation of already-issued unprefixed API keys: request authentication hashes the complete bearer value and therefore remains backward-compatible.
5. Run the focused test, then `npm run build`.
6. Commit:

   ```bash
   git add convex/lib/tokenSecrets.ts convex/apiKeys.ts convex/deviceAuthorizations.test.ts
   git commit -m "refactor: share API token primitives"
   ```

---

## Phase 2 — Convex Device Authorization State Machine

### Task 3: Add the authorization table and indexes

**Objective:** Persist short-lived device requests without storing credentials in plaintext.

**Files:**

- Modify: `convex/schema.ts`

Add `deviceAuthorizations` with:

```ts
{
  deviceCodeHash: string,
  userCode: string,
  deviceName: string,
  clientVersion?: string,
  status: "pending" | "approved" | "denied" | "consumed",
  createdAt: number,
  expiresAt: number,
  pollIntervalMs: number,
  lastPolledAt?: number,
  approvedFamilyId?: Id<"families">,
  approvedBy?: Id<"users">,
  approvedAt?: number,
  deniedAt?: number,
  consumedAt?: number,
}
```

Indexes:

- `by_deviceCodeHash`
- `by_userCode`
- `by_createdAt`

Run `npx convex dev --once` against development and `npm run build`. Commit as `feat: add device authorization schema`.

### Task 4: Implement request creation and cleanup

**Objective:** Create collision-safe, expiring authorization requests.

**Files:**

- Create: `convex/deviceAuthorizations.ts`
- Test: `convex/deviceAuthorizations.test.ts`

**Steps:**

1. Write failing tests for input limits, ten-minute expiry, user-code collision retry, stored device hash, no stored device plaintext, and coarse recent-start throttling.
2. Implement `internalMutation` `start`:
   - validate/sanitize metadata;
   - apply the bounded recent-start circuit breaker;
   - retry user-code generation on active-code collision;
   - hash the device secret;
   - insert `pending` state;
   - schedule cleanup after 24 hours;
   - return plaintext device secret and user code only to the HTTP action.
3. Implement `internalMutation` `cleanup` that deletes the specified row only after its retention deadline.
4. Run focused and full tests. Commit as `feat: create device authorization requests`.

### Task 5: Implement authenticated browser inspection, approval, and denial

**Objective:** Let only a signed-in family owner approve an active code.

**Files:**

- Modify: `convex/deviceAuthorizations.ts`
- Test: `convex/deviceAuthorizations.test.ts`

**Public Convex functions:**

- `inspect({ userCode })` — authenticated lookup returning safe device metadata and state.
- `approve({ userCode, familyId })` — calls `requireFamilyOwner`; transitions pending to approved.
- `deny({ userCode })` — authenticated user can deny a pending code they are inspecting; no family data is attached.

**Tests:**

- unauthenticated inspection fails;
- helpers/admins cannot approve;
- owner can approve only for a family they own;
- expired, denied, approved, and consumed requests cannot be approved;
- response never contains `deviceCodeHash`;
- repeated approval is rejected deterministically.

Run focused and full tests. Commit as `feat: approve CLI devices from browser`.

### Task 6: Implement polling and one-time API-key exchange

**Objective:** Exchange an approved request for one revocable family-bound bearer key exactly once.

**Files:**

- Modify: `convex/deviceAuthorizations.ts`
- Modify: `convex/apiKeys.ts`
- Test: `convex/deviceAuthorizations.test.ts`

**Steps:**

1. Write failing tests for all protocol states: pending, slow-down, denied, expired, invalid secret, approved, and consumed.
2. Extract an internal `insertApiKey` helper so manual creation and device exchange use the same schema and hashing.
3. Implement internal mutation `exchange({ deviceCodeHash, apiUrl })`:
   - locate by indexed hash;
   - enforce expiry and polling interval;
   - return state without leaking request metadata;
   - on approval, generate `bt_…`, insert a labelled API key such as `CLI · hermes-server`, and mark consumed atomically;
   - return plaintext access token once with family metadata.
4. Confirm no database document contains the plaintext token.
5. Commit as `feat: exchange approved devices for API keys`.

---

## Phase 3 — HTTP Device Endpoints

### Task 7: Add typed deployment configuration

**Objective:** Return the real activation URL without accepting a client-supplied host.

**Files:**

- Modify: `convex/convex.config.ts`
- Modify: `.env.example`
- Modify: `README.md`

Add typed optional `PUBLIC_APP_URL`. The start handler must fail clearly when unset. Document:

```bash
npx convex env set PUBLIC_APP_URL https://<actual-bluetape-domain>
npx convex env set PUBLIC_APP_URL http://localhost:5173   # development deployment
```

Do not commit a guessed production domain. Commit as `docs: configure Bluetape activation URL`.

### Task 8: Register `/cli/device/start` and `/cli/device/token`

**Objective:** Expose the state machine to a headless CLI without weakening `/api/*` authentication.

**Files:**

- Modify: `convex/http.ts`
- Test: `convex/deviceAuthorizations.test.ts`

**Steps:**

1. Add exact unauthenticated POST routes outside the `/api/*` bearer-auth catch-all.
2. Parse JSON with explicit malformed-body errors and content-type response headers.
3. Call the internal start/exchange mutations and map state to the HTTP contract in §2.
4. Keep all existing `/api/*` endpoints behind `authenticateRequest`.
5. Add `Cache-Control: no-store` to device responses.
6. Run tests, `npm run build`, and curl the development endpoints.
7. Commit as `feat: expose CLI device authorization endpoints`.

---

## Phase 4 — Browser Approval UI

### Task 9: Add `/activate` to the authenticated app

**Objective:** Provide the code-entry and approval experience without a new auth system.

**Files:**

- Create: `src/routes/device-activate.tsx`
- Modify: `src/App.tsx`
- Modify: `src/data/hooks.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/my.json`

**Behavior:**

1. Accept manual code entry and optional `?code=B7KQ-MR2V` prefill.
2. Normalize lowercase and optional hyphen/spaces into `XXXX-XXXX`.
3. Use `deviceAuthorizations.inspect` only after normal browser authentication.
4. Preserve `/activate` through password login: current app-level auth gating keeps the browser location unchanged, so do not add a redirect to `/`.
5. Show only families where `role === "owner"`; preselect the current family when owned.
6. Display device name, expiry, and the explicit full read/write warning.
7. Approve or deny using Convex mutations, then show a terminal state.
8. Follow `DESIGN.md`: warm paper background, flat sections, white only for overlays, restrained orange, mono styling for the code, no nested cards.
9. All strings go through `react-i18next`; update both locale files in the same change.

Run:

```bash
npm run check:i18n
npm run build
npm run lint
```

Commit as `feat: add device approval page`.

### Task 10: Surface device-issued keys in family settings

**Objective:** Make CLI access visible and revocable through the existing owner-only API-key list.

**Files:**

- Modify only if needed: `src/routes/family.tsx`
- Modify only if needed: `src/locales/en.json`, `src/locales/my.json`

The exchange-created label (`CLI · <deviceName>`) should already appear in the existing key list with creation date and revoke action. Do not build a second device-management screen. Add only wording needed to explain that API keys may come from manual creation or approved CLI devices.

Verify revocation immediately causes the CLI's next `/api/*` call to return `401`. Commit as `docs: clarify connected CLI keys` only if a change is needed.

---

## Phase 5 — Dependency-Free Node CLI

### Task 11: Implement configuration and atomic credential storage

**Objective:** Store one active Bluetape connection safely without adding runtime packages.

**Files:**

- Create: `cli/config.mjs`
- Test: `cli/bluetape.test.mjs`

Config path:

```text
$XDG_CONFIG_HOME/bluetape/config.json
# fallback: ~/.config/bluetape/config.json
```

Stored fields:

```json
{
  "apiUrl": "https://<deployment>.convex.site/api",
  "appUrl": "https://<bluetape-app>",
  "accessToken": "bt_…",
  "family": { "id": "…", "name": "…" }
}
```

Requirements:

- create parent directory recursively;
- write to a temporary file, `chmod 0600` on POSIX, then rename atomically;
- never print the access token;
- allow `BLUETAPE_CONFIG` override for tests and automation;
- malformed config fails with an actionable error.

Use Node's built-in test runner. Commit as `feat: add secure Bluetape CLI config`.

### Task 12: Implement `bluetape login`

**Objective:** Complete the browser/device flow from a local or headless terminal.

**Files:**

- Create: `cli/bluetape.mjs`
- Modify through npm command: `package.json`
- Test: `cli/bluetape.test.mjs`

Commands/options:

```text
bluetape login [--browserless] [--device-name NAME] [--endpoint CONVEX_SITE_URL]
bluetape logout
bluetape whoami
```

Implementation requirements:

1. Use built-in `fetch`, `AbortController`, `fs`, `os`, `path`, and `child_process` only.
2. `login` calls `/cli/device/start`, prints the code and URL immediately, and optionally attempts `xdg-open`, `open`, or Windows `start` without treating open failure as login failure.
3. Poll at the server-provided interval; honor `slow_down`; stop on deny, expiry, Ctrl-C, or network timeout.
4. Never place the device secret in command-line arguments, logs, browser URLs, or files.
5. Save only the final access token and API URL.
6. `logout` deletes only Bluetape's config file.
7. `whoami` reports the stored family and verifies the token against an authenticated API request without displaying it.
8. Register the executable using npm rather than hand-editing the manifest:

   ```bash
   npm pkg set bin.bluetape="./cli/bluetape.mjs"
   chmod +x cli/bluetape.mjs
   ```

9. Test browserless output, polling transitions, cancellation, expiry, atomic config writes, and redaction using a local fake HTTP server.
10. Commit as `feat: add Bluetape CLI device login`.

---

## Phase 6 — End-to-End Verification and Documentation

### Task 13: Verify the real flow against Convex development

**Objective:** Prove the complete flow with real backend state, not mocks alone.

**Steps:**

1. Start/push the development Convex deployment:

   ```bash
   npx convex dev
   ```

2. Run the frontend and link the CLI locally:

   ```bash
   npm run dev
   npm link
   set -a; . ./.env.local; set +a
   bluetape login --browserless --endpoint "$VITE_CONVEX_SITE_URL"
   ```

3. Open the printed `/activate` URL, sign in as the family owner, enter the code, choose the family, and approve.
4. Verify the CLI exits successfully and `bluetape whoami` reports the selected family.
5. Call at least one read and one write through the existing `/api/*` surface.
6. Revoke `CLI · <deviceName>` in Family settings.
7. Verify the next CLI API request returns `401 Invalid or revoked API key`.
8. Verify helper and non-owner admin accounts cannot approve.
9. Verify an expired code and a denied code never issue a token.

### Task 14: Document installation, login, and recovery

**Files:**

- Modify: `README.md`
- Modify: `docs/plans/PLAN.md` only to link this implemented capability in the appropriate product/technical section
- Create after implementation decision is proven: `docs/adr/002-cli-device-authorization.md`

Document:

- `npm link`/installation path;
- interactive and `--browserless` login;
- config location;
- full family read/write warning;
- key revocation;
- expired/lost-response recovery: rerun login;
- production `PUBLIC_APP_URL` configuration;
- why this follows the device-authorization pattern without claiming Bluetape is an OAuth provider.

Run the complete gate:

```bash
npm test
npm run test:cli
npm run check:i18n
npm run build
npm run lint
```

Expected: all commands exit `0`.

Commit as `docs: document Bluetape CLI authorization`.

---

## 4. Final Acceptance Criteria

- `bluetape login --browserless` prints an eight-character code and an activation URL.
- A browser already logged into Bluetape can approve the code without copying a long API key.
- An unauthenticated browser is shown normal Bluetape login and remains on `/activate` afterward.
- Only the selected family's owner can approve.
- The CLI receives a family-bound token only after approval and stores it with restrictive permissions.
- The user code alone cannot retrieve a token.
- Device and access-token plaintext never appear in Convex storage.
- Pending, slow-down, denied, expired, invalid, consumed, and success states behave deterministically.
- The issued key appears in existing Family → API keys and can be revoked there.
- Revocation causes subsequent CLI API calls to fail with `401`.
- Existing manually created API keys and HTTP API behavior remain compatible.
- Browser and CLI tests pass, and the flow is exercised against a real Convex development deployment.

## 5. Deferred Follow-ups

Only consider these after the V1 flow works end to end:

- fine-grained enforced API scopes;
- several named CLI profiles/families in one config;
- an edge rate limiter keyed by trusted source IP;
- encrypted replay window for lost successful exchange responses;
- packaged npm release and automatic CLI updates;
- QR code alongside the typed code;
- admin/helper-limited device authorization.
