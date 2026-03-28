# 测试指南

## 手动测试

### 本地开发测试

1. 启动本地开发服务器：
```bash
npm run dev
```

### 使用 curl 测试

#### OpenAI 协议测试

```bash
# 测试 OpenAI 协议 (GPT 模型)
curl http://localhost:8787/gpt-4/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-openai-key" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'

# 测试 OpenAI 协议访问 Claude
curl http://localhost:8787/claude-3-opus-20240229/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-anthropic-key" \
  -d '{
    "model": "claude-3-opus-20240229",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'

# 测试 OpenAI 协议访问 Gemini
curl http://localhost:8787/gemini-1.5-pro/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-gemini-key" \
  -d '{
    "model": "gemini-1.5-pro",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

#### Anthropic 协议测试

```bash
# 测试 Anthropic 协议
curl http://localhost:8787/claude-3-opus-20240229/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-anthropic-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-opus-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 流式响应测试

```bash
# 测试流式响应
curl http://localhost:8787/claude-3-opus-20240229/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-anthropic-key" \
  -d '{
    "model": "claude-3-opus-20240229",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

## 健康检查

```bash
# 访问根路径查看信息
curl http://localhost:8787/gpt-4/
```

## CORS 测试

```bash
# 测试预检请求
curl -X OPTIONS http://localhost:8787/gpt-4/v1/chat/completions \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -v
```
