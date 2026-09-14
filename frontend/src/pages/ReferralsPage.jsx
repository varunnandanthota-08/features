import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import ReferralSlaDisplay from '../components/ReferralSlaDisplay';

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  useEffect(() => {
    apiRequest('/api/referrals')
      .then(res => setReferrals(res.data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredReferrals = referrals.filter(r => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="referrals-page" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '3rem' }}>
      <Link className="back-link" to="/worker" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--teal)', fontSize: '0.875rem', fontWeight: 700 }}>
        ← Back to Dashboard
      </Link>

      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>Referrals Directory</h1>
          <p className="intro">Manage incoming and outgoing referrals across the network.</p>
        </div>
      </header>

      <div className="cc-section">
        <div className="cc-filters" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <div className="cc-filter-pills">
            {['ALL', 'PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED'].map(status => (
              <button 
                key={status} 
                className={`cc-filter-pill ${filterStatus === status ? 'active' : ''}`}
                onClick={() => setFilterStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="data-state">Loading referrals...</p>
        ) : error ? (
          <p className="data-state data-state-error">{error}</p>
        ) : filteredReferrals.length === 0 ? (
          <p className="data-state">No referrals found matching your criteria.</p>
        ) : (
          <div className="referrals-list" style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
            {filteredReferrals.map(r => (
              <article key={r.referralId} className="referral-row">
                <div className="referral-row-top">
                  <div>
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{r.referralId}</h3>
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.3rem 0' }}>{r.reason}</p>
                  </div>
                  <span className={`status-${r.status?.toLowerCase()} referral-status`}>{r.status}</span>
                </div>
                <div className="referral-details" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', paddingBottom: '1rem' }}>
                  <dl style={{ margin: 0 }}>
                    <dt>From</dt>
                    <dd>{r.fromHealthCenterId}</dd>
                  </dl>
                  <dl style={{ margin: 0 }}>
                    <dt>To</dt>
                    <dd>{r.toHealthCenterId}</dd>
                  </dl>
                  <dl style={{ margin: 0 }}>
                    <dt>Patient</dt>
                    <dd>{r.patientId || 'Unknown'}</dd>
                  </dl>
                  <dl style={{ margin: 0 }}>
                    <dt>Case</dt>
                    <dd>
                      {r.caseId ? (
                        <Link to={`/worker/cases/${encodeURIComponent(r.caseId)}`} style={{ color: 'var(--teal)', fontWeight: 600 }}>{r.caseId}</Link>
                      ) : 'N/A'}
                    </dd>
                  </dl>
                </div>
                {r.status === 'PENDING' && <ReferralSlaDisplay referral={r} />}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
