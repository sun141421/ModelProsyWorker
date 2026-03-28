import type { Env, AnthropicRequest, AnthropicResponse } from '../types';
import { createErrorResponse, extractAuthHeader } from '../utils';

export async function handleAnthropicRequest(
  request: Request,
  env: Env,
  model: string,
  path: string
): Promise<Response> {
  let apiKey = extractAuthHeader(request);
  if (!apiKey) {
    apiKey = request.headers.get('x-api-key') || undefined;
  }
  const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

  if (!apiKey) {
    return createErrorResponse('API key required. Provide via Authorization: Bearer <key> or x-api-key header', 401);
  }

  const url = new URL(path, baseUrl);
  const body = await request.text();

  let requestBody: AnthropicRequest;
  try {
    requestBody = JSON.parse(body);
    requestBody.model = model;
  } catch {
    return createErrorResponse('Invalid JSON body', 400);
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('x-api-key', apiKey);
  headers.set('anthropic-version', request.headers.get('anthropic-version') || '2023-06-01');

  if (request.headers.get('anthropic-dangerous-direct-browser-access')) {
    headers.set(
      'anthropic-dangerous-direct-browser-access',
      request.headers.get('anthropic-dangerous-direct-browser-access')!
    );
  }

  const upstreamRequest = new Request(url.toString(), {
    method: request.method,
    headers,
    body: JSON.stringify(requestBody),
    redirect: 'manual',
  });

  const upstreamResponse = await fetch(upstreamRequest);

  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });
  responseHeaders.set('Content-Type', 'application/json');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function handleAnthropicToOpenAIStream(
  request: Request,
  env: Env,
  model: string,
  path: string
): Promise<Response> {
  let apiKey = extractAuthHeader(request);
  if (!apiKey) {
    apiKey = request.headers.get('x-api-key') || undefined;
  }
  const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

  if (!apiKey) {
    return createErrorResponse('API key required. Provide via Authorization: Bearer <key> or x-api-key header', 401);
  }

  const url = new URL(path, baseUrl);
  const body = await request.text();

  let requestBody: AnthropicRequest;
  try {
    requestBody = JSON.parse(body);
    requestBody.model = model;
    requestBody.stream = true;
  } catch {
    return createErrorResponse('Invalid JSON body', 400);
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('x-api-key', apiKey);
  headers.set('anthropic-version', request.headers.get('anthropic-version') || '2023-06-01');

  const upstreamRequest = new Request(url.toString(), {
    method: request.method,
    headers,
    body: JSON.stringify(requestBody),
    redirect: 'manual',
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
          if (jsonStr === '[DONE]') {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            continue;
          }

          let event: any;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          const openAIEvent = convertAnthropicStreamEvent(event, model);
          if (openAIEvent) {
            await writer.write(encoder.encode(openAIEvent));
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          if (jsonStr !== '[DONE]') {
            try {
              const event = JSON.parse(jsonStr);
              const openAIEvent = convertAnthropicStreamEvent(event, model);
              if (openAIEvent) {
                await writer.write(encoder.encode(openAIEvent));
              }
            } catch {
              // ignore
            }
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

function convertAnthropicStreamEvent(event: any, model: string): string | null {
  const created = Math.floor(Date.now() / 1000);

  if (event.type === 'message_start') {
    return `data: ${JSON.stringify({
      id: event.message?.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null,
        },
      ],
    })}\n\n`;
  }

  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return `data: ${JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { content: event.delta.text },
          finish_reason: null,
        },
      ],
    })}\n\n`;
  }

  if (event.type === 'message_delta') {
    let finish_reason: 'stop' | 'length' | null = 'stop';
    if (event.delta?.stop_reason === 'max_tokens') finish_reason = 'length';

    return `data: ${JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
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
