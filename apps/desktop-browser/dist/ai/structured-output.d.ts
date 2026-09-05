/**
 * Structured Output Parser and JSON Repair Utility for Local Models.
 */
export declare class StructuredOutputParser {
    /**
     * Safely extracts and parses JSON from raw LLM output, handling markdown fences,
     * leading prose, trailing commentary, and subtle syntax anomalies.
     */
    static parseJson<T = any>(rawText: string): T;
}
//# sourceMappingURL=structured-output.d.ts.map