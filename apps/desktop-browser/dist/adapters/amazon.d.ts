/**
 * Amazon Website Adapter.
 */
export declare class AmazonAdapter {
    static isAmazonUrl(url: string): boolean;
    static search(query: string): Promise<boolean>;
    static getProducts(): Promise<Array<{
        title: string;
        price: string;
        rating?: string;
    }>>;
}
//# sourceMappingURL=amazon.d.ts.map