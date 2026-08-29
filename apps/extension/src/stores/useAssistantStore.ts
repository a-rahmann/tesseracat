import { create } from 'zustand';

export type AssistantState =
  | 'IDLE'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'THINKING'
  | 'SPEAKING'
  | 'ACTING'
  | 'WAITING_APPROVAL'
  | 'PAUSED';

export interface AssistantStore {
  state: AssistantState;
  spokenText: string;
  transcript: string;
  isVoiceActive: boolean;
  aiProcessingMode: 'Local-Only' | 'Cloud-AI';
  setState: (state: AssistantState) => void;
  setSpokenText: (text: string) => void;
  setTranscript: (transcript: string) => void;
  setVoiceActive: (active: boolean) => void;
  toggleAiProcessingMode: () => void;
}

export const useAssistantStore = create<AssistantStore>((set) => ({
  state: 'IDLE',
  spokenText: '',
  transcript: '',
  isVoiceActive: false,
  aiProcessingMode: 'Local-Only',
  setState: (state) => set({ state }),
  setSpokenText: (spokenText) => set({ spokenText }),
  setTranscript: (transcript) => set({ transcript }),
  setVoiceActive: (isVoiceActive) => set({ isVoiceActive }),
  toggleAiProcessingMode: () =>
    set((s) => ({
      aiProcessingMode: s.aiProcessingMode === 'Local-Only' ? 'Cloud-AI' : 'Local-Only',
    })),
}));
