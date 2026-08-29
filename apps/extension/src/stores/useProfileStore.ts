import { create } from 'zustand';
import { UserProfile } from '../../../../packages/core-types/src/index.js';

export interface ProfileStore {
  activeProfile: UserProfile;
  profiles: UserProfile[];
  setActiveProfile: (profileId: string) => void;
}

const DEFAULT_PROFILES: UserProfile[] = [
  { id: 'prof-personal', name: 'Personal', type: 'Personal', colorHex: '#38BDF8', icon: '👤', createdAt: new Date().toISOString(), isDefault: true },
  { id: 'prof-work', name: 'Work', type: 'Work', colorHex: '#818CF8', icon: '💼', createdAt: new Date().toISOString(), isDefault: false },
  { id: 'prof-college', name: 'College', type: 'College', colorHex: '#F472B6', icon: '🎓', createdAt: new Date().toISOString(), isDefault: false },
  { id: 'prof-entertainment', name: 'Entertainment', type: 'Entertainment', colorHex: '#FBBF24', icon: '🎬', createdAt: new Date().toISOString(), isDefault: false },
];

export const useProfileStore = create<ProfileStore>((set) => ({
  activeProfile: DEFAULT_PROFILES[0],
  profiles: DEFAULT_PROFILES,
  setActiveProfile: (profileId) =>
    set((state) => {
      const found = state.profiles.find((p) => p.id === profileId);
      return found ? { activeProfile: found } : state;
    }),
}));
