export type ProfileType = 'Personal' | 'Work' | 'College' | 'Entertainment' | 'Custom';

export interface UserProfile {
  id: string;
  name: string;
  type: ProfileType;
  colorHex: string;
  icon: string;
  createdAt: string;
  isDefault: boolean;
}

export interface ProfileSecurityBoundary {
  profileId: string;
  allowCrossProfileSharing: boolean; // Always false by blueprint spec
  isolateCookiesAndHistory: boolean; // Always true
  isolateOAuthTokens: boolean;      // Always true
  isolateTaskState: boolean;         // Always true
}
