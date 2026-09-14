import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { apiRequest } from '../services/api';

export default function NotificationsDropdown() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) return;

    if (user.role === 'HEALTH_WORKER') {
      // Real operational notifications derived from active emergencies and attention cases
      Promise.all([
        apiRequest('/api/emergencies').catch(() => ({ data: [] })),
        apiRequest('/api/cases').catch(() => ({ data: [] }))
      ]).then(([emgRes, casesRes]) => {
        const emergencies = emgRes.data || [];
        const cases = casesRes.data || [];
        const notifs = [];

        emergencies.slice(0, 5).forEach(emg => {
          notifs.push({
            id: `emg-${emg.emergencyId || emg._id}`,
            type: 'emergency',
            title: `Active Emergency: ${emg.severity || 'CRITICAL'}`,
            desc: emg.description || `Emergency dispatch reported in ${emg.village || 'area'}.`,
            time: emg.createdAt ? new Date(emg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'
          });
        });

        cases.filter(c => c.priority === 'CRITICAL' || c.priority === 'HIGH' || c.status === 'ESCALATED').slice(0, 5).forEach(c => {
          notifs.push({
            id: `case-${c.caseId || c._id}`,
            type: 'case',
            title: `Case Attention Required (${c.caseId})`,
            desc: `Status: ${c.status}. Symptoms: ${(c.symptoms || []).join(', ') || 'Under evaluation'}.`,
            time: c.createdAt ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'
          });
        });

        if (notifs.length === 0) {
          notifs.push({
            id: 'idle',
            type: 'document',
            title: 'No Pending Alerts',
            desc: 'All emergencies and attention cases have been triaged.',
            time: 'Just now'
          });
        }

        setNotifications(notifs);
      }).catch(err => console.error('Failed to load worker notifications:', err));
    } else if (user.role === 'PATIENT') {
      // Fetch cases and derive patient-specific notifications
      apiRequest('/api/cases/patient')
        .then(res => {
          const cases = res.data || [];
          const patientNotifs = [];
          
          cases.forEach((c) => {
            let statusText = 'Your case has been registered and queued for worker review.';
            if (c.status === 'IN_PROGRESS') statusText = 'A health worker is actively reviewing your care request.';
            if (c.status === 'RESOLVED') statusText = 'Your care request has been marked resolved.';
            if (c.status === 'ESCALATED') statusText = 'Your case has been escalated for senior doctor review.';

            patientNotifs.push({
              id: `case-${c.caseId || c._id}`,
              type: c.status === 'ESCALATED' ? 'emergency' : 'case',
              title: `Case #${c.caseId || ''} (${c.status})`,
              desc: statusText,
              time: c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'
            });

            if (c.referral) {
              patientNotifs.push({
                id: `ref-${c.caseId}`,
                type: 'referral',
                title: 'Referral Update',
                desc: `Referral created to ${c.referral.targetFacility || 'specialized facility'}.`,
                time: 'Recent'
              });
            }
          });

          if (patientNotifs.length === 0) {
            patientNotifs.push({
              id: 'welcome',
              type: 'document',
              title: 'Welcome to CareOS',
              desc: 'Your health profile is ready. No new updates.',
              time: 'Just now'
            });
          }

          setNotifications(patientNotifs);
        })
        .catch(err => console.error('Failed to load notifications:', err));
    }
  }, [user]);

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: '10px', width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        {notifications.length > 0 && (
          <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--red)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, minWidth: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setIsOpen(false)}></div>
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 0.5rem)', width: '320px', background: '#fff', border: '1px solid var(--line)', borderRadius: '14px', boxShadow: 'var(--shadow)', zIndex: 999, overflow: 'hidden' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Notifications</h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Mark all read</button>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {notifications.map(n => (
                <div key={n.id} style={{ padding: '1rem', borderBottom: '1px solid var(--line)', display: 'flex', gap: '0.8rem', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'var(--paper)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ 
                    width: '2rem', height: '2rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: (n.type === 'emergency' || n.type === 'case') ? 'var(--red-soft)' : n.type === 'referral' ? 'var(--blue-soft)' : 'var(--teal-soft)',
                    color: (n.type === 'emergency' || n.type === 'case') ? 'var(--red)' : n.type === 'referral' ? 'var(--blue)' : 'var(--teal-dark)'
                  }}>
                    {n.type === 'emergency' ? '🚨' : n.type === 'case' ? '🩺' : n.type === 'referral' ? '→' : '📄'}
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--ink)' }}>{n.title}</h4>
                    <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.4 }}>{n.desc}</p>
                    <span style={{ fontSize: '0.65rem', color: '#aab7be', fontWeight: 700 }}>{n.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
