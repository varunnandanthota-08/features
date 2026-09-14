import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';

export default function PatientCaseDetailsPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [caseRecord, setCaseRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDetails() {
      try {
        setLoading(true);
        setError('');
        const res = await apiRequest(`/api/cases/${encodeURIComponent(caseId)}`);
        if (res?.data) {
          setCaseRecord(res.data);
        } else {
          setError('Case details not found.');
        }
      } catch (err) {
        setError(err.message || 'Unable to load case details.');
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [caseId]);

  if (loading) {
    return (
      <div className="details-page" style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '3rem' }}>
        <p className="data-state">Loading your case details...</p>
      </div>
    );
  }

  if (error || !caseRecord) {
    return (
      <div className="details-page" style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '3rem' }}>
        <header className="page-topline" style={{ marginBottom: '1.5rem' }}>
          <button 
            onClick={() => navigate('/patient/cases')}
            style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, cursor: 'pointer', padding: 0 }}
          >
            ← Back to My Cases
          </button>
        </header>
        <div style={{ padding: '2rem', background: '#fff', borderRadius: '12px', border: '1px solid var(--line)', textAlign: 'center' }}>
          <p className="data-state data-state-error" style={{ margin: 0 }}>
            {error || 'Case details are unavailable.'}
          </p>
        </div>
      </div>
    );
  }

  const patient = caseRecord.patient || {};
  const assignedHc = caseRecord.assignedHealthCenter || {};
  const referral = caseRecord.referral || null;
  const docs = Array.isArray(caseRecord.documents) ? caseRecord.documents : [];

  // Build authentic timeline events only from real recorded fields
  const timelineEvents = [];
  if (caseRecord.createdAt) {
    timelineEvents.push({
      title: 'Case Registered',
      desc: `Intake recorded via ${caseRecord.source || 'Dashboard'}.`,
      date: new Date(caseRecord.createdAt),
      status: 'DONE'
    });
  }
  if (caseRecord.assignedHealthCenterId && caseRecord.createdAt) {
    timelineEvents.push({
      title: 'Assigned to Health Centre',
      desc: `Assigned to ${assignedHc.name || assignedHc.healthCenterId || 'Designated Centre'}.`,
      date: new Date(caseRecord.createdAt),
      status: 'DONE'
    });
  }
  if (caseRecord.acknowledgedAt) {
    timelineEvents.push({
      title: 'Acknowledged by Care Team',
      desc: `Review initiated by health worker (${caseRecord.acknowledgedByWorkerId || 'Staff'}).`,
      date: new Date(caseRecord.acknowledgedAt),
      status: 'DONE'
    });
  }
  if (caseRecord.referredAt || referral?.createdAt) {
    timelineEvents.push({
      title: 'Medical Referral Initiated',
      desc: referral ? `Referral to ${referral.toHealthCenterId} (${referral.status}).` : 'Case referred for specialized care.',
      date: new Date(caseRecord.referredAt || referral?.createdAt),
      status: 'DONE'
    });
  }
  if (caseRecord.escalatedAt) {
    timelineEvents.push({
      title: 'Case Escalated',
      desc: caseRecord.escalationReason || 'Escalated within health network.',
      date: new Date(caseRecord.escalatedAt),
      status: 'ALERT'
    });
  }
  if (caseRecord.resolvedAt) {
    timelineEvents.push({
      title: 'Case Resolved',
      desc: 'Care pathway completed.',
      date: new Date(caseRecord.resolvedAt),
      status: 'DONE'
    });
  }

  timelineEvents.sort((a, b) => a.date - b.date);

  const statusColor = caseRecord.status === 'RESOLVED' 
    ? 'var(--teal-soft)' 
    : caseRecord.status === 'REFERRED'
    ? 'var(--amber-soft)'
    : 'var(--blue-soft)';
  const statusTextColor = caseRecord.status === 'RESOLVED'
    ? 'var(--teal-dark)'
    : caseRecord.status === 'REFERRED'
    ? 'var(--amber-dark)'
    : 'var(--blue)';

  return (
    <div className="details-page" style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '4rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <button 
          onClick={() => navigate('/patient/cases')}
          style={{ background: 'none', border: 'none', color: 'var(--teal)', fontWeight: 800, cursor: 'pointer', padding: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          ← Back to My Cases
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--teal)', fontWeight: 800, textTransform: 'uppercase' }}>
              Case Details
            </span>
            <h1 style={{ fontSize: '2.2rem', margin: '0.2rem 0', color: 'var(--ink)' }}>{caseRecord.caseId}</h1>
            <p className="intro" style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
              Registered on {new Date(caseRecord.createdAt).toLocaleString()} via {caseRecord.source || 'Dashboard'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <span style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', background: statusColor, color: statusTextColor, fontWeight: 800, fontSize: '0.85rem' }}>
              {caseRecord.status}
            </span>
            <span style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', background: caseRecord.escalationStatus === 'ESCALATED' ? 'var(--red-soft)' : 'var(--paper)', color: caseRecord.escalationStatus === 'ESCALATED' ? 'var(--red)' : 'var(--ink)', fontWeight: 700, fontSize: '0.85rem' }}>
              {caseRecord.escalationStatus === 'ESCALATED' ? 'Critical Escalation' : 'Standard Priority'}
            </span>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Case Information Card */}
        <section className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
          <h2 style={{ fontSize: '1.25rem', margin: '0 0 1.25rem', color: 'var(--ink)' }}>Health Complaint & Details</h2>
          
          <div style={{ padding: '1.25rem', background: 'var(--paper)', borderRadius: '10px', marginBottom: '1.5rem', border: '1px solid var(--line)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>
              Primary Complaint
            </span>
            <p style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink)', fontWeight: 600 }}>
              {caseRecord.complaint}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.2rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Symptoms</span>
              <p style={{ margin: '0.3rem 0 0', color: 'var(--ink)', fontSize: '0.95rem' }}>
                {caseRecord.symptoms || caseRecord.symptomsDescription || patient.symptomsDescription || 'As stated in complaint'}
              </p>
            </div>
            {caseRecord.duration && (
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Duration</span>
                <p style={{ margin: '0.3rem 0 0', color: 'var(--ink)', fontSize: '0.95rem' }}>{caseRecord.duration}</p>
              </div>
            )}
            {caseRecord.severity && (
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Severity</span>
                <p style={{ margin: '0.3rem 0 0', color: 'var(--ink)', fontSize: '0.95rem' }}>{caseRecord.severity}</p>
              </div>
            )}
            {caseRecord.clinicalContext && (
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Clinical Context</span>
                <p style={{ margin: '0.3rem 0 0', color: 'var(--ink)', fontSize: '0.95rem' }}>{caseRecord.clinicalContext}</p>
              </div>
            )}
          </div>
        </section>

        {/* Patient & Assigned Facility Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          
          {/* Patient Profile Snapshot */}
          <section className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
            <h2 style={{ fontSize: '1.2rem', margin: '0 0 1.25rem', color: 'var(--ink)' }}>Patient Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Name</span>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--ink)', fontWeight: 600 }}>{patient.name || 'Not provided'}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Age & Gender</span>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--ink)' }}>
                  {patient.age ? `${patient.age} yrs` : 'Age N/A'} · {patient.gender || 'N/A'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Phone</span>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--ink)' }}>{patient.phone || 'N/A'}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Village / Location</span>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--ink)' }}>{patient.location?.village || 'Community'}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Language</span>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--ink)' }}>{patient.language ? patient.language.toUpperCase() : 'EN'}</p>
              </div>
            </div>
          </section>

          {/* Health Centre Information */}
          <section className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
            <h2 style={{ fontSize: '1.2rem', margin: '0 0 1.25rem', color: 'var(--ink)' }}>Assigned Health Centre</h2>
            {assignedHc.name ? (
              <div>
                <strong style={{ fontSize: '1.05rem', color: 'var(--ink)', display: 'block' }}>{assignedHc.name}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Facility ID: {assignedHc.healthCenterId}</span>
                <p style={{ margin: '0.8rem 0', color: 'var(--ink)', fontSize: '0.9rem' }}>
                  {assignedHc.address || assignedHc.village || 'Regional Healthcare Centre'}
                </p>
                {Array.isArray(assignedHc.services) && assignedHc.services.length > 0 && (
                  <div style={{ marginTop: '0.8rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                      Available Services
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {assignedHc.services.map(svc => (
                        <span key={svc} style={{ padding: '0.2rem 0.6rem', background: 'var(--teal-soft)', color: 'var(--teal-dark)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                          {svc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>
                Centre assignment is currently pending triage by the coordination network.
              </p>
            )}
          </section>

        </div>

        {/* Care Timeline */}
        <section className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
          <h2 style={{ fontSize: '1.2rem', margin: '0 0 1.5rem', color: 'var(--ink)' }}>Care Timeline</h2>
          {timelineEvents.length === 0 ? (
            <p style={{ color: 'var(--muted)', margin: 0 }}>No timeline events recorded.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', borderLeft: '2px solid var(--line)', paddingLeft: '1.5rem', marginLeft: '0.5rem' }}>
              {timelineEvents.map((evt, idx) => (
                <div key={idx} style={{ position: 'relative' }}>
                  <div style={{ 
                    position: 'absolute', 
                    left: '-1.95rem', 
                    top: '0.15rem', 
                    width: '12px', 
                    height: '12px', 
                    borderRadius: '50%', 
                    background: evt.status === 'ALERT' ? 'var(--red)' : 'var(--teal)',
                    border: '2px solid #fff'
                  }} />
                  <strong style={{ fontSize: '0.95rem', color: 'var(--ink)', display: 'block' }}>{evt.title}</strong>
                  <p style={{ margin: '0.15rem 0', fontSize: '0.85rem', color: 'var(--muted)' }}>{evt.desc}</p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>{evt.date.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Referral Information (if referred) */}
        {referral && (
          <section className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
            <h2 style={{ fontSize: '1.2rem', margin: '0 0 1.25rem', color: 'var(--ink)' }}>Referral Details</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.2rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Referral ID</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, color: 'var(--ink)' }}>{referral.referralId}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Destination Facility</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, color: 'var(--teal-dark)' }}>{referral.toHealthCenterId}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Referral Status</span>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--ink)' }}>{referral.status}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Initiated On</span>
                <p style={{ margin: '0.2rem 0 0', color: 'var(--muted)' }}>{new Date(referral.createdAt).toLocaleString()}</p>
              </div>
            </div>
          </section>
        )}

        {/* Medical Documents Section */}
        <section className="cc-section" style={{ background: '#fff', padding: '2rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
          <h2 style={{ fontSize: '1.2rem', margin: '0 0 1.25rem', color: 'var(--ink)' }}>My Health Documents</h2>
          {docs.length === 0 ? (
            <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.9rem' }}>
              No documents (reports, prescriptions, or labs) currently associated with your care file.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {docs.map(doc => (
                <div key={doc._id} style={{ padding: '1rem', background: 'var(--paper)', borderRadius: '10px', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--teal-dark)', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                    {doc.documentType ? doc.documentType.replace('_', ' ') : 'Medical Document'}
                  </span>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--ink)', display: 'block' }}>
                    {doc.originalFileName || 'Patient Record'}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
                    Status: {doc.extractionStatus} · {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
