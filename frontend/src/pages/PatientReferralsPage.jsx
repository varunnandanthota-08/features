import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';

export default function PatientReferralsPage() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/api/referrals/patient')
      .then(res => setReferrals(res.data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="referrals-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>My Referrals</h1>
          <p className="intro">View your health centre referrals and their status.</p>
        </div>
      </header>

      <div className="cc-section">
        {loading ? (
          <p className="data-state">Loading your referrals...</p>
        ) : error ? (
          <p className="data-state data-state-error">{error}</p>
        ) : referrals.length === 0 ? (
          <div style={{ padding: '3rem', background: '#fff', borderRadius: '12px', border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>→</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--ink)' }}>No referrals to display</h3>
            <p style={{ margin: 0, color: 'var(--muted)' }}>You do not have any active or past referrals.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {referrals.map(r => (
              <div key={r.referralId} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.2rem', fontSize: '1.2rem', color: 'var(--ink)' }}>Referral {r.referralId}</h3>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                      Linked to Case: {r.caseId}
                    </p>
                  </div>
                  <span style={{ 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '8px', 
                    fontSize: '0.75rem', 
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    background: r.status === 'PENDING' ? 'var(--blue-soft)' : r.status === 'ACCEPTED' ? 'var(--teal-soft)' : 'var(--paper)',
                    color: r.status === 'PENDING' ? 'var(--blue)' : r.status === 'ACCEPTED' ? 'var(--teal-dark)' : 'var(--muted)'
                  }}>
                    {r.status}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', background: 'var(--paper)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>From</span>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{r.sourceCenterId}</strong>
                  </div>
                  <div style={{ color: 'var(--muted)' }}>→</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>To</span>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{r.destinationCenterId}</strong>
                  </div>
                </div>

                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.5rem' }}>Reason</span>
                  <p style={{ margin: 0, color: 'var(--ink)', fontSize: '0.95rem' }}>{r.reason || 'No specific reason provided.'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
