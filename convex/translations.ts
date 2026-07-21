import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { sha256Hex } from "./lib/sha256";
import {
  requireAuthenticatedUser,
  requireFamilyMember,
} from "./permissions";
import { SUPPORTED_LOCALES } from "./supportedLocales";
import {
  MAX_TRANSLATION_FIELDS,
  TRANSLATION_LEASE_MS,
  TRANSLATION_RETRY_MS,
  translationClaimValidator,
  translationFieldRefValidator,
  type TaskTranslationField,
} from "./translation/validators";

const fieldStateValidator = v.union(
  v.literal("empty"),
  v.literal("missing"),
  v.literal("pending"),
  v.literal("ready"),
  v.literal("source_is_target"),
  v.literal("failed"),
);

const fieldResultValidator = v.object({
  entityType: v.literal("task"),
  entityId: v.id("tasks"),
  field: v.union(v.literal("title"), v.literal("note")),
  state: fieldStateValidator,
  translatedText: v.optional(v.string()),
  retryAfter: v.optional(v.number()),
});

const completionValidator = v.union(
  v.object({
    claim: translationClaimValidator,
    status: v.literal("ready"),
    detectedSourceLocale: v.string(),
    normalizedSource: v.string(),
    translatedText: v.string(),
    provider: v.string(),
    model: v.string(),
  }),
  v.object({
    claim: translationClaimValidator,
    status: v.literal("source_is_target"),
    detectedSourceLocale: v.string(),
    provider: v.string(),
    model: v.string(),
  }),
  v.object({
    claim: translationClaimValidator,
    status: v.literal("failed"),
    errorCode: v.string(),
  }),
);

type TranslationRef = {
  entityType: "task";
  entityId: Id<"tasks">;
  field: TaskTranslationField;
};

function assertBoundedUniqueFields(fields: TranslationRef[]): void {
  if (fields.length > MAX_TRANSLATION_FIELDS) {
    throw new Error(`At most ${MAX_TRANSLATION_FIELDS} translation fields are allowed`);
  }
  const keys = new Set(fields.map((field) => `${field.entityId}:${field.field}`));
  if (keys.size !== fields.length) {
    throw new Error("Translation fields must be unique");
  }
}

function assertSupportedLocale(locale: string): void {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    throw new Error("Unsupported profile locale");
  }
}

function sourceFor(task: Doc<"tasks">, field: TaskTranslationField): string {
  return field === "title" ? task.title : task.note ?? "";
}

async function findTranslation(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<"families">,
  ref: TranslationRef,
  targetLocale: string,
) {
  return ctx.db
    .query("contentTranslations")
    .withIndex(
      "by_entity_field_locale",
      (q) =>
        q
          .eq("familyId", familyId)
          .eq("entityType", "task")
          .eq("entityId", ref.entityId)
          .eq("field", ref.field)
          .eq("targetLocale", targetLocale),
    )
    .unique();
}

export const getForFields = query({
  args: { fields: v.array(translationFieldRefValidator) },
  returns: v.object({
    enabled: v.boolean(),
    results: v.array(fieldResultValidator),
  }),
  handler: async (ctx, args) => {
    assertBoundedUniqueFields(args.fields);
    const { profile } = await requireAuthenticatedUser(ctx);
    if (profile.autoTranslateEnabled !== true || !profile.currentFamilyId) {
      return { enabled: false, results: [] };
    }
    assertSupportedLocale(profile.locale);
    await requireFamilyMember(ctx, profile.currentFamilyId);

    const results = [];
    for (const ref of args.fields) {
      const task = await ctx.db.get(ref.entityId);
      if (!task || task.familyId !== profile.currentFamilyId) {
        throw new Error("Task not found in current family");
      }
      const source = sourceFor(task, ref.field);
      if (!source.trim()) {
        results.push({ ...ref, state: "empty" as const });
        continue;
      }
      const sourceHash = await sha256Hex(source);
      const translation = await findTranslation(
        ctx,
        profile.currentFamilyId,
        ref,
        profile.locale,
      );
      if (!translation || translation.sourceHash !== sourceHash) {
        results.push({ ...ref, state: "missing" as const });
      } else if (translation.status === "ready") {
        results.push({
          ...ref,
          state: "ready" as const,
          translatedText: translation.translatedText,
        });
      } else if (translation.status === "failed") {
        results.push({
          ...ref,
          state: "failed" as const,
          retryAfter: translation.retryAfter,
        });
      } else {
        results.push({ ...ref, state: translation.status });
      }
    }
    return { enabled: true, results };
  },
});

export const ensureForFields = mutation({
  args: { fields: v.array(translationFieldRefValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertBoundedUniqueFields(args.fields);
    const { profile } = await requireAuthenticatedUser(ctx);
    if (profile.autoTranslateEnabled !== true || !profile.currentFamilyId) {
      return null;
    }
    assertSupportedLocale(profile.locale);
    await requireFamilyMember(ctx, profile.currentFamilyId);

    const now = Date.now();
    const claims: Array<{
      translationId: Id<"contentTranslations">;
      sourceHash: string;
      generation: number;
    }> = [];

    for (const ref of args.fields) {
      const task = await ctx.db.get(ref.entityId);
      if (!task || task.familyId !== profile.currentFamilyId) {
        throw new Error("Task not found in current family");
      }
      const source = sourceFor(task, ref.field);
      if (!source.trim()) continue;

      const sourceHash = await sha256Hex(source);
      const existing = await findTranslation(
        ctx,
        profile.currentFamilyId,
        ref,
        profile.locale,
      );
      if (
        existing?.sourceHash === sourceHash &&
        (existing.status === "ready" ||
          existing.status === "source_is_target" ||
          (existing.status === "pending" && existing.leaseExpiresAt > now) ||
          (existing.status === "failed" && existing.retryAfter > now))
      ) {
        continue;
      }

      const generation = (existing?.generation ?? 0) + 1;
      const pending = {
        familyId: profile.currentFamilyId,
        entityType: "task" as const,
        entityId: ref.entityId,
        field: ref.field,
        targetLocale: profile.locale,
        sourceHash,
        generation,
        status: "pending" as const,
        leaseExpiresAt: now + TRANSLATION_LEASE_MS,
        updatedAt: now,
      };
      const translationId = existing
        ? (await ctx.db.replace(existing._id, pending), existing._id)
        : await ctx.db.insert("contentTranslations", pending);
      claims.push({ translationId, sourceHash, generation });
    }

    if (claims.length > 0) {
      await ctx.scheduler.runAfter(0, internal.translationActions.processClaims, {
        claims,
      });
    }
    return null;
  },
});

export const loadClaims = internalQuery({
  args: { claims: v.array(translationClaimValidator) },
  returns: v.array(
    v.object({
      claim: translationClaimValidator,
      source: v.string(),
      targetLocale: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.claims.length > MAX_TRANSLATION_FIELDS) {
      throw new Error("Too many translation claims");
    }
    const loaded = [];
    for (const claim of args.claims) {
      const translation = await ctx.db.get(claim.translationId);
      if (
        !translation ||
        translation.status !== "pending" ||
        translation.sourceHash !== claim.sourceHash ||
        translation.generation !== claim.generation
      ) {
        continue;
      }
      const task = await ctx.db.get(translation.entityId);
      if (!task || task.familyId !== translation.familyId) continue;
      const source = sourceFor(task, translation.field);
      if ((await sha256Hex(source)) !== claim.sourceHash) continue;
      loaded.push({ claim, source, targetLocale: translation.targetLocale });
    }
    return loaded;
  },
});

export const completeClaims = internalMutation({
  args: { completions: v.array(completionValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.completions.length > MAX_TRANSLATION_FIELDS) {
      throw new Error("Too many translation completions");
    }
    const now = Date.now();
    for (const completion of args.completions) {
      const { claim } = completion;
      const translation = await ctx.db.get(claim.translationId);
      if (
        !translation ||
        translation.status !== "pending" ||
        translation.sourceHash !== claim.sourceHash ||
        translation.generation !== claim.generation
      ) {
        continue;
      }
      const task = await ctx.db.get(translation.entityId);
      if (
        !task ||
        task.familyId !== translation.familyId ||
        (await sha256Hex(sourceFor(task, translation.field))) !== claim.sourceHash
      ) {
        continue;
      }

      const common = {
        familyId: translation.familyId,
        entityType: "task" as const,
        entityId: translation.entityId,
        field: translation.field,
        targetLocale: translation.targetLocale,
        sourceHash: translation.sourceHash,
        generation: translation.generation,
        updatedAt: now,
      };
      if (completion.status === "ready") {
        await ctx.db.replace(translation._id, {
          ...common,
          status: "ready",
          detectedSourceLocale: completion.detectedSourceLocale,
          normalizedSource: completion.normalizedSource,
          translatedText: completion.translatedText,
          provider: completion.provider,
          model: completion.model,
        });
      } else if (completion.status === "source_is_target") {
        await ctx.db.replace(translation._id, {
          ...common,
          status: "source_is_target",
          detectedSourceLocale: completion.detectedSourceLocale,
          provider: completion.provider,
          model: completion.model,
        });
      } else {
        await ctx.db.replace(translation._id, {
          ...common,
          status: "failed",
          errorCode: completion.errorCode,
          retryAfter: now + TRANSLATION_RETRY_MS,
        });
      }
    }
    return null;
  },
});
