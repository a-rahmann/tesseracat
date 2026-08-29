import React from 'react';
import { useAssistantStore, AssistantState } from '../stores/useAssistantStore.js';

export interface AssistantOverlayProps {
  currentGoal?: string;
  planSteps?: Array<{ id: string; description: string; status: string }>;
  onApproveStep?: (stepId: string) => void;
}

export const AssistantOverlay: React.FC<AssistantOverlayProps> = ({
  currentGoal,
  planSteps = [],
  onApproveStep,
}) => {
  const { state, spokenText, isVoiceActive, setState } = useAssistantStore();

  const stateColors: Record<AssistantState, string> = {
    IDLE: '#94A3B8',
    LISTENING: '#EF4444',
    TRANSCRIBING: '#F6AD55',
    THINKING: '#6366F1',
    SPEAKING: '#38BDF8',
    ACTING: '#A855F7',
    WAITING_APPROVAL: '#F59E0B',
    PAUSED: '#64748B',
  };

  if (state === 'IDLE' && !currentGoal) {
    return null;
  }

  return (
    <div style={{ backgroundColor: '#0F172A', borderRadius: '12px', border: `1px solid ${stateColors[state]}`, padding: '20px', marginTop: '16px' }}>
      {/* Header & State Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: stateColors[state], boxShadow: `0 0 10px ${stateColors[state]}` }} />
          <span style={{ fontWeight: 700, fontSize: '14px', color: stateColors[state] }}>
            ASSISTANT: {state}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setState('PAUSED')}
            style={{ background: '#334155', border: 'none', color: '#FFF', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
          >
            Pause
          </button>
          <button
            onClick={() => setState('IDLE')}
            style={{ background: '#7F1D1D', border: 'none', color: '#FECACA', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
          >
            Halt / Stop
          </button>
        </div>
      </div>

      {/* Goal Description */}
      {currentGoal && (
        <div style={{ fontSize: '14px', color: '#F1F5F9', marginBottom: '12px', fontWeight: 600 }}>
          Goal: "{currentGoal}"
        </div>
      )}

      {/* Spoken Text / Voice Transcript */}
      {spokenText && (
        <div style={{ fontSize: '13px', color: '#38BDF8', fontStyle: 'italic', marginBottom: '12px', backgroundColor: '#1E293B', padding: '10px', borderRadius: '6px' }}>
          🗣️ "{spokenText}"
        </div>
      )}

      {/* Plan Timeline */}
      {planSteps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Execution Plan</div>
          {planSteps.map((step, idx) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '6px', backgroundColor: '#1E293B' }}>
              <span style={{ fontSize: '13px', color: '#E2E8F0' }}>
                {idx + 1}. {step.description}
              </span>
              {step.status === 'WAITING_APPROVAL' ? (
                <button
                  onClick={() => onApproveStep?.(step.id)}
                  style={{ background: '#10B981', border: 'none', color: '#FFF', fontWeight: 600, padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Approve Action
                </button>
              ) : (
                <span style={{ fontSize: '11px', fontWeight: 600, color: step.status === 'SUCCESS' ? '#4ADE80' : step.status === 'RUNNING' ? '#A855F7' : '#94A3B8' }}>
                  {step.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
