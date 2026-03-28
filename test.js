const http = require('http');

const BASE_URL = 'localhost';
const PORT = 8787;

// 模拟 curl 请求的工具函数
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          };
          resolve(response);
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// 测试 1: 健康检查
async function testHealthCheck(model = 'gpt-4') {
  console.log('\n=== 测试 1: 健康检查 ===');
  const options = {
    hostname: BASE_URL,
    port: PORT,
    path: `/${model}/`,
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options);
    console.log(`状态码: ${response.statusCode}`);
    console.log('响应:', JSON.stringify(response.body, null, 2));
    return response.statusCode === 200;
  } catch (err) {
    console.error('错误:', err.message);
    return false;
  }
}

// 测试 2: CORS 预检请求
async function testCORS() {
  console.log('\n=== 测试 2: CORS 预检请求 ===');
  const options = {
    hostname: BASE_URL,
    port: PORT,
    path: '/gpt-4/v1/chat/completions',
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://example.com',
      'Access-Control-Request-Method': 'POST'
    }
  };

  try {
    const response = await makeRequest(options);
    console.log(`状态码: ${response.statusCode}`);
    console.log('CORS Headers:', {
      'Access-Control-Allow-Origin': response.headers['access-control-allow-origin'],
      'Access-Control-Allow-Methods': response.headers['access-control-allow-methods']
    });
    return response.statusCode === 204;
  } catch (err) {
    console.error('错误:', err.message);
    return false;
  }
}

// 测试 3: OpenAI 协议 (需要实际 API key)
async function testOpenAIProtocol(model, apiKey = 'test-key') {
  console.log(`\n=== 测试 3: OpenAI 协议 - ${model} ===`);
  const testData = {
    model: model,
    messages: [
      { role: 'user', content: 'Hello, this is a test!' }
    ],
    stream: false,
    max_tokens: 50
  };

  const options = {
    hostname: BASE_URL,
    port: PORT,
    path: `/${model}/v1/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  };

  try {
    const response = await makeRequest(options, testData);
    console.log(`状态码: ${response.statusCode}`);
    if (response.body) {
      console.log('响应:', JSON.stringify(response.body, null, 2));
    }
    return response.statusCode === 200 || response.statusCode === 401; // 401 也是有效的响应（API key 无效是预期的）
  } catch (err) {
    console.error('错误:', err.message);
    return false;
  }
}

// 测试 4: Anthropic 协议 (需要实际 API key)
async function testAnthropicProtocol(model, apiKey = 'test-key') {
  console.log(`\n=== 测试 4: Anthropic 协议 - ${model} ===`);
  const testData = {
    model: model,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'Hello, this is a test!' }
    ]
  };

  const options = {
    hostname: BASE_URL,
    port: PORT,
    path: `/${model}/v1/messages`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'anthropic-version': '2023-06-01'
    }
  };

  try {
    const response = await makeRequest(options, testData);
    console.log(`状态码: ${response.statusCode}`);
    if (response.body) {
      console.log('响应:', JSON.stringify(response.body, null, 2));
    }
    return response.statusCode === 200 || response.statusCode === 401;
  } catch (err) {
    console.error('错误:', err.message);
    return false;
  }
}

// 测试 5: 无效路径测试
async function testInvalidPath() {
  console.log('\n=== 测试 5: 无效路径 ===');
  const options = {
    hostname: BASE_URL,
    port: PORT,
    path: '/invalid/path/test',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options);
    console.log(`状态码: ${response.statusCode}`);
    console.log('响应:', JSON.stringify(response.body, null, 2));
    return response.statusCode === 404;
  } catch (err) {
    console.error('错误:', err.message);
    return false;
  }
}

// 测试 6: 缺少 Authorization header
async function testMissingAuth(model) {
  console.log('\n=== 测试 6: 缺少 Authorization header ===');
  const testData = {
    model: model,
    messages: [
      { role: 'user', content: 'Hello!' }
    ]
  };

  const options = {
    hostname: BASE_URL,
    port: PORT,
    path: `/${model}/v1/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options, testData);
    console.log(`状态码: ${response.statusCode}`);
    console.log('响应:', JSON.stringify(response.body, null, 2));
    return response.statusCode === 401;
  } catch (err) {
    console.error('错误:', err.message);
    return false;
  }
}

// 主测试函数
async function runAllTests() {
  console.log('==================================');
  console.log('  Model Proxy 测试套件');
  console.log('==================================');
  console.log(`目标服务器: ${BASE_URL}:${PORT}`);
  console.log('请确保先运行: npm run dev');

  const results = [];

  results.push({ name: '健康检查', passed: await testHealthCheck() });
  results.push({ name: 'CORS 预检', passed: await testCORS() });
  results.push({ name: 'OpenAI 协议 (GPT)', passed: await testOpenAIProtocol('gpt-4') });
  results.push({ name: 'OpenAI 协议 (Claude)', passed: await testOpenAIProtocol('claude-3-opus-20240229') });
  results.push({ name: 'OpenAI 协议 (Gemini)', passed: await testOpenAIProtocol('gemini-2.5-flash') });
  results.push({ name: 'Anthropic 协议', passed: await testAnthropicProtocol('claude-3-opus-20240229') });
  results.push({ name: '无效路径', passed: await testInvalidPath() });
  results.push({ name: '缺少 Auth Header', passed: await testMissingAuth('gpt-4') });

  console.log('\n==================================');
  console.log('  测试结果汇总');
  console.log('==================================');
  results.forEach(r => {
    const status = r.passed ? '✓ 通过' : '✗ 失败';
    console.log(`${status}: ${r.name}`);
  });

  const passed = results.filter(r => r.passed).length;
  console.log(`\n总计: ${passed}/${results.length} 测试通过`);
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  makeRequest,
  testHealthCheck,
  testCORS,
  testOpenAIProtocol,
  testAnthropicProtocol,
  testInvalidPath,
  testMissingAuth,
  runAllTests
};
