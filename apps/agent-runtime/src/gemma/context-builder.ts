export interface RawPageContext {
  url?: string;
  title?: string;
  headings?: string[];
  mainVisibleText?: string;
  visibleTables?: string[];
  selectedText?: string;
}

export interface SanitizedPageContext {
  url: string;
  title: string;
  headings: string[];
  mainVisibleText: string;
  visibleTables: string[];
  selectedText: string;
  redactionCount: number;
}

export interface ContextBuilderOptions {
  maxHeadings?: number;
  maxHeadingLength?: number;
  maxMainTextLength?: number;
  maxTables?: number;
  maxTableLength?: number;
  maxSelectedTextLength?: number;
  maxUrlLength?: number;
}

export class ContextBuilder {
  private readonly options: Required<ContextBuilderOptions>;

  // Regex patterns for sensitive secret redaction
  private static readonly SECRET_PATTERNS: Array<{
    pattern: RegExp;
    replacement: string;
    description: string;
  }> = [
    // 1. Bearer / Auth tokens
    {
      pattern: /bearer\s+[a-zA-Z0-9_\-\.=:_+/]{16,}/gi,
      replacement: 'Bearer [REDACTED_AUTH_TOKEN]',
      description: 'Bearer Token',
    },
    // 2. JWT tokens (header.payload.signature)
    {
      pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
      replacement: '[REDACTED_JWT_TOKEN]',
      description: 'JWT Token',
    },
    // 3. Common API Keys (OpenAI including sk-proj-, GitHub, AWS, Google, Generic keys)
    {
      pattern: /(?:sk-[a-zA-Z0-9_\-]{20,}|ghp_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z-_]{35})/g,
      replacement: '[REDACTED_API_KEY]',
      description: 'API Key',
    },
    // 4. Passwords and secrets in key-value format (e.g. password=xyz, Secret Account: xyz, password is xyz)
    {
      pattern: /(["']?(?:password|passwd|pwd|secret|api_key|apikey|credential|token)(?:[ \t]+[a-zA-Z0-9_\-]+)?["']?\s*(?:[:=]|\bis\b)\s*["']?)([^"',\s\n]{3,})(["']?)/gi,
      replacement: '$1[REDACTED_PASSWORD]$3',
      description: 'Password Field',
    },
    // 5. URL query parameter secrets
    {
      pattern: /([?&](?:token|key|api_key|auth|secret|password)=)([^&\s]+)/gi,
      replacement: '$1[REDACTED_URL_SECRET]',
      description: 'URL Secret Parameter',
    },
    // 5. Payment card numbers (13-19 digits with optional spaces or dashes)
    {
      pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b|\b\d{15,16}\b/g,
      replacement: '[REDACTED_PAYMENT_CARD]',
      description: 'Payment Card',
    },
    // 6. CVV / CVC
    {
      pattern: /\b(?:cvv|cvc|security\s*code)\s*[:=]?\s*\d{3,4}\b/gi,
      replacement: '[REDACTED_CVV]',
      description: 'CVV',
    },
    // 7. OTP / 2FA verification codes
    {
      pattern: /\b(?:otp|2fa|verification\s*code|auth\s*code)\s*[:=]?\s*\d{4,8}\b/gi,
      replacement: '[REDACTED_OTP]',
      description: 'OTP Code',
    },
    // 8. Cookies & Session headers
    {
      pattern: /(?:cookie|set-cookie)\s*[:=]\s*[^;\r\n]+/gi,
      replacement: 'Cookie: [REDACTED_COOKIE]',
      description: 'Session Cookie',
    },
  ];

  constructor(options: ContextBuilderOptions = {}) {
    this.options = {
      maxHeadings: options.maxHeadings ?? 10,
      maxHeadingLength: options.maxHeadingLength ?? 120,
      maxMainTextLength: options.maxMainTextLength ?? 2500,
      maxTables: options.maxTables ?? 3,
      maxTableLength: options.maxTableLength ?? 500,
      maxSelectedTextLength: options.maxSelectedTextLength ?? 1000,
      maxUrlLength: options.maxUrlLength ?? 250,
    };
  }

  /**
   * Redact sensitive secrets from any text string
   */
  public redactSensitiveData(text: string): { sanitized: string; count: number } {
    if (!text) return { sanitized: '', count: 0 };

    let result = text;
    let totalRedactions = 0;

    for (const { pattern, replacement } of ContextBuilder.SECRET_PATTERNS) {
      const matches = result.match(pattern);
      if (matches) {
        totalRedactions += matches.length;
        result = result.replace(pattern, replacement);
      }
    }

    return { sanitized: result, count: totalRedactions };
  }

  /**
   * Safely truncate text to a maximum character length with ellipsis
   */
  private truncate(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '... [truncated]';
  }

  /**
   * Sanitize, redact, and compress raw page context into a safe structured context
   */
  public buildSanitizedContext(raw: RawPageContext): SanitizedPageContext {
    let totalRedactions = 0;

    // 1. URL
    const { sanitized: safeUrl, count: urlRedact } = this.redactSensitiveData(
      raw.url || ''
    );
    totalRedactions += urlRedact;
    const truncatedUrl = this.truncate(safeUrl, this.options.maxUrlLength);

    // 2. Title
    const { sanitized: safeTitle, count: titleRedact } = this.redactSensitiveData(
      raw.title || ''
    );
    totalRedactions += titleRedact;
    const truncatedTitle = this.truncate(safeTitle, 150);

    // 3. Headings
    const headings: string[] = [];
    if (Array.isArray(raw.headings)) {
      for (const h of raw.headings.slice(0, this.options.maxHeadings)) {
        if (!h || typeof h !== 'string') continue;
        const { sanitized, count } = this.redactSensitiveData(h.trim());
        totalRedactions += count;
        headings.push(this.truncate(sanitized, this.options.maxHeadingLength));
      }
    }

    // 4. Main Visible Text
    const { sanitized: safeMainText, count: textRedact } = this.redactSensitiveData(
      raw.mainVisibleText || ''
    );
    totalRedactions += textRedact;
    const truncatedMainText = this.truncate(
      safeMainText,
      this.options.maxMainTextLength
    );

    // 5. Visible Tables
    const visibleTables: string[] = [];
    if (Array.isArray(raw.visibleTables)) {
      for (const table of raw.visibleTables.slice(0, this.options.maxTables)) {
        if (!table || typeof table !== 'string') continue;
        const { sanitized, count } = this.redactSensitiveData(table.trim());
        totalRedactions += count;
        visibleTables.push(this.truncate(sanitized, this.options.maxTableLength));
      }
    }

    // 6. Selected Text
    const { sanitized: safeSelected, count: selRedact } = this.redactSensitiveData(
      raw.selectedText || ''
    );
    totalRedactions += selRedact;
    const truncatedSelected = this.truncate(
      safeSelected,
      this.options.maxSelectedTextLength
    );

    return {
      url: truncatedUrl,
      title: truncatedTitle,
      headings,
      mainVisibleText: truncatedMainText,
      visibleTables,
      selectedText: truncatedSelected,
      redactionCount: totalRedactions,
    };
  }

  /**
   * Format the sanitized page context into an LLM system prompt block
   */
  public formatContextForPrompt(raw?: RawPageContext): string {
    if (!raw) return '';

    const sanitized = this.buildSanitizedContext(raw);

    const parts: string[] = [];

    if (sanitized.url) {
      parts.push(`- Current URL: ${sanitized.url}`);
    }
    if (sanitized.title) {
      parts.push(`- Page Title: ${sanitized.title}`);
    }
    if (sanitized.headings.length > 0) {
      parts.push(`- Key Headings:\n  ${sanitized.headings.map(h => `* ${h}`).join('\n  ')}`);
    }
    if (sanitized.selectedText) {
      parts.push(`- User Selected Text:\n"${sanitized.selectedText}"`);
    }
    if (sanitized.mainVisibleText) {
      parts.push(`- Main Visible Content:\n${sanitized.mainVisibleText}`);
    }
    if (sanitized.visibleTables.length > 0) {
      parts.push(`- Tables:\n${sanitized.visibleTables.join('\n---\n')}`);
    }

    if (parts.length === 0) return '';

    return `\n--- ACTIVE PAGE CONTEXT (Sanitized & Redacted) ---\n${parts.join('\n\n')}\n--- END PAGE CONTEXT ---\n`;
  }
}
