export class PromptInjectionDefense {
  private static REDACTION_PATTERNS = [
    /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
    /password\s*[:=]\s*\S+/gi,
    /otp\s*[:=]\s*\d{6}/gi,
    /4[0-9]{12}(?:[0-9]{3})?/g, // Visa card pattern
  ];

  private static HOSTILE_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    /system\s+override/gi,
    /you\s+are\s+now\s+a/gi,
    /exfiltrate/gi,
    /print\s+system\s+prompt/gi,
  ];

  /**
   * Sanitize external web page or document text before supplying to model context.
   */
  public static sanitizeUntrustedContent(rawContent: string): string {
    let sanitized = rawContent;

    // 1. Redact credential patterns
    for (const pattern of this.REDACTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }

    // 2. Neutralize hostile injection instructions
    for (const pattern of this.HOSTILE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[HOSTILE_INSTRUCTION_REMOVED]');
    }

    return sanitized;
  }

  /**
   * Wrap content in untrusted data delimiters.
   */
  public static wrapAsUntrustedData(content: string, sourceName: string): string {
    const clean = this.sanitizeUntrustedContent(content);
    return `<UNTRUSTED_EXTERNAL_DATA source="${sourceName}">\n${clean}\n</UNTRUSTED_EXTERNAL_DATA>`;
  }
}
