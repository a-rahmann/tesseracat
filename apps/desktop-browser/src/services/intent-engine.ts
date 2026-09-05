/**
 * IntentEngine: Context-aware Natural Language Understanding for Tesseract.
 * Translates raw transcription into structured, actionable intents without
 * brittle regex chains. Maintains short-lived task context to resolve
 * pronouns ("the first one"), follow-ups ("go back"), and contextual searches ("open Amazon" -> "search Sony headphones").
 */

export type IntentType =
  | 'navigation'
  | 'media_playback'
  | 'search'
  | 'browser_control'
  | 'shopping'
  | 'comparison'
  | 'page_action'
  | 'clarification';

export interface StructuredIntent {
  type: IntentType;
  confidence: number;
  rawText: string;
  cleanText: string;
  targetUrl?: string;
  query?: string;
  action?: 'navigate' | 'play' | 'search' | 'back' | 'forward' | 'reload' | 'click' | 'compare' | 'pause' | 'resume' | 'new_tab' | 'close_tab';
  referent?: 'first' | 'second' | 'third' | 'last' | number;
  spokenIntro?: string;
  spokenFeedback?: string;
  autoPlayMedia?: boolean;
  siteContext?: string;
  inNewTab?: boolean;
  parameters?: Record<string, any>;
}

export interface TaskContext {
  currentSite?: string;
  currentUrl?: string;
  lastIntent?: StructuredIntent;
  lastQuery?: string;
  lastResults?: any[];
  selectedResult?: any;
  history: StructuredIntent[];
}

export class IntentEngine {
  private static instance: IntentEngine | null = null;
  private context: TaskContext = {
    history: [],
  };

  private sitePresets: Record<string, { domain: string; url: string; searchUrl: string; isMedia?: boolean; isShopping?: boolean }> = {
    youtube: { domain: 'youtube.com', url: 'https://www.youtube.com', searchUrl: 'https://www.youtube.com/results?search_query=', isMedia: true },
    google: { domain: 'google.com', url: 'https://www.google.com', searchUrl: 'https://www.google.com/search?q=' },
    amazon: { domain: 'amazon.com', url: 'https://www.amazon.com', searchUrl: 'https://www.amazon.com/s?k=', isShopping: true },
    github: { domain: 'github.com', url: 'https://www.github.com', searchUrl: 'https://github.com/search?q=' },
    reddit: { domain: 'reddit.com', url: 'https://www.reddit.com', searchUrl: 'https://www.reddit.com/search/?q=' },
    twitter: { domain: 'twitter.com', url: 'https://twitter.com', searchUrl: 'https://twitter.com/search?q=' },
    x: { domain: 'x.com', url: 'https://x.com', searchUrl: 'https://twitter.com/search?q=' },
    chatgpt: { domain: 'chatgpt.com', url: 'https://chatgpt.com', searchUrl: 'https://chatgpt.com/?q=' },
    spotify: { domain: 'spotify.com', url: 'https://open.spotify.com', searchUrl: 'https://open.spotify.com/search/', isMedia: true },
    netflix: { domain: 'netflix.com', url: 'https://www.netflix.com', searchUrl: 'https://www.netflix.com/search?q=', isMedia: true },
    wikipedia: { domain: 'wikipedia.org', url: 'https://en.wikipedia.org', searchUrl: 'https://en.wikipedia.org/w/index.php?search=' },
    maps: { domain: 'maps.google.com', url: 'https://maps.google.com', searchUrl: 'https://maps.google.com/?q=' },
  };

  private constructor() {}

  public static getInstance(): IntentEngine {
    if (!IntentEngine.instance) {
      IntentEngine.instance = new IntentEngine();
    }
    return IntentEngine.instance;
  }

  public getContext(): TaskContext {
    return { ...this.context };
  }

  public updateCurrentUrl(url: string): void {
    this.context.currentUrl = url;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      for (const [key, preset] of Object.entries(this.sitePresets)) {
        if (host.includes(preset.domain) || host.includes(key)) {
          this.context.currentSite = key;
          console.log(`[Intent] Updated current site context: "${key}" (${url})`);
          return;
        }
      }
      this.context.currentSite = host;
    } catch {
      this.context.currentSite = undefined;
    }
  }

  /**
   * Strip wake-up phrases and polite conversational fillers.
   */
  /**
   * Strip wake-up phrases and polite conversational fillers.
   * Matches "Hey Tesseract", "Hate us Iraq", "Hey test rats", "Hey test react",
   * and all regional phonetic accent variations through dual regex & phonetic skeleton matching.
   */
  public stripWakeAndPreamble(text: string): { hasWakeWord: boolean; cleanText: string } {
    if (!text) return { hasWakeWord: false, cleanText: '' };
    let raw = text.trim();

    // 1. Direct Regex matching all common Whisper acoustic/accent variations
    const directWakeRegex = /^(?:hey|hi|hello|ok|yo|hate|head|he|a|high|aye)?[\s,.-]*(?:tesseract|tesserract|tesserac|tessera|tasseract|tasheract|tazera|test\s*rats?|test\s*rat|testrat|test\s*erect|tess\s*erect|tess\s*direct|test\s*react|tess\s*react|test\s*tracks?|test\s*racks?|tester\s*act|tess\s*act|test\s*act|taste\s*rats?|taste\s*rat|taste\s*act|toss\s*a\s*rock|toss\s*rock|us\s*iraq|this\s*iraq|the\s*seract|deseract|desert\s*act|death\s*trap|that\s*a\s*rap|tess)(?:[,.!\s]+|$)/i;

    let hasWakeWord = false;
    const m = raw.match(directWakeRegex);
    if (m) {
      hasWakeWord = true;
      raw = raw.slice(m[0].length).trim();
    } else {
      // 2. Accent-tolerant phonetic skeleton matching
      const words = raw.split(/[\s,.-]+/).filter(Boolean);
      for (let len = 1; len <= Math.min(4, words.length); len++) {
        const candidate = words.slice(0, len).join(' ');
        const skeleton = candidate
          .toLowerCase()
          .replace(/ph/g, 'f')
          .replace(/ck|c(?=[iey])/g, 's')
          .replace(/[cqk]/g, 'k')
          .replace(/[dt]/g, 't')
          .replace(/[sz]/g, 's')
          .replace(/[aeiouywh]/g, '')
          .replace(/(.)\1+/g, '$1');

        if (/t.*s.*r.*[kts]/i.test(skeleton) || /t.*s.*r.*t/i.test(skeleton)) {
          hasWakeWord = true;
          raw = words.slice(len).join(' ').trim();
          break;
        }
      }
    }

    // Polite fillers & conversational preambles
    const preamblePatterns = [
      /^(?:can\s+you\s+(?:please\s+)?(?:go\s+ahead\s+and\s+)?)/i,
      /^(?:could\s+you\s+(?:please\s+)?(?:go\s+ahead\s+and\s+)?)/i,
      /^(?:would\s+you\s+(?:please\s+)?(?:go\s+ahead\s+and\s+)?)/i,
      /^(?:please\s+)/i,
      /^(?:kindly\s+)/i,
      /^(?:i\s+want\s+(?:you\s+to\s+|to\s+))/i,
      /^(?:i\s+need\s+(?:you\s+to\s+|to\s+))/i,
      /^(?:help\s+me\s+(?:to\s+|with\s+)?)/i,
      /^(?:do\s+me\s+a\s+favor\s+and\s+)/i,
      /^(?:go\s+ahead\s+and\s+)/i,
      /^(?:just\s+)/i,
      /^(?:let'?s\s+)/i,
      /^(?:tell\s+me\s+)/i,
    ];

    let changed = true;
    while (changed) {
      changed = false;
      for (const pat of preamblePatterns) {
        if (pat.test(raw)) {
          raw = raw.replace(pat, '').trim();
          changed = true;
        }
      }
    }

    // Strip trailing punctuation marks that Whisper often adds (. , ! ? ; :)
    raw = raw.replace(/^[,\s]+|[.,!?;:\s]+$/g, '').trim();

    return { hasWakeWord, cleanText: raw };
  }

  /**
   * Primary Entry Point: Classify raw utterance into a structured intent.
   */
  /**
   * Primary Entry Point: Classify raw utterance into a structured intent.
   */
  public classify(rawTranscript: string): StructuredIntent {
    console.log(`[Intent] received: "${rawTranscript}"`);
    const { hasWakeWord, cleanText } = this.stripWakeAndPreamble(rawTranscript);
    let workingText = cleanText;
    let inNewTab = false;

    // 1. Detect "open (a/another/new/a new) tab and..." prefix
    const openTabAndMatch = workingText.match(/^(?:open|create|launch)\s+(?:(?:a|an|another|new|a\s+new)\s+)?tab\s*(?:and\s+|,?\s*)/i);
    if (openTabAndMatch) {
      inNewTab = true;
      workingText = workingText.slice(openTabAndMatch[0].length).trim();
    }

    // 2. Detect "in another tab", "in a new tab", "on another tab" suffix or embedded
    const inTabMatch = workingText.match(/\b(?:in|on)\s+(?:(?:a|an|another|new|a\s+new)\s+)?tab\b/i);
    if (inTabMatch) {
      inNewTab = true;
      workingText = workingText.replace(/\b(?:in|on)\s+(?:(?:a|an|another|new|a\s+new)\s+)?tab\b/gi, '').trim();
    }

    workingText = workingText.replace(/^(?:and\s+|then\s+)/i, '').replace(/^[,\s]+|[.,!?;:\s]+$/g, '').trim();
    const text = workingText.toLowerCase();

    // 0. Isolated Wake Word without command
    if (hasWakeWord && (!text || text.length === 0)) {
      const intent: StructuredIntent = {
        type: 'clarification',
        confidence: 0.95,
        rawText: rawTranscript,
        cleanText: '',
        spokenIntro: "I'm listening, what can I do for you?",
      };
      this.recordIntent(intent);
      return intent;
    }

    // Standalone new tab command (e.g. "open a new tab", "open another tab", "new tab")
    if (inNewTab && (!text || text === 'open' || text === 'create' || text === 'tab')) {
      const intent: StructuredIntent = {
        type: 'browser_control',
        action: 'new_tab',
        confidence: 0.98,
        rawText: rawTranscript,
        cleanText: workingText,
        inNewTab: true,
        spokenIntro: 'Opening a new tab.',
      };
      this.recordIntent(intent);
      return intent;
    }

    // 1. Browser Controls (Back, Forward, Refresh, Reload, New Tab, Close Tab, Pause, Resume)
    const browserControl = this.matchBrowserControl(text, rawTranscript, workingText, inNewTab);
    if (browserControl) {
      this.recordIntent(browserControl);
      return browserControl;
    }

    // 2. Contextual Ordinals / Media Playback ("Play the first one", "Play the second video")
    const ordinalControl = this.matchOrdinalSelection(text, rawTranscript, workingText);
    if (ordinalControl) {
      this.recordIntent(ordinalControl);
      return ordinalControl;
    }

    // 3. Direct Navigation ("Open YouTube", "Go to Google", "Launch GitHub", "Open Amazon")
    const navIntent = this.matchNavigation(text, rawTranscript, workingText, inNewTab);
    if (navIntent) {
      this.recordIntent(navIntent);
      return navIntent;
    }

    // 4. Media Playback Intent ("Play some lofi", "Put on jazz", "play a song from youtube in another tab")
    const mediaIntent = this.matchMediaPlayback(text, rawTranscript, workingText, inNewTab);
    if (mediaIntent) {
      this.recordIntent(mediaIntent);
      return mediaIntent;
    }

    // 5. Search Intent ("Search YouTube for lofi", "Search for Sony headphones", "Google cats")
    const searchIntent = this.matchSearch(text, rawTranscript, workingText, inNewTab);
    if (searchIntent) {
      this.recordIntent(searchIntent);
      return searchIntent;
    }

    // 6. Shopping Intent ("Find wireless earbuds under 3000", "Buy coffee beans")
    const shoppingIntent = this.matchShopping(text, rawTranscript, workingText);
    if (shoppingIntent) {
      this.recordIntent(shoppingIntent);
      return shoppingIntent;
    }

    // 7. Comparison Intent ("Compare the first three", "Compare iPhone vs Galaxy")
    const comparisonIntent = this.matchComparison(text, rawTranscript, workingText);
    if (comparisonIntent) {
      this.recordIntent(comparisonIntent);
      return comparisonIntent;
    }

    // 8. General Query / URL Fallback
    const fallbackIntent = this.createFallbackIntent(text, rawTranscript, workingText);
    if (inNewTab) fallbackIntent.inNewTab = true;
    this.recordIntent(fallbackIntent);
    return fallbackIntent;
  }

  private matchBrowserControl(text: string, rawText: string, cleanText: string, inNewTab = false): StructuredIntent | null {
    if (/^(?:open|create|launch)?\s*(?:(?:a|an|another|new|a\s+new)\s+)?tab$/i.test(text)) {
      return {
        type: 'browser_control',
        action: 'new_tab',
        confidence: 0.98,
        rawText,
        cleanText,
        inNewTab: true,
        spokenIntro: 'Opening a new tab.',
      };
    }
    if (/\b(?:close|shut|kill)\s+(?:this\s+|the\s+)?tab\b/i.test(text)) {
      return {
        type: 'browser_control',
        action: 'close_tab',
        confidence: 0.98,
        rawText,
        cleanText,
        spokenIntro: 'Closing tab.',
      };
    }
    if (/\b(?:pause|pause\s+video|pause\s+music|pause\s+song|stop\s+music|stop\s+playback)\b/i.test(text)) {
      return {
        type: 'browser_control',
        action: 'pause',
        confidence: 0.96,
        rawText,
        cleanText,
        spokenIntro: 'Pausing playback.',
      };
    }
    if (/\b(?:resume|resume\s+video|resume\s+music|continue\s+playback|unpause)\b/i.test(text)) {
      return {
        type: 'browser_control',
        action: 'resume',
        confidence: 0.96,
        rawText,
        cleanText,
        spokenIntro: 'Resuming playback.',
      };
    }
    if (/\b(?:go\s+back|navigate\s+back|previous\s+page|back)\b/i.test(text)) {
      return {
        type: 'browser_control',
        action: 'back',
        confidence: 0.98,
        rawText,
        cleanText,
        spokenIntro: 'Going back.',
      };
    }
    if (/\b(?:go\s+forward|next\s+page|forward)\b/i.test(text)) {
      return {
        type: 'browser_control',
        action: 'forward',
        confidence: 0.98,
        rawText,
        cleanText,
        spokenIntro: 'Going forward.',
      };
    }
    if (/\b(?:reload|refresh|refresh\s+page|reload\s+page)\b/i.test(text)) {
      return {
        type: 'browser_control',
        action: 'reload',
        confidence: 0.98,
        rawText,
        cleanText,
        spokenIntro: 'Reloading page.',
      };
    }
    return null;
  }

  private matchOrdinalSelection(text: string, rawText: string, cleanText: string): StructuredIntent | null {
    const ordinalMap: Record<string, { referent: 'first' | 'second' | 'third' | 'last' | number; index: number }> = {
      'first': { referent: 'first', index: 0 },
      '1st': { referent: 'first', index: 0 },
      'second': { referent: 'second', index: 1 },
      '2nd': { referent: 'second', index: 1 },
      'third': { referent: 'third', index: 2 },
      '3rd': { referent: 'third', index: 2 },
      'fourth': { referent: 4, index: 3 },
      '4th': { referent: 4, index: 3 },
      'last': { referent: 'last', index: -1 },
    };

    const ordinalMatch = text.match(/\b(?:play|open|choose|select|click)\s+(?:the\s+)?(first|second|third|fourth|last|1st|2nd|3rd|4th)(?:\s+(?:one|video|result|item|link))?\b/i) ||
                         text.match(/\b(?:the\s+)?(first|second|third|fourth|last|1st|2nd|3rd|4th)(?:\s+(?:one|video|result|item))(?:\s+please)?\b/i);

    if (ordinalMatch) {
      const key = ordinalMatch[1].toLowerCase();
      const meta = ordinalMap[key] || { referent: 'first', index: 0 };
      const site = this.context.currentSite || 'web';

      return {
        type: 'page_action',
        action: 'click',
        referent: meta.referent,
        confidence: 0.94,
        rawText,
        cleanText,
        siteContext: site,
        spokenIntro: `Playing the ${meta.referent} result.`,
        parameters: { index: meta.index },
      };
    }

    return null;
  }

  private matchMediaPlayback(text: string, rawText: string, cleanText: string, inNewTab = false): StructuredIntent | null {
    // 1. Generic "play a song from/on youtube", "play some music", "play a song" (including typos like yotube)
    if (/\b(?:play|put\s+on|listen\s+to)\s+(?:a\s+|some\s+)?(?:song|music|track|tunes)(?:\s+(?:from|on)\s+(?:youtube|yotube|you\s*tube|spotify))?\b/i.test(text)) {
      return {
        type: 'media_playback',
        action: 'play',
        confidence: 0.96,
        rawText,
        cleanText,
        query: 'popular music songs',
        targetUrl: 'https://www.youtube.com/results?search_query=popular+music+songs',
        spokenIntro: inNewTab ? 'Opening a new tab and playing a song on YouTube.' : 'Playing a song on YouTube.',
        autoPlayMedia: true,
        siteContext: 'youtube',
        inNewTab,
      };
    }

    // 2. Specific lofi / study beats trigger
    if (/\b(?:lofi|lo-fi|focus\s+beats|study\s+beats|chill\s+beats)\b/i.test(text)) {
      return {
        type: 'media_playback',
        action: 'play',
        confidence: 0.96,
        rawText,
        cleanText,
        query: 'lofi hip hop radio beats to relax study to',
        targetUrl: 'https://www.youtube.com/results?search_query=lofi+hip+hop+radio+beats+to+relax+study+to',
        spokenIntro: inNewTab ? 'Opening a new tab and putting on lofi beats.' : 'Putting on lofi beats on YouTube.',
        autoPlayMedia: true,
        siteContext: 'youtube',
        inNewTab,
      };
    }

    // 3. Match "play [query] (from/on youtube)", "listen to [query]", "put on [query]"
    const playMatch = text.match(/\b(?:play|stream|put\s+on|listen\s+to|watch)\s+(?:a\s+|the\s+)?(.+)/i);
    if (playMatch) {
      let query = playMatch[1]
        .replace(/\b(?:from|on)\s+(?:youtube|yotube|you\s*tube|spotify)\b/gi, '')
        .replace(/\b(?:video|song|music)\b/gi, '')
        .trim();
      if (!query || query === 'a' || query === 'the') {
        query = 'popular music songs';
      }
      return {
        type: 'media_playback',
        action: 'play',
        confidence: 0.94,
        rawText,
        cleanText,
        query,
        targetUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        spokenIntro: inNewTab ? `Opening a new tab and playing ${query} on YouTube.` : `Playing ${query} on YouTube.`,
        autoPlayMedia: true,
        siteContext: 'youtube',
        inNewTab,
      };
    }

    return null;
  }

  private matchNavigation(text: string, rawText: string, cleanText: string, inNewTab = false): StructuredIntent | null {
    // Check for "open X", "go to X", "take me to X", "navigate to X"
    const navMatch = text.match(/^(?:open|go\s+to|take\s+me\s+to|navigate\s+to|launch|visit)\s+(.+)/i);
    const subject = (navMatch ? navMatch[1] : text).replace(/^[,\s]+|[.,!?;:\s]+$/g, '').trim();

    for (const [key, preset] of Object.entries(this.sitePresets)) {
      // Direct keyword or starts with key ("youtube", "open youtube", "go to amazon")
      if (
        subject === key ||
        subject === preset.domain ||
        subject.startsWith(`${key} `) ||
        subject.startsWith(`www.${preset.domain}`)
      ) {
        return {
          type: 'navigation',
          action: 'navigate',
          confidence: 0.97,
          rawText,
          cleanText,
          targetUrl: preset.url,
          siteContext: key,
          inNewTab,
          spokenIntro: inNewTab ? `Opening ${key.charAt(0).toUpperCase() + key.slice(1)} in a new tab.` : `Opening ${key.charAt(0).toUpperCase() + key.slice(1)}.`,
        };
      }
    }

    // Direct domain input e.g. "open github.com" or "open https://..."
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(subject) || subject.startsWith('http://') || subject.startsWith('https://')) {
      const url = subject.startsWith('http') ? subject : `https://${subject}`;
      return {
        type: 'navigation',
        action: 'navigate',
        confidence: 0.95,
        rawText,
        cleanText,
        targetUrl: url,
        inNewTab,
        spokenIntro: inNewTab ? `Opening ${subject} in a new tab.` : `Opening ${subject}.`,
      };
    }

    return null;
  }

  private matchSearch(text: string, rawText: string, cleanText: string, inNewTab = false): StructuredIntent | null {
    // 1. Explicit site search: "Search YouTube for lofi", "Search Amazon for Sony headphones"
    const explicitSiteMatch = text.match(/\bsearch\s+([a-zA-Z0-9]+)\s+for\s+(.+)/i);
    if (explicitSiteMatch) {
      const siteKey = explicitSiteMatch[1].toLowerCase();
      const query = explicitSiteMatch[2].replace(/^[,\s]+|[.,!?;:\s]+$/g, '').trim();
      const preset = this.sitePresets[siteKey];

      if (preset && query) {
        return {
          type: preset.isMedia ? 'media_playback' : (preset.isShopping ? 'shopping' : 'search'),
          action: 'search',
          confidence: 0.95,
          rawText,
          cleanText,
          query,
          targetUrl: `${preset.searchUrl}${encodeURIComponent(query)}`,
          siteContext: siteKey,
          inNewTab,
          spokenIntro: inNewTab
            ? `Searching ${siteKey.charAt(0).toUpperCase() + siteKey.slice(1)} for "${query}" in a new tab.`
            : `Searching ${siteKey.charAt(0).toUpperCase() + siteKey.slice(1)} for "${query}".`,
          autoPlayMedia: preset.isMedia === true,
        };
      }
    }

    // 2. Generic search: "Search for cats", "Search for Sony headphones", "Google cats", "Find me..."
    const searchMatch = text.match(/^(?:search(?:\s+for)?|google|look\s+up|find(?:\s+me)?)\s+(.+)/i);
    if (searchMatch) {
      const query = searchMatch[1].replace(/^[,\s]+|[.,!?;:\s]+$/g, '').trim();
      
      // Contextual awareness: If user is on Amazon OR searching for product/shopping keyword
      const isProductSearch = /\b(?:headphones|earbuds|shoes|phone|laptop|case|beans|watch)\b/i.test(query);
      const currentSite = this.context.currentSite;

      if (currentSite === 'amazon' || (isProductSearch && currentSite !== 'google' && currentSite !== 'youtube')) {
        const preset = this.sitePresets.amazon;
        return {
          type: 'shopping',
          action: 'search',
          confidence: 0.93,
          rawText,
          cleanText,
          query,
          targetUrl: `${preset.searchUrl}${encodeURIComponent(query)}`,
          siteContext: 'amazon',
          inNewTab,
          spokenIntro: inNewTab ? `Searching Amazon for "${query}" in a new tab.` : `Searching Amazon for "${query}".`,
        };
      }

      if (currentSite && this.sitePresets[currentSite]) {
        const preset = this.sitePresets[currentSite];
        return {
          type: preset.isShopping ? 'shopping' : (preset.isMedia ? 'media_playback' : 'search'),
          action: 'search',
          confidence: 0.92,
          rawText,
          cleanText,
          query,
          targetUrl: `${preset.searchUrl}${encodeURIComponent(query)}`,
          siteContext: currentSite,
          inNewTab,
          spokenIntro: inNewTab
            ? `Searching ${currentSite.charAt(0).toUpperCase() + currentSite.slice(1)} for "${query}" in a new tab.`
            : `Searching ${currentSite.charAt(0).toUpperCase() + currentSite.slice(1)} for "${query}".`,
          autoPlayMedia: preset.isMedia === true,
        };
      }

      // Default Web Search on Google
      return {
        type: 'search',
        action: 'search',
        confidence: 0.92,
        rawText,
        cleanText,
        query,
        targetUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        siteContext: 'google',
        inNewTab,
        spokenIntro: inNewTab ? `Searching Google for "${query}" in a new tab.` : `Searching Google for "${query}".`,
      };
    }

    return null;
  }

  private matchShopping(text: string, rawText: string, cleanText: string): StructuredIntent | null {
    if (/\b(?:buy|order|purchase|price\s+of|shop\s+for|under\s+(?:₹|\$|rs|inr)?\s*\d+)\b/i.test(text)) {
      const query = text.replace(/^(?:buy|order|purchase|shop\s+for)\s+/i, '').trim();
      return {
        type: 'shopping',
        action: 'search',
        confidence: 0.91,
        rawText,
        cleanText,
        query,
        targetUrl: `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
        siteContext: 'amazon',
        spokenIntro: `Searching Amazon for "${query}".`,
      };
    }
    return null;
  }

  private matchComparison(text: string, rawText: string, cleanText: string): StructuredIntent | null {
    const compMatch = text.match(/\bcompare\s+(?:the\s+)?(first\s+three|first\s+two|all|\d+)?(?:\s+(.+))?/i);
    if (compMatch) {
      const referentRaw = compMatch[1] ? compMatch[1].trim() : 'first three';
      const subject = compMatch[2] ? compMatch[2].trim() : '';

      return {
        type: 'comparison',
        action: 'compare',
        confidence: 0.90,
        rawText,
        cleanText,
        query: subject || this.context.lastQuery,
        spokenIntro: `Comparing ${referentRaw}${subject ? ` for ${subject}` : ''}.`,
        parameters: { referent: referentRaw },
      };
    }
    return null;
  }

  private createFallbackIntent(text: string, rawText: string, cleanText: string): StructuredIntent {
    // If text looks like a question or general inquiry, perform a web search
    const query = cleanText;
    return {
      type: 'search',
      action: 'search',
      confidence: 0.75,
      rawText,
      cleanText,
      query,
      targetUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      siteContext: 'google',
      spokenIntro: `Searching for "${query}".`,
    };
  }

  private recordIntent(intent: StructuredIntent): void {
    console.log(`[Intent] classification: ${intent.type} (Confidence: ${intent.confidence})`);
    if (intent.targetUrl) console.log(`[Intent] target: ${intent.targetUrl}`);
    if (intent.query) console.log(`[Intent] query: "${intent.query}"`);
    if (intent.action) console.log(`[Intent] action: ${intent.action}`);

    this.context.lastIntent = intent;
    if (intent.query) this.context.lastQuery = intent.query;
    this.context.history.push(intent);
    if (this.context.history.length > 20) {
      this.context.history.shift();
    }
  }
}
