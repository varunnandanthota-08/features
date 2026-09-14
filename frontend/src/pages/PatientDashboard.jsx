import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { apiRequest } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [casesRes, refRes] = await Promise.all([
          apiRequest('/api/cases/patient').catch(() => ({ data: [] })),
          apiRequest('/api/referrals/patient').catch(() => ({ data: [] }))
        ]);
        setCases(casesRes.data || []);
        setReferrals(refRes.data || []);
      } catch (err) {
        console.error('Failed to load patient data:', err);
        setError('Unable to load your health portal data right now.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  const activeCase = cases.find(c => c.status !== 'RESOLVED') || cases[0];
  const activeReferral = referrals.find(r => r.status !== 'COMPLETED' && r.status !== 'CANCELLED') || referrals[0];
  const isVerified = Boolean(user?.phone && user?.name);

  if (loading) {
    return <div className="details-page"><p className="data-state">Loading your patient health portal...</p></div>;
  }

  return (
    <div className="patient-dashboard" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem' }}>
      
      {/* Top Header */}
      <header className="page-topline" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--teal)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Patient Care Portal
          </span>
          <h1 style={{ fontSize: '2.4rem', margin: '0.2rem 0 0.2rem', color: 'var(--ink)' }}>
            Welcome, {user?.name || user?.username || 'Patient'}
          </h1>
          <p className="intro" style={{ margin: 0, color: 'var(--muted)', fontSize: '0.95rem' }}>
            Monitor your healthcare journey, cases, and referrals across the CareOS network.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link 
            to="/patient/register-complaint" 
            style={{ padding: '0.85rem 1.6rem', background: 'var(--teal)', color: '#fff', borderRadius: '8px', fontWeight: 800, textDecoration: 'none', boxShadow: 'var(--shadow-soft)' }}
          >
            + Register Health Complaint
          </Link>

          {/* Dummy Patient Visual / Avatar */}
          <Link to="/patient/profile" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.5rem 0.9rem', background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', boxShadow: 'var(--shadow-soft)' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', overflow: 'hidden', background: 'var(--teal-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img 
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200" 
                  alt="Demo Patient Portrait" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>{user?.name || user?.username || 'Patient'}</strong>
                  <span style={{ fontSize: '0.75rem', color: isVerified ? 'var(--teal)' : 'var(--muted)', fontWeight: 800 }}>
                    {isVerified ? '✓' : ''}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  {isVerified ? 'Profile Verified' : 'Standard Account'}
                </span>
              </div>
            </div>
          </Link>
        </div>
      </header>

      {error && <p className="data-state data-state-error">{error}</p>}

      {/* Verification & Profile Prompt */}
      {!isVerified && (
        <div style={{ padding: '1.25rem', background: 'var(--amber-soft)', color: 'var(--amber-dark)', borderRadius: '12px', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', border: '1px solid rgba(244, 162, 97, 0.3)' }}>
          <div>
            <strong>Complete Your Health Profile</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
              Add your phone number and village to enable clinic verification and coordinated care updates.
            </p>
          </div>
          <Link to="/patient/profile" style={{ background: '#fff', color: 'var(--amber-dark)', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: 800, textDecoration: 'none', border: '1px solid var(--line)' }}>
            Complete Profile →
          </Link>
        </div>
      )}

      {/* Hero: Calm Health Status */}
      <div style={{ background: 'linear-gradient(135deg, #07161b 0%, #173642 100%)', borderRadius: '16px', padding: '2.5rem', color: '#fff', marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
        <div>
          <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--teal-soft)', fontWeight: 800 }}>
            Current Care Status
          </span>
          <h2 style={{ fontSize: '1.8rem', margin: '0.5rem 0 0.5rem', color: '#fff' }}>
            {activeCase ? `Care Request In Progress: ${activeCase.caseId}` : 'No active health cases reported'}
          </h2>
          <p style={{ margin: 0, color: '#aab7be', fontSize: '1rem', maxWidth: '500px', lineHeight: 1.5 }}>
            {activeCase 
              ? `Your complaint "${activeCase.complaint}" is being processed by the regional medical network.`
              : 'You have no unresolved complaints. If you need medical assistance, register a complaint anytime.'}
          </p>
        </div>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>
          🩺
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '2rem' }}>
        
        {/* SECTION 19: My Cases (Read-Only) */}
        <section className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.3rem', margin: 0, color: 'var(--ink)' }}>My Cases ({cases.length})</h2>
            <Link to="/patient/cases" style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem' }}>View History →</Link>
          </div>

          {cases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--paper)', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--ink)' }}>No cases to display</h3>
              <p style={{ margin: '0 0 1.25rem', color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Your health cases will appear here once you register a health complaint.
              </p>
              <Link to="/patient/register-complaint" style={{ display: 'inline-block', padding: '0.6rem 1.2rem', background: 'var(--teal)', color: '#fff', borderRadius: '8px', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none', boxShadow: 'var(--shadow-soft)' }}>
                Register Health Complaint
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {cases.slice(0, 4).map(c => (
                <div key={c.caseId} style={{ padding: '1.25rem', background: 'var(--paper)', borderRadius: '12px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{c.caseId}</strong>
                    <span style={{ 
                      background: c.status === 'RESOLVED' ? 'var(--teal-soft)' : 'var(--blue-soft)', 
                      color: c.status === 'RESOLVED' ? 'var(--teal-dark)' : 'var(--blue)', 
                      padding: '0.2rem 0.6rem', 
                      borderRadius: '6px', 
                      fontSize: '0.75rem', 
                      fontWeight: 800 
                    }}>
                      {c.status}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.5rem', color: 'var(--ink)', fontSize: '0.9rem', fontWeight: 600 }}>{c.complaint}</p>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--muted)', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <span>Assigned: {c.assignedHealthCenter?.name || 'Local Health Centre'}</span>
                    <Link 
                      to={`/patient/cases/${encodeURIComponent(c.caseId)}`}
                      style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none' }}
                    >
                      View Details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 20: My Referrals (Read-Only Care Journey) */}
        <section className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.3rem', margin: 0, color: 'var(--ink)' }}>My Referrals ({referrals.length})</h2>
            <Link to="/patient/referrals" style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem' }}>View Details →</Link>
          </div>

          {referrals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'var(--paper)', borderRadius: '12px' }}>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>No medical facility transfers or referrals required.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {referrals.map(r => (
                <div key={r.referralId} style={{ padding: '1.25rem', background: 'var(--paper)', borderRadius: '12px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>{r.referralId}</strong>
                    <span style={{ 
                      background: r.status === 'ACCEPTED' ? 'var(--teal-soft)' : 'var(--blue-soft)', 
                      color: r.status === 'ACCEPTED' ? 'var(--teal-dark)' : 'var(--blue)', 
                      padding: '0.2rem 0.6rem', 
                      borderRadius: '6px', 
                      fontSize: '0.75rem', 
                      fontWeight: 800 
                    }}>
                      {r.status}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 0.5rem', color: 'var(--ink)', fontSize: '0.85rem' }}>{r.reason || 'Specialist care transfer'}</p>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Route: {r.sourceCenterId || 'Center'} → {r.destinationCenterId || 'Specialized Facility'}</span>
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
