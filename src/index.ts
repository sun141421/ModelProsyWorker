import type { Env } from './types';
import { getModelConfig, createErrorResponse } from './utils';
import { handleAnthropicRequest } from './adapters/anthropic';
import { handleOpenAIRequest, handleOpenAIToAnthropicRequest } from './adapters/openai';
import { handleOpenAIToGeminiRequest } from './adapters/gemini';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    // 路由: /{model}/v1/...
    const match = path.match(/^\/([^/]+)(\/.*)?$/);
    if (!match) {
      return createErrorResponse('Invalid path format. Use: /{model}/...', 404);
    }

    const model = match[1];
    const subPath = match[2] || '/';

    const config = getModelConfig(model, env);
    if (!config) {
      return createErrorResponse(`Unsupported model: ${model}`, 400);
    }

    // 根据请求路径判断使用的协议
    if (subPath.startsWith('/v1/chat/completions') || subPath.startsWith('/v1/completions')) {
      // OpenAI 协议入口
      if (config.protocol === 'anthropic') {
        // OpenAI -> Anthropic 转换
        return handleOpenAIToAnthropicRequest(request, env, model);
      } else if (config.protocol === 'gemini') {
        // OpenAI -> Gemini 转换
        return handleOpenAIToGeminiRequest(request, env, model);
      } else {
        // 原生 OpenAI 协议代理
        return handleOpenAIRequest(request, env, model, subPath);
      }
    } else if (subPath.startsWith('/v1/messages')) {
      // Anthropic 协议入口
      return handleAnthropicRequest(request, env, model, subPath);
    } else if (subPath === '/' || subPath === '') {
      // 健康检查/信息页面
      return handleInfo(model, config);
    } else {
      return createErrorResponse(`Unknown endpoint: ${subPath}`, 404);
    }
  },
};

function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function handleInfo(model: string, config: any): Response {
  return new Response(
    JSON.stringify(
      {
        name: 'Model Proxy',
        version: '1.0.0',
        model,
        protocol: config.protocol,
        baseUrl: config.baseUrl,
        status: 'ok',
        endpoints: {
          openai: `/${model}/v1/chat/completions`,
          anthropic: `/${model}/v1/messages`,
        },
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
