export declare const currentPlatform: {
    isMac: boolean;
    isWindows: boolean;
    platformName: "darwin";
    modifierKey: string;
    modifierSymbol: string;
    shortcutLabel: (key: string) => string;
    defaultShell: string;
} | {
    isMac: boolean;
    isWindows: boolean;
    platformName: "win32";
    modifierKey: string;
    modifierSymbol: string;
    shortcutLabel: (key: string) => string;
    defaultShell: string;
};
export declare function getAppDataDir(appName?: string): string;
export declare function isPlatformModifierKey(e: KeyboardEvent): boolean;
export declare function getPushToTalkKey(): string;
//# sourceMappingURL=index.d.ts.map