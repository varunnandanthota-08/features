import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';

export default function PatientDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiRequest(`/api/patients/${encodeURIComponent(id)}`)
      .then(res => {
        if (!res.data) throw new Error('Patient record not found');
        setPatientData(res.data);
      })
      .catch(err => setError(err.message || 'Failed to load patient record'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="details-page"><p className="data-state">Loading patient clinical record...</p></div>;
  if (error) return <div className="details-page"><p className="data-state data-state-error">{error}</p></div>;
  if (!patientData || !patientData.patient) return <div className="details-page"><p className="data-state">Patient not found.</p></div>;

  const { patient, cases = [], referrals = [], documents = [] } = patientData;
  const patientCode = patient.patientId || `PT-${(patient._id || '').slice(-6).toUpperCase()}`;
  const isVerified = Boolean(patient.phone && patient.name);

  // Build a chronological care timeline from cases, referrals, and documents
  const timelineEvents = [
    ...cases.map(c => ({
      date: new Date(c.createdAt || Date.now()),
      title: `Case Registered (${c.caseId})`,
      desc: c.complaint,
      status: c.status,
      type: 'case'
    })),
    ...referrals.map(r => ({
      date: new Date(r.createdAt || Date.now()),
      title: `Referral Created (${r.referralId})`,
      desc: `Transfer initiated to ${r.destinationCenterId || 'Center'}`,
      status: r.status,
      type: 'referral'
    })),
    ...documents.map(d => ({
      date: new Date(d.createdAt || Date.now()),
      title: `Document: ${d.documentType?.replace(/_/g, ' ') || 'Record'}`,
      desc: d.originalFileName || 'Medical attachment',
      status: d.extractionStatus,
      type: 'document'
    }))
  ].sort((a, b) => b.date - a.date);

  return (
    <div className="patient-details-page" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem' }}>
      <button 
        onClick={() => navigate('/worker/patients')} 
        style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0 }}
      >
        ← Back to Patient Directory
      </button>

      {/* Patient Header Card */}
      <div className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', marginBottom: '2rem', boxShadow: 'var(--shadow-soft)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--teal-soft)', color: 'var(--teal-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 800 }}>
              {patient.name ? patient.name.charAt(0).toUpperCase() : 'P'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--ink)' }}>{patient.name || 'Unnamed Patient'}</h1>
                <span style={{ 
                  background: isVerified ? 'var(--teal-soft)' : 'var(--paper)', 
                  color: isVerified ? 'var(--teal-dark)' : 'var(--muted)', 
                  padding: '0.2rem 0.6rem', 
                  borderRadius: '12px', 
                  fontSize: '0.75rem', 
                  fontWeight: 800,
                  border: '1px solid var(--line)'
                }}>
                  {isVerified ? 'Verified ✓' : 'Not Verified'}
                </span>
              </div>
              <p style={{ margin: '0.3rem 0 0', color: 'var(--muted)', fontSize: '0.95rem', fontWeight: 700 }}>
                Patient ID: <span style={{ color: 'var(--ink)' }}>{patientCode}</span> • Source: {patient.source || 'Dashboard'}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--line)' }}>
          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Phone Number</span>
            <strong style={{ fontSize: '1rem', color: 'var(--ink)' }}>{patient.phone}</strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Location</span>
            <strong style={{ fontSize: '1rem', color: 'var(--ink)' }}>{patient.location?.village || 'Not specified'}</strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Age / Gender</span>
            <strong style={{ fontSize: '1rem', color: 'var(--ink)', textTransform: 'capitalize' }}>
              {patient.age ? `${patient.age} yrs` : 'N/A'} • {patient.gender === 'prefer_not_to_say' ? 'Unspecified' : patient.gender || 'Unspecified'}
            </strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 800 }}>Preferred Language</span>
            <strong style={{ fontSize: '1rem', color: 'var(--ink)', textTransform: 'uppercase' }}>{patient.language || 'EN'}</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '2rem' }}>
        
        {/* Left Column: Cases & Referrals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Active / Previous Cases */}
          <section className="cc-section" style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid var(--line)' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--ink)' }}>Clinical Cases ({cases.length})</h2>
            {cases.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No clinical cases recorded for this patient.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {cases.map(c => (
                  <Link 
                    key={c.caseId} 
                    to={`/worker/case-details/case/${encodeURIComponent(c.caseId)}`} 
                    state={{ record: { ...c, patient } }}
                    style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: '1rem', background: 'var(--paper)', borderRadius: '10px', border: '1px solid var(--line)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <strong style={{ color: 'var(--ink)', fontSize: '0.95rem' }}>{c.caseId}</strong>
                      <span style={{ background: c.status === 'RESOLVED' ? 'var(--teal-soft)' : 'var(--amber-soft)', color: c.status === 'RESOLVED' ? 'var(--teal-dark)' : 'var(--amber-dark)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
                        {c.status}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>{c.complaint}</p>
                    <span style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--teal)', fontWeight: 700 }}>View Case Details →</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Referrals */}
          <section className="cc-section" style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid var(--line)' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--ink)' }}>Referrals ({referrals.length})</h2>
            {referrals.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No referrals active or historical for this patient.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {referrals.map(r => (
                  <div key={r.referralId} style={{ padding: '1rem', background: 'var(--paper)', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <strong style={{ color: 'var(--ink)', fontSize: '0.95rem' }}>{r.referralId}</strong>
                      <span style={{ background: 'var(--blue-soft)', color: 'var(--blue)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800 }}>
                        {r.status}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>{r.reason || 'Medical referral'}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Medical Documents */}
          <section className="cc-section" style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid var(--line)' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.2rem', color: 'var(--ink)' }}>Medical Documents & Reports ({documents.length})</h2>
            {documents.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No documents or prescriptions attached to this profile.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {documents.map(d => (
                  <div key={d._id} style={{ padding: '1rem', background: 'var(--paper)', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: 'var(--ink)', fontSize: '0.9rem' }}>{d.documentType?.replace(/_/g, ' ')}</strong>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>{d.originalFileName || 'File scan'}</p>
                      </div>
                      <span style={{ background: d.extractionStatus === 'VERIFIED' ? 'var(--teal-soft)' : 'var(--paper)', color: d.extractionStatus === 'VERIFIED' ? 'var(--teal-dark)' : 'var(--muted)', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, border: '1px solid var(--line)' }}>
                        {d.extractionStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* Right Column: Care Timeline */}
        <div>
          <section className="cc-section" style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid var(--line)' }}>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.2rem', color: 'var(--ink)' }}>Care Timeline</h2>
            {timelineEvents.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>Timeline will populate as healthcare interactions take place.</p>
            ) : (
              <div style={{ position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid var(--line)' }}>
                {timelineEvents.map((evt, idx) => (
                  <div key={idx} style={{ marginBottom: '1.5rem', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '-1.95rem', top: '0.2rem', width: '12px', height: '12px', borderRadius: '50%', background: evt.type === 'case' ? 'var(--teal)' : evt.type === 'referral' ? 'var(--blue)' : 'var(--amber)', border: '2px solid #fff' }} />
                    <strong style={{ display: 'block', fontSize: '0.85rem', color: 'var(--ink)' }}>{evt.title}</strong>
                    <p style={{ margin: '0.2rem 0', fontSize: '0.8rem', color: 'var(--muted)' }}>{evt.desc}</p>
                    <span style={{ fontSize: '0.7rem', color: '#aab7be' }}>{evt.date.toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

      </div>
    </div>
  );
}
