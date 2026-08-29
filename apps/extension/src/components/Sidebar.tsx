import React from 'react';
import { useProfileStore } from '../stores/useProfileStore.js';
import { useAssistantStore } from '../stores/useAssistantStore.js';

export interface SidebarProps {
  activeNavItem: string;
  onSelectNavItem: (item: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeNavItem, onSelectNavItem }) => {
  const { activeProfile, profiles, setActiveProfile } = useProfileStore();
  const { aiProcessingMode, toggleAiProcessingMode } = useAssistantStore();

  const navItems = [
    { id: 'Home', label: 'Home', icon: '🏠' },
    { id: 'Explore', label: 'Explore', icon: '🔍' },
    { id: 'Agent', label: 'AI Agent', icon: '🤖' },
    { id: 'Compare', label: 'Compare', icon: '⚖️' },
    { id: 'Tasks', label: 'Tasks', icon: '📋' },
    { id: 'History', label: 'History', icon: '📜' },
    { id: 'Bookmarks', label: 'Bookmarks', icon: '🔖' },
    { id: 'Downloads', label: 'Downloads', icon: '📥' },
    { id: 'Notes', label: 'Notes', icon: '📝' },
    { id: 'Privacy', label: 'Privacy Center', icon: '🛡️' },
    { id: 'Settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside style={{ width: '250px', backgroundColor: '#0F172A', borderRight: '1px solid #1E293B', display: 'flex', flexDirection: 'column', padding: '16px', userSelect: 'none' }}>
      {/* Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366F1, #A855F7)', display: 'grid', placeItems: 'center', fontWeight: 'bold', color: '#FFF', fontSize: '18px' }}>T</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '0.5px', color: '#F8FAFC' }}>TESSERACT</div>
          <div style={{ fontSize: '11px', color: '#64748B' }}>Browser v1.0</div>
        </div>
      </div>

      {/* Profile Selector */}
      <div style={{ marginBottom: '16px', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#1E293B', border: '1px solid #334155' }}>
        <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '4px' }}>Active Profile</div>
        <select
          value={activeProfile.id}
          onChange={(e) => setActiveProfile(e.target.value)}
          style={{ width: '100%', background: 'none', border: 'none', color: '#F1F5F9', fontSize: '13px', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id} style={{ backgroundColor: '#1E293B', color: '#F1F5F9' }}>
              {p.icon} {p.name} Profile
            </option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
        {navItems.map((item) => {
          const isActive = activeNavItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectNavItem(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? '#1E293B' : 'transparent',
                color: isActive ? '#38BDF8' : '#94A3B8',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '15px' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* AI Processing Mode Pill (Local-Only / Cloud AI mandatory display) */}
      <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', backgroundColor: '#1E293B', border: '1px solid #334155' }}>
        <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>AI Processing Mode</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: aiProcessingMode === 'Local-Only' ? '#4ADE80' : '#F6AD55' }}>
            ● {aiProcessingMode}
          </span>
          <button
            onClick={toggleAiProcessingMode}
            style={{ background: '#334155', border: 'none', color: '#CBD5E1', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', padding: '3px 8px' }}
          >
            Switch
          </button>
        </div>
      </div>
    </aside>
  );
};
