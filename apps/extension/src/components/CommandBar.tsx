import React, { useState } from 'react';
import { useAssistantStore } from '../stores/useAssistantStore.js';

export interface CommandBarProps {
  onSubmitGoal: (goal: string) => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({ onSubmitGoal }) => {
  const [input, setInput] = useState('');
  const { isVoiceActive, setVoiceActive, state } = useAssistantStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSubmitGoal(input.trim());
      setInput('');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a goal or command... (Hold 'T', press Ctrl+Space to push-to-talk, or say 'Hey Tesseract')"
        style={{
          width: '100%',
          padding: '16px 20px',
          paddingRight: '160px',
          borderRadius: '12px',
          backgroundColor: '#1E293B',
          border: state === 'ACTING' ? '1px solid #6366F1' : '1px solid #334155',
          color: '#F8FAFC',
          fontSize: '15px',
          outline: 'none',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setVoiceActive(!isVoiceActive)}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: isVoiceActive ? '#EF4444' : '#334155',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🎙️</span>
          <span>{isVoiceActive ? 'Listening' : 'Push to Talk'}</span>
        </button>
        <button
          type="submit"
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#6366F1',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Ask
        </button>
      </div>
    </form>
  );
};
