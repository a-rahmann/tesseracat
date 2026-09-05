/**
 * ContextManager: Resolves anaphoric references ("it", "that", "the second one").
 */
export interface ContextualEntities {
    activeUrl?: string;
    activeTitle?: string;
    activeVideo?: {
        title: string;
        channel?: string;
        url?: string;
    };
    lastOptions?: Array<{
        index: number;
        label: string;
        value: any;
    }>;
    lastSelectedEntity?: any;
}
export declare class ContextManager {
    private static instance;
    private currentContext;
    static getInstance(): ContextManager;
    updateContext(patch: Partial<ContextualEntities>): void;
    getContext(): ContextualEntities;
    setOptionsList(options: string[] | Array<{
        label: string;
        value: any;
    }>): void;
    /**
     * Resolves ordinal references:
     * "first", "second", "the 2nd one", "third", "last"
     */
    resolveOrdinal(text: string): {
        index: number;
        resolvedItem?: any;
    } | null;
    /**
     * Resolves pronouns "it", "this", "that", "this video".
     */
    resolvePronoun(text: string): {
        type: 'video' | 'page' | 'entity';
        referent: any;
    } | null;
}
//# sourceMappingURL=context-manager.d.ts.map