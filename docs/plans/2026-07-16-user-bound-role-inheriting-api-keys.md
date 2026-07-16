# User-Bound, Role-Inheriting API Keys Implementation Plan

> **For Hermes:** Use the `subagent-driven-development` skill to implement this plan task-by-task.

**Goal:** Make every Bluetape API key act as the user who created it, inherit that user's live family role, and attribute every API action to both the user and the exact key used.

**Architecture:** Keep API keys bound to one family, but treat `apiKeys.createdBy` as the key's human principal rather than routing requests through the shared synthetic `API Agent`. Resolve the creator's current family membership on every request, enforce the same operation-level permissions as the UI, write normal entity attribution using the real user ID, and store a separate per-key API audit trail.

**Tech stack:** Convex schema/functions/HTTP actions, TypeScript, React 19, `react-i18next`, Vitest + `convex-test` for backend regression coverage.

---

## Why this redesign matters

The current implementation has two separate problems.

### 1. The Family page is accidentally owner-only

`src/routes/family.tsx` requests API-key metadata for every admin or owner who opens the page. `convex/apiKeys.ts:list` immediately calls `requireFamilyOwner`, so a non-owner admin receives an authorization error before the query can return an empty list.

The absence of API keys is not the problem. An authorized query with no matching keys should return `[]`.

### 2. API calls do not inherit the key creator's identity or role

`convex/api.ts:resolveAgentInFamily` currently creates or reuses one synthetic `API Agent` user, adds it to every target family as an admin, and attributes API-created records to that synthetic user.

Consequences:

- Every API key effectively acts as an admin, regardless of its creator's current role.
- Demoting or removing the human key owner does not reduce the key's authority.
- `createdBy`, `addedBy`, `updatedBy`, `completedBy`, and `boughtBy` do not identify the real human principal.
- Multiple integrations are indistinguishable because they all act as the same synthetic user.
- The app cannot answer: "Which user, through which API key, performed this action?"

This conflicts with Bluetape's existing per-user attribution and server-side permission model.

---

## Resolved behavior

### API keys are delegated user credentials

An API key has no independent role. It is bound to:

- one `familyId`
- one creator/principal via `createdBy`
- one secret hash
- one human-readable label
- its creation and revocation state

On every authenticated API request, Bluetape must:

1. Hash and resolve the bearer token to an active API-key document.
2. Resolve `apiKey.createdBy` as the acting user.
3. Verify that user is still a member of `apiKey.familyId`.
4. Derive the user's **current** family role (`owner`, `admin`, or `helper`).
5. Enforce the permission required by the requested operation.
6. Attribute entity changes to the real user.
7. Record the exact `apiKeyId` in the API audit trail.

Do not copy a role onto the API-key document. A stored role snapshot would become stale. Role must be derived from `families.ownerUserId` plus the current `familyMembers` row on every request.

### Role changes apply immediately

- Promoting a user immediately expands what their existing keys may do.
- Demoting an admin to helper immediately reduces what their existing keys may do.
- Removing a user from the family makes all of that user's keys for the family unusable.
- Revoking one key disables only that key.
- Switching the user's current UI family does not retarget a key; the key remains bound to its original family.

### Key-management policy for this iteration

| Actor | List keys | Create key | Revoke key |
|---|---|---|---|
| Family owner | All keys in the family | Own key | Any family key |
| Family admin | Own keys only | Own key | Own keys only |
| Helper | No key-management UI in this iteration | No | No |

The runtime authorization design must still support a helper-owned key later without another backend redesign. If helper key creation is enabled later, that key will inherit helper permissions automatically.

### API operation permissions

Match the existing app permission model rather than granting blanket API-admin access:

| Operation | Helper | Admin | Owner |
|---|---:|---:|---:|
| Read family content | Yes | Yes | Yes |
| Create one-off task | Yes | Yes | Yes |
| Toggle task completion | Yes | Yes | Yes |
| Add/toggle shopping item | Yes | Yes | Yes |
| Toggle routine completion | Yes | Yes | Yes |
| Create item page | Yes | Yes | Yes |
| Edit item page | No | Yes | Yes |
| Create/edit rule page | No | Yes | Yes |
| Create routine | No | Yes | Yes |

A future per-key scope system may reduce these rights, but a key must never exceed its user's live role.

---

## Audit and attribution model

### Entity attribution

Existing attribution fields continue to represent the human actor:

- `pages.createdBy` / `pages.updatedBy`
- `routines.createdBy`
- `tasks.createdBy`
- `groceryItems.addedBy` / `groceryItems.boughtBy`
- `routineCompletions.completedBy`

For API actions, write the API key creator's real `userId` into these fields. Do not write the synthetic `API Agent` user.

### API audit events

Add a separate append-only `apiAuditEvents` table:

```ts
apiAuditEvents: defineTable({
  familyId: v.id("families"),
  apiKeyId: v.id("apiKeys"),
  actorUserId: v.id("users"),
  method: v.union(v.literal("GET"), v.literal("POST")),
  path: v.string(),
  operation: v.string(),
  outcome: v.union(
    v.literal("success"),
    v.literal("denied"),
    v.literal("error"),
  ),
  statusCode: v.number(),
  resourceType: v.optional(v.string()),
  resourceId: v.optional(v.string()),
  occurredAt: v.number(),
})
  .index("by_family_occurredAt", ["familyId", "occurredAt"])
  .index("by_apiKey_occurredAt", ["apiKeyId", "occurredAt"])
  .index("by_actor_occurredAt", ["actorUserId", "occurredAt"])
```

Rules:

- Every successful API write records an audit event in the same Convex transaction as the data change.
- Successful authenticated reads are logged before their response is returned.
- Requests made with a valid key but denied by the user's current role or membership are logged with `outcome: "denied"`.
- Invalid bearer tokens cannot be attributed to an API key and must not create a misleading key audit event.
- Never store the plaintext key, bearer header, request body, password, or key hash in an audit event.
- `operation` uses stable names such as `tasks.create`, `tasks.complete`, `shopping.buy`, `routines.create`, `pages.update`, and `today.read` rather than raw prose.

The audit table is the complete "which key performed this API action" record. Entity attribution remains the concise "which user performed this change" record.

---

## Migration and compatibility

Existing API-key rows already contain `createdBy`, so no principal-field migration is required. Under the new model, `createdBy` becomes the authoritative user bound to the key.

Existing active keys therefore become user-bound automatically after deployment:

- Existing owner-created keys inherit the owner's current role.
- The plaintext key does not change.
- The key remains bound to its existing family.

Historical records attributed to the synthetic `API Agent` cannot be reliably reassigned to a human or a specific key. Preserve that historical attribution rather than fabricating provenance.

After the new path is verified:

- Stop creating or using `API Agent` memberships.
- Remove stale `API Agent` family memberships so they no longer appear as active family members.
- Keep the synthetic user/profile if historical rows reference it.
- Do not rewrite historical `createdBy`/`addedBy` fields without evidence.

---

## Success criteria

- A non-owner admin can open `/family` when no keys exist and sees an empty API-key state instead of an authorization error.
- An admin can create, list, and revoke their own keys.
- An admin cannot list or revoke another admin's keys.
- The owner can list and revoke every key in the family.
- A key can act only inside its bound family.
- API-created records use the key owner's real user ID in existing attribution fields.
- Every successful API write records the exact API key and user in `apiAuditEvents`.
- Valid-key reads and denied requests are auditable.
- Demoting an admin immediately changes what their existing keys can do.
- Removing a user from a family makes their keys return `403` without deleting the keys.
- Revoked or unknown keys return `401`.
- No API path creates or relies on the shared synthetic `API Agent`.
- Plaintext keys remain one-time display values and are never persisted.
- Existing UI mutation permissions remain unchanged.

---

## Non-goals

- OAuth, service accounts, or third-party identity federation.
- User-selectable custom roles.
- Per-key fine-grained scopes in this iteration.
- A full audit-log UI in this iteration; the backend audit data must exist first.
- Reassigning historical `API Agent` actions without evidence.
- Exposing family/member administration through the HTTP API.
- Logging request bodies or secrets.

---

## POC-before-migration rule

Prove the model with one vertical slice before rewiring every endpoint.

Use `POST /api/tasks` as the proof:

1. Admin creates a key.
2. The key resolves to the admin's real user ID and current role.
3. The request creates a task with `createdBy === adminUserId`.
4. The same transaction creates an `apiAuditEvents` row with the exact `apiKeyId`.
5. Removing the admin from the family makes the same key fail with `403`.
6. The key cannot be used against another family.

Do not remove `resolveAgentInFamily` from all operations until this slice passes. Once proven, apply the same principal object and audit helper to the remaining endpoints.

---

## Task 1: Establish Convex regression-test infrastructure

**Objective:** Add a repeatable backend test harness before changing authorization.

**Files:**

- Modify via npm: `package.json`, `package-lock.json`
- Create: `convex/test.setup.ts`
- Create: `convex/apiKeys.test.ts`

**Steps:**

1. Install the test dependencies through npm rather than hand-editing manifests:

   ```bash
   npm install -D vitest convex-test
   npm pkg set scripts.test="vitest run"
   ```

2. Create the Convex test module loader in `convex/test.setup.ts` using `convex-test` and the generated schema.
3. Add fixture helpers that create auth users, user profiles, one family, and owner/admin/helper memberships.
4. Write a baseline test that proves the current owner can create a key and that only the hash—not plaintext—is stored.
5. Run:

   ```bash
   npm test
   ```

   Expected: baseline test passes before the authorization redesign begins.

6. Suggested commit:

   ```bash
   git add package.json package-lock.json convex/test.setup.ts convex/apiKeys.test.ts
   git commit -m "test: add Convex API key regression harness"
   ```

---

## Task 2: Add API audit-event storage

**Objective:** Create the append-only structure needed to identify every API action by key and user.

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/admin.ts`
- Create: `convex/apiAudit.ts`
- Create: `convex/apiAudit.test.ts`

**Steps:**

1. Write failing schema/function tests for inserting an event and listing events by family/key.
2. Add `apiAuditEvents` and the three bounded indexes defined above to `convex/schema.ts`.
3. Add `apiAuditEvents` to the dev-only wipe table list in `convex/admin.ts`.
4. In `convex/apiAudit.ts`, add:
   - an internal helper for inserting transaction-local success events
   - an `internalMutation` for HTTP-layer read/denied/error events
   - an owner-only query for future inspection/debugging
5. Ensure validators are explicit and no request body or secret field is accepted.
6. Run `npm test`, then one-shot Convex validation:

   ```bash
   npx convex dev --once
   ```

   Expected: schema and functions sync successfully to the development deployment.

7. Suggested commit:

   ```bash
   git add convex/schema.ts convex/admin.ts convex/apiAudit.ts convex/apiAudit.test.ts
   git commit -m "feat: add per-key API audit events"
   ```

---

## Task 3: Resolve a live user principal from an API key

**Objective:** Replace the shared API-agent identity with a reusable, transaction-safe principal resolver.

**Files:**

- Create: `convex/apiAuthorization.ts`
- Create: `convex/apiAuthorization.test.ts`
- Modify: `convex/apiKeys.ts`

**Principal shape:**

```ts
type ApiPrincipal = {
  apiKeyId: Id<"apiKeys">;
  familyId: Id<"families">;
  userId: Id<"users">;
  role: "owner" | "admin" | "helper";
  label: string | null;
};
```

**Steps:**

1. Write failing tests covering owner, admin, helper, revoked key, removed member, and cross-family behavior.
2. Implement `requireApiPrincipal(ctx, apiKeyId)`:
   - load the key by ID
   - reject missing/revoked keys as unauthorized
   - load the family and the `familyMembers` row for `key.createdBy`
   - reject a removed member with forbidden status
   - derive `owner` from `families.ownerUserId`; otherwise use the live membership role
3. Add `requireApiAdmin(principal)` and operation-specific policy helpers. These helpers may reduce rights but must never elevate the principal.
4. Update `apiKeys.getByHash` to return the key ID and enough non-secret binding information for the HTTP layer. Never return `keyHash`.
5. Run `npm test`.
6. Suggested commit:

   ```bash
   git add convex/apiAuthorization.ts convex/apiAuthorization.test.ts convex/apiKeys.ts
   git commit -m "feat: resolve API keys to live user roles"
   ```

---

## Task 4: Allow owner/admin management of properly isolated keys

**Objective:** Make key management match the resolved owner/admin policy and unblock the Family page.

**Files:**

- Modify: `convex/apiKeys.ts`
- Modify: `convex/apiKeys.test.ts`

**Steps:**

1. Write failing tests proving:
   - owner with no keys receives `[]`
   - admin with no keys receives `[]`
   - admin sees only keys where `createdBy === adminUserId`
   - owner sees all family key metadata
   - admin can create and revoke their own key
   - admin cannot revoke another user's key
   - owner can revoke any family key
   - helper is denied key management
2. Replace blanket `requireFamilyOwner` calls:
   - list: resolve current family member; owner returns all, admin filters to own
   - create: require owner/admin and store the caller as `createdBy`
   - revoke: permit key creator or family owner
3. Keep plaintext return-once behavior unchanged.
4. Return metadata only: `_id`, `label`, `createdBy`, `createdAt`, and revocation state where needed. Do not return `keyHash`.
5. Run `npm test` and `npx convex dev --once`.
6. Suggested commit:

   ```bash
   git add convex/apiKeys.ts convex/apiKeys.test.ts
   git commit -m "fix: allow admins to manage their own API keys"
   ```

---

## Task 5: Prove the user-bound model with task creation

**Objective:** Complete the POC vertical slice through bearer authentication, role resolution, entity attribution, and audit.

**Files:**

- Modify: `convex/http.ts`
- Modify: `convex/api.ts`
- Create or modify: `convex/api.test.ts`

**Steps:**

1. Write a failing integration test for `POST /api/tasks` using an admin-owned key.
2. Change `authenticateRequest` to resolve and return an `ApiPrincipal`, not only `{ familyId, label }`.
3. Pass `apiKeyId` into `internal.api.addTask`; derive family/user through `requireApiPrincipal` inside the mutation rather than trusting a client-supplied family ID.
4. Insert the task with `createdBy: principal.userId`.
5. Insert `tasks.create` audit success in the same mutation with the new task ID.
6. Test that removing the admin's membership causes the same request to return `403`.
7. Test that replacing a family/resource ID in the body cannot cross the API key's family boundary.
8. Run `npm test` and `npx convex dev --once`.
9. Suggested commit:

   ```bash
   git add convex/http.ts convex/api.ts convex/api.test.ts
   git commit -m "feat: attribute API-created tasks to key owners"
   ```

---

## Task 6: Rewire all remaining HTTP API operations

**Objective:** Apply the proven principal and permission model to every existing API endpoint.

**Files:**

- Modify: `convex/http.ts`
- Modify: `convex/api.ts`
- Modify: `convex/api.test.ts`

**Steps:**

1. Convert internal API reads to accept `apiKeyId`, derive `familyId` server-side, and log successful read operations.
2. Convert task completion and ensure it is attributed/audited.
3. Convert shopping add/bought/unbought; write `addedBy` and `boughtBy` as `principal.userId`.
4. Convert routine completion; write `completedBy` as `principal.userId`.
5. Gate routine creation to live admin/owner role and write `createdBy` as `principal.userId`.
6. Gate page operations according to both operation and page type:
   - item create: any member
   - item update: admin/owner
   - rule create/update: admin/owner
7. For every successful write, insert the audit event in the same transaction.
8. For valid-key denied/error responses, log the principal, key, stable operation name, and response status without logging request data.
9. Delete `resolveAgentInFamily` only after every call site is gone.
10. Remove stale comments/TODOs claiming the HTTP layer still trusts client `familyId`; keys are already family-bound and the new mutation boundary revalidates this.
11. Fix the public `/api/help` output:
    - remove the nonexistent `/api/setup` entry
    - remove the obsolete environment-key/open-dev wording
    - describe keys as user-bound and role-inheriting
12. Run `npm test`, `npx convex dev --once`, and `npm run build`.
13. Suggested commit:

   ```bash
   git add convex/http.ts convex/api.ts convex/api.test.ts
   git commit -m "feat: enforce user roles across HTTP API actions"
   ```

---

## Task 7: Update the Family/API-key UI

**Objective:** Let admins use their own integrations without exposing owner-only family controls.

**Files:**

- Modify: `src/routes/family.tsx`
- Modify: `src/data/hooks.ts`
- Modify: `src/locales/en.json`
- Modify: `src/locales/id.json`
- Modify: `src/locales/my.json`

**Steps:**

1. Add a UI regression test if the selected React test setup supports route rendering; otherwise verify through the browser in Task 9.
2. Show the API-key section for `owner` and `admin`, not owner only.
3. Keep the query authorized for both roles; an empty result renders the existing no-keys state.
4. Owners see creator metadata for all family keys. Admins receive only their own keys from the server.
5. Add concise explanatory copy through i18n:

   > API keys act as you and inherit your current family role. Each API action is recorded against you and the key used.

6. Do not expose key hashes or previously issued plaintext secrets.
7. Preserve the one-time reveal/copy flow after key creation.
8. Run:

   ```bash
   npm run check:i18n
   npm run build
   ```

9. Suggested commit:

   ```bash
   git add src/routes/family.tsx src/data/hooks.ts src/locales/en.json src/locales/id.json src/locales/my.json
   git commit -m "feat: expose user-bound API keys to family admins"
   ```

---

## Task 8: Clean up the legacy API Agent safely

**Objective:** Stop showing or authorizing the obsolete shared synthetic agent without corrupting historical attribution.

**Files:**

- Create: `convex/migrations/removeApiAgentMemberships.ts`
- Modify: `convex/admin.ts` only if migration support belongs there instead
- Modify: `docs/plans/PLAN.md`
- Create: `docs/adr/002-user-bound-role-inheriting-api-keys.md`

**Steps:**

1. Add an idempotent internal migration that finds the synthetic `api-agent@bluetape.local` user and removes only its `familyMembers` rows.
2. Do not delete the synthetic user/profile while historical records still reference its user ID.
3. Run the migration on development and verify the agent no longer appears in family member lists.
4. Add the architecture decision to `docs/plans/PLAN.md` §10.
5. Record the durable decision in ADR 002:
   - keys are delegated user credentials
   - roles are live, never copied onto keys
   - keys stay family-bound
   - attribution stores human user plus exact key
   - existing synthetic attribution remains historical
6. Suggested commit:

   ```bash
   git add convex/migrations/removeApiAgentMemberships.ts docs/plans/PLAN.md docs/adr/002-user-bound-role-inheriting-api-keys.md
   git commit -m "docs: record user-bound API key architecture"
   ```

---

## Task 9: End-to-end verification

**Objective:** Verify the real role transitions, attribution, and audit records against the development deployment.

**Files:** No new files required unless a repeatable smoke-test script is added under `scripts/`.

**Test accounts:**

- one family owner
- one non-owner admin
- one helper
- optionally a second family to test isolation

**Scenarios:**

1. Open `/family` as a non-owner admin with no keys; verify the page and empty state render.
2. Create an admin key and copy the plaintext once.
3. Use the key to create a task through `POST /api/tasks`.
4. Inspect Convex data:
   - task `createdBy` equals the admin user ID
   - audit event references the same admin and exact key ID
5. Use the same key to create a routine; verify success while the user is admin.
6. Demote that user to helper.
7. Retry routine creation; verify `403` plus a denied audit event.
8. Use the same key for a helper-permitted action such as adding a shopping item; verify success and real-user attribution.
9. Remove the user from the family; verify the key returns `403` for all family operations.
10. Revoke another admin's key as the owner; verify it returns `401` afterward.
11. Attempt cross-family access; verify the request cannot select or infer another family.
12. Verify an admin cannot list or revoke another admin's key.
13. Verify no response or audit row contains `keyHash` or plaintext bearer values.

**Final commands:**

```bash
npm test
npm run check:i18n
npm run lint
npm run build
npx convex dev --once
```

Expected:

- all tests pass
- i18n audit passes
- lint passes
- production frontend build passes
- Convex schema/functions sync successfully
- the manual role-transition scenarios match the matrix above

---

## Rollout order

1. Deploy schema and audit support.
2. Deploy principal resolution and key-management changes.
3. Prove task creation in development.
4. Rewire and test remaining API endpoints.
5. Deploy frontend Family-page changes.
6. Verify existing production keys now act as their creators.
7. Run the legacy API Agent membership cleanup only after the new path is confirmed.

Rollback remains straightforward until step 7 because existing key rows and plaintext values are unchanged. If the new authorization path fails, revert the function deployment; do not rotate or delete keys as part of rollback.

---

## Definition of done

- [ ] API keys authenticate a human user principal, not the shared API Agent.
- [ ] Role is derived live from family ownership/membership on every request.
- [ ] Existing key creators retain their keys without rotation.
- [ ] Entity attribution uses the real user.
- [ ] Every authenticated API action is traceable to the exact key.
- [ ] Admins can manage their own keys; owners can oversee all family keys.
- [ ] Family page works for non-owner admins when the key list is empty.
- [ ] Role changes and family removal affect existing keys immediately.
- [ ] Cross-family access is impossible.
- [ ] Plaintext secrets and request bodies never enter audit storage.
- [ ] Shared API Agent is no longer used for new actions.
- [ ] Historical synthetic attribution is preserved honestly.
- [ ] Tests, i18n audit, lint, build, and Convex one-shot sync all pass.
