import { env } from "../_generated/server";

const PROVIDER = "openrouter";
export const DEFAULT_TRANSLATION_MODEL = "deepseek/deepseek-v4-flash";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type TranslationProviderInput = {
  id: string;
  text: string;
  targetLocale: string;
  mode: "instruction";
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

function baseLocale(locale: string): string {
  return locale.trim().toLowerCase().split(/[-_]/)[0] ?? "";
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
        reasoning: { effort: "none" },
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You normalize informal household instructions and translate them. " +
              "Understand Singapore English and Singlish, including omitted grammar and discourse particles such as ah, lah, already, and can. " +
              "Preserve every action, object, negation, name, quantity, date, sequence, urgency, URL, code span, and __BT_*__ placeholder. " +
              "Do not add advice or make an instruction stricter or weaker. " +
              "Return valid JSON only as {\"results\":[{\"id\":string,\"detectedSourceLocale\":string,\"normalizedSource\":string,\"translatedText\":string,\"sourceIsTarget\":boolean}]}. " +
              "Use BCP-47-like locale codes. If source and target are the same language, set sourceIsTarget true and copy the source meaning without translating.",
          },
          {
            role: "user",
            content: JSON.stringify({ items: inputs }),
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
