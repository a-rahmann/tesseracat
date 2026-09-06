/**
 * Ollama Gemma 3 4B Implementation of AgentModel.
 * Connects directly to local Ollama instance with streaming token support.
 */
import { AgentModel, ChatMessage, ModelGenerateOptions, ModelStreamCallbacks } from './model.js';
export declare class OllamaGemmaModel implements AgentModel {
    readonly name: string;
    readonly provider = "Ollama Local";
    private baseUrl;
    private static requestQueue;
    constructor(modelName?: string, baseUrl?: string);
    generate(prompt: string, options?: ModelGenerateOptions): Promise<string>;
    stream(prompt: string, callbacks: ModelStreamCallbacks, options?: ModelGenerateOptions): Promise<string>;
    chat(messages: ChatMessage[], options?: ModelGenerateOptions): Promise<string>;
    private executeChat;
    structuredOutput<T = any>(prompt: string, schemaDescription: string, options?: ModelGenerateOptions): Promise<T>;
}
//# sourceMappingURL=ollama-gemma.d.ts.map