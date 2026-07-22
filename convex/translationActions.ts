import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  TranslationProviderError,
  translateBatch,
} from "./translation/provider";
import {
  protectTranslatableText,
  restoreTranslatedText,
} from "./translation/protection";
import {
  MAX_PROVIDER_BATCH,
  translationClaimValidator,
} from "./translation/validators";

export const processClaims = internalAction({
  args: { claims: v.array(translationClaimValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const loaded = await ctx.runQuery(internal.translations.loadClaims, {
      claims: args.claims,
    });
    if (loaded.length === 0) return null;

    const protectedItems = loaded.map((item, index) => ({
      ...item,
      providerId: `field-${index}`,
      protectedText: protectTranslatableText(item.source),
    }));

    for (let offset = 0; offset < protectedItems.length; offset += MAX_PROVIDER_BATCH) {
      const batch = protectedItems.slice(offset, offset + MAX_PROVIDER_BATCH);
      try {
        const providerResults = await translateBatch(
          batch.map((item) => ({
            id: item.providerId,
            text: item.protectedText.text,
            targetLocale: item.targetLocale,
            mode: item.mode,
          })),
        );
        const byId = new Map(providerResults.map((result) => [result.id, result]));
        const completions = batch.map((item) => {
          const result = byId.get(item.providerId);
          if (!result) {
            return {
              claim: item.claim,
              status: "failed" as const,
              errorCode: "provider_missing_result",
            };
          }
          try {
            const normalizedSource = restoreTranslatedText(
              result.normalizedSource,
              item.protectedText,
            );
            if (result.sourceIsTarget) {
              return {
                claim: item.claim,
                status: "source_is_target" as const,
                detectedSourceLocale: result.detectedSourceLocale,
                provider: result.provider,
                model: result.model,
              };
            }
            const translatedText = restoreTranslatedText(
              result.translatedText,
              item.protectedText,
            );
            return {
              claim: item.claim,
              status: "ready" as const,
              detectedSourceLocale: result.detectedSourceLocale,
              normalizedSource,
              translatedText,
              provider: result.provider,
              model: result.model,
            };
          } catch {
            return {
              claim: item.claim,
              status: "failed" as const,
              errorCode: "protected_content_changed",
            };
          }
        });
        await ctx.runMutation(internal.translations.completeClaims, { completions });
      } catch (error) {
        const errorCode =
          error instanceof TranslationProviderError
            ? error.code
            : "translation_processing_failed";
        await ctx.runMutation(internal.translations.completeClaims, {
          completions: batch.map((item) => ({
            claim: item.claim,
            status: "failed" as const,
            errorCode,
          })),
        });
      }
    }
    return null;
  },
});
