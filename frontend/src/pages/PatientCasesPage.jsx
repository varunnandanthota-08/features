import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';

export default function PatientCasesPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/api/cases/patient')
      .then(res => setCases(res.data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="cases-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>My Cases</h1>
          <p className="intro">View your past and active health cases.</p>
        </div>
      </header>

      <div className="cc-section">
        {loading ? (
          <p className="data-state">Loading your cases...</p>
        ) : error ? (
          <p className="data-state data-state-error">{error}</p>
        ) : cases.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', background: '#fff', borderRadius: '16px', border: '1px solid var(--line)', textAlign: 'center', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--teal-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem' }}>
              🩺
            </div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--ink)', fontSize: '1.4rem' }}>No cases to display</h3>
            <p style={{ margin: '0 0 1.5rem', color: 'var(--muted)', fontSize: '0.95rem', maxWidth: '420px', marginInline: 'auto', lineHeight: 1.5 }}>
              Your health cases will appear here once you register a health complaint.
            </p>
            <Link 
              to="/patient/register-complaint"
              style={{ display: 'inline-block', padding: '0.8rem 1.6rem', background: 'var(--teal)', color: '#fff', borderRadius: '8px', fontWeight: 800, textDecoration: 'none', boxShadow: 'var(--shadow-soft)', transition: 'background 0.2s' }}
            >
              Register Health Complaint
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {cases.map(c => (
              <div key={c.caseId} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.2rem', fontSize: '1.2rem', color: 'var(--ink)' }}>Case {c.caseId}</h3>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                      {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span style={{ 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '8px', 
                    fontSize: '0.75rem', 
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    background: c.status === 'NEW' ? 'var(--blue-soft)' : c.status === 'IN_PROGRESS' ? 'var(--teal-soft)' : 'var(--paper)',
                    color: c.status === 'NEW' ? 'var(--blue)' : c.status === 'IN_PROGRESS' ? 'var(--teal-dark)' : 'var(--muted)'
                  }}>
                    {c.status.replace('_', ' ')}
                  </span>
                </div>

                <div style={{ marginBottom: '1.5rem', background: 'var(--paper)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Complaint</h4>
                  <p style={{ margin: 0, color: 'var(--ink)' }}>{c.complaint || 'No complaint details available.'}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Assigned Centre</span>
                    <span style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{c.assignedTo?.healthCenterId || 'Pending'}</span>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Priority</span>
                    <span style={{ fontSize: '0.95rem', color: c.isEmergency ? 'var(--red)' : 'var(--ink)', fontWeight: c.isEmergency ? 700 : 400 }}>
                      {c.isEmergency ? 'Emergency' : 'Standard'}
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <Link 
                    to={`/patient/cases/${encodeURIComponent(c.caseId)}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.2rem', background: 'var(--teal)', color: '#fff', borderRadius: '8px', fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem', boxShadow: 'var(--shadow-soft)' }}
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
