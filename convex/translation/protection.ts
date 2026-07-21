type ProtectedToken = {
  placeholder: string;
  original: string;
};

export type ProtectedText = {
  text: string;
  tokens: ProtectedToken[];
};

const PLACEHOLDER_PATTERN = /__BT_[A-Z]+__/g;

function lettersFor(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function protectTranslatableText(source: string): ProtectedText {
  const tokens: ProtectedToken[] = [];
  const protect = (original: string): string => {
    const placeholder = `__BT_${lettersFor(tokens.length)}__`;
    tokens.push({ placeholder, original });
    return placeholder;
  };

  let text = source;

  // Code must be protected before other patterns inspect its contents.
  text = text.replace(/```[\s\S]*?```/g, (match) => protect(match));
  text = text.replace(/`[^`\n]+`/g, (match) => protect(match));

  // Keep wiki identity stable while allowing its visible label to translate.
  text = text.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, label: string | undefined) => {
      const stableTarget = protect(target);
      return `[[${stableTarget}|${label ?? target}]]`;
    },
  );

  // Preserve destinations, while link labels remain translatable.
  text = text.replace(/\]\((https?:\/\/[^)\s]+)\)/g, (_match, url: string) =>
    `](${protect(url)})`,
  );
  text = text.replace(/https?:\/\/[^\s)\]]+/g, (match) => protect(match));

  // Preserve numeric values exactly. Unit words remain translatable.
  text = text.replace(/\b\d+(?:[.,]\d+)*\b/g, (match) => protect(match));

  return { text, tokens };
}

export function restoreTranslatedText(
  translated: string,
  protectedText: ProtectedText,
): string {
  const seen = new Set<string>();
  const discovered = translated.match(PLACEHOLDER_PATTERN) ?? [];

  for (const placeholder of discovered) {
    if (seen.has(placeholder)) {
      throw new Error("protected_token_duplicated");
    }
    seen.add(placeholder);
  }

  if (seen.size !== protectedText.tokens.length) {
    throw new Error("protected_token_missing");
  }

  let restored = translated;
  for (const token of protectedText.tokens) {
    if (!seen.has(token.placeholder)) {
      throw new Error("protected_token_missing");
    }
    restored = restored.replace(token.placeholder, token.original);
  }

  if (PLACEHOLDER_PATTERN.test(restored)) {
    PLACEHOLDER_PATTERN.lastIndex = 0;
    throw new Error("protected_token_unknown");
  }
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return restored;
}
