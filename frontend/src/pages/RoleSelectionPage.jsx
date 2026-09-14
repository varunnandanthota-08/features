import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function RoleSelectionPage() {
  const navigate = useNavigate();

  return (
    <div className="auth-layout" style={{ gridTemplateColumns: '1fr', background: 'var(--paper)' }}>
      <div style={{ padding: '3rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        <div className="brand-lockup" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div className="brand-mark">C</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="brand-kicker">CareOS</span>
            <h1 className="brand-name">Platform</h1>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 2rem 6rem' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '3rem', color: 'var(--ink)' }}>How are you using CareOS?</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', width: '100%', maxWidth: '800px' }}>
          
          <button onClick={() => navigate('/login?role=worker')} style={{ background: '#fff', border: '1px solid var(--teal)', padding: '3rem 2rem', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'var(--shadow)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1rem' }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-4px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ width: '4rem', height: '4rem', background: 'var(--teal-soft)', color: 'var(--teal)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
            </div>
            <div>
              <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem', color: 'var(--ink)' }}>Health Worker</h3>
              <p style={{ fontSize: '1rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>Manage patients, cases, emergencies and referrals across your connected health centres.</p>
            </div>
          </button>
          
          <button onClick={() => navigate('/login?role=patient')} style={{ background: '#fff', border: '1px solid var(--line)', padding: '3rem 2rem', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'var(--shadow-soft)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1rem' }} onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = 'var(--blue)'; }} onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--line)'; }}>
            <div style={{ width: '4rem', height: '4rem', background: 'var(--blue-soft)', color: 'var(--blue)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <div>
              <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem', color: 'var(--ink)' }}>Patient</h3>
              <p style={{ fontSize: '1rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>Follow your care journey, view your medical records, and track active referrals.</p>
            </div>
          </button>
          
        </div>
      </div>
    </div>
  );
}
