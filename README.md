# Model Proxy

Cloudflare Workers 代理，支持多种大模型 API，兼容 OpenAI 和 Anthropic 接口协议。

## 特性

- 统一接口访问多种大模型（GPT、Claude、Gemini）
- 同时支持 OpenAI 协议和 Anthropic 协议
- 协议自动转换
- 流式响应支持
- CORS 支持
- API key 通过请求头传入，无需在服务端配置

## 支持的模型

| 模型类型 | 协议 | 示例模型 |
|---------|------|---------|
| OpenAI GPT | OpenAI | `gpt-4`, `gpt-3.5-turbo` |
| Anthropic Claude | Anthropic | `claude-3-opus`, `claude-3-sonnet` |
| Google Gemini | OpenAI (转换) | `gemini-1.5-pro`, `gemini-1.5-flash` |

## 部署

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量 (可选)

编辑 `wrangler.toml` 文件，配置模型的基础 URL (API key 在请求时传入)：

```toml
[vars]
ANTHROPIC_BASE_URL = "https://api.anthropic.com"
OPENAI_BASE_URL = "https://api.openai.com"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"
```

### 3. 本地开发

```bash
npm run dev
```

### 4. 部署到 Cloudflare Workers

```bash
npm run deploy
```

## 使用方法

### URL 结构

```
https://your-worker.workers.dev/{model}/{endpoint}
```

### OpenAI 协议

所有模型都可以通过 OpenAI 协议访问，使用 `Authorization: Bearer <your-api-key>` 传入对应的 API key：

```bash
curl https://your-worker.workers.dev/gpt-4/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-openai-key" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

```bash
curl https://your-worker.workers.dev/claude-3-opus-20240229/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-ant-your-anthropic-key" \
  -d '{
    "model": "claude-3-opus-20240229",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

```bash
curl https://your-worker.workers.dev/gemini-1.5-pro/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-gemini-key" \
  -d '{
    "model": "gemini-1.5-pro",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Anthropic 协议

Claude 模型可以使用原生 Anthropic 协议，通过 `Authorization: Bearer <key>` 或 `x-api-key: <key>` 传入 API key：

```bash
curl https://your-worker.workers.dev/claude-3-opus-20240229/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-ant-your-anthropic-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-opus-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

或者使用 `x-api-key` header：

```bash
curl https://your-worker.workers.dev/claude-3-opus-20240229/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-ant-your-anthropic-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-opus-20240229",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 自定义模型配置

可以通过环境变量配置自定义模型：

```toml
[vars]
MODEL_MY_CUSTOM_MODEL_PROTOCOL = "openai"
MODEL_MY_CUSTOM_MODEL_BASE_URL = "https://custom-api.example.com"
MODEL_MY_CUSTOM_MODEL_API_KEY = "your-api-key"
```

使用方式：

```bash
curl https://your-worker.workers.dev/my-custom-model/v1/chat/completions ...
```

## 测试

### 手动测试

查看 [TESTING.md](TESTING.md) 获取详细的 curl 测试命令。

### 自动化测试脚本

项目包含 `Test.js`，一个 Node.js 测试脚本，可以模拟 curl 请求测试所有端点：

```bash
# 首先启动本地开发服务器
npm run dev

# 在另一个终端运行测试
node Test.js
```

测试脚本包含以下测试：
- 健康检查
- CORS 预检请求
- OpenAI 协议 (GPT、Claude、Gemini)
- Anthropic 协议
- 无效路径
- 缺少 Authorization header

## 项目结构

```
.
├── src/
│   ├── index.ts              # 主入口
│   ├── types.ts              # 类型定义
│   ├── utils.ts              # 工具函数
│   └── adapters/
│       ├── anthropic.ts      # Anthropic 协议适配器
│       ├── openai.ts         # OpenAI 协议适配器
│       └── gemini.ts         # Gemini 协议适配器
├── wrangler.toml             # Cloudflare Workers 配置
├── package.json
├── tsconfig.json
├── TESTING.md                # 测试指南
└── Test.js                   # Node.js 测试脚本
```
