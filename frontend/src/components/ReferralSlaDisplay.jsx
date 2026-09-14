import { useState, useEffect } from 'react';

export default function ReferralSlaDisplay({ referral }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (referral.status !== 'PENDING' || !referral.acceptanceDueAt) return;
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, [referral.status, referral.acceptanceDueAt]);

  if (referral.status !== 'PENDING') return null;

  if (referral.escalationStatus === 'ESCALATED') {
    return (
      <div className="sla-display sla-escalated">
        <p className="sla-expired-text">Acceptance SLA expired</p>
        <div className="escalation-summary">
          <span className="escalation-badge">Escalation level {referral.escalationLevel}</span>
          <p>New destination: <strong>{referral.escalatedToHealthCenterId}</strong></p>
        </div>
      </div>
    );
  }

  if (!referral.acceptanceDueAt) return null;

  const dueTime = new Date(referral.acceptanceDueAt).getTime();
  const timeRemainingMs = dueTime - now;

  if (timeRemainingMs <= 0) {
    return (
      <div className="sla-display sla-expired">
        <p className="sla-expired-text">Acceptance SLA expired</p>
        <p className="sla-awaiting">Awaiting escalation...</p>
      </div>
    );
  }

  const totalSeconds = Math.floor(timeRemainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  const isWarning = totalSeconds <= 300; // 5 minutes or less

  return (
    <div className={`sla-display ${isWarning ? 'sla-warning' : 'sla-normal'}`}>
      <p className="sla-label">Accept within:</p>
      <p className="sla-countdown">
        {minutes}m {seconds.toString().padStart(2, '0')}s
      </p>
    </div>
  );
}
