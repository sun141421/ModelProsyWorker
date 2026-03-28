import type { Env, OpenAIRequest, OpenAIResponse, OpenAIMessage } from '../types';
import { createErrorResponse, extractAuthHeader } from '../utils';

interface GeminiContent {
  parts: { text?: string; inline_data?: { mime_type: string; data: string } }[];
  role?: 'user' | 'model';
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: { text: string }[];
  };
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
      role: 'model';
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
  }[];
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export async function handleOpenAIToGeminiRequest(
  request: Request,
  env: Env,
  model: string
): Promise<Response> {
  const apiKey = extractAuthHeader(request);
  const baseUrl = env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

  if (!apiKey) {
    return createErrorResponse('API key required. Provide via Authorization: Bearer <key> header', 401);
  }

  const body = await request.text();
  let openAIReq: OpenAIRequest;
  try {
    openAIReq = JSON.parse(body);
  } catch {
    return createErrorResponse('Invalid JSON body', 400);
  }

  const geminiReq = openAIToGemini(openAIReq);

  if (openAIReq.stream) {
    return handleOpenAIToGeminiStream(geminiReq, apiKey, baseUrl, model);
  }

  const url = new URL(`/v1beta/models/${model}:generateContent`, baseUrl);
  url.searchParams.set('key', apiKey);

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  const upstreamRequest = new Request(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(geminiReq),
  });

  const upstreamResponse = await fetch(upstreamRequest);

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text();
    return new Response(errorText, {
      status: upstreamResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const geminiResp: GeminiResponse = await upstreamResponse.json();
  const openAIResp = geminiToOpenAI(geminiResp, model);

  return new Response(JSON.stringify(openAIResp), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function openAIToGemini(openAIReq: OpenAIRequest): GeminiRequest {
  const contents: GeminiContent[] = [];
  let systemInstruction: { parts: { text: string }[] } | undefined;

  for (const msg of openAIReq.messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : '';
      systemInstruction = { parts: [{ text }] };
      continue;
    }

    const content: GeminiContent = {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: convertOpenAIContent(msg.content),
    };
    contents.push(content);
  }

  return {
    contents,
    systemInstruction,
    generationConfig: {
      temperature: openAIReq.temperature,
      topP: openAIReq.top_p,
      maxOutputTokens: openAIReq.max_tokens,
      stopSequences: Array.isArray(openAIReq.stop)
        ? openAIReq.stop
        : openAIReq.stop
        ? [openAIReq.stop]
        : undefined,
    },
  };
}

function convertOpenAIContent(
  content: string | any[] | null
): { text?: string; inline_data?: { mime_type: string; data: string } }[] {
  if (content === null) return [{ text: '' }];
  if (typeof content === 'string') return [{ text: content }];

  return content.map((part) => {
    if (part.type === 'text') {
      return { text: part.text || '' };
    }
    if (part.type === 'image_url' && part.image_url) {
      const url = part.image_url.url;
      if (url.startsWith('data:')) {
        const [header, data] = url.split(',');
        const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
        return { inline_data: { mime_type: mimeType, data } };
      }
    }
    return { text: '' };
  });
}

function geminiToOpenAI(geminiResp: GeminiResponse, model: string): OpenAIResponse {
  const candidate = geminiResp.candidates?.[0];
  const textContent = candidate?.content?.parts?.map((p) => p.text).join('') || '';

  let finish_reason: 'stop' | 'length' | 'content_filter' | null = 'stop';
  if (candidate?.finishReason === 'MAX_TOKENS') finish_reason = 'length';
  else if (candidate?.finishReason === 'SAFETY') finish_reason = 'content_filter';

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textContent,
        },
        finish_reason,
      },
    ],
    usage: {
      prompt_tokens: geminiResp.usageMetadata?.promptTokenCount || 0,
      completion_tokens: geminiResp.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: geminiResp.usageMetadata?.totalTokenCount || 0,
    },
  };
}

async function handleOpenAIToGeminiStream(
  geminiReq: GeminiRequest,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<Response> {
  const url = new URL(`/v1beta/models/${model}:streamGenerateContent`, baseUrl);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('alt', 'sse');

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  const upstreamRequest = new Request(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(geminiReq),
  });

  const upstreamResponse = await fetch(upstreamRequest);

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text();
    return new Response(errorText, {
      status: upstreamResponse.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!upstreamResponse.body) {
    return createErrorResponse('No response body from upstream', 500);
  }

  const { readable, writable } = new TransformStream();
  const reader = upstreamResponse.body.getReader();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          let geminiEvent: any;
          try {
            geminiEvent = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          const openAIEvent = convertGeminiStreamEvent(geminiEvent, model);
          if (openAIEvent) {
            await writer.write(encoder.encode(openAIEvent));
          }
        }
      }

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (e) {
      console.error('Stream error:', e);
    } finally {
      writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function convertGeminiStreamEvent(geminiEvent: any, model: string): string | null {
  const created = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-${Date.now()}`;

  const candidate = geminiEvent.candidates?.[0];
  if (!candidate) return null;

  const textContent = candidate.content?.parts?.map((p: any) => p.text).join('') || '';

  if (textContent) {
    return `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { content: textContent },
          finish_reason: null,
        },
      ],
    })}\n\n`;
  }

  if (candidate.finishReason) {
    let finish_reason: 'stop' | 'length' | 'content_filter' | null = 'stop';
    if (candidate.finishReason === 'MAX_TOKENS') finish_reason = 'length';
    else if (candidate.finishReason === 'SAFETY') finish_reason = 'content_filter';

    return `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason,
        },
      ],
    })}\n\n`;
  }

  return null;
}
