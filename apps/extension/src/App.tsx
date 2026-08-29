import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { CommandBar } from './components/CommandBar.js';
import { AssistantOverlay } from './components/AssistantOverlay.js';
import { WidgetsGrid } from './components/Widgets.js';
import { useAssistantStore } from './stores/useAssistantStore.js';

export const App: React.FC = () => {
  const [activeNav, setActiveNav] = useState('Home');
  const [activeGoal, setActiveGoal] = useState<string | undefined>();
  const [steps, setSteps] = useState<Array<{ id: string; description: string; status: string }>>([]);

  const { setState } = useAssistantStore();

  const handleGoalSubmit = (goal: string) => {
    setActiveGoal(goal);
    setState('THINKING');

    // Simulate task breakdown & planning
    setTimeout(() => {
      setSteps([
        { id: 's1', description: 'Analyze active web page context & metadata', status: 'SUCCESS' },
        { id: 's2', description: 'Search trusted domain sources for structured info', status: 'WAITING_APPROVAL' },
        { id: 's3', description: 'Deduplicate facts and generate cited comparison report', status: 'PENDING' },
      ]);
      setState('WAITING_APPROVAL');
    }, 1200);
  };

  const handleApproveStep = (stepId: string) => {
    setState('ACTING');
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status: 'RUNNING' } : s))
    );

    setTimeout(() => {
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, status: 'SUCCESS' } : s))
      );
      setState('SPEAKING');
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#0A0D14', color: '#F1F5F9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Sidebar activeNavItem={activeNav} onSelectNavItem={setActiveNav} />

      <main style={{ flex: 1, padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <CommandBar onSubmitGoal={handleGoalSubmit} />

        <AssistantOverlay
          currentGoal={activeGoal}
          planSteps={steps}
          onApproveStep={handleApproveStep}
        />

        {activeNav === 'Home' && <WidgetsGrid />}

        {activeNav !== 'Home' && (
          <div style={{ backgroundColor: '#1E293B', borderRadius: '12px', padding: '24px', border: '1px solid #334155' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#38BDF8' }}>{activeNav} Module</h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>Active profile: <strong>Personal</strong>. Managed view for {activeNav}.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
