/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { name: "Owner" });
    const importerId = await ctx.db.insert("users", { name: "Importer" });
    const otherId = await ctx.db.insert("users", { name: "Other" });
    const familyId = await ctx.db.insert("families", {
      name: "Home",
      ownerUserId: ownerId,
      inviteToken: "token",
      createdAt: 1,
    });
    for (const [userId, role] of [
      [ownerId, "admin"],
      [importerId, "user"],
      [otherId, "user"],
    ] as const) {
      await ctx.db.insert("familyMembers", {
        familyId,
        userId,
        role,
        displayName: "Member",
        joinedAt: 1,
      });
      await ctx.db.insert("userProfiles", {
        userId,
        displayName: "Member",
        locale: userId === importerId ? "id" : "en",
        timezone: "Asia/Singapore",
        currentFamilyId: familyId,
        autoTranslateEnabled: true,
      });
    }
    return { ownerId, importerId, otherId, familyId };
  });
  return { t, ...ids };
}

function asUser<T extends ReturnType<typeof convexTest>>(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId });
}

describe("recipe import lifecycle", () => {
  it("requeues a pre-locale draft in the importing user's locale", async () => {
    const { t, importerId, familyId } = await setup();
    const importer = asUser(t, importerId);
    const created = await importer.mutation(api.recipes.createImport, {
      familyId,
      url: "https://example.com/recipe",
    });
    if (!created.jobId) throw new Error("Expected import job");
    await t.run(async (ctx) => {
      await ctx.db.patch(created.jobId!, {
        targetLocale: undefined,
        status: "needs_review",
        stage: "needs_review",
      });
    });

    await importer.mutation(api.recipes.createImport, {
      familyId,
      url: "https://example.com/recipe",
    });
    const claim = await t.mutation(internal.recipes.claimNext, { workerId: "test-worker" });

    expect(claim?.jobId).toBe(created.jobId);
    expect(claim?.targetLocale).toBe("id");
  });

  it("normalizes duplicates, leases work, reviews, and publishes structured rows", async () => {
    const { t, importerId, familyId } = await setup();
    const importer = asUser(t, importerId);
    const first = await importer.mutation(api.recipes.createImport, {
      familyId,
      url: "https://www.youtube.com/watch?v=abc&utm_source=test#fragment",
    });
    const duplicate = await importer.mutation(api.recipes.createImport, {
      familyId,
      url: "https://www.youtube.com/watch?v=abc",
    });
    expect(duplicate.recipeId).toBe(first.recipeId);
    expect(duplicate.jobId).toBe(first.jobId);

    const claim = await t.mutation(internal.recipes.claimNext, { workerId: "test-worker" });
    expect(claim?.jobId).toBe(first.jobId);
    expect(claim?.targetLocale).toBe("id");
    if (!claim) throw new Error("Expected claimed job");
    await t.mutation(internal.recipes.completeWorkerDraft, {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      title: "Chicken rice",
      ingredients: ["1 whole chicken", "2 cups rice"],
      steps: ["Poach the chicken.", "Cook the rice."],
      sourceName: "Test cook",
      sourceLanguage: "ms",
    });

    const recipeId = await importer.mutation(api.recipes.publish, {
      jobId: claim.jobId,
      title: "Chicken rice",
      ingredients: ["1 whole chicken", "2 cups rice"],
      steps: ["Poach the chicken.", "Cook the rice."],
    });
    const detail = await importer.query(api.recipes.get, { recipeId });
    expect(detail?.recipe.status).toBe("published");
    expect(detail?.recipe.sourceLanguage).toBe("ms");
    expect(detail?.ingredients.map((row) => row.text)).toEqual(["1 whole chicken", "2 cups rice"]);
    expect(detail?.steps.map((row) => row.text)).toEqual(["Poach the chicken.", "Cook the rice."]);
  });

  it("limits editing and deletion to importer/admin/owner", async () => {
    const { t, importerId, otherId, familyId } = await setup();
    const importer = asUser(t, importerId);
    const created = await importer.mutation(api.recipes.createImport, {
      familyId,
      url: "https://example.com/recipe",
    });
    const claim = await t.mutation(internal.recipes.claimNext, { workerId: "test-worker" });
    if (!claim || !created.jobId) throw new Error("Expected import job");
    await t.mutation(internal.recipes.completeWorkerDraft, {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      title: "Soup",
      ingredients: ["Water"],
      steps: ["Boil it."],
    });
    await importer.mutation(api.recipes.publish, {
      jobId: created.jobId,
      title: "Soup",
      ingredients: ["Water"],
      steps: ["Boil it."],
    });

    await expect(asUser(t, otherId).mutation(api.recipes.remove, {
      recipeId: created.recipeId,
    })).rejects.toThrow("cannot delete");
  });

  it("lets the importer clear a failed draft but rejects another family user", async () => {
    const { t, importerId, otherId, familyId } = await setup();
    const importer = asUser(t, importerId);
    const created = await importer.mutation(api.recipes.createImport, {
      familyId,
      url: "https://www.instagram.com/p/private-post",
    });
    if (!created.jobId) throw new Error("Expected import job");
    const claim = await t.mutation(internal.recipes.claimNext, { workerId: "test-worker" });
    if (!claim) throw new Error("Expected claimed job");
    await t.mutation(internal.recipes.failWorkerJob, {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      errorCode: "login_required",
      message: "Login required",
    });

    await expect(asUser(t, otherId).mutation(api.recipes.discardImport, {
      jobId: created.jobId,
    })).rejects.toThrow("cannot clear");

    await importer.mutation(api.recipes.discardImport, { jobId: created.jobId });

    expect(await importer.query(api.recipes.getImport, { jobId: created.jobId })).toBeNull();
    expect(await importer.query(api.recipes.get, { recipeId: created.recipeId })).toBeNull();
  });
});
