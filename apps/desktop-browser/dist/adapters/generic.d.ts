/**
 * Universal Generic Website Adapter.
 * Default fallback for any arbitrary website using structured browser perception.
 */
export declare class GenericAdapter {
    static inspectPage(): Promise<import("../browser/snapshot.js").PageSnapshot>;
    static clickElement(elementId: string): Promise<{
        success: boolean;
    }>;
    static typeElement(elementId: string, text: string, pressEnter?: boolean): Promise<{
        success: boolean;
    }>;
}
//# sourceMappingURL=generic.d.ts.map