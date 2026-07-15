import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireFamilyMember } from "./permissions";

// ─── Queries ───────────────────────────────────────────────────────────

export const isDone = query({
  args: {
    routineId: v.id("routines"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const routine = await ctx.db.get(args.routineId);
    if (!routine) throw new Error("Routine not found");
    await requireFamilyMember(ctx, routine.familyId);
    const completion = await ctx.db
      .query("routineCompletions")
      .withIndex("routineId_date", (q) =>
        q.eq("routineId", args.routineId).eq("date", args.date),
      )
      .unique();
    return completion !== null;
  },
});

export const forDate = query({
  args: { familyId: v.id("families"), date: v.string() },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    // No index on date alone within a family; scan completions for this family
    // and filter. V1 household scale is fine.
    const completions = await ctx.db.query("routineCompletions").collect();
    return completions.filter(
      (c) => c.familyId === args.familyId && c.date === args.date,
    );
  },
});

export const forRoutine = query({
  args: { routineId: v.id("routines") },
  handler: async (ctx, args) => {
    const routine = await ctx.db.get(args.routineId);
    if (!routine) throw new Error("Routine not found");
    await requireFamilyMember(ctx, routine.familyId);
    return ctx.db
      .query("routineCompletions")
      .withIndex("routineId_date", (q) => q.eq("routineId", args.routineId))
      .collect();
  },
});

// ─── Mutations (any family member) ────────────────────────────────────

export const toggle = mutation({
  args: {
    routineId: v.id("routines"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const routine = await ctx.db.get(args.routineId);
    if (!routine) throw new Error("Routine not found");
    const { userId } = await requireFamilyMember(ctx, routine.familyId);

    const existing = await ctx.db
      .query("routineCompletions")
      .withIndex("routineId_date", (q) =>
        q.eq("routineId", args.routineId).eq("date", args.date),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { completed: false };
    }
    await ctx.db.insert("routineCompletions", {
      familyId: routine.familyId,
      routineId: args.routineId,
      date: args.date,
      completedBy: userId,
    });
    return { completed: true };
  },
});
