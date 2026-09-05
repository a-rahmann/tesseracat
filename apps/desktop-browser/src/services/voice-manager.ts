/**
 * Re-export the single authoritative VoiceManager implementation from voice/voice-manager.ts.
 * Guarantees a single singleton instance and a single microphone audio pipeline across the application.
 */

export * from '../voice/voice-manager.js';
