import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuth } from '../components/AuthContext';

export default function CasesPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState('ALL');

  useEffect(() => {
    apiRequest('/api/cases/active')
      .then(res => setCases(res.data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredCases = cases.filter(c => {
    if (filterPriority !== 'ALL' && c.priority !== filterPriority) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        c.patient?.name?.toLowerCase().includes(term) ||
        c.patient?.phone?.includes(term) ||
        c.caseId.toLowerCase().includes(term) ||
        c.complaint?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="cases-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <Link className="back-link" to="/worker" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--teal)', fontSize: '0.875rem', fontWeight: 700 }}>
        ← Back to Dashboard
      </Link>

      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>All Cases</h1>
          <p className="intro">Manage and view active operational cases assigned to your centre.</p>
        </div>
      </header>

      <div className="cc-section">
        <div className="cc-filters" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <input 
            type="text" 
            className="cc-search-input" 
            placeholder="Search by patient, phone, or case ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: '400px' }}
          />
          <div className="cc-filter-pills">
            {['ALL', 'CRITICAL', 'HIGH', 'STANDARD'].map(prio => (
              <button 
                key={prio} 
                className={`cc-filter-pill ${filterPriority === prio ? 'active' : ''}`}
                onClick={() => setFilterPriority(prio)}
              >
                {prio}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="data-state">Loading cases...</p>
        ) : error ? (
          <p className="data-state data-state-error">{error}</p>
        ) : filteredCases.length === 0 ? (
          <p className="data-state">No cases found matching your criteria.</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Case ID</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Patient</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Complaint</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Priority</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map(c => (
                  <tr key={c.caseId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '1rem', fontWeight: 700 }}>{c.caseId}</td>
                    <td style={{ padding: '1rem' }}>
                      <strong style={{ display: 'block' }}>{c.patient?.name || 'Unknown'}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{c.patient?.phone}</span>
                    </td>
                    <td style={{ padding: '1rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.complaint}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span className={`compact-priority ${c.priority?.toLowerCase() || 'standard'}`}>
                        {c.priority || 'STANDARD'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span className="compact-status">{c.status?.replace('_', ' ')}</span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <Link 
                        to={`/worker/cases/${encodeURIComponent(c.caseId)}`}
                        style={{ color: 'var(--teal)', fontWeight: 700, fontSize: '0.85rem' }}
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
