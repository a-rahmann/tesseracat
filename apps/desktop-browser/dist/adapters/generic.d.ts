/**
 * Universal Generic Website Adapter.
 * Default fallback for any arbitrary website using structured browser perception.
 */
export declare class GenericAdapter {
    static inspectPage(): Promise<import("../browser/snapshot.js").PageSnapshot>;
    static clickElement(elementId: string): Promise<import("../services/browser-automator.js").AutomatorResult<any>>;
    static typeElement(elementId: string, text: string, pressEnter?: boolean): Promise<import("../services/browser-automator.js").AutomatorResult<any>>;
}
//# sourceMappingURL=generic.d.ts.map