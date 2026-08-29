import React from 'react';

export const WidgetsGrid: React.FC = () => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
      {/* Continue Missions Widget */}
      <div style={{ backgroundColor: '#1E293B', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#38BDF8' }}>🚀 Continue Missions</h3>
          <span style={{ fontSize: '11px', color: '#94A3B8', backgroundColor: '#0F172A', padding: '2px 8px', borderRadius: '4px' }}>0 Active</span>
        </div>
        <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No background missions currently active. Start an automated research task or daily briefing.</p>
      </div>

      {/* Needs Attention Widget */}
      <div style={{ backgroundColor: '#1E293B', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#F59E0B' }}>⚠️ Needs Your Attention</h3>
          <span style={{ fontSize: '11px', color: '#34D399', backgroundColor: '#0F172A', padding: '2px 8px', borderRadius: '4px' }}>All Clear</span>
        </div>
        <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No actions requiring manual takeover, CAPTCHA resolution, or payment authorization.</p>
      </div>

      {/* Media Center Widget (Blueprint Section 10) */}
      <div style={{ backgroundColor: '#1E293B', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#A855F7' }}>🎵 Media Center</h3>
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>Browser Session</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#0F172A', padding: '10px 14px', borderRadius: '8px' }}>
          <span style={{ fontSize: '20px' }}>🎧</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9' }}>No Media Playing</div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>Spotify / YouTube Music / Local</div>
          </div>
          <button style={{ background: '#334155', border: 'none', color: '#FFF', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>▶</button>
        </div>
      </div>
    </div>
  );
};
