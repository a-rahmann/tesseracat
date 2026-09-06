import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  OllamaGemmaProvider,
  OllamaUnavailableError,
  GemmaModelMissingError,
  OllamaTimeoutError,
  OllamaCancellationError,
} from '../apps/agent-runtime/src/gemma/ollama-provider.js';
import { ContextBuilder } from '../apps/agent-runtime/src/gemma/context-builder.js';
import { IntentClassifier } from '../apps/agent-runtime/src/gemma/intent-classifier.js';
import { TaskPlanner, UnsafePlanError } from '../apps/agent-runtime/src/gemma/task-planner.js';
import { ResponseGenerator } from '../apps/agent-runtime/src/gemma/response-generator.js';
import { AgentOrchestrator } from '../apps/agent-runtime/src/orchestrator/orchestrator.js';

describe('Local Gemma AI Layer Test Suite', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Test 1: Ollama unavailable
  it('1. should detect when Ollama endpoint is unavailable and return UNAVAILABLE status', async () => {
    // Dead port on localhost
    const deadProvider = new OllamaGemmaProvider('http://127.0.0.1:59999', 'gemma3:4b');
    const health = await deadProvider.checkHealth();
    assert.strictEqual(health.status, 'UNAVAILABLE');
    assert.ok(health.error);

    await assert.rejects(
      async () => {
        await deadProvider.chat([{ role: 'user', content: 'test' }]);
      },
      (err: any) => err instanceof OllamaUnavailableError
    );
  });

  // Test 2: Gemma model missing
  it('2. should detect when Ollama is running but Gemma model is missing', async () => {
    globalThis.fetch = async (url: any) => {
      if (String(url).endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'mistral:7b' }, { name: 'llama3:8b' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new OllamaGemmaProvider('http://127.0.0.1:11434', 'gemma3:4b');
    const health = await provider.checkHealth();
    assert.strictEqual(health.status, 'MODEL_MISSING');
    assert.strictEqual(health.availableModels.includes('mistral:7b'), true);

    await assert.rejects(
      async () => {
        await provider.chat([{ role: 'user', content: 'hello' }]);
      },
      (err: any) => err instanceof GemmaModelMissingError
    );
  });

  // Test 3: Valid chat response
  it('3. should handle valid chat responses from Ollama', async () => {
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'gemma3:4b', details: { family: 'gemma3' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: { role: 'assistant', content: 'Hello, I am Gemma 3.' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new OllamaGemmaProvider('http://127.0.0.1:11434', 'gemma3:4b');
    const reply = await provider.chat([{ role: 'user', content: 'Hello!' }]);
    assert.strictEqual(reply, 'Hello, I am Gemma 3.');
  });

  // Test 4: Valid intent response
  it('4. should correctly classify user intent into Zod-validated structure', async () => {
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma3:4b' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({
                intent: 'browser_navigation',
                confidence: 0.98,
                target: 'https://news.ycombinator.com',
                parameters: { url: 'https://news.ycombinator.com' },
                reasoning: 'User requested to visit Hacker News',
              }),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new OllamaGemmaProvider('http://127.0.0.1:11434', 'gemma3:4b');
    const classifier = new IntentClassifier(provider);
    const result = await classifier.classify('take me to hacker news');

    assert.strictEqual(result.intent, 'browser_navigation');
    assert.strictEqual(result.confidence, 0.98);
    assert.strictEqual(result.target, 'https://news.ycombinator.com');
  });

  // Test 5: Invalid structured model output fallback
  it('5. should fall back safely to unknown intent when model output is invalid JSON', async () => {
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma3:4b' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: { role: 'assistant', content: 'I am not sure what you mean by that.' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new OllamaGemmaProvider('http://127.0.0.1:11434', 'gemma3:4b');
    const classifier = new IntentClassifier(provider);
    const result = await classifier.classify('random non-json output');

    assert.strictEqual(result.intent, 'unknown');
    assert.strictEqual(result.confidence, 0);
  });

  // Test 6: Valid task plan
  it('6. should generate a valid read-only task plan validated by Zod', async () => {
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma3:4b' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({
                goal: 'Research quantum computing breakthroughs',
                reasoning: 'Perform read-only web search and scan results',
                steps: [
                  {
                    stepNumber: 1,
                    description: 'Search for 2026 quantum computing breakthroughs',
                    toolName: 'web_search',
                    toolParameters: { query: 'quantum computing breakthroughs 2026' },
                  },
                  {
                    stepNumber: 2,
                    description: 'Read and analyze content',
                    toolName: 'read_page_content',
                    toolParameters: { focus: 'quantum algorithms' },
                  },
                ],
                isReadOnly: true,
                safeAlternatives: [],
              }),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new OllamaGemmaProvider('http://127.0.0.1:11434', 'gemma3:4b');
    const planner = new TaskPlanner(provider);
    const plan = await planner.plan('research quantum computing');

    assert.strictEqual(plan.isReadOnly, true);
    assert.strictEqual(plan.steps.length, 2);
    assert.strictEqual(plan.steps[0].toolName, 'web_search');
    assert.strictEqual(plan.steps[1].toolName, 'read_page_content');
  });

  // Test 7: Unsafe plan/tool request rejected
  it('7. should strictly reject plans requesting dangerous write/execution actions', async () => {
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma3:4b' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({
                goal: 'Buy items and checkout',
                reasoning: 'Unsafe execution attempt',
                steps: [
                  {
                    stepNumber: 1,
                    description: 'Submit credit card payment',
                    toolName: 'payment_submit',
                    toolParameters: { amount: 500 },
                  },
                ],
                isReadOnly: false,
              }),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new OllamaGemmaProvider('http://127.0.0.1:11434', 'gemma3:4b');
    const planner = new TaskPlanner(provider);

    await assert.rejects(
      async () => {
        await planner.plan('submit payment');
      },
      (err: any) => err instanceof UnsafePlanError
    );
  });

  // Test 8: Context redaction
  it('8. should redact all secrets, tokens, keys, passwords, cookies, and payment cards', () => {
    const builder = new ContextBuilder();
    const rawSensitive = `
      User credentials: password="SuperSecretPassword123!"
      Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMC6Y5
      API Key: sk-proj-1234567890abcdefghijklmnopqrstuvwxyz123456
      Credit Card: 4532 1234 5678 9012
      CVV: 893
      OTP: 948271
      Header: Cookie: session_id=abcdef123456; auth=xyz
    `;

    const { sanitized, count } = builder.redactSensitiveData(rawSensitive);

    assert.ok(count >= 6, `Expected at least 6 redactions, got ${count}`);
    assert.strictEqual(sanitized.includes('SuperSecretPassword123!'), false);
    assert.strictEqual(sanitized.includes('sk-proj-1234567890'), false);
    assert.strictEqual(sanitized.includes('4532 1234 5678 9012'), false);
    assert.strictEqual(sanitized.includes('948271'), false);
    assert.ok(sanitized.includes('[REDACTED_PASSWORD]'));
    assert.ok(sanitized.includes('[REDACTED_API_KEY]'));
    assert.ok(sanitized.includes('[REDACTED_PAYMENT_CARD]'));
    assert.ok(sanitized.includes('[REDACTED_OTP]'));
  });

  // Test 9: Sensitive data never reaches prompt builder
  it('9. should ensure sensitive data never appears in formatted prompt output', () => {
    const builder = new ContextBuilder();
    const secretApiKey = 'sk-1234567890abcdef1234567890abcdef';
    const secretPassword = 'MySecretBankPassword!';

    const promptBlock = builder.formatContextForPrompt({
      url: `https://example.com/login?token=${secretApiKey}`,
      title: `Secret Account: ${secretPassword}`,
      headings: [`API Key Config: ${secretApiKey}`],
      mainVisibleText: `Account password is ${secretPassword}`,
    });

    assert.strictEqual(promptBlock.includes(secretApiKey), false);
    assert.strictEqual(promptBlock.includes(secretPassword), false);
    assert.ok(promptBlock.includes('[REDACTED_'));
  });

  // Test 10: Cloud provider is never called
  it('10. should ensure Google Gemini or external cloud APIs are NEVER invoked', async () => {
    let cloudApiCalled = false;

    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com') || urlStr.includes('google') && urlStr.includes('gemini')) {
        cloudApiCalled = true;
        throw new Error('Cloud provider invoked violation!');
      }
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma3:4b' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({
                goal: 'Test local execution',
                reasoning: 'Local-only verification',
                steps: [
                  {
                    stepNumber: 1,
                    description: 'Local search',
                    toolName: 'web_search',
                    toolParameters: { query: 'test' },
                  },
                ],
                isReadOnly: true,
                safeAlternatives: [],
              }),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const orchestrator = new AgentOrchestrator();
    await orchestrator.createTaskAndPlan('test-profile', 'explain local AI');

    assert.strictEqual(cloudApiCalled, false, 'Cloud Gemini API must NEVER be invoked');
  });

  // Test 11: No tool executes from Gemma output
  it('11. should not execute any tools during planning phase', async () => {
    let toolExecuted = false;

    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma3:4b' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({
                goal: 'Plan navigation',
                reasoning: 'Planning only',
                steps: [
                  {
                    stepNumber: 1,
                    description: 'Navigate to site',
                    toolName: 'browser_navigate',
                    toolParameters: { url: 'https://example.com' },
                  },
                ],
                isReadOnly: true,
              }),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const orchestrator = new AgentOrchestrator();
    orchestrator.registerTool({
      name: 'browser_navigate',
      description: 'Navigate browser',
      category: 'READ_PAGE',
      inputSchema: {},
      execute: async () => {
        toolExecuted = true;
        return { status: 'executed' };
      },
    });

    // Planning phase ONLY
    const task = await orchestrator.createTaskAndPlan('profile-1', 'go to example.com');

    assert.strictEqual(toolExecuted, false, 'Gemma planning must NOT trigger tool execution');
    assert.strictEqual(task.planSteps.length, 1);
    assert.strictEqual(task.status, 'WAITING_FOR_APPROVAL');
  });

  // Test 12: Timeout and cancellation
  it('12. should respect timeout and handle cancellation via AbortSignal', async () => {
    globalThis.fetch = async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'gemma3:4b' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.endsWith('/api/chat')) {
        // Hang indefinitely until aborted
        return new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const provider = new OllamaGemmaProvider('http://127.0.0.1:11434', 'gemma3:4b');

    // Test timeout (50ms timeout)
    await assert.rejects(
      async () => {
        await provider.chat([{ role: 'user', content: 'timeout test' }], {
          timeoutMs: 50,
        });
      },
      (err: any) => err instanceof OllamaTimeoutError
    );

    // Test explicit cancellation
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    await assert.rejects(
      async () => {
        await provider.chat([{ role: 'user', content: 'cancel test' }], {
          signal: controller.signal,
          timeoutMs: 5000,
        });
      },
      (err: any) => err instanceof OllamaCancellationError
    );
  });
});
