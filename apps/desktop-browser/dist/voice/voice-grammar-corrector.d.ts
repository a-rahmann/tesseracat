/**
 * VoiceGrammarCorrector: Generalized Acoustic & Grammatical Voice Auto-Correction Engine.
 *
 * Implements Gboard / Google Assistant-style intelligent intent & grammar repair:
 * 1. Phonetic & Damerau-Levenshtein distance matching against 60+ canonical web platforms & browser actions.
 * 2. Bi-Gram context-aware homophone correction (e.g., "add to card" -> "add to cart", "by shoes" -> "buy shoes").
 * 3. Indefinite article ('a' vs 'an') correction based on following vowel/consonant phonetics.
 * 4. Stutter & hesitation deduplication ("open open youtube" -> "open youtube").
 * 5. Transitive verb and grammatical preposition restoration ("go youtube" -> "go to youtube", "search google shoes" -> "search google for shoes").
 * 6. Acoustic Whisper speech-to-text artifact cleansing (stripping "[BLANK_AUDIO]", "wrap open", "bye").
 * 7. Compound sentence synthesis ("open youtube and video" -> "open youtube and play a random video").
 * 8. Voice-activated grammar check & rewriting for input elements or verbal dictation.
 *
 * Runs in <1ms without network calls or external LLM dependencies.
 */
export interface CorrectionChange {
    original: string;
    corrected: string;
    reason: string;
}
export interface GrammarCorrectionResult {
    correctedText: string;
    originalText: string;
    wasModified: boolean;
    confidence: number;
    changes: CorrectionChange[];
    explanation: string;
}
export declare class VoiceGrammarCorrector {
    private static instance;
    private canonicalPlatforms;
    private canonicalActions;
    private protectedWords;
    static getInstance(): VoiceGrammarCorrector;
    /**
     * Soundex phonetic algorithm to match near-identical spoken pronunciations.
     */
    soundex(s: string): string;
    /**
     * Damerau-Levenshtein distance (substitution, insertion, deletion, transposition).
     */
    levenshteinDistance(s1: string, s2: string): number;
    /**
     * Main grammar & acoustic auto-correction method.
     * Runs in <1ms.
     */
    correct(rawText: string): GrammarCorrectionResult;
    /**
     * Corrects indefinite articles: 'a' before vowel sounds -> 'an', 'an' before consonant sounds -> 'a'.
     */
    correctArticles(text: string): {
        text: string;
        changes: CorrectionChange[];
    };
    /**
     * Deduplicates repeated stutter words (e.g. "open open", "search search", "the the").
     */
    deduplicateStutter(text: string): string;
    /**
     * Pure general English grammar & spelling correction for text fields.
     */
    correctGrammarOnly(text: string): GrammarCorrectionResult;
    /**
     * Strips speech-to-text sound tokens, whisper padding artifacts, and conversational noise.
     */
    private cleanAcousticArtifacts;
}
//# sourceMappingURL=voice-grammar-corrector.d.ts.map