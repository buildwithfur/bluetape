/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { name: "Owner" });
    const adminId = await ctx.db.insert("users", { name: "Admin" });
    const createdUserId = await ctx.db.insert("users", { name: "Helper" });
    const familyId = await ctx.db.insert("families", {
      name: "Home",
      ownerUserId: ownerId,
      inviteToken: "token",
      createdAt: 1,
    });
    for (const [userId, role] of [[ownerId, "admin"], [adminId, "admin"]] as const) {
      await ctx.db.insert("familyMembers", {
        familyId,
        userId,
        role,
        displayName: role,
        joinedAt: 1,
      });
    }
    return { ownerId, adminId, createdUserId, familyId };
  });
  return { t, ...ids };
}

describe("username member authorization", () => {
  it("rejects an admin creating a username member", async () => {
    const { t, adminId, familyId } = await setup();

    await expect(t.query(internal.families.validateUsernameUserCreation, {
      familyId,
      username: "helper_one",
      callerUserId: adminId,
    })).rejects.toThrow("Only the family owner");
  });

  it("rejects finalization when the creator is not the family owner", async () => {
    const { t, adminId, createdUserId, familyId } = await setup();

    await expect(t.mutation(internal.families.finalizeUsernameUser, {
      familyId,
      userId: createdUserId,
      username: "helper_one",
      displayName: "Helper",
      createdBy: adminId,
    })).rejects.toThrow("Only the family owner");
  });

  it("rejects an admin resetting the owner's username password", async () => {
    const { t, adminId, ownerId, familyId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("userProfiles", {
        userId: ownerId,
        displayName: "Owner",
        username: "owner_helper",
        locale: "en",
        timezone: "Asia/Singapore",
        currentFamilyId: familyId,
        autoTranslateEnabled: false,
      });
    });

    await expect(t.query(internal.families.validateUsernamePasswordChange, {
      familyId,
      targetUserId: ownerId,
      callerUserId: adminId,
    })).rejects.toThrow("Only the family owner");
  });
});
