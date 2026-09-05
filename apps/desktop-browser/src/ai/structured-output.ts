/**
 * Structured Output Parser and JSON Repair Utility for Local Models.
 */

export class StructuredOutputParser {
  /**
   * Safely extracts and parses JSON from raw LLM output, handling markdown fences,
   * leading prose, trailing commentary, and subtle syntax anomalies.
   */
  public static parseJson<T = any>(rawText: string): T {
    if (!rawText || !rawText.trim()) {
      throw new Error('StructuredOutputParser: Empty response text');
    }

    let cleaned = rawText.trim();

    // 1. Remove markdown code blocks (```json ... ``` or ``` ...)
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      cleaned = codeBlockMatch[1].trim();
    }

    // 2. Direct parse attempt
    try {
      return JSON.parse(cleaned) as T;
    } catch {}

    // 3. Find the outermost JSON object or array
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleaned.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx !== -1 && endIdx > startIdx) {
      const candidate = cleaned.slice(startIdx, endIdx + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch (err: any) {
        // Attempt minor repairs: remove trailing commas before closing braces/brackets
        const repaired = candidate
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        return JSON.parse(repaired) as T;
      }
    }

    throw new Error(`StructuredOutputParser: Could not extract valid JSON from response: "${rawText.slice(0, 160)}..."`);
  }
}
