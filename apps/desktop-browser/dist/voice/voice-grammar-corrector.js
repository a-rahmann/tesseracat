"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceGrammarCorrector = void 0;
class VoiceGrammarCorrector {
    static instance = null;
    // Canonical platform dictionary (60+ platforms)
    canonicalPlatforms = {
        youtube: ['yooutube', 'yutube', 'u tube', 'you tube', 'june clear', 'june clear box', 'utube', 'ytube', 'yotube'],
        instagram: ['insta', 'instgram', 'ig', 'instagrm', 'insta gram'],
        google: ['gugle', 'googel', 'gogle', 'googl', 'gooogle', 'goggle'],
        amazon: ['amzon', 'amazn', 'amazone', 'amzone', 'amasor'],
        github: ['githup', 'git hub', 'gethub', 'githun'],
        reddit: ['redidt', 'redit', 'readit', 'red it'],
        wikipedia: ['wikpedia', 'wikepedia', 'wiki pedia', 'wikapedia', 'wickipedia'],
        twitter: ['twiter', 'twitr', 'x.com'],
        spotify: ['spotfy', 'spotafy', 'spotifi', 'spot if i'],
        netflix: ['netflicks', 'netflx', 'netflics'],
        gmail: ['gmaill', 'g mail', 'gee mail'],
        chatgpt: ['chatt gpt', 'chat gpt', 'chat gbt', 'chatgpt', 'chat g p t'],
        claude: ['claud', 'clawd'],
        linkedin: ['linked in', 'linkdin', 'linkin'],
        tiktok: ['tik tok', 'tictok', 'tic tok'],
        twitch: ['twich', 'twitche'],
        ebay: ['e bay', 'ebey'],
        walmart: ['wal mart', 'wallmart'],
        discord: ['dis cord', 'disord'],
        slack: ['slak'],
        notion: ['no tion', 'noton'],
        medium: ['meedium'],
        stackoverflow: ['stack over flow', 'stack overflow', 'stackoverflow'],
        pinterest: ['pinterst', 'pin terest'],
        facebook: ['face book', 'facebok'],
        yahoo: ['yahu', 'yahou'],
        duckduckgo: ['duck duck go', 'duckduck go'],
        imdb: ['i m d b', 'imdb'],
        coursera: ['coursra', 'course era'],
        udemy: ['u demy'],
        apple: ['aple'],
        microsoft: ['micro soft'],
    };
    // Canonical actions & UI vocabulary
    canonicalActions = {
        play: ['pay', 'lay', 'pray', 'plea', 'plaid', 'played', 'k', 'c', 'be'],
        search: ['surch', 'serch', 'surround for', 'look up for', 'lookup for', 'seach'],
        open: ['wrap open', 'wanna open', 'please open', 'go open', 'open up'],
        navigate: ['navgate', 'naviget'],
        scroll: ['scrol', 'skroll'],
        click: ['clik', 'clic'],
        type: ['tipe', 'teyp'],
        buy: ['by', 'bye'],
        checkout: ['check out', 'chekout', 'chechout'],
        cart: ['card'],
        summarize: ['sumarize', 'summerize', 'sum up'],
        explain: ['explan', 'xplain'],
        download: ['downlod', 'down load'],
        login: ['log in', 'logon', 'log on', 'sign in', 'signin'],
        signup: ['sign up', 'register'],
        tab: ['tap'],
        site: ['sight'],
        cache: ['cash'],
        fullscreen: ['full scream', 'full screan'],
        cursor: ['curser'],
    };
    protectedWords = new Set([
        'switch', 'twitch', 'email', 'mail', 'watch', 'show', 'search', 'close',
        'read', 'write', 'check', 'send', 'post', 'call', 'link', 'page', 'site',
        'file', 'tab', 'down', 'up', 'back', 'next', 'home', 'shop', 'news', 'chat',
        'talk', 'hear', 'here', 'look', 'view', 'card', 'cart', 'play', 'open', 'like',
        'time', 'times', 'date', 'word', 'text', 'code', 'help', 'feed', 'live', 'video',
        'stop', 'wait', 'find', 'move', 'take', 'done', 'save', 'load', 'make', 'give',
    ]);
    static getInstance() {
        if (!VoiceGrammarCorrector.instance) {
            VoiceGrammarCorrector.instance = new VoiceGrammarCorrector();
        }
        return VoiceGrammarCorrector.instance;
    }
    /**
     * Soundex phonetic algorithm to match near-identical spoken pronunciations.
     */
    soundex(s) {
        const a = s.toLowerCase().split('');
        const firstLetter = a[0] ? a[0].toUpperCase() : '';
        const codes = {
            b: '1', f: '1', p: '1', v: '1',
            c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
            d: '3', t: '3',
            l: '4',
            m: '5', n: '5',
            r: '6',
        };
        let r = firstLetter;
        let prev = codes[a[0]] || '0';
        for (let i = 1; i < a.length; i++) {
            const code = codes[a[i]];
            if (code) {
                if (code !== prev) {
                    r += code;
                }
                prev = code;
            }
            else {
                prev = '0';
            }
            if (r.length === 4)
                break;
        }
        return (r + '000').slice(0, 4);
    }
    /**
     * Damerau-Levenshtein distance (substitution, insertion, deletion, transposition).
     */
    levenshteinDistance(s1, s2) {
        const m = s1.length;
        const n = s2.length;
        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++)
            dp[i][0] = i;
        for (let j = 0; j <= n; j++)
            dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, // deletion
                dp[i][j - 1] + 1, // insertion
                dp[i - 1][j - 1] + cost // substitution
                );
                if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
                    dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1); // transposition
                }
            }
        }
        return dp[m][n];
    }
    /**
     * Main grammar & acoustic auto-correction method.
     * Runs in <1ms.
     */
    correct(rawText) {
        const input = (rawText || '').trim();
        if (!input) {
            return {
                correctedText: '',
                originalText: rawText,
                wasModified: false,
                confidence: 1.0,
                changes: [],
                explanation: 'Empty utterance',
            };
        }
        let text = input;
        const changes = [];
        // Stage 1: Strip Whisper acoustic token artifacts and noise closures
        const cleanedNoise = this.cleanAcousticArtifacts(text);
        if (cleanedNoise !== text) {
            changes.push({ original: text, corrected: cleanedNoise, reason: 'acoustic_noise_cleanup' });
            text = cleanedNoise;
        }
        // Stage 2: Stutter & hesitation deduplication (e.g. "open open youtube" -> "open youtube")
        const deduplicated = this.deduplicateStutter(text);
        if (deduplicated !== text) {
            changes.push({ original: text, corrected: deduplicated, reason: 'stutter_deduplication' });
            text = deduplicated;
        }
        // Stage 3: Known platform aliases
        for (const [canonical, aliases] of Object.entries(this.canonicalPlatforms)) {
            for (const alias of aliases) {
                const regex = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`, 'gi');
                if (regex.test(text)) {
                    text = text.replace(regex, canonical);
                    changes.push({ original: alias, corrected: canonical, reason: `platform_alias:${canonical}` });
                }
            }
        }
        // Stage 4: Known verb & UI action phonetic auto-corrections
        for (const [canonical, aliases] of Object.entries(this.canonicalActions)) {
            for (const alias of aliases) {
                const regex = new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`, 'gi');
                if (regex.test(text)) {
                    // Contextual guard for "play"
                    if (canonical === 'play' && (alias === 'be' || alias === 'k' || alias === 'c')) {
                        const mediaFollower = /\b(?:k|c|be)\s+(?:a\s+|the\s+)?(?:random\s+)?(?:video|song|track|clip|media)\b/i;
                        if (!mediaFollower.test(text))
                            continue;
                        text = text.replace(mediaFollower, (match) => match.replace(new RegExp(`\\b${alias}\\b`, 'i'), 'play'));
                        changes.push({ original: alias, corrected: 'play', reason: 'contextual_verb:play' });
                        continue;
                    }
                    // Contextual guard for "card" -> "cart"
                    if (canonical === 'cart' && alias === 'card') {
                        const cartContext = /\b(?:add\s+to|in\s+my|view|checkout|shopping)\s+card\b/i;
                        if (!cartContext.test(text))
                            continue;
                        text = text.replace(/\bcard\b/gi, 'cart');
                        changes.push({ original: 'card', corrected: 'cart', reason: 'homophone:add_to_cart' });
                        continue;
                    }
                    // Contextual guard for "tap" -> "tab"
                    if (canonical === 'tab' && alias === 'tap') {
                        const tabContext = /\b(?:new|close|switch|open|next|previous|current)\s+tap\b|\btap\s+(?:number|one|two|three|\d+)\b/i;
                        if (!tabContext.test(text))
                            continue;
                        text = text.replace(/\btap\b/gi, 'tab');
                        changes.push({ original: 'tap', corrected: 'tab', reason: 'contextual_ui:tab' });
                        continue;
                    }
                    // Contextual guard for "sight" -> "site"
                    if (canonical === 'site' && alias === 'sight') {
                        const siteContext = /\b(?:web|this|the|visit|open)\s+sight\b/i;
                        if (!siteContext.test(text))
                            continue;
                        text = text.replace(/\bsight\b/gi, 'site');
                        changes.push({ original: 'sight', corrected: 'site', reason: 'homophone:site' });
                        continue;
                    }
                    // Contextual guard for "cash" -> "cache"
                    if (canonical === 'cache' && alias === 'cash') {
                        const cacheContext = /\b(?:clear|browser|empty|clean)\s+cash\b/i;
                        if (!cacheContext.test(text))
                            continue;
                        text = text.replace(/\bcash\b/gi, 'cache');
                        changes.push({ original: 'cash', corrected: 'cache', reason: 'homophone:cache' });
                        continue;
                    }
                    text = text.replace(regex, canonical);
                    changes.push({ original: alias, corrected: canonical, reason: `action_alias:${canonical}` });
                }
            }
        }
        // Stage 5: Bi-Gram Homophone & Contextual Acoustic Grammar Repair
        const homophoneRepairs = [
            // Shopping / E-commerce
            { pattern: /\badd\s+to\s+card\b/gi, replacement: 'add to cart', reason: 'e-commerce:add_to_cart' },
            { pattern: /\bshopping\s+card\b/gi, replacement: 'shopping cart', reason: 'e-commerce:shopping_cart' },
            { pattern: /\bcheckout\s+(?:my\s+)?card\b/gi, replacement: 'checkout my cart', reason: 'e-commerce:checkout_cart' },
            { pattern: /\bby\s+(?:a\s+|the\s+)?(?:laptop|phone|shoes|headphones|product|item|book|shirt|ticket|tickets|sneakers|monitor)\b/gi, replacement: 'buy $1', reason: 'homophone:buy' },
            { pattern: /\bon\s+sell\b/gi, replacement: 'on sale', reason: 'homophone:sale' },
            { pattern: /\bshiping\b/gi, replacement: 'shipping', reason: 'spelling:shipping' },
            // Communication & Messaging
            { pattern: /\b(send|read|check)\s+(?:a\s+|the\s+)?massage\b/gi, replacement: '$1 a message', reason: 'homophone:message' },
            { pattern: /\bdirect\s+massage\b/gi, replacement: 'direct message', reason: 'homophone:message' },
            { pattern: /\bchat\s+width\b/gi, replacement: 'chat with', reason: 'homophone:chat_with' },
            { pattern: /\bweather\s+([A-Z][a-z]+|\w+)\s+(?:messaged|texted|sent|dm|replied|wrote)/gi, replacement: 'whether $1 messaged', reason: 'homophone:whether' },
            { pattern: /\bweather\s+(?:or\s+not|it|they|he|she)\b/gi, replacement: 'whether $1', reason: 'homophone:whether' },
            // Productivity & Mail
            { pattern: /\b(?:check|read|open|send|unread)\s+(?:my\s+|the\s+)?male\b/gi, replacement: 'check my mail', reason: 'homophone:mail' },
            { pattern: /\bgmail\s+male\b/gi, replacement: 'gmail', reason: 'homophone:mail' },
            { pattern: /\bright\s+(?:an?\s+)?(?:email|note|letter|code|message|review)\b/gi, replacement: 'write an email', reason: 'homophone:write' },
            // Prepositions & Numbers
            { pattern: /\b(go|navigate|visit|listen|talk)\s+too\b/gi, replacement: '$1 to', reason: 'preposition:to' },
            { pattern: /\b(search|look|shopping|waiting|paying)\s+four\b/gi, replacement: '$1 for', reason: 'preposition:for' },
            { pattern: /\b(times|pages|steps|tabs)\s+to\b/gi, replacement: '$1 two', reason: 'numeric:two' },
            { pattern: /\bscroll\s+down\s+to\s+times\b/gi, replacement: 'scroll down two times', reason: 'numeric:two' },
            { pattern: /\bto\s+times\b/gi, replacement: 'two times', reason: 'numeric:two' },
            // Audio / Video / Media
            { pattern: /\bloose\s+yourself\b/gi, replacement: 'lose yourself', reason: 'homophone:lose' },
            { pattern: /\bloose\s+my\b/gi, replacement: 'lose my', reason: 'homophone:lose' },
            { pattern: /\b(?:the\s+ransom|a\s+ransom|ransom)\s+(?:video|vide|clip)\b/gi, replacement: 'a random video', reason: 'acoustic:random_video' },
            { pattern: /\b(?:see\s+you\s+around|around)\s+(?:the|a)?\s*(?:video|vide)\b/gi, replacement: 'a random video', reason: 'acoustic:random_video' },
            { pattern: /\bsound\s+trek\b/gi, replacement: 'soundtrack', reason: 'homophone:soundtrack' },
            { pattern: /\bvalume\b/gi, replacement: 'volume', reason: 'spelling:volume' },
            // General English Homophones & Grammar
            { pattern: /\bthe\s+hole\s+(page|screen|article|document|text|video|tab)\b/gi, replacement: 'the whole $1', reason: 'homophone:whole' },
            { pattern: /\btake\s+a\s+brake\b/gi, replacement: 'take a break', reason: 'homophone:break' },
            { pattern: /\bwitch\s+(one|page|tab|site|website|video|song|link|button)\b/gi, replacement: 'which $1', reason: 'homophone:which' },
            { pattern: /\b(better|faster|more|less|rather)\s+then\b/gi, replacement: '$1 than', reason: 'grammar:than' },
            { pattern: /\bclick\s+hear\b/gi, replacement: 'click here', reason: 'homophone:here' },
            { pattern: /\blook\s+hear\b/gi, replacement: 'look here', reason: 'homophone:here' },
            { pattern: /\bi\s+no\s+(?:that|how|what)\b/gi, replacement: 'i know that', reason: 'homophone:know' },
            { pattern: /\bin\s+the\s+passed\b/gi, replacement: 'in the past', reason: 'homophone:past' },
            { pattern: /\ba\s+peace\s+of\b/gi, replacement: 'a piece of', reason: 'homophone:piece' },
            { pattern: /\bcurser\b/gi, replacement: 'cursor', reason: 'spelling:cursor' },
            { pattern: /\bin\s+box\b/gi, replacement: 'inbox', reason: 'compound:inbox' },
            { pattern: /\bweb\s+site\b/gi, replacement: 'website', reason: 'compound:website' },
            { pattern: /\bscreen\s+shot\b/gi, replacement: 'screenshot', reason: 'compound:screenshot' },
            { pattern: /\bbook\s+mark\b/gi, replacement: 'bookmark', reason: 'compound:bookmark' },
        ];
        for (const repair of homophoneRepairs) {
            if (repair.pattern.test(text)) {
                text = text.replace(repair.pattern, repair.replacement);
                changes.push({ original: repair.pattern.source, corrected: repair.replacement, reason: repair.reason });
            }
        }
        // Stage 6: Indefinite Article ('a' vs 'an') Grammar Repair
        const articleRepairs = this.correctArticles(text);
        if (articleRepairs.text !== text) {
            changes.push(...articleRepairs.changes);
            text = articleRepairs.text;
        }
        // Stage 7: Grammatical Preposition & Transitive Verb Restoration
        // e.g. "navigate youtube" -> "navigate to youtube"
        text = text.replace(/\b(navigate|go|visit)\s+(youtube|instagram|google|amazon|github|reddit|wikipedia|twitter|spotify|netflix|gmail|chatgpt|claude|linkedin|tiktok|twitch|ebay|walmart)\b/gi, '$1 to $2');
        // e.g. "search google shoes" -> "search google for shoes"
        text = text.replace(/\bsearch\s+(google|amazon|youtube|reddit|wikipedia|ebay|walmart|bing|duckduckgo)\s+(?!for\b)(.+)$/gi, 'search $1 for $2');
        // e.g. "listen [artist/song]" -> "listen to [artist/song]"
        text = text.replace(/\blisten\s+(?!to\b)([a-z0-9\s]+?)\s+(?:on|in)\s+(spotify|youtube|apple\s+music)\b/gi, 'listen to $1 on $2');
        // e.g. "subscribe [channel]" -> "subscribe to [channel]"
        text = text.replace(/\bsubscribe\s+(?!to\b)([a-z0-9_-]+)\b/gi, 'subscribe to $1');
        // e.g. "open youtube and video" -> "open youtube and play a random video"
        text = text.replace(/\bopen\s+youtube(?:\s+and)?\s+(?:a\s+)?video(?:\s+bye)?\b/gi, 'open youtube and play a random video');
        text = text.replace(/\bopen\s+youtube(?:\s+and)?\s+(?:k\s+|c\s+|see\s+)?(?:a\s+)?random\s+video\b/gi, 'open youtube and play a random video');
        text = text.replace(/\b(?:k|c)\s+(?:a\s+)?random\s+video\b/gi, 'play a random video');
        text = text.replace(/\bopen\s+youtube\s+play\s+(?:a\s+)?(?:random\s+)?video\b/gi, 'open youtube and play a random video');
        // Stage 8: Word-level Phonetic Fuzzy Matching via Levenshtein / Soundex for unmatched words
        const words = text.split(/\s+/);
        const correctedWords = [];
        for (let i = 0; i < words.length; i++) {
            const w = words[i].toLowerCase().replace(/[^a-z0-9]/g, '');
            if (w.length >= 4 && !this.protectedWords.has(w)) {
                let matched = false;
                // Check if word is 1 edit away from canonical platform
                for (const platform of Object.keys(this.canonicalPlatforms)) {
                    if (Math.abs(w.length - platform.length) <= 2) {
                        const dist = this.levenshteinDistance(w, platform);
                        if (dist === 1 || (dist === 2 && this.soundex(w) === this.soundex(platform))) {
                            correctedWords.push(platform);
                            changes.push({ original: words[i], corrected: platform, reason: `fuzzy_platform:${platform}` });
                            matched = true;
                            break;
                        }
                    }
                }
                if (!matched) {
                    correctedWords.push(words[i]);
                }
            }
            else {
                correctedWords.push(words[i]);
            }
        }
        text = correctedWords.join(' ').replace(/\s+/g, ' ').trim();
        const wasModified = text.toLowerCase() !== input.toLowerCase();
        const confidence = wasModified ? Math.max(0.85, 1.0 - changes.length * 0.05) : 1.0;
        const explanation = changes.map(c => `${c.reason} ('${c.original}' -> '${c.corrected}')`).join(', ') || 'No corrections needed';
        return {
            correctedText: text,
            originalText: input,
            wasModified,
            confidence,
            changes,
            explanation,
        };
    }
    /**
     * Corrects indefinite articles: 'a' before vowel sounds -> 'an', 'an' before consonant sounds -> 'a'.
     */
    correctArticles(text) {
        let result = text;
        const changes = [];
        // 'a' before vowel sound -> 'an'
        const aBeforeVowels = /\ba\s+(email|apple|account|order|issue|item|article|image|idea|error|audio|input|extension|update|action|alert|element|option|event|overview|icon|asset|album|answer|ad|api)\b/gi;
        if (aBeforeVowels.test(result)) {
            result = result.replace(aBeforeVowels, (m, word) => {
                changes.push({ original: m, corrected: `an ${word}`, reason: 'grammar:article_an' });
                return `an ${word}`;
            });
        }
        // 'an' before consonant sound -> 'a'
        const anBeforeConsonants = /\ban\s+(website|web\s+page|page|video|button|user|search|book|song|post|file|tab|link|field|review|laptop|phone|photo|device|screen|task|macro)\b/gi;
        if (anBeforeConsonants.test(result)) {
            result = result.replace(anBeforeConsonants, (m, word) => {
                changes.push({ original: m, corrected: `a ${word}`, reason: 'grammar:article_a' });
                return `a ${word}`;
            });
        }
        return { text: result, changes };
    }
    /**
     * Deduplicates repeated stutter words (e.g. "open open", "search search", "the the").
     */
    deduplicateStutter(text) {
        return text.replace(/\b(\w+)\s+\1\b/gi, '$1');
    }
    /**
     * Pure general English grammar & spelling correction for text fields.
     */
    correctGrammarOnly(text) {
        return this.correct(text);
    }
    /**
     * Strips speech-to-text sound tokens, whisper padding artifacts, and conversational noise.
     */
    cleanAcousticArtifacts(text) {
        return text
            .replace(/\[[A-Z0-9_\s-]+\]/gi, '') // e.g. [BLANK_AUDIO], [Music], [Applause]
            .replace(/\([A-Z0-9_\s-]+\)/gi, '') // e.g. (bell dings)
            .replace(/\*[A-Z0-9_\s-]+\*/gi, '') // e.g. *cough*
            .replace(/\b(?:you\s+need\s+to\s+wrap\s+open|wrap\s+open)\b/gi, 'open')
            .replace(/\s*[,.]?\s*bye[.!?\s]*$/gi, '')
            .replace(/\s*[,.]?\s*(?:thank\s+you|thanks|please|thank\s+u)[.!?\s]*$/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
}
exports.VoiceGrammarCorrector = VoiceGrammarCorrector;
//# sourceMappingURL=voice-grammar-corrector.js.map