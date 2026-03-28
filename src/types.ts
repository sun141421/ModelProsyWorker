export interface Env {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  [key: string]: string | undefined;
}

export interface ModelConfig {
  baseUrl: string;
  apiKey?: string;
  protocol: 'anthropic' | 'openai' | 'gemini';
}

// Anthropic Types
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// OpenAI Types
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  n?: number;
}

export interface OpenAIResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

// Stream Types
export interface OpenAIStreamEvent {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
}

export interface OpenAIStreamChoice {
  index: number;
  delta: Partial<OpenAIMessage>;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface AnthropicStreamEvent {
  type: string;
  message?: AnthropicResponse;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
  usage?: {
    output_tokens: number;
  };
}
