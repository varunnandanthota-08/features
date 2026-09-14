import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuth } from '../components/AuthContext';

export default function EmergenciesPage() {
  const { user } = useAuth();
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  useEffect(() => {
    apiRequest('/api/emergency/active')
      .then(res => setEmergencies(res.data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredEmergencies = emergencies.filter(e => {
    if (filterSeverity === 'CRITICAL' && e.priority !== 'CRITICAL') return false;
    if (filterSeverity === 'HIGH' && e.priority !== 'HIGH') return false;
    if (filterSeverity === 'ALERTED' && e.status !== 'ALERTED') return false;
    if (filterSeverity === 'ACKNOWLEDGED' && e.status !== 'ACKNOWLEDGED') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const patientName = e.patient?.name?.toLowerCase() || '';
      const patientPhone = e.patient?.phone || '';
      const id = e.caseId?.toLowerCase() || '';
      const desc = (e.complaint || e.chiefComplaint || e.reason || '').toLowerCase();
      return patientName.includes(term) || patientPhone.includes(term) || id.includes(term) || desc.includes(term);
    }
    return true;
  });

  return (
    <div className="emergencies-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <Link className="back-link" to="/worker" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--teal)', fontSize: '0.875rem', fontWeight: 700 }}>
        ← Back to Dashboard
      </Link>

      <header className="page-topline" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ margin: 0 }}>Active Emergencies</h1>
            {emergencies.length > 0 && (
              <span style={{ background: 'var(--red)', color: '#fff', padding: '0.2rem 0.65rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 800 }}>
                {emergencies.length} ACTIVE
              </span>
            )}
          </div>
          <p className="intro" style={{ margin: 0, color: 'var(--muted)' }}>
            Real-time critical emergency dispatch cases requiring immediate medical response from {user?.healthCenterId || 'your centre'}.
          </p>
        </div>
      </header>

      <div className="cc-section">
        <div className="cc-filters" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <input
            type="text"
            className="cc-search-input"
            placeholder="Search emergencies by patient, phone, or case ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: '420px', flex: '1 1 300px' }}
          />
          <div className="cc-filter-pills" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['ALL', 'CRITICAL', 'HIGH', 'ALERTED', 'ACKNOWLEDGED'].map(sev => (
              <button
                key={sev}
                className={`cc-filter-pill ${filterSeverity === sev ? 'active' : ''}`}
                onClick={() => setFilterSeverity(sev)}
                type="button"
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="data-state">Loading emergency cases...</p>
        ) : error ? (
          <p className="data-state data-state-error">{error}</p>
        ) : filteredEmergencies.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>🛡️</span>
            <h3 style={{ margin: '0 0 0.5rem' }}>No Active Emergencies</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              All urgent triage and emergency dispatch requests for your facility are currently resolved.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Emergency ID</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Patient</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Chief Complaint</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Priority</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmergencies.map(e => {
                  const isCritical = e.priority === 'CRITICAL' || e.requiresImmediateAttention;
                  return (
                    <tr key={e.caseId} style={{ borderBottom: '1px solid var(--line)', background: isCritical ? 'rgba(230, 57, 70, 0.03)' : undefined }}>
                      <td style={{ padding: '1rem', fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {isCritical && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />}
                          <span>{e.caseId}</span>
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <strong style={{ display: 'block' }}>{e.patient?.name || 'Emergency Patient'}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          {e.patient?.phone || 'No phone'} {e.location?.village ? `• ${e.location.village}` : ''}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.complaint || e.chiefComplaint || e.reason || 'Emergency dispatch'}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span className={`compact-priority ${isCritical ? 'critical' : 'high'}`}>
                          {e.priority || 'CRITICAL'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span className="compact-status" style={{ fontWeight: 600 }}>
                          {e.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <Link
                          to={`/worker/emergencies/${encodeURIComponent(e.caseId)}`}
                          style={{ color: 'var(--red)', fontWeight: 700, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                          Respond →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
