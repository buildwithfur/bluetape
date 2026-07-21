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
  type TranslationFieldRef,
  type TranslationMode,
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
  entityType: v.union(
    v.literal("task"),
    v.literal("recipe"),
    v.literal("recipeIngredient"),
    v.literal("recipeStep"),
  ),
  entityId: v.union(
    v.id("tasks"),
    v.id("recipes"),
    v.id("recipeIngredients"),
    v.id("recipeSteps"),
  ),
  field: v.union(v.literal("title"), v.literal("note"), v.literal("text")),
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

function refKey(ref: TranslationFieldRef): string {
  return `${ref.entityType}:${ref.entityId}:${ref.field}`;
}

function assertBoundedUniqueFields(fields: TranslationFieldRef[]): void {
  if (fields.length > MAX_TRANSLATION_FIELDS) {
    throw new Error(`At most ${MAX_TRANSLATION_FIELDS} translation fields are allowed`);
  }
  if (new Set(fields.map(refKey)).size !== fields.length) {
    throw new Error("Translation fields must be unique");
  }
}

function assertSupportedLocale(locale: string): void {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    throw new Error("Unsupported profile locale");
  }
}

function refFromTranslation(
  translation: Doc<"contentTranslations">,
): TranslationFieldRef | null {
  if (translation.entityType === "task" &&
      (translation.field === "title" || translation.field === "note")) {
    return {
      entityType: "task",
      entityId: translation.entityId as Id<"tasks">,
      field: translation.field,
    };
  }
  if (translation.entityType === "recipe" && translation.field === "title") {
    return {
      entityType: "recipe",
      entityId: translation.entityId as Id<"recipes">,
      field: "title",
    };
  }
  if (translation.entityType === "recipeIngredient" && translation.field === "text") {
    return {
      entityType: "recipeIngredient",
      entityId: translation.entityId as Id<"recipeIngredients">,
      field: "text",
    };
  }
  if (translation.entityType === "recipeStep" && translation.field === "text") {
    return {
      entityType: "recipeStep",
      entityId: translation.entityId as Id<"recipeSteps">,
      field: "text",
    };
  }
  return null;
}

async function sourceForRef(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<"families">,
  ref: TranslationFieldRef,
): Promise<{ source: string; mode: TranslationMode }> {
  switch (ref.entityType) {
    case "task": {
      const task = await ctx.db.get(ref.entityId);
      if (!task || task.familyId !== familyId) {
        throw new Error("Task not found in current family");
      }
      return {
        source: ref.field === "title" ? task.title : task.note ?? "",
        mode: ref.field === "title" ? "label" : "instruction",
      };
    }
    case "recipe": {
      const recipe = await ctx.db.get(ref.entityId);
      if (!recipe || recipe.familyId !== familyId) {
        throw new Error("Recipe not found in current family");
      }
      return { source: recipe.title, mode: "label" };
    }
    case "recipeIngredient": {
      const ingredient = await ctx.db.get(ref.entityId);
      if (!ingredient || ingredient.familyId !== familyId) {
        throw new Error("Recipe ingredient not found in current family");
      }
      return { source: ingredient.text, mode: "ingredient" };
    }
    case "recipeStep": {
      const step = await ctx.db.get(ref.entityId);
      if (!step || step.familyId !== familyId) {
        throw new Error("Recipe step not found in current family");
      }
      return { source: step.text, mode: "instruction" };
    }
  }
}

async function findTranslation(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<"families">,
  ref: TranslationFieldRef,
  targetLocale: string,
) {
  return ctx.db
    .query("contentTranslations")
    .withIndex("by_entity_field_locale", (q) =>
      q
        .eq("familyId", familyId)
        .eq("entityType", ref.entityType)
        .eq("entityId", ref.entityId)
        .eq("field", ref.field)
        .eq("targetLocale", targetLocale))
    .unique();
}

export const getForFields = query({
  args: { fields: v.array(translationFieldRefValidator) },
  returns: v.object({ enabled: v.boolean(), results: v.array(fieldResultValidator) }),
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
      const { source } = await sourceForRef(ctx, profile.currentFamilyId, ref);
      if (!source.trim()) {
        results.push({ ...ref, state: "empty" as const });
        continue;
      }
      const sourceHash = await sha256Hex(source);
      const translation = await findTranslation(ctx, profile.currentFamilyId, ref, profile.locale);
      if (!translation || translation.sourceHash !== sourceHash) {
        results.push({ ...ref, state: "missing" as const });
      } else if (translation.status === "ready") {
        results.push({ ...ref, state: "ready" as const, translatedText: translation.translatedText });
      } else if (translation.status === "failed") {
        results.push({ ...ref, state: "failed" as const, retryAfter: translation.retryAfter });
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
    if (profile.autoTranslateEnabled !== true || !profile.currentFamilyId) return null;
    assertSupportedLocale(profile.locale);
    await requireFamilyMember(ctx, profile.currentFamilyId);

    const now = Date.now();
    const claims: Array<{ translationId: Id<"contentTranslations">; sourceHash: string; generation: number }> = [];
    for (const ref of args.fields) {
      const { source } = await sourceForRef(ctx, profile.currentFamilyId, ref);
      if (!source.trim()) continue;
      const sourceHash = await sha256Hex(source);
      const existing = await findTranslation(ctx, profile.currentFamilyId, ref, profile.locale);
      if (existing?.sourceHash === sourceHash &&
          (existing.status === "ready" || existing.status === "source_is_target" ||
           (existing.status === "pending" && existing.leaseExpiresAt > now) ||
           (existing.status === "failed" && existing.retryAfter > now))) {
        continue;
      }

      const generation = (existing?.generation ?? 0) + 1;
      const pending = {
        familyId: profile.currentFamilyId,
        entityType: ref.entityType,
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
      await ctx.scheduler.runAfter(0, internal.translationActions.processClaims, { claims });
    }
    return null;
  },
});

export const loadClaims = internalQuery({
  args: { claims: v.array(translationClaimValidator) },
  returns: v.array(v.object({
    claim: translationClaimValidator,
    source: v.string(),
    targetLocale: v.string(),
    mode: v.union(v.literal("label"), v.literal("instruction"), v.literal("ingredient")),
  })),
  handler: async (ctx, args) => {
    if (args.claims.length > MAX_TRANSLATION_FIELDS) throw new Error("Too many translation claims");
    const loaded = [];
    for (const claim of args.claims) {
      const translation = await ctx.db.get(claim.translationId);
      if (!translation || translation.status !== "pending" ||
          translation.sourceHash !== claim.sourceHash || translation.generation !== claim.generation) continue;
      const ref = refFromTranslation(translation);
      if (!ref) continue;
      let current;
      try {
        current = await sourceForRef(ctx, translation.familyId, ref);
      } catch {
        continue;
      }
      if ((await sha256Hex(current.source)) !== claim.sourceHash) continue;
      loaded.push({ claim, source: current.source, targetLocale: translation.targetLocale, mode: current.mode });
    }
    return loaded;
  },
});

export const completeClaims = internalMutation({
  args: { completions: v.array(completionValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.completions.length > MAX_TRANSLATION_FIELDS) throw new Error("Too many translation completions");
    const now = Date.now();
    for (const completion of args.completions) {
      const { claim } = completion;
      const translation = await ctx.db.get(claim.translationId);
      if (!translation || translation.status !== "pending" ||
          translation.sourceHash !== claim.sourceHash || translation.generation !== claim.generation) continue;
      const ref = refFromTranslation(translation);
      if (!ref) continue;
      let current;
      try {
        current = await sourceForRef(ctx, translation.familyId, ref);
      } catch {
        continue;
      }
      if ((await sha256Hex(current.source)) !== claim.sourceHash) continue;

      const common = {
        familyId: translation.familyId,
        entityType: translation.entityType,
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
