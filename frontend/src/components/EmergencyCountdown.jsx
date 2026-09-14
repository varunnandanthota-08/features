import { useState, useEffect } from 'react';

export default function EmergencyCountdown({ dueAt, createdAt, onExpire, style }) {
  const calculateSeconds = () => {
    const targetMs = dueAt
      ? new Date(dueAt).getTime()
      : (createdAt ? new Date(createdAt).getTime() + 5 * 60 * 1000 : Date.now() + 5 * 60 * 1000);
    return Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
  };

  const [secondsLeft, setSecondsLeft] = useState(calculateSeconds);

  useEffect(() => {
    setSecondsLeft(calculateSeconds());
    const timer = setInterval(() => {
      const remaining = calculateSeconds();
      setSecondsLeft(remaining);
      if (remaining === 0 && onExpire) {
        onExpire();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [dueAt, createdAt, onExpire]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  if (secondsLeft === 0) {
    return (
      <span style={{ color: '#ffb4b4', fontWeight: 800, ...style }}>
        00:00 (SLA Expired)
      </span>
    );
  }

  return (
    <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 900, fontSize: '1.15rem', letterSpacing: '0.05em', ...style }}>
      {mins}:{secs}
    </span>
  );
}
