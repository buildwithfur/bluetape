import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  isOwner,
  requireFamilyAdmin,
  requireFamilyMember,
} from "./permissions";
import { canonicalizeWikiReferences } from "./wiki";

// ─── Queries ───────────────────────────────────────────────────────────

export const list = query({
  args: {
    familyId: v.id("families"),
    status: v.optional(v.union(v.literal("pending"), v.literal("done"))),
  },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    if (args.status) {
      return ctx.db
        .query("tasks")
        .withIndex("status_dueDate", (q) =>
          q.eq("familyId", args.familyId).eq("status", args.status!),
        )
        .order("desc")
        .collect();
    }
    return ctx.db
      .query("tasks")
      .withIndex("status_dueDate", (q) => q.eq("familyId", args.familyId).eq("status", "pending"))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { taskId: v.string() },
  handler: async (ctx, args) => {
    const taskId = ctx.db.normalizeId("tasks", args.taskId);
    if (!taskId) return null;
    const task = await ctx.db.get(taskId);
    if (!task) return null;
    await requireFamilyMember(ctx, task.familyId);
    return task;
  },
});

export const dueOnDate = query({
  args: {
    familyId: v.id("families"),
    date: v.string(),
    includeUndatedTasks: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    const pending = await ctx.db
      .query("tasks")
      .withIndex("status_dueDate", (q) =>
        q.eq("familyId", args.familyId).eq("status", "pending"),
      )
      .collect();
    return pending.filter((t) =>
      t.dueDate === args.date || (args.includeUndatedTasks === true && !t.dueDate)
    );
  },
});

// ─── Mutations ────────────────────────────────────────────────────────

export const add = mutation({
  args: {
    familyId: v.id("families"),
    title: v.string(),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireFamilyMember(ctx, args.familyId);
    if (!args.title.trim()) throw new Error("Task title cannot be empty");
    const title = await canonicalizeWikiReferences(
      ctx,
      args.familyId,
      args.title.trim(),
    );
    const taskId = await ctx.db.insert("tasks", {
      familyId: args.familyId,
      title,
      status: "pending",
      dueDate: args.dueDate,
      createdBy: userId,
      createdAt: Date.now(),
    });
    return ctx.db.get(taskId);
  },
});

export const updateDetails = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await requireFamilyAdmin(ctx, task.familyId);

    const patch: { title?: string; note?: string } = {};
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Task title cannot be empty");
      patch.title = await canonicalizeWikiReferences(ctx, task.familyId, title);
    }
    if (args.note !== undefined) {
      patch.note = await canonicalizeWikiReferences(
        ctx,
        task.familyId,
        args.note.trim(),
      );
    }
    await ctx.db.patch(args.taskId, patch);
    return ctx.db.get(args.taskId);
  },
});

export const markDone = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await requireFamilyMember(ctx, task.familyId);
    if (task.status === "done") throw new Error("Task is already done");
    await ctx.db.patch(args.taskId, {
      status: "done",
      completedAt: Date.now(),
    });
    return ctx.db.get(args.taskId);
  },
});

export const toggleDone = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await requireFamilyMember(ctx, task.familyId);
    const isDone = task.status === "done";
    await ctx.db.patch(args.taskId, {
      status: isDone ? "pending" : "done",
      completedAt: isDone ? undefined : Date.now(),
    });
    return ctx.db.get(args.taskId);
  },
});

/** Hard-delete a one-off task. Creator, family admin, or owner only. */
export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    const { userId, family, membership } = await requireFamilyMember(
      ctx,
      task.familyId,
    );
    const canDelete =
      task.createdBy === userId ||
      isOwner(family, userId) ||
      membership.role === "admin";
    if (!canDelete) {
      throw new Error("Only the task creator or a family admin can delete this task");
    }
    await ctx.db.delete(args.taskId);
    return null;
  },
});
