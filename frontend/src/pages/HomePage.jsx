import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';

const HEALTH_CENTER_ID = import.meta.env.VITE_HEALTH_CENTER_ID || '';

function formatDate(value) {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function patientLabel(patient) {
  return patient?.name || patient?.phone || 'Patient details unavailable';
}

function centreLabel(centre) {
  return centre?.name || 'Health centre pending';
}

function statusLabel(value) {
  return value?.replaceAll('_', ' ') || 'STATUS UNAVAILABLE';
}

function DataState({ loading, error, emptyMessage, children }) {
  if (loading) return <p className="data-state">Loading operational data...</p>;
  if (error) return <p className="data-state data-state-error">{error}</p>;
  if (!children || (Array.isArray(children) && children.length === 0)) return <p className="data-state">{emptyMessage}</p>;
  return children;
}

function currentResponsibleCentre(item) {
  if (['ESCALATED', 'ACKNOWLEDGED_AFTER_ESCALATION'].includes(item.escalationStatus)) {
    return item.escalationTargetHealthCenter?.healthCenterId || item.assignedHealthCenter?.healthCenterId || null;
  }
  return item.assignedHealthCenter?.healthCenterId || item.selectedHealthCenter?.healthCenterId || null;
}

function CaseRow({ item, emergency = false }) {
  return (
    <Link
      className={`case-row-link${emergency ? ' emergency-row-link' : ''}`}
      state={{ record: item }}
      to={`/case-details/${emergency ? 'emergency' : 'case'}/${encodeURIComponent(item.caseId)}`}
    >
      <article className={`case-row${emergency ? ' emergency-row' : ''}`}>
        <div className="case-row-heading">
          <div>
            <span className="case-kind">{emergency ? 'Emergency queue' : 'Assigned case'}</span>
            <h3>{item.caseId || 'Case ID unavailable'}</h3>
          </div>
          <span className={`priority-badge${emergency ? ' critical' : ''}`}>{item.priority || 'Standard'}</span>
        </div>
        <p className="case-subject">{patientLabel(item.patient)}</p>
        <p className="case-description">{item.reason || item.complaint || 'No description provided'}</p>
        <dl className="case-details">
          <div><dt>Status</dt><dd>{statusLabel(item.status)}</dd></div>
          <div><dt>Health centre</dt><dd>{centreLabel(item.assignedHealthCenter || item.selectedHealthCenter)}</dd></div>
          <div><dt>Escalation</dt><dd>{statusLabel(item.escalationStatus)}</dd></div>
          <div><dt>Opened</dt><dd>{formatDate(item.createdAt)}</dd></div>
        </dl>
        <span className="open-case-label">Open case <b>→</b></span>
      </article>
    </Link>
  );
}

function ReferralRow({ referral, incoming, action, onUpdate }) {
  return (
    <article className="referral-row">
      <div className="referral-row-top">
        <div>
          <span className="case-kind">{incoming ? 'Incoming referral' : 'Outgoing referral'}</span>
          <h3>{referral.referralId}</h3>
        </div>
        <span className={`referral-status status-${referral.status?.toLowerCase()}`}>{statusLabel(referral.status)}</span>
      </div>
      <p className="case-description">{referral.reason || 'No reason provided'}</p>
      <dl className="referral-details">
        <div><dt>{incoming ? 'Source HC' : 'Destination HC'}</dt><dd>{incoming ? referral.fromHealthCenterId : referral.toHealthCenterId}</dd></div>
        <div><dt>Patient</dt><dd>{referral.patientId || 'Not available'}</dd></div>
        <div><dt>Case</dt><dd>{referral.caseId || 'Not available'}</dd></div>
        <div><dt>Destination</dt><dd>{referral.toHealthCenterId || 'Not available'}</dd></div>
        <div><dt>Created</dt><dd>{formatDate(referral.createdAt)}</dd></div>
      </dl>
      {action?.error && <p className="action-message action-message-error" role="alert">{action.error}</p>}
      {action?.success && <p className="action-message action-message-success" role="status">{action.success}</p>}
      <div className="referral-row-actions">
        {referral.caseId && <Link className="open-case-label" to={`/case-details/case/${encodeURIComponent(referral.caseId)}`}>Review referral <b>→</b></Link>}
        {incoming && referral.status === 'PENDING' && <div className="referral-action-buttons">
          <button className="action-button" disabled={action?.loading} onClick={() => onUpdate(referral, 'ACCEPTED')} type="button">{action?.loading && action?.status === 'ACCEPTED' ? 'Accepting...' : 'Accept referral'}</button>
          <button className="decision-button" disabled={action?.loading} onClick={() => onUpdate(referral, 'CANCELLED')} type="button">{action?.loading && action?.status === 'CANCELLED' ? 'Cancelling...' : 'Cancel'}</button>
        </div>}
      </div>
    </article>
  );
}

function SectionHeader({ eyebrow, title, count }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><span className="section-count">{count}</span></div>;
}

export default function HomePage() {
  const [records, setRecords] = useState({ cases: [], emergencies: [], referrals: [], centre: null });
  const [referralActions, setReferralActions] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [states, setStates] = useState({ cases: { loading: true, error: '' }, emergencies: { loading: true, error: '' }, referrals: { loading: true, error: '' }, centre: { loading: true, error: '' } });

  useEffect(() => {
    let active = true;
    const requests = [
      ['cases', apiRequest('/api/cases/active')],
      ['emergencies', apiRequest('/api/emergency/active')],
      ['referrals', apiRequest('/api/referrals')],
      ['centre', HEALTH_CENTER_ID ? apiRequest(`/api/health-centers/${encodeURIComponent(HEALTH_CENTER_ID)}`) : Promise.reject(new Error('VITE_HEALTH_CENTER_ID is not configured.'))]
    ];

    Promise.allSettled(requests.map(([, request]) => request)).then(results => {
      if (!active) return;
      const nextStates = {};
      const nextRecords = { cases: [], emergencies: [], referrals: [], centre: null };
      results.forEach((result, index) => {
        const key = requests[index][0];
        if (result.status === 'fulfilled') {
          const data = result.value?.data;
          nextRecords[key] = key === 'centre' ? data || null : Array.isArray(data) ? data : [];
          nextStates[key] = { loading: false, error: '' };
        } else {
          nextStates[key] = { loading: false, error: result.reason?.message || `Unable to load ${key}.` };
        }
      });
      setRecords(nextRecords);
      setStates(nextStates);
    });

    return () => { active = false; };
  }, [refreshKey]);

  async function updateIncomingReferral(referral, status) {
    const currentAction = referralActions[referral.referralId];
    if (currentAction?.loading) return;
    setReferralActions(current => ({ ...current, [referral.referralId]: { loading: true, status, error: '', success: '' } }));
    try {
      const payload = await apiRequest(`/api/referrals/${encodeURIComponent(referral.referralId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      const updatedReferral = payload?.data;
      if (!updatedReferral) throw new Error('Referral status response was incomplete.');
      setRecords(current => ({ ...current, referrals: current.referrals.map(item => item.referralId === updatedReferral.referralId ? updatedReferral : item) }));
      setReferralActions(current => ({ ...current, [referral.referralId]: { loading: false, status, error: '', success: `Referral marked ${updatedReferral.status}. Refreshing case ownership...` } }));
      setRefreshKey(current => current + 1);
    } catch (error) {
      setReferralActions(current => ({ ...current, [referral.referralId]: { loading: false, status, error: error.message || 'Unable to update referral.', success: '' } }));
    }
  }

  const myCases = records.cases.filter(item => currentResponsibleCentre(item) === HEALTH_CENTER_ID);
  const myEmergencies = records.emergencies.filter(item => {
    const assigned = item.escalationTargetHealthCenter?.healthCenterId || item.assignedHealthCenter?.healthCenterId || item.selectedHealthCenter?.healthCenterId;
    return assigned === HEALTH_CENTER_ID;
  });
  const incomingReferrals = records.referrals.filter(item => item.toHealthCenterId === HEALTH_CENTER_ID);
  const outgoingReferrals = records.referrals.filter(item => item.fromHealthCenterId === HEALTH_CENTER_ID);
  const criticalCount = myEmergencies.filter(item => item.priority === 'CRITICAL').length;
  const centreName = records.centre?.name || (HEALTH_CENTER_ID ? 'Health centre' : 'Development context missing');

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <div className="page-topline">
        <div><p className="eyebrow">Health centre operations</p><h1 id="dashboard-title">Your operational queue</h1><p className="intro">Cases and referrals currently responsible to your care team.</p></div>
        <div className="centre-identity"><span className="identity-mark">HC</span><div><span>Current centre</span><strong>{centreName} · {HEALTH_CENTER_ID || 'Not configured'}</strong></div><span className="online-pill"><i />Live</span></div>
      </div>
      {!HEALTH_CENTER_ID && <p className="data-state data-state-error dashboard-config-warning">Set <strong>VITE_HEALTH_CENTER_ID</strong> to load a health-centre-specific queue.</p>}
      <div className="dashboard-hero"><div><span className="hero-label">{HEALTH_CENTER_ID || 'Development context'}</span><h2>Focused care coordination.</h2><p>Only work currently assigned or routed to this health centre appears in your queue.</p></div><div className="hero-visual" aria-hidden="true"><span className="hero-cross">+</span><span className="hero-orbit orbit-one" /><span className="hero-orbit orbit-two" /><div className="hero-stat"><strong>{states.emergencies.loading ? '--' : myEmergencies.length}</strong><span>emergencies</span></div></div></div>
      <div className="dashboard-summary" aria-label="Health centre operational totals">
        <div className="summary-card summary-card-primary"><div className="summary-icon">⌁</div><div><span>My active cases</span><strong>{states.cases.loading ? '--' : myCases.length}</strong><small>Current responsibility</small></div></div>
        <div className="summary-card summary-card-alert"><div className="summary-icon">!</div><div><span>Critical attention</span><strong>{states.emergencies.loading ? '--' : criticalCount}</strong><small>Priority emergency queue</small></div></div>
        <div className="summary-card summary-card-blue"><div className="summary-icon">↗</div><div><span>Active emergencies</span><strong>{states.emergencies.loading ? '--' : myEmergencies.length}</strong><small>Assigned or escalated here</small></div></div>
        <div className="summary-card summary-card-muted"><div className="summary-icon">⇄</div><div><span>Incoming referrals</span><strong>{states.referrals.loading ? '--' : incomingReferrals.length}</strong><small>{outgoingReferrals.length} outgoing</small></div></div>
      </div>
      <div className="queue-grid">
        <section className="queue-section" aria-labelledby="my-cases-heading"><SectionHeader eyebrow="Current responsibility" title="My Active Cases" count={states.cases.loading ? '--' : myCases.length} /><DataState {...states.cases} emptyMessage="No active cases are currently assigned to this centre.">{myCases.map(item => <CaseRow item={item} key={item.caseId} />)}</DataState></section>
        <section className="queue-section" aria-labelledby="emergency-heading"><SectionHeader eyebrow="Immediate attention" title="Emergency Queue" count={states.emergencies.loading ? '--' : myEmergencies.length} /><DataState {...states.emergencies} emptyMessage="No active emergencies are routed to this centre.">{myEmergencies.map(item => <CaseRow emergency item={item} key={item.caseId} />)}</DataState></section>
        <section className="queue-section" aria-labelledby="incoming-heading"><SectionHeader eyebrow="Destination: this centre" title="Incoming Referrals" count={states.referrals.loading ? '--' : incomingReferrals.length} /><DataState {...states.referrals} emptyMessage="No incoming referrals for this centre.">{incomingReferrals.map(item => <ReferralRow incoming item={item} action={referralActions[item.referralId]} key={item.referralId} onUpdate={updateIncomingReferral} />)}</DataState></section>
        <section className="queue-section" aria-labelledby="outgoing-heading"><SectionHeader eyebrow="Source: this centre" title="Outgoing Referrals" count={states.referrals.loading ? '--' : outgoingReferrals.length} /><DataState {...states.referrals} emptyMessage="No outgoing referrals from this centre.">{outgoingReferrals.map(item => <ReferralRow item={item} key={item.referralId} onUpdate={updateIncomingReferral} />)}</DataState></section>
      </div>
    </section>
  );
}
