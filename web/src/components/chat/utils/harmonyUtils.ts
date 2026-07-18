export interface HarmonyMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  channel?: 'final' | 'analysis' | 'commentary';
  content: string;
}

export interface ParsedHarmonyContent {
  messages: HarmonyMessage[];
  rawText: string;
}

/**
 * Parse Harmony format content into structured messages
 * @param content The raw content that may contain Harmony format tokens
 * @returns ParsedHarmonyContent with messages and remaining raw text
 */
export const parseHarmonyContent = (content: string): ParsedHarmonyContent => {
  const messages: HarmonyMessage[] = [];

  // Harmony format pattern: <|start|>role<|channel|>channel<|message|>content<|end|>
  const harmonyPattern = /<\|start\|>([^<]+)(?:<\|channel\|>([^<]+))?<\|message\|>([^]*?)<\|end\|>/g;
  let match;
  // Collect the text between/around complete blocks by slicing at the matched
  // ranges rather than string-replacing match[0]. A string `replace` only
  // removes the first occurrence, so byte-identical blocks would leak a raw
  // copy; index slicing removes every processed segment exactly.
  let lastIndex = 0;
  const rawParts: string[] = [];

  while ((match = harmonyPattern.exec(content)) !== null) {
    const [full, role, channel, messageContent] = match;
    rawParts.push(content.slice(lastIndex, match.index));
    lastIndex = match.index + full.length;

    messages.push({
      role: role as HarmonyMessage['role'],
      channel: channel as HarmonyMessage['channel'],
      content: messageContent
    });
  }

  // Text after the last complete block. During streaming this can be a partial
  // block ("<|start|>...<|message|>partial" with no closing <|end|> yet). Strip
  // the control-token scaffolding so the raw markers don't render verbatim,
  // keeping any prefix text and the partial message body.
  let trailing = content.slice(lastIndex);
  const partialMatch =
    /^([^]*?)<\|start\|>[^<]*(?:<\|channel\|>[^<]*)?(?:<\|message\|>([^]*))?$/.exec(
      trailing
    );
  if (partialMatch) {
    trailing = partialMatch[1] + (partialMatch[2] ?? "");
  }
  rawParts.push(trailing);

  return {
    messages,
    rawText: rawParts.join("").trim()
  };
};

/**
 * Check if content contains Harmony format tokens
 * @param content The content to check
 * @returns boolean indicating if content contains Harmony tokens
 */
export const hasHarmonyTokens = (content: string): boolean => {
  return /<\|start\||<\|end\||<\|message\||<\|channel\|>/.test(content);
};

/** Get the display content for a Harmony message. */
export const getDisplayContent = (message: HarmonyMessage): string => {
  return message.content;
};