import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireFamilyMember } from "./permissions";
import { singaporeDayBounds } from "./date";

type UpcomingItem =
  | {
      kind: "routine";
      date: string;
      routineId: Id<"routines">;
      title: string;
      frequency: "daily" | "weekly" | "monthly";
      dayOfWeek?: number;
      dayOfMonth?: number;
      pageId?: Id<"pages">;
    }
  | {
      kind: "task";
      date: string;
      taskId: Id<"tasks">;
      title: string;
      createdBy: Id<"users">;
    };

/** Format a YYYY-MM-DD date as a UTC Date (calendar-only, no TZ drift). */
function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function matchesFrequency(
  d: Date,
  frequency: "daily" | "weekly" | "monthly",
  dayOfWeek?: number,
  dayOfMonth?: number,
): boolean {
  switch (frequency) {
    case "daily":
      return true;
    case "weekly":
      return d.getUTCDay() === dayOfWeek;
    case "monthly":
      return d.getUTCDate() === dayOfMonth;
    default:
      return false;
  }
}

/** Next occurrence of a routine strictly after `afterISO`.
 * Searches up to 60 days ahead — enough to always find the next
 * daily/weekly/monthly hit. */
function nextOccurrence(
  frequency: "daily" | "weekly" | "monthly",
  dayOfWeek: number | undefined,
  dayOfMonth: number | undefined,
  afterISO: string,
): string | null {
  const d = isoToDate(afterISO);
  d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 60; i++) {
    if (matchesFrequency(d, frequency, dayOfWeek, dayOfMonth)) {
      return toISO(d);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

/**
 * The Today dashboard query (family-scoped).
 * @param date - client-computed calendar date YYYY-MM-DD in Asia/Singapore.
 * @param includeUndatedTasks - whether ad-hoc tasks belong on this day.
 *   Clients set this only for their actual Today view; an undated task must
 *   never be repeated on a future date.
 */
export const list = query({
  args: {
    familyId: v.id("families"),
    date: v.string(),
    currentDate: v.string(),
    includeUndatedTasks: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);

    const dateObj = new Date(args.date + "T00:00:00Z");
    const dayOfWeek = dateObj.getUTCDay();
    const dayOfMonth = dateObj.getUTCDate();

    // 1. Routines due today.
    const activeRoutines = await ctx.db
      .query("routines")
      .withIndex("active_frequency", (q) =>
        q.eq("familyId", args.familyId).eq("isActive", true),
      )
      .collect();
    const dueRoutines = activeRoutines.filter((r) => {
      switch (r.frequency) {
        case "daily": return true;
        case "weekly": return r.dayOfWeek === dayOfWeek;
        case "monthly": return r.dayOfMonth === dayOfMonth;
        default: return false;
      }
    });

    // Completion state for each due routine today.
    const routinesWithState = await Promise.all(
      dueRoutines.map(async (routine) => {
        const completion = await ctx.db
          .query("routineCompletions")
          .withIndex("routineId_date", (q) =>
            q.eq("routineId", routine._id).eq("date", args.date),
          )
          .unique();
        return {
          ...routine,
          isDone: completion !== null,
          completedBy: completion?.completedBy ?? null,
        };
      }),
    );
    routinesWithState.sort((a, b) => a.sortOrder - b.sortOrder);

    // 2. Tasks due on this date. Undated, ad-hoc tasks appear only when the
    // client explicitly identifies this as its Today view.
    const dueTasks = await ctx.db
      .query("tasks")
      .withIndex("status_dueDate", (q) =>
        q
          .eq("familyId", args.familyId)
          .eq("status", "pending")
          .eq("dueDate", args.date),
      )
      .collect();
    const undatedTasks = args.includeUndatedTasks === true
      ? await ctx.db
        .query("tasks")
        .withIndex("status_dueDate", (q) =>
          q
            .eq("familyId", args.familyId)
            .eq("status", "pending")
            .eq("dueDate", undefined),
        )
        .collect()
      : [];
    const { start: currentDayStart, end: currentDayEnd } =
      singaporeDayBounds(args.currentDate);
    const completedToday = await ctx.db
      .query("tasks")
      .withIndex("status_completedAt", (q) =>
        q
          .eq("familyId", args.familyId)
          .eq("status", "done")
          .gte("completedAt", currentDayStart)
          .lt("completedAt", currentDayEnd),
      )
      .collect();
    const belongsOnDate = (task: { dueDate?: string }) =>
      task.dueDate === args.date ||
      (args.includeUndatedTasks === true && !task.dueDate);
    const todayTasks = [
      ...dueTasks,
      ...undatedTasks,
      ...completedToday.filter(
        (task) => belongsOnDate(task),
      ),
    ].sort((a, b) => a.createdAt - b.createdAt);

    // 3. Pinned rules.
    const allRules = await ctx.db
      .query("pages")
      .withIndex("by_type", (q) =>
        q.eq("familyId", args.familyId).eq("type", "rule"),
      )
      .collect();
    const pinnedRules = allRules.filter((r) => r.pinnedToToday === true);

    return {
      date: args.date,
      routines: routinesWithState,
      tasks: todayTasks,
      pinnedRules,
    };
  },
});

/**
 * Upcoming items strictly after `afterDate` — the next occurrence of each
 * active routine plus future-dated one-off tasks. Drives the collapsible
 * "Upcoming" section on the Tasks view.
 */
export const upcoming = query({
  args: { familyId: v.id("families"), afterDate: v.string() },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);

    const items: UpcomingItem[] = [];

    // 1. Next occurrence of each active routine strictly after afterDate.
    const active = await ctx.db
      .query("routines")
      .withIndex("active_frequency", (q) =>
        q.eq("familyId", args.familyId).eq("isActive", true),
      )
      .collect();
    for (const r of active) {
      const next = nextOccurrence(
        r.frequency,
        r.dayOfWeek,
        r.dayOfMonth,
        args.afterDate,
      );
      if (next) {
        items.push({
          kind: "routine",
          date: next,
          routineId: r._id,
          title: r.title,
          frequency: r.frequency,
          dayOfWeek: r.dayOfWeek,
          dayOfMonth: r.dayOfMonth,
          pageId: r.pageId,
        });
      }
    }

    // 2. Pending one-off tasks with dueDate strictly after afterDate.
    const pending = await ctx.db
      .query("tasks")
      .withIndex("status_dueDate", (q) =>
        q
          .eq("familyId", args.familyId)
          .eq("status", "pending")
          .gt("dueDate", args.afterDate),
      )
      .collect();
    for (const t of pending) {
      if (!t.dueDate) continue;
      items.push({
        kind: "task",
        date: t.dueDate,
        taskId: t._id,
        title: t.title,
        createdBy: t.createdBy,
      });
    }

    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return items;
  },
});
