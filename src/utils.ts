import type {
  AnthropicRequest,
  AnthropicResponse,
  AnthropicMessage,
  AnthropicContentBlock,
  OpenAIRequest,
  OpenAIResponse,
  OpenAIMessage,
  OpenAIContentPart,
  ModelConfig,
  Env,
} from './types';

export function getModelConfig(model: string, env: Env): ModelConfig | null {
  const lowerModel = model.toLowerCase();

  // Gemini models
  if (lowerModel.startsWith('gemini')) {
    return {
      baseUrl: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
      apiKey: undefined,
      protocol: 'gemini',
    };
  }

  // Claude models (Anthropic protocol)
  if (lowerModel.startsWith('claude')) {
    return {
      baseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      apiKey: undefined,
      protocol: 'anthropic',
    };
  }

  // GPT models (OpenAI protocol)
  if (lowerModel.startsWith('gpt')) {
    return {
      baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com',
      apiKey: undefined,
      protocol: 'openai',
    };
  }

  // Check for custom model mappings in env vars
  const customProtocol = env[`MODEL_${upperSnakeCase(model)}_PROTOCOL`];
  if (customProtocol) {
    return {
      baseUrl: env[`MODEL_${upperSnakeCase(model)}_BASE_URL`] || '',
      apiKey: undefined,
      protocol: customProtocol as 'anthropic' | 'openai' | 'gemini',
    };
  }

  // Default to OpenAI protocol for unknown models
  return {
    baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com',
    apiKey: undefined,
    protocol: 'openai',
  };
}

function upperSnakeCase(str: string): string {
  return str.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
}

export function openAIToAnthropic(openAIReq: OpenAIRequest): AnthropicRequest {
  const messages: AnthropicMessage[] = [];
  let system: string | undefined;

  for (const msg of openAIReq.messages) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : undefined;
      continue;
    }

    const anthropicMsg: AnthropicMessage = {
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: convertOpenAIContent(msg.content),
    };
    messages.push(anthropicMsg);
  }

  return {
    model: openAIReq.model,
    messages,
    max_tokens: openAIReq.max_tokens || 4096,
    system,
    temperature: openAIReq.temperature,
    top_p: openAIReq.top_p,
    stop_sequences: Array.isArray(openAIReq.stop)
      ? openAIReq.stop
      : openAIReq.stop
      ? [openAIReq.stop]
      : undefined,
    stream: openAIReq.stream,
  };
}

function convertOpenAIContent(
  content: string | OpenAIContentPart[] | null
): string | AnthropicContentBlock[] {
  if (content === null) return '';
  if (typeof content === 'string') return content;

  return content.map((part): AnthropicContentBlock => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text || '' };
    }
    if (part.type === 'image_url' && part.image_url) {
      const url = part.image_url.url;
      if (url.startsWith('data:')) {
        const [header, data] = url.split(',');
        const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: data,
          },
        };
      }
      return { type: 'text', text: `[Image: ${url}]` };
    }
    return { type: 'text', text: '' };
  });
}

export function anthropicToOpenAI(
  anthropicResp: AnthropicResponse,
  originalModel: string
): OpenAIResponse {
  const textContent = anthropicResp.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null = 'stop';
  if (anthropicResp.stop_reason === 'max_tokens') finishReason = 'length';
  else if (anthropicResp.stop_reason === 'stop_sequence') finishReason = 'stop';

  return {
    id: anthropicResp.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: originalModel,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textContent,
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: anthropicResp.usage.input_tokens,
      completion_tokens: anthropicResp.usage.output_tokens,
      total_tokens:
        anthropicResp.usage.input_tokens + anthropicResp.usage.output_tokens,
    },
  };
}

export function anthropicToOpenAIStream(
  event: any,
  originalModel: string
): string | null {
  if (event.type === 'message_start') {
    return formatOpenAIStreamEvent({
      id: event.message?.id || '',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalModel,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null,
        },
      ],
    });
  }

  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return formatOpenAIStreamEvent({
      id: '',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalModel,
      choices: [
        {
          index: 0,
          delta: { content: event.delta.text },
          finish_reason: null,
        },
      ],
    });
  }

  if (event.type === 'message_delta') {
    let finishReason: 'stop' | 'length' | null = 'stop';
    if (event.delta?.stop_reason === 'max_tokens') finishReason = 'length';

    return formatOpenAIStreamEvent({
      id: '',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalModel,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: finishReason,
        },
      ],
    });
  }

  if (event.type === 'message_stop') {
    return 'data: [DONE]\n\n';
  }

  return null;
}

function formatOpenAIStreamEvent(event: any): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function extractAuthHeader(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

export function createErrorResponse(message: string, status: number = 400): Response {
  return new Response(
    JSON.stringify({
      error: {
        message,
        type: 'invalid_request_error',
        code: null,
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
