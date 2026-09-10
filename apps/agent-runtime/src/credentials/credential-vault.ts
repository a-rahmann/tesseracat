export interface StoredCredential {
  id: string;
  domain: string;
  username: string;
  /** Passwords are encrypted/held strictly in isolated vault memory */
  secretPassword: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface SafeCredentialMetadata {
  id: string;
  domain: string;
  username: string;
}

export class CredentialVault {
  private credentials: Map<string, StoredCredential[]> = new Map();

  constructor() {
    // Seed sample test credentials for user abdul (domain normalized)
    this.storeCredential({
      id: 'cred-amazon',
      domain: 'amazon.com',
      username: 'abdul@example.com',
      secretPassword: 'VaultProtectedPassword123!',
      createdAt: new Date().toISOString(),
    });
    this.storeCredential({
      id: 'cred-google',
      domain: 'google.com',
      username: 'abdul@gmail.com',
      secretPassword: 'VaultProtectedGooglePassword456!',
      createdAt: new Date().toISOString(),
    });
  }

  public normalizeDomain(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }

  public storeCredential(cred: StoredCredential): void {
    const domain = this.normalizeDomain(cred.domain);
    const list = this.credentials.get(domain) || [];
    list.push(cred);
    this.credentials.set(domain, list);
  }

  /**
   * Safe inquiry for the agent: returns metadata only, NEVER passwords.
   */
  public getCredentialMetadata(domain: string): SafeCredentialMetadata[] {
    const norm = this.normalizeDomain(domain);
    const list = this.credentials.get(norm) || [];
    return list.map(c => ({
      id: c.id,
      domain: c.domain,
      username: c.username,
    }));
  }

  /**
   * Secure retrieval strictly invoked by Browser Automation Bridge AFTER explicit Level 2 user approval.
   * NEVER pass this result to the LLM.
   */
  public getSecretCredentialForAutomation(domain: string, username?: string): StoredCredential | undefined {
    const norm = this.normalizeDomain(domain);
    const list = this.credentials.get(norm) || [];
    if (username) {
      return list.find(c => c.username.toLowerCase() === username.toLowerCase());
    }
    return list[0];
  }

  /**
   * Redaction utility to guarantee secrets never leak into logs or prompts.
   */
  public redactKnownSecrets(text: string): string {
    let result = text;
    for (const list of this.credentials.values()) {
      for (const cred of list) {
        if (cred.secretPassword && cred.secretPassword.length > 3) {
          result = result.split(cred.secretPassword).join('[REDACTED_PASSWORD]');
        }
      }
    }
    return result;
  }
}
