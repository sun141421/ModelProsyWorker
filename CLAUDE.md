# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Workers proxy that provides unified access to multiple LLM APIs (OpenAI GPT, Anthropic Claude, Google Gemini) while supporting both OpenAI and Anthropic interface protocols.

## Key Features

- URL path format: `/{model}/{endpoint}` (e.g., `/gemini-1.5-pro/v1/chat/completions`)
- API keys are passed via request headers (`Authorization: Bearer <key>`), not stored server-side
- Automatic protocol conversion: use OpenAI protocol to access Claude/Gemini, use Anthropic protocol to access Claude
- Streaming response support
- CORS enabled

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server with wrangler |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run preview` | Preview the worker |

## Architecture

### Entry Point
- [src/index.ts](src/index.ts) - Main fetch handler, routes requests based on URL path

### Routing Flow
1. Extract `model` from first URL segment and `subPath` from the rest
2. `getModelConfig()` determines protocol (anthropic/openai/gemini) based on model name prefix
3. Route to appropriate adapter based on endpoint:
   - `/v1/chat/completions` → OpenAI protocol endpoint
   - `/v1/messages` → Anthropic protocol endpoint

### Adapters
- [src/adapters/anthropic.ts](src/adapters/anthropic.ts) - Native Anthropic protocol handling
- [src/adapters/openai.ts](src/adapters/openai.ts) - Native OpenAI protocol + OpenAI→Anthropic conversion
- [src/adapters/gemini.ts](src/adapters/gemini.ts) - OpenAI→Gemini conversion

### Key Files
- [src/types.ts](src/types.ts) - Type definitions for both protocols
- [src/utils.ts](src/utils.ts) - Protocol conversion utilities, auth header extraction
- [wrangler.toml](wrangler.toml) - Cloudflare Workers configuration (base URLs only, no API keys)

## Model Detection

| Model Prefix | Protocol |
|--------------|----------|
| `gemini*` | gemini |
| `claude*` | anthropic |
| `gpt*` | openai |
| Custom | Configurable via env vars `MODEL_*_PROTOCOL`, `MODEL_*_BASE_URL` |
