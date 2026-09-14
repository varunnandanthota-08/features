import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function AnimatedCounter({ end, duration = 2000, suffix = '+' }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [end, duration]);

  return <span>{count.toLocaleString()}{suffix}</span>;
}

export default function Footer() {
  return (
    <footer className="careos-footer">
      <div className="footer-content">
        <div className="footer-brand" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '380px' }}>
          <div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', letterSpacing: '-0.03em' }}>CareOS</h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              Connecting rural healthcare facilities, frontline workers, and patients through unified digital triage and coordinated care.
            </p>
          </div>
        </div>
        <div className="footer-links-grid">
          <div className="footer-column">
            <h4>Portals</h4>
            <Link to="/role-selection?role=patient">Patient Portal</Link>
            <Link to="/role-selection?role=worker">Health Worker Portal</Link>
            <Link to="/health-centres">Health Centres Directory</Link>
          </div>
          <div className="footer-column">
            <h4>Explore</h4>
            <a href="/#why-careos">Why CareOS</a>
            <a href="/#connected-health-centres">Network Map</a>
            <Link to="/signup">Register Account</Link>
          </div>
          <div className="footer-column">
            <h4>Platform</h4>
            <a href="/login">Sign In</a>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Offline First & OCR Enabled</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Emergency Dispatch Ready</span>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} CareOS. Operating for rural healthcare networks.</p>
      </div>
    </footer>
  );
}
