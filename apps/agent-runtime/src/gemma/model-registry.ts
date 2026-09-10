/**
 * Local AI Model Registry & Hardware Recommendation System
 *
 * Centralizes definitions, hardware-aware recommendation heuristics,
 * and state management for local LLMs running via Ollama.
 */

export interface LocalModelDefinition {
  id: string; // Canonical identifier (e.g. 'gemma4:e2b', 'gemma4:e4b', 'gemma3:4b')
  name: string; // User-facing name (e.g. 'Gemma 4 E2B')
  family: 'gemma4' | 'gemma3';
  parameterSize: string; // e.g. '2B', '4B', '4.3B'
  description: string;
  recommendedMinRamGb: number;
  recommendedMinVramGb?: number;
  pullCommand: string;
  inferenceTimeoutMs: number;
}

export interface HardwareSpecs {
  totalRamGb: number;
  freeRamGb?: number;
  cpuModel?: string;
  cpuCores?: number;
  gpuName?: string;
  gpuVramGb?: number;
  platform?: string;
  arch?: string;
}

export interface LocalModelCardStatus {
  id: string;
  name: string;
  family: string;
  parameterSize: string;
  description: string;
  isInstalled: boolean;
  installedName?: string; // Exact case as reported by Ollama tags (e.g. 'Gemma3:4b')
  isActive: boolean;
  isRecommended: boolean;
  recommendationReason?: string;
  pullCommand: string;
}

export const SUPPORTED_LOCAL_MODELS: LocalModelDefinition[] = [
  {
    id: 'gemma4:e2b',
    name: 'Gemma 4 E2B',
    family: 'gemma4',
    parameterSize: '2B',
    description: 'Ultra-fast and lightweight (2B parameters). Optimized for high throughput, lower-spec PCs, or integrated GPUs.',
    recommendedMinRamGb: 8,
    recommendedMinVramGb: 2,
    pullCommand: 'ollama pull gemma4:e2b',
    inferenceTimeoutMs: 90000,
  },
  {
    id: 'gemma4:e4b',
    name: 'Gemma 4 E4B',
    family: 'gemma4',
    parameterSize: '4B',
    description: 'Next-gen balanced reasoning engine (4B parameters). Excellent for autonomous browsing plans and structured JSON tasks.',
    recommendedMinRamGb: 16,
    recommendedMinVramGb: 6,
    pullCommand: 'ollama pull gemma4:e4b',
    inferenceTimeoutMs: 120000,
  },
  {
    id: 'gemma3:4b',
    name: 'Gemma 3 4B',
    family: 'gemma3',
    parameterSize: '4.3B',
    description: 'Standard local privacy-first model configured in Tesseract. Proven intent classification and reliable conversational QA.',
    recommendedMinRamGb: 12,
    recommendedMinVramGb: 4,
    pullCommand: 'ollama pull gemma3:4b',
    inferenceTimeoutMs: 60000,
  },
];

export class LocalModelRegistry {
  private activeModelId: string = 'gemma3:4b';
  private readonly supportedModels: LocalModelDefinition[] = [...SUPPORTED_LOCAL_MODELS];

  constructor(initialModelId?: string) {
    if (initialModelId && this.isValidModelId(initialModelId)) {
      this.activeModelId = initialModelId;
    }
  }

  public getSupportedModels(): LocalModelDefinition[] {
    return this.supportedModels;
  }

  public getModelById(id: string): LocalModelDefinition | undefined {
    const clean = (id || '').trim().toLowerCase();
    return this.supportedModels.find(
      (m) => m.id.toLowerCase() === clean || clean.startsWith(m.id.toLowerCase())
    );
  }

  public isValidModelId(id: string): boolean {
    return this.getModelById(id) !== undefined;
  }

  public getActiveModelId(): string {
    return this.activeModelId;
  }

  public getActiveModel(): LocalModelDefinition {
    return this.getModelById(this.activeModelId) || this.supportedModels[2]; // Fallback to Gemma 3 4B definition
  }

  public getActiveModelTimeout(): number {
    return this.getActiveModel().inferenceTimeoutMs || 90000;
  }

  public setActiveModelId(id: string): void {
    const model = this.getModelById(id);
    if (!model) {
      throw new Error(`Unsupported local model ID: "${id}". Supported: ${this.supportedModels.map(m => m.id).join(', ')}`);
    }
    this.activeModelId = model.id;
  }

  /**
   * Recommend a model based on detected hardware specs.
   * Does not force or restrict user selection.
   */
  public getHardwareRecommendation(hw?: HardwareSpecs): { recommendedModelId: string; reason: string } {
    if (!hw || !hw.totalRamGb) {
      return {
        recommendedModelId: 'gemma3:4b',
        reason: 'Recommended for standard local reasoning.',
      };
    }

    const hasDedicatedGpu =
      Boolean(hw.gpuName) &&
      !hw.gpuName?.toLowerCase().includes('intel') &&
      !hw.gpuName?.toLowerCase().includes('basic render') &&
      !hw.gpuName?.toLowerCase().includes('microsoft');

    const vram = hw.gpuVramGb ?? (hasDedicatedGpu ? 4 : 0);

    // High tier: >= 16 GB RAM with dedicated GPU or VRAM >= 6 GB
    if (hw.totalRamGb >= 16 && (vram >= 6 || hasDedicatedGpu)) {
      return {
        recommendedModelId: 'gemma4:e4b',
        reason: `Optimal for your ${hw.totalRamGb}GB RAM + ${hw.gpuName || 'GPU'} setup. Highest reasoning capacity for agent tasks.`,
      };
    }

    // Mid tier: 12-16 GB RAM
    if (hw.totalRamGb >= 12) {
      return {
        recommendedModelId: 'gemma3:4b',
        reason: `Balanced performance for your ${hw.totalRamGb}GB RAM. Solid local intent and conversational reasoning.`,
      };
    }

    // Efficiency tier: < 12 GB RAM or low VRAM
    return {
      recommendedModelId: 'gemma4:e2b',
      reason: `Lightweight and responsive for systems with ${hw.totalRamGb}GB RAM. Minimizes memory pressure.`,
    };
  }

  /**
   * Evaluates all supported models against the live installed models returned by Ollama.
   * Matches case-insensitively and returns card presentation data.
   */
  public evaluateModelStatuses(
    installedOllamaModels: Array<{ name: string; details?: { family?: string } }> = [],
    hw?: HardwareSpecs
  ): LocalModelCardStatus[] {
    const rec = this.getHardwareRecommendation(hw);

    return this.supportedModels.map((def) => {
      // Check if installed in Ollama (case-insensitive)
      const installed = installedOllamaModels.find((m) => {
        const mName = m.name.toLowerCase();
        const defId = def.id.toLowerCase();
        return (
          mName === defId ||
          mName.startsWith(defId + ':') ||
          (defId.includes(':') && mName === defId) ||
          mName.replace(':latest', '') === defId.replace(':latest', '')
        );
      });

      const isInstalled = Boolean(installed);
      const installedName = installed ? installed.name : undefined;
      const isActive = def.id.toLowerCase() === this.activeModelId.toLowerCase();
      const isRecommended = def.id.toLowerCase() === rec.recommendedModelId.toLowerCase();

      return {
        id: def.id,
        name: def.name,
        family: def.family,
        parameterSize: def.parameterSize,
        description: def.description,
        isInstalled,
        installedName,
        isActive,
        isRecommended,
        recommendationReason: isRecommended ? rec.reason : undefined,
        pullCommand: def.pullCommand,
      };
    });
  }
}
