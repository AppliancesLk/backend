export interface AiChatResponse {
  conversationId: string;
  message: string;
}

// Preserve complete provider parts (including thought signatures) across tool turns.
export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: unknown; id?: string };
  functionResponse?: { name: string; response: unknown; id?: string };
}
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export const AI_TOOL_NAMES = [
  'getProductDetails',
  'searchProducts',
  'getRelatedProducts',
  'compareProducts',
] as const;
export type AiToolName = (typeof AI_TOOL_NAMES)[number];
