"use strict";
/**
 * Ollama Gemma 3 4B Implementation of AgentModel.
 * Connects directly to local Ollama instance with streaming token support.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaGemmaModel = void 0;
const structured_output_js_1 = require("./structured-output.js");
class OllamaGemmaModel {
    name;
    provider = 'Ollama Local';
    baseUrl;
    static requestQueue = Promise.resolve();
    constructor(modelName = 'gemma3:4b', baseUrl = 'http://localhost:11434') {
        this.name = modelName;
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }
    async generate(prompt, options = {}) {
        const messages = [];
        if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        return this.chat(messages, options);
    }
    async stream(prompt, callbacks, options = {}) {
        const messages = [];
        if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        const payload = {
            model: this.name,
            messages,
            stream: true,
            options: {
                temperature: options.temperature ?? 0.2,
                num_predict: options.maxTokens ?? 1024,
                stop: options.stopSequences ?? [],
            },
        };
        let accumulated = '';
        try {
            const resp = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!resp.ok) {
                throw new Error(`Ollama HTTP error ${resp.status}: ${await resp.text()}`);
            }
            if (!resp.body) {
                throw new Error('No response body returned from Ollama');
            }
            const reader = resp.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (parsed.message?.content) {
                            const token = parsed.message.content;
                            accumulated += token;
                            callbacks.onToken(token);
                        }
                    }
                    catch { }
                }
            }
            if (callbacks.onComplete)
                callbacks.onComplete(accumulated);
            return accumulated;
        }
        catch (err) {
            console.error('[OllamaGemmaModel] Stream error:', err);
            if (callbacks.onError)
                callbacks.onError(err);
            throw err;
        }
    }
    async chat(messages, options = {}) {
        // Chain sequentially to prevent Ollama -np 1 CPU queue starvation
        const nextCall = OllamaGemmaModel.requestQueue
            .catch(() => { })
            .then(() => this.executeChat(messages, options));
        OllamaGemmaModel.requestQueue = nextCall;
        return nextCall;
    }
    async executeChat(messages, options = {}) {
        const payload = {
            model: this.name,
            messages,
            stream: false,
            options: {
                temperature: options.temperature ?? 0.2,
                num_predict: options.maxTokens ?? 1024,
                stop: options.stopSequences ?? [],
            },
        };
        if (options.format || options.jsonSchema) {
            payload.format = options.format || options.jsonSchema;
        }
        const timeoutMs = options.timeoutMs ?? 120000; // 120s default for CPU inference
        const controller = new AbortController();
        let isTimedOut = false;
        const timeout = setTimeout(() => {
            isTimedOut = true;
            controller.abort();
        }, timeoutMs);
        const endpoint = `${this.baseUrl}/api/chat`;
        try {
            let responseText = '';
            // Try browser fetch first
            try {
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
                if (!resp.ok) {
                    const bodyText = await resp.text();
                    const errObj = {
                        name: 'OllamaHttpError',
                        message: `Ollama HTTP ${resp.status}: ${bodyText}`,
                        httpStatus: resp.status,
                        responseBody: bodyText,
                        endpoint,
                        model: this.name,
                    };
                    console.error('[LLM ERROR] ' + JSON.stringify(errObj, null, 2));
                    throw new Error(errObj.message);
                }
                const json = await resp.json();
                responseText = json.message?.content || '';
            }
            catch (fetchErr) {
                // If fetch failed due to renderer network restrictions or CORS, fallback to Node http
                if (typeof window !== 'undefined' && window.require && !isTimedOut && fetchErr?.name !== 'AbortError') {
                    const http = window.require('http');
                    const parsedUrl = new URL(endpoint);
                    responseText = await new Promise((resolve, reject) => {
                        const req = http.request({
                            hostname: parsedUrl.hostname,
                            port: parsedUrl.port || 11434,
                            path: parsedUrl.pathname,
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(JSON.stringify(payload))
                            }
                        }, (res) => {
                            let data = '';
                            res.on('data', (chunk) => data += chunk);
                            res.on('end', () => {
                                try {
                                    const j = JSON.parse(data);
                                    resolve(j.message?.content || '');
                                }
                                catch (pe) {
                                    reject(new Error(`Failed to parse Ollama JSON response: ${data}`));
                                }
                            });
                        });
                        req.on('error', reject);
                        req.write(JSON.stringify(payload));
                        req.end();
                    });
                }
                else {
                    throw fetchErr;
                }
            }
            return responseText;
        }
        catch (err) {
            const isAbort = isTimedOut || err?.name === 'AbortError';
            const diagnosticError = {
                name: isAbort ? 'LlmTimeoutError' : (err?.name || 'Error'),
                message: isAbort
                    ? `Ollama request timed out after ${timeoutMs}ms (model: ${this.name}, endpoint: ${endpoint})`
                    : (err?.message || String(err)),
                stack: err?.stack,
                cause: err?.cause,
                model: this.name,
                endpoint,
                timedOut: isAbort,
                timeoutMs,
            };
            console.error('[LLM ERROR] ' + JSON.stringify(diagnosticError, null, 2));
            throw new Error(diagnosticError.message);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async structuredOutput(prompt, schemaDescription, options = {}) {
        const structuredSystem = `${options.systemPrompt || 'You are Tesseract autonomous browser planner.'}
CRITICAL REQUIREMENT: Output MUST be valid JSON conforming exactly to this specification:
${schemaDescription}
DO NOT wrap in conversational preamble. Output ONLY the JSON block.`;
        const raw = await this.generate(prompt, {
            ...options,
            format: options.format || 'json',
            systemPrompt: structuredSystem,
        });
        return structured_output_js_1.StructuredOutputParser.parseJson(raw);
    }
}
exports.OllamaGemmaModel = OllamaGemmaModel;
//# sourceMappingURL=ollama-gemma.js.map