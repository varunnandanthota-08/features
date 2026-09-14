import { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import ReferralSlaDisplay from '../components/ReferralSlaDisplay';
import EmergencyCountdown from '../components/EmergencyCountdown';
import NotificationsDropdown from '../components/NotificationsDropdown';
import { useAuth } from '../components/AuthContext';

function patientLabel(patient) {
  return patient?.name || patient?.phone || 'Patient details unavailable';
}

function statusLabel(value) {
  return value?.replaceAll('_', ' ') || 'STATUS UNAVAILABLE';
}

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({
    cases: [],
    referrals: [],
    emergencies: [],
    healthCenter: null
  });
  const [loading, setLoading] = useState(true);
  const [alarmEnabled, setAlarmEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('careos_emergency_alarm');
      return stored === null ? true : stored === 'true';
    } catch (_) {
      return true;
    }
  });
  const audioRef = useRef(null);

  const toggleAlarm = () => {
    setAlarmEnabled(prev => {
      const next = !prev;
      try {
        localStorage.setItem('careos_emergency_alarm', String(next));
      } catch (_) {}
      return next;
    });
  };

  useEffect(() => {
    async function loadDashboard() {
      try {
        const hcId = user?.healthCenterId;
        const [casesRes, refRes, emRes, hcRes] = await Promise.all([
          apiRequest('/api/cases').catch(() => ({ data: [] })),
          apiRequest('/api/referrals').catch(() => ({ data: [] })),
          apiRequest('/api/emergency/active').catch(() => ({ data: [] })),
          hcId ? apiRequest(`/api/health-centers/${encodeURIComponent(hcId)}`).catch(() => ({ data: null })) : Promise.resolve({ data: null })
        ]);
        
        setData({
          cases: casesRes.data || [],
          referrals: refRes.data || [],
          emergencies: emRes.data || [],
          healthCenter: hcRes.data
        });
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const activeCases = useMemo(() => data.cases.filter(c => c.status !== 'RESOLVED'), [data.cases]);
  const activeEmergencies = useMemo(() => {
    // Explicit emergencies from API are already filtered by authorization
    const explicit = data.emergencies.filter(e => e.status !== 'RESOLVED');
    const critical = activeCases.filter(c => c.priority === 'CRITICAL');
    const map = new Map();
    explicit.forEach(e => map.set(e.caseId, e));
    critical.forEach(c => {
      if (!map.has(c.caseId)) map.set(c.caseId, c);
    });
    return Array.from(map.values());
  }, [data.emergencies, activeCases]);

  // Only ALERTED emergencies owned by this HC should trigger the alarm sound
  const actionableAlertedEmergencies = useMemo(() => {
    return data.emergencies.filter(e => e.status === 'ALERTED');
  }, [data.emergencies]);

  const escalatedCases = useMemo(() => {
    return activeCases.filter(c => c.escalationStatus && c.escalationStatus !== 'NOT_ESCALATED' && c.escalationStatus !== 'NONE');
  }, [activeCases]);

  const pendingReferrals = useMemo(() => {
    return data.referrals.filter(r => r.status === 'PENDING');
  }, [data.referrals]);

  // Managed Audio Lifecycle:
  // - Loops audio ONLY if alarm is enabled and there are ALERTED emergencies
  // - Immediately pauses and resets if acknowledged, resolved, escalated away, or alarm toggled OFF
  // - Gracefully catches autoplay policy restrictions
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (actionableAlertedEmergencies.length > 0 && alarmEnabled) {
      audio.loop = true;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.debug('Autoplay waiting for user gesture:', err.message);
        });
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
    }

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [actionableAlertedEmergencies.length, alarmEnabled]);

  // Next cases needing attention (active, non-emergency)
  const attentionCases = useMemo(() => {
    return activeCases
      .filter(c => c.priority !== 'CRITICAL' && !activeEmergencies.some(e => e.caseId === c.caseId))
      .slice(0, 4);
  }, [activeCases, activeEmergencies]);

  if (loading) return <div className="details-page"><p className="data-state">Loading dashboard...</p></div>;

  const currentCenterId = data.healthCenter?.healthCenterId || user?.healthCenterId;

  return (
    <div className="command-centre" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '4rem' }}>
      
      {/* Audio element for managed sound alert */}
      <audio ref={audioRef} src="/emergency-alert.mp3" preload="auto" />

      {/* HEADER CONTROLS: ALARM TOGGLE + NOTIFICATIONS SIDE BY SIDE */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          type="button"
          onClick={toggleAlarm}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.55rem',
            padding: '0.45rem 1.15rem',
            borderRadius: '10px',
            border: alarmEnabled ? '1px solid rgba(36, 167, 123, 0.45)' : '1px solid var(--line)',
            background: alarmEnabled ? 'rgba(36, 167, 123, 0.12)' : 'var(--paper)',
            color: alarmEnabled ? 'var(--teal)' : 'var(--muted)',
            fontSize: '0.88rem',
            fontWeight: 800,
            cursor: 'pointer',
            height: '2.5rem',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}
          title={alarmEnabled ? 'Emergency Alarm: ON (Click to turn OFF)' : 'Emergency Alarm: OFF (Click to turn ON)'}
        >
          <span style={{ fontSize: '1.05rem' }}>{alarmEnabled ? '🔊' : '🔇'}</span>
          <span>Emergency Alarm: <strong style={{ color: alarmEnabled ? 'var(--teal)' : 'var(--ink)' }}>{alarmEnabled ? 'ON' : 'OFF'}</strong></span>
        </button>

        <NotificationsDropdown />
      </div>

      {/* A. HERO */}
      <header style={{ 
        display: 'flex', 
        flexDirection: 'row', 
        flexWrap: 'wrap', 
        background: '#07161b', 
        borderRadius: '16px', 
        overflow: 'hidden', 
        marginBottom: '2rem',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Left Side: Context & Information */}
        <div style={{ flex: '1 1 450px', padding: '3rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#fff' }}>
          <h1 style={{ fontSize: '2.5rem', margin: '0 0 0.5rem', color: '#fff', letterSpacing: '-0.02em' }}>
            Good morning, {user?.name || user?.username || 'Health Worker'}
          </h1>
          <p style={{ fontSize: '1.25rem', color: 'var(--teal)', margin: '0 0 1.25rem', fontWeight: 700 }}>
            {data.healthCenter?.name || 'Health Centre'} • {data.healthCenter?.village || data.healthCenter?.location?.village || 'Network'}
          </p>
          <p style={{ margin: 0, color: '#aab7be', lineHeight: 1.6, fontSize: '1.05rem', maxWidth: '440px' }}>
            Connected healthcare network. Monitor cases, referrals, emergencies and patient care from your centre.
          </p>
        </div>
        
        {/* Right Side: Earth Video (Inside Hero, non-blocking) */}
        <div style={{ flex: '1 1 380px', position: 'relative', minHeight: '280px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #07161b 0%, transparent 15%)', zIndex: 1, pointerEvents: 'none' }}></div>
          <video 
            src="/careos-earth.mp4" 
            autoPlay 
            muted 
            loop
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      </header>

      {/* EMERGENCY ALERT BANNER (Prominent visual alert) */}
      {activeEmergencies.length > 0 && (
        <div style={{ 
          background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)', 
          color: '#fff', 
          padding: '1.5rem 2rem', 
          borderRadius: '14px', 
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.25rem',
          boxShadow: '0 12px 30px rgba(220, 38, 38, 0.35)',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          <div style={{ flex: '1 1 500px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.75rem' }}>🚨</span>
              <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.01em' }}>
                {activeEmergencies[0].escalationStatus === 'ESCALATED' || activeEmergencies[0].status === 'ESCALATED'
                  ? `EMERGENCY ESCALATED — Level ${activeEmergencies[0].escalationLevel || 1}`
                  : 'CRITICAL EMERGENCY'}
              </h3>
              <span style={{ background: '#fff', color: '#dc2626', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 900 }}>
                {activeEmergencies[0].status || 'ALERTED'}
              </span>
              {activeEmergencies.length > 1 && (
                <span style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                  +{activeEmergencies.length - 1} more emergency
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.4rem 1rem', fontSize: '0.95rem', opacity: 0.95, margin: '0.6rem 0' }}>
              <div><strong>Case:</strong> {activeEmergencies[0].caseId}</div>
              <div><strong>Patient:</strong> {patientLabel(activeEmergencies[0].patient)}</div>
              <div><strong>Location:</strong> {activeEmergencies[0].locationLabel || (activeEmergencies[0].location?.latitude ? `${activeEmergencies[0].location.latitude.toFixed(3)}, ${activeEmergencies[0].location.longitude.toFixed(3)}` : 'Location pending')}</div>
              <div><strong>Reason:</strong> {activeEmergencies[0].reason || 'Emergency medical triage required'}</div>
            </div>

            {/* Escalation history line if escalated */}
            {(activeEmergencies[0].escalationStatus === 'ESCALATED' || activeEmergencies[0].escalatedAt) && (
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '0.35rem 0.65rem', borderRadius: '6px' }}>
                <strong>Escalation route:</strong> {activeEmergencies[0].escalatedFromHealthCenter?.name || activeEmergencies[0].escalatedFromHealthCenterId || 'Previous Health Centre'} → {data.healthCenter?.name || currentCenterId || 'Current Centre'}
                {activeEmergencies[0].escalatedAt && ` • Escalated at: ${new Date(activeEmergencies[0].escalatedAt).toLocaleTimeString()}`}
                {activeEmergencies[0].escalationReason && ` • Reason: ${activeEmergencies[0].escalationReason}`}
              </p>
            )}

            {/* Live 5-minute countdown */}
            {activeEmergencies[0].status !== 'RESOLVED' && (
              <div style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.85rem', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                  {activeEmergencies[0].status === 'ACKNOWLEDGED' ? 'Response active' : 'Time remaining:'}
                </span>
                {activeEmergencies[0].status === 'ACKNOWLEDGED' ? (
                  <span style={{ fontWeight: 800, color: '#a7f3d0' }}>✓ Acknowledged</span>
                ) : (
                  <EmergencyCountdown dueAt={activeEmergencies[0].emergencyEscalationDueAt} createdAt={activeEmergencies[0].createdAt} />
                )}
              </div>
            )}
          </div>

          <Link 
            to={`/worker/case-details/emergency/${encodeURIComponent(activeEmergencies[0].caseId)}`} 
            state={{ record: activeEmergencies[0] }} 
            style={{ 
              padding: '0.85rem 1.8rem', 
              background: '#fff', 
              color: '#b91c1c', 
              borderRadius: '8px', 
              fontWeight: 900, 
              fontSize: '1rem',
              textDecoration: 'none', 
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
              transition: 'transform 0.15s ease'
            }}
          >
            View Emergency →
          </Link>
        </div>
      )}


      {/* B. PRIORITY SECTION (3 useful priority cards with real counts) */}
      <section className="cc-priority-section" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.4rem', margin: '0 0 1rem', color: 'var(--ink)' }}>Priority Queue</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          
          {/* 1. Emergencies Card */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: '5px solid var(--red)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Emergencies</span>
              <span style={{ fontSize: '1.5rem' }}>🚨</span>
            </div>
            <strong style={{ fontSize: '2rem', color: 'var(--ink)' }}>{activeEmergencies.length}</strong>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {activeEmergencies.length > 0 ? 'Critical care cases requiring immediate triage' : 'No active emergencies pending'}
            </p>
          </div>

          {/* 2. Escalated Cases Card */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: '5px solid var(--amber)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Escalated Cases</span>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            </div>
            <strong style={{ fontSize: '2rem', color: 'var(--ink)' }}>{escalatedCases.length}</strong>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {escalatedCases.length > 0 ? 'Cases escalated due to SLA or complex care needs' : 'No cases currently escalated'}
            </p>
          </div>

          {/* 3. Pending Referrals Card */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: '5px solid var(--blue)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-soft)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Referrals</span>
              <span style={{ fontSize: '1.5rem' }}>→</span>
            </div>
            <strong style={{ fontSize: '2rem', color: 'var(--ink)' }}>{pendingReferrals.length}</strong>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              {pendingReferrals.length > 0 ? 'Transfers waiting for acceptance or review' : 'No incoming referrals waiting'}
            </p>
          </div>

        </div>
      </section>

      {/* Main Grid: Cases Needing Attention, Referrals, Emergencies */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        
        {/* C. CASES NEEDING ATTENTION */}
        <section className="cc-section" style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--ink)' }}>Cases Needing Attention</h2>
            <Link to="/worker/cases" style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem' }}>View All →</Link>
          </div>
          {attentionCases.length === 0 ? (
            <p className="data-state" style={{ padding: '2rem 1rem' }}>No pending standard cases needing immediate action.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {attentionCases.map(c => (
                <Link key={c.caseId} to={`/worker/case-details/case/${encodeURIComponent(c.caseId)}`} state={{ record: c }} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ padding: '0.9rem', background: 'var(--paper)', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>{c.caseId}</strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)' }}>{statusLabel(c.status)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink)' }}>{patientLabel(c.patient)}</p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>{c.complaint}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* D. REFERRALS */}
        <section className="cc-section" style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--ink)' }}>Referrals</h2>
            <Link to="/worker/referrals" style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem' }}>View All →</Link>
          </div>
          {pendingReferrals.length === 0 ? (
            <p className="data-state" style={{ padding: '2rem 1rem' }}>No pending referrals for your centre.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {pendingReferrals.slice(0, 3).map(r => (
                <div key={r.referralId} style={{ padding: '0.9rem', background: 'var(--paper)', borderRadius: '10px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>{r.referralId}</strong>
                    <span style={{ background: 'var(--blue-soft)', color: 'var(--blue)', fontSize: '0.7rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '6px' }}>PENDING</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink)' }}>From: {r.sourceCenterId || 'Network Centre'}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>{r.reason || 'Specialist consultation required'}</p>
                  <ReferralSlaDisplay referral={r} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* E. EMERGENCIES */}
        <section className="cc-section" style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--ink)' }}>Emergencies</h2>
            <Link to="/worker/emergencies" style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem' }}>View All →</Link>
          </div>
          {activeEmergencies.length === 0 ? (
            <p className="data-state" style={{ padding: '2rem 1rem' }}>No active emergency incidents recorded.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeEmergencies.slice(0, 3).map(e => (
                <Link key={e.caseId} to={`/worker/case-details/emergency/${encodeURIComponent(e.caseId)}`} state={{ record: e }} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ padding: '0.9rem', background: 'var(--red-soft)', borderRadius: '10px', border: '1px solid rgba(230, 57, 70, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--red)' }}>🚨 {e.caseId}</strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--red)' }}>CRITICAL</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink)', fontWeight: 700 }}>{patientLabel(e.patient)}</p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>{e.reason || e.complaint || 'Emergency triage needed'}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* F. ABOUT YOUR HEALTH CENTRE */}
      <section className="about-health-center" style={{ background: '#fff', borderRadius: '16px', border: '1px solid var(--line)', padding: '2.5rem', boxShadow: 'var(--shadow-soft)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.25rem', color: 'var(--ink)' }}>About Your Health Centre</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.95rem' }}>Operational facility information and capabilities</p>
          </div>
          {currentCenterId && (
            <button 
              onClick={() => navigate(`/health-centres/${currentCenterId}`)} 
              style={{ padding: '0.8rem 1.6rem', background: 'var(--teal)', color: '#fff', borderRadius: '8px', fontWeight: 800, border: 'none', cursor: 'pointer' }}
            >
              View Full Health Centre Profile →
            </button>
          )}
        </div>

        {data.healthCenter ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2.5rem' }}>
            
            <div>
              <div style={{ width: '100%', height: '220px', borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem', background: 'var(--line)', position: 'relative' }}>
                <img 
                  src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=600" 
                  alt="Health Centre Facility" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                <span style={{ position: 'absolute', bottom: '6px', left: '6px', fontSize: '0.65rem', color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  * Demo visual
                </span>
              </div>
              <h3 style={{ fontSize: '1.4rem', margin: '0 0 0.4rem', color: 'var(--ink)' }}>{data.healthCenter.name}</h3>
              <p style={{ color: 'var(--muted)', margin: '0 0 0.8rem', fontSize: '0.9rem' }}>
                📍 {data.healthCenter.village || data.healthCenter.location?.village || ''}, {data.healthCenter.district || data.healthCenter.location?.district || ''} {data.healthCenter.state || ''}
              </p>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--ink)', margin: 0 }}>
                {data.healthCenter.description || `${data.healthCenter.name} serves as a connected primary care hub in the CareOS public network.`}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.8rem', fontSize: '1rem', color: 'var(--ink)', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.3rem', display: 'inline-block' }}>
                  Facilities & Capacity
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'var(--paper)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Total Beds</span>
                    <strong style={{ fontSize: '0.9rem' }}>{data.healthCenter.capacity || 0}</strong>
                  </li>
                  <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'var(--paper)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Current Patient Load</span>
                    <strong style={{ fontSize: '0.9rem' }}>{data.healthCenter.currentPatientLoad || 0}</strong>
                  </li>
                  <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'var(--paper)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Emergency Readiness</span>
                    <strong style={{ fontSize: '0.9rem', color: data.healthCenter.emergencyAvailable ? 'var(--teal)' : 'var(--red)' }}>
                      {data.healthCenter.emergencyAvailable ? 'Available (24/7)' : 'Not Available'}
                    </strong>
                  </li>
                </ul>
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.8rem', fontSize: '1rem', color: 'var(--ink)', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.3rem', display: 'inline-block' }}>
                  Core Services
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {data.healthCenter.services?.length > 0 ? data.healthCenter.services.map((service, i) => (
                    <span key={i} style={{ background: 'var(--teal-soft)', color: 'var(--teal-dark)', padding: '0.3rem 0.7rem', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {service.replace(/_/g, ' ')}
                    </span>
                  )) : (
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No specific services listed.</span>
                  )}
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.8rem', fontSize: '1rem', color: 'var(--ink)', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.3rem', display: 'inline-block' }}>
                  Equipment
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {data.healthCenter.equipment && Object.keys(data.healthCenter.equipment).filter(k => data.healthCenter.equipment[k]).length > 0 ? 
                    Object.keys(data.healthCenter.equipment).filter(k => data.healthCenter.equipment[k]).map(eq => (
                      <span key={eq} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--ink)' }}>
                        ✓ {eq.toUpperCase()}
                      </span>
                    )) : (
                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No equipment details specified.</span>
                    )}
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.8rem', fontSize: '1rem', color: 'var(--ink)', borderBottom: '2px solid var(--teal-soft)', paddingBottom: '0.3rem', display: 'inline-block' }}>
                  Medical Staff
                </h4>
                {data.healthCenter.doctors && Object.values(data.healthCenter.doctors).some(v => v > 0) ? (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {Object.entries(data.healthCenter.doctors).filter(([_, c]) => c > 0).map(([dept, c]) => (
                      <span key={dept} style={{ background: 'var(--paper)', border: '1px solid var(--line)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {dept}: {c}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
                    Medical staff information is not available yet.
                  </p>
                )}
              </div>

            </div>

          </div>
        ) : (
          <p className="data-state">No health centre information assigned to your account.</p>
        )}
      </section>

    </div>
  );
}
