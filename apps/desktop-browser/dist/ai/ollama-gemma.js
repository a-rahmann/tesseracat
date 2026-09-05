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
        const resp = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) {
            throw new Error(`Ollama HTTP error ${resp.status}: ${await resp.text()}`);
        }
        const json = await resp.json();
        return json.message?.content || '';
    }
    async structuredOutput(prompt, schemaDescription, options = {}) {
        const structuredSystem = `${options.systemPrompt || 'You are Tesseract autonomous browser planner.'}
CRITICAL REQUIREMENT: Output MUST be valid JSON conforming exactly to this specification:
${schemaDescription}
DO NOT wrap in conversational preamble. Output ONLY the JSON block.`;
        const raw = await this.generate(prompt, {
            ...options,
            systemPrompt: structuredSystem,
        });
        return structured_output_js_1.StructuredOutputParser.parseJson(raw);
    }
}
exports.OllamaGemmaModel = OllamaGemmaModel;
//# sourceMappingURL=ollama-gemma.js.map