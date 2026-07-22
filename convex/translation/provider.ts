import { env } from "../_generated/server";

const PROVIDER = "openrouter";
export const DEFAULT_TRANSLATION_MODEL = "xiaomi/mimo-v2.5";
export const DEFAULT_TRANSLATION_REASONING_EFFORT = "none";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const TRANSLATION_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type TranslationReasoningEffort =
  (typeof TRANSLATION_REASONING_EFFORTS)[number];

export type TranslationProviderInput = {
  id: string;
  text: string;
  targetLocale: string;
  mode: "label" | "instruction" | "ingredient" | "document";
};

export type TranslationProviderResult = {
  id: string;
  detectedSourceLocale: string;
  normalizedSource: string;
  translatedText: string;
  sourceIsTarget: boolean;
  provider: typeof PROVIDER;
  model: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
};

type RawResult = {
  id?: unknown;
  detectedSourceLocale?: unknown;
  normalizedSource?: unknown;
  translatedText?: unknown;
  sourceIsTarget?: unknown;
};

export class TranslationProviderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function translationReasoningEffort(
  configured: string | undefined,
): TranslationReasoningEffort {
  const effort = configured?.trim().toLowerCase()
    || DEFAULT_TRANSLATION_REASONING_EFFORT;
  if (!(TRANSLATION_REASONING_EFFORTS as readonly string[]).includes(effort)) {
    throw new TranslationProviderError("provider_invalid_reasoning_effort");
  }
  return effort as TranslationReasoningEffort;
}

function baseLocale(locale: string): string {
  return locale.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

const TARGET_LANGUAGE_BY_LOCALE: Record<
  string,
  { language: string; tag: string }
> = {
  en: { language: "English", tag: "en" },
  my: {
    language: "Burmese (Myanmar language; မြန်မာဘာသာ; never Malay)",
    tag: "my-MM",
  },
  id: { language: "Indonesian (Bahasa Indonesia)", tag: "id-ID" },
};

function targetForLocale(locale: string): { language: string; tag: string } {
  const target = TARGET_LANGUAGE_BY_LOCALE[baseLocale(locale)];
  if (!target) {
    throw new TranslationProviderError("provider_unsupported_target_locale");
  }
  return target;
}

export function targetLanguageForLocale(locale: string): string {
  return targetForLocale(locale).language;
}

export function targetLanguageTagForLocale(locale: string): string {
  return targetForLocale(locale).tag;
}

export function parseProviderResults(
  content: string,
  inputs: TranslationProviderInput[],
  model = DEFAULT_TRANSLATION_MODEL,
): TranslationProviderResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new TranslationProviderError("provider_invalid_json");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new TranslationProviderError("provider_invalid_shape");
  }
  const rawResults = (parsed as { results?: unknown }).results;
  if (!Array.isArray(rawResults) || rawResults.length !== inputs.length) {
    throw new TranslationProviderError("provider_invalid_shape");
  }

  const byId = new Map(
    rawResults.map((result) => {
      const item = result as RawResult;
      return [item.id, item] as const;
    }),
  );

  return inputs.map((input) => {
    const item = byId.get(input.id);
    if (
      !item ||
      typeof item.detectedSourceLocale !== "string" ||
      typeof item.normalizedSource !== "string" ||
      typeof item.translatedText !== "string" ||
      typeof item.sourceIsTarget !== "boolean" ||
      !item.detectedSourceLocale.trim() ||
      !item.normalizedSource.trim()
    ) {
      throw new TranslationProviderError("provider_invalid_shape");
    }

    const sourceIsTarget =
      baseLocale(item.detectedSourceLocale) === baseLocale(input.targetLocale);
    if (!sourceIsTarget && !item.translatedText.trim()) {
      throw new TranslationProviderError("provider_empty_translation");
    }

    return {
      id: input.id,
      detectedSourceLocale: item.detectedSourceLocale,
      normalizedSource: item.normalizedSource,
      translatedText: item.translatedText,
      sourceIsTarget,
      provider: PROVIDER,
      model,
    };
  });
}

export async function translateBatch(
  inputs: TranslationProviderInput[],
): Promise<TranslationProviderResult[]> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new TranslationProviderError("provider_not_configured");
  }
  if (inputs.length === 0) return [];
  const model = env.OPENROUTER_TRANSLATION_MODEL?.trim() || DEFAULT_TRANSLATION_MODEL;
  const reasoningEffort = translationReasoningEffort(
    env.OPENROUTER_TRANSLATION_REASONING_EFFORT,
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: reasoningEffort },
        temperature: 0.1,
        // Reasoning tokens count against the output budget. Preserve room for
        // the same eight-field JSON batch when reasoning is enabled.
        max_tokens: reasoningEffort === "none" ? 1200 : 2400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You interpret and translate informal household instructions. For each item, first infer the intended meaning from colloquial, dialectal, grammatically incomplete, code-switched, or speech-like text. " +
              "Write normalizedSource as a clear, natural standard-English sentence, then translate that normalized meaning into the requested target language in the same response. " +
              "Resolve fillers, discourse particles, omitted words, local idioms, and nonstandard grammar from context instead of copying them literally. " +
              "Treat each item's targetLanguage as authoritative; specifically, locale my means Burmese/Myanmar (မြန်မာဘာသာ), never Malay. " +
              "When the intended speech act is a command, normalizedSource must be a direct imperative rather than a description of the listener's habits. " +
              "Honor each item's mode: label means a short title, ingredient means concise recipe ingredient wording with quantities and units unchanged, instruction means a direct actionable sentence, and document means preserve the Markdown structure, paragraph breaks, list markers, and wiki-link syntax while translating only human-readable text. " +
              "Preserve every action, object, negation, name, quantity, date, sequence, urgency, URL, code span, and __BT_*__ placeholder. " +
              "Do not add advice or make an instruction stricter or weaker. " +
              "Return valid JSON only as {\"results\":[{\"id\":string,\"detectedSourceLocale\":string,\"normalizedSource\":string,\"translatedText\":string,\"sourceIsTarget\":boolean}]}. " +
              "Use BCP-47-like locale codes. If source and target are the same language, set sourceIsTarget true and copy the source meaning without translating.",
          },
          {
            role: "user",
            content: JSON.stringify({
              items: inputs.map((input) => ({
                ...input,
                targetLocale: targetLanguageTagForLocale(input.targetLocale),
                targetLanguage: targetLanguageForLocale(input.targetLocale),
              })),
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TranslationProviderError("provider_timeout");
    }
    throw new TranslationProviderError("provider_network_error");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const code = response.status === 429
      ? "provider_rate_limited"
      : response.status >= 500
        ? "provider_unavailable"
        : "provider_request_rejected";
    throw new TranslationProviderError(code);
  }

  const payload = (await response.json()) as OpenRouterResponse;
  const choice = payload.choices?.[0];
  if (choice?.finish_reason !== "stop" || !choice.message?.content) {
    throw new TranslationProviderError("provider_incomplete_response");
  }
  return parseProviderResults(choice.message.content, inputs, model);
}
