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
  let remainingText = content;

  // Harmony format pattern: <|start|>role<|channel|>channel<|message|>content<|end|>
  const harmonyPattern = /<\|start\|>([^<]+)(?:<\|channel\|>([^<]+))?<\|message\|>([^]*?)<\|end\|>/g;
  let match;

  while ((match = harmonyPattern.exec(content)) !== null) {
    const [, role, channel, messageContent] = match;
    
    messages.push({
      role: role as HarmonyMessage['role'],
      channel: channel as HarmonyMessage['channel'],
      content: messageContent
    });
    
    // Remove the parsed message from remaining text
    remainingText = remainingText.replace(match[0], '');
  }

  // Clean up extra whitespace and newlines
  remainingText = remainingText.trim();
  
  return {
    messages,
    rawText: remainingText
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

/**
 * Get the display content for a Harmony message based on its channel
 * @param message The Harmony message
 * @returns The content to display
 */
export const getDisplayContent = (message: HarmonyMessage): string => {
  // For 'final' channel or messages without a channel, show the content
  if (!message.channel || message.channel === 'final') {
    return message.content;
  }
  
  // For 'analysis' channel, we might want to show it differently or not at all
  // For 'commentary' channel, we might want to show it differently or not at all
  return message.content;
};