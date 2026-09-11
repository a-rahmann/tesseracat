"use strict";
/**
 * Google Native Service Connector for Tesseract.
 *
 * Provides OAuth 2.0 with PKCE authorization, secure token management via CredentialVault,
 * token auto-refresh, and tool routing for Gmail, Google Calendar, Google Drive, and YouTube.
 *
 * Security Invariants:
 * 1. ZERO password entry. Only OAuth 2.0 consent authorization.
 * 2. Least-privilege scopes requested per capability.
 * 3. Access & refresh tokens stored encrypted via CredentialVault.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleConnector = void 0;
const http = __importStar(require("http"));
const crypto = __importStar(require("crypto"));
const url_1 = require("url");
const credential_vault_js_1 = require("./credential-vault.js");
const browser_automator_js_1 = require("../browser-automator.js");
class GoogleConnector {
    id = 'google';
    name = 'Google Workspace';
    authenticationState = 'DISCONNECTED';
    capabilities = [];
    static instance = null;
    vault = credential_vault_js_1.CredentialVault.getInstance();
    config;
    currentTokens = null;
    toolHandlers = new Map();
    constructor() {
        this.config = {
            clientId: process.env.GOOGLE_CLIENT_ID || 'tesseract-client-id.apps.googleusercontent.com',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:54321/oauth2callback',
        };
        this.initializeCapabilities();
    }
    static getInstance() {
        if (!GoogleConnector.instance) {
            GoogleConnector.instance = new GoogleConnector();
        }
        return GoogleConnector.instance;
    }
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
    registerToolHandler(toolName, handler) {
        this.toolHandlers.set(toolName, handler);
    }
    initializeCapabilities() {
        this.capabilities = [
            // Gmail
            {
                name: 'gmail.search',
                description: 'Search Gmail messages using standard query syntax (e.g. "is:unread from:boss")',
                requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
            },
            {
                name: 'gmail.getMessage',
                description: 'Fetch email subject, body snippet, and headers by message ID',
                requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
            },
            {
                name: 'gmail.listThreads',
                description: 'List recent email conversation threads',
                requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
            },
            {
                name: 'gmail.createDraft',
                description: 'Create a draft email without sending it',
                requiredScopes: ['https://www.googleapis.com/auth/gmail.compose'],
            },
            {
                name: 'gmail.send',
                description: 'Send an email message (External communication gate required)',
                requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
                isDestructive: true,
            },
            // Calendar
            {
                name: 'calendar.today',
                description: "Retrieve all scheduled calendar events for today",
                requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
            },
            {
                name: 'calendar.upcoming',
                description: 'Retrieve upcoming calendar events for the next N days',
                requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
            },
            {
                name: 'calendar.search',
                description: 'Search calendar events by title, attendee, or keywords',
                requiredScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
            },
            {
                name: 'calendar.createEvent',
                description: 'Schedule a new calendar event (Requires user confirmation gate)',
                requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
                isDestructive: true,
            },
            {
                name: 'calendar.updateEvent',
                description: 'Update time, location, or summary of an existing event',
                requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
            },
            {
                name: 'calendar.deleteEvent',
                description: 'Remove an event from calendar (Requires user confirmation gate)',
                requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
                isDestructive: true,
            },
            // Drive
            {
                name: 'drive.search',
                description: 'Search files and folders in Google Drive by name, type, or query',
                requiredScopes: ['https://www.googleapis.com/auth/drive.readonly'],
            },
            {
                name: 'drive.getFile',
                description: 'Fetch file metadata and download link',
                requiredScopes: ['https://www.googleapis.com/auth/drive.readonly'],
            },
            {
                name: 'drive.upload',
                description: 'Upload a local file to Google Drive',
                requiredScopes: ['https://www.googleapis.com/auth/drive.file'],
            },
            {
                name: 'drive.delete',
                description: 'Delete or trash a file in Google Drive (Requires confirmation gate)',
                requiredScopes: ['https://www.googleapis.com/auth/drive.file'],
                isDestructive: true,
            },
            // YouTube
            {
                name: 'youtube.search',
                description: 'Search YouTube for videos with metadata (title, duration, views)',
                requiredScopes: ['https://www.googleapis.com/auth/youtube.readonly'],
            },
            {
                name: 'youtube.getVideo',
                description: 'Get details, description, and status of a YouTube video',
                requiredScopes: ['https://www.googleapis.com/auth/youtube.readonly'],
            },
            {
                name: 'youtube.play',
                description: 'Navigate browser to video, initiate playback, and verify playing state',
                requiredScopes: [],
            },
        ];
    }
    getCapabilities() {
        return this.capabilities;
    }
    async getValidAccessToken() {
        if (!this.currentTokens) {
            this.currentTokens = await this.vault.getTokens(this.id);
        }
        if (!this.currentTokens) {
            this.authenticationState = 'DISCONNECTED';
            throw new Error('Google Workspace is not connected. Please authenticate first.');
        }
        // Refresh if expired or within 60 seconds of expiration
        const now = Date.now();
        if (this.currentTokens.expiresAt && this.currentTokens.expiresAt <= now + 60000) {
            if (this.currentTokens.refreshToken) {
                await this.refreshAccessToken(this.currentTokens.refreshToken);
            }
            else {
                this.authenticationState = 'EXPIRED';
                throw new Error('Google Workspace token expired and no refresh token available. Reconnection required.');
            }
        }
        this.authenticationState = 'CONNECTED';
        return this.currentTokens.accessToken;
    }
    async connect(scopes) {
        const requestedScopes = scopes && scopes.length > 0
            ? scopes
            : Array.from(new Set(this.capabilities.flatMap(c => c.requiredScopes)));
        // Generate PKCE
        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        const state = crypto.randomBytes(16).toString('hex');
        const authUrl = new url_1.URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', this.config.clientId);
        authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', requestedScopes.join(' '));
        authUrl.searchParams.set('code_challenge', challenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        try {
            console.log(`[GoogleConnector] Starting OAuth authorization flow...`);
            // Start local loopback listener for OAuth callback
            const authCodePromise = this.listenForAuthCode(state);
            // Open OAuth URL in browser
            await browser_automator_js_1.BrowserAutomator.getInstance().navigate(authUrl.toString());
            const code = await authCodePromise;
            if (!code) {
                this.authenticationState = 'DISCONNECTED';
                return false;
            }
            // Exchange code for tokens
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret || '',
                    redirect_uri: this.config.redirectUri,
                    grant_type: 'authorization_code',
                    code_verifier: verifier,
                }),
            });
            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                throw new Error(`Google token exchange failed: ${errorText}`);
            }
            const tokenData = await tokenResponse.json();
            this.currentTokens = {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
                tokenType: tokenData.token_type,
                scope: tokenData.scope,
            };
            await this.vault.storeTokens(this.id, this.currentTokens);
            this.authenticationState = 'CONNECTED';
            console.log('[GoogleConnector] Successfully authenticated with Google Workspace');
            return true;
        }
        catch (err) {
            console.error('[GoogleConnector] OAuth connection error:', err);
            this.authenticationState = 'DISCONNECTED';
            return false;
        }
    }
    async refreshAccessToken(refreshToken) {
        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret || '',
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token',
                }),
            });
            if (!response.ok) {
                throw new Error(`Token refresh failed: ${await response.text()}`);
            }
            const data = await response.json();
            this.currentTokens = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || refreshToken,
                expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
                tokenType: data.token_type,
            };
            await this.vault.storeTokens(this.id, this.currentTokens);
            this.authenticationState = 'CONNECTED';
            return data.access_token;
        }
        catch (err) {
            this.authenticationState = 'EXPIRED';
            throw err;
        }
    }
    async disconnect() {
        if (this.currentTokens?.accessToken) {
            try {
                await fetch(`https://oauth2.googleapis.com/revoke?token=${this.currentTokens.accessToken}`, {
                    method: 'POST',
                });
            }
            catch {
                // Revocation failure is non-fatal
            }
        }
        await this.vault.removeTokens(this.id);
        this.currentTokens = null;
        this.authenticationState = 'DISCONNECTED';
        return true;
    }
    async healthCheck() {
        try {
            const tokens = await this.vault.getTokens(this.id);
            if (!tokens) {
                this.authenticationState = 'DISCONNECTED';
                return { ok: false, status: 'Not connected' };
            }
            if (tokens.expiresAt && tokens.expiresAt <= Date.now()) {
                if (!tokens.refreshToken) {
                    this.authenticationState = 'EXPIRED';
                    return { ok: false, status: 'Token expired, re-auth required' };
                }
            }
            this.authenticationState = 'CONNECTED';
            return { ok: true, status: 'Authenticated' };
        }
        catch (err) {
            return { ok: false, status: err.message };
        }
    }
    async executeTool(toolName, params) {
        const handler = this.toolHandlers.get(toolName);
        if (!handler) {
            throw new Error(`No implementation registered for Google tool: "${toolName}"`);
        }
        // Enforce authentication for tools that require scopes
        const cap = this.capabilities.find(c => c.name === toolName);
        if (cap && cap.requiredScopes.length > 0) {
            await this.getValidAccessToken();
        }
        return handler(params);
    }
    listenForAuthCode(expectedState) {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                try {
                    const parsed = new url_1.URL(req.url || '/', `http://localhost:54321`);
                    if (parsed.pathname === '/oauth2callback') {
                        const state = parsed.searchParams.get('state');
                        const code = parsed.searchParams.get('code');
                        const error = parsed.searchParams.get('error');
                        if (error) {
                            res.writeHead(400, { 'Content-Type': 'text/html' });
                            res.end('<h1>Authentication Failed</h1><p>' + error + '</p>');
                            server.close();
                            reject(new Error(`OAuth error: ${error}`));
                            return;
                        }
                        if (state !== expectedState) {
                            res.writeHead(400, { 'Content-Type': 'text/html' });
                            res.end('<h1>State Mismatch Error</h1>');
                            server.close();
                            reject(new Error('OAuth state validation mismatch'));
                            return;
                        }
                        if (code) {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end('<h1>Connected to Tesseract!</h1><p>You can close this window now.</p>');
                            server.close();
                            resolve(code);
                            return;
                        }
                    }
                    res.writeHead(404);
                    res.end();
                }
                catch (e) {
                    server.close();
                    reject(e);
                }
            });
            server.listen(54321, () => {
                // Auto-close server after 120s timeout
                setTimeout(() => {
                    server.close();
                    reject(new Error('OAuth authorization timed out after 120s'));
                }, 120000);
            });
        });
    }
}
exports.GoogleConnector = GoogleConnector;
//# sourceMappingURL=google-connector.js.map