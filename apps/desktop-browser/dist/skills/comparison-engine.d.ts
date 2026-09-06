/**
 * Multi-Site Comparison Engine for Tesseract.
 * Researches and compares products, specs, and prices across multiple domains
 * without hardcoding to a single retailer.
 */
export interface ProductComparisonItem {
    productName: string;
    price?: number;
    priceString?: string;
    currency?: string;
    seller?: string;
    availability?: string;
    shipping?: string;
    rating?: number;
    reviewCount?: number;
    source: string;
    url: string;
}
export interface ComparisonReport {
    query: string;
    items: ProductComparisonItem[];
    platforms?: string[];
    topRecommendation?: ProductComparisonItem;
    summary: string;
    summaryBestDeal?: string;
    timestamp: number;
}
export declare class ComparisonEngine {
    private static instance;
    private model;
    private constructor();
    static getInstance(): ComparisonEngine;
    /**
     * Compares a product query across multiple real e-commerce / search sites.
     */
    compareAcrossWebsites(productQuery: string, onProgress?: (status: string) => void): Promise<ComparisonReport>;
    private extractItemsFromSnapshot;
}
//# sourceMappingURL=comparison-engine.d.ts.map