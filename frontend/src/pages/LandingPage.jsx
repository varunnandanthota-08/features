import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';
import HealthCentreMap from '../components/HealthCentreMap';
import { apiRequest } from '../services/api';

function AnimatedCounter({ end, duration = 1500, suffix = '' }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    let frameId;
    const target = Number(end) || 0;
    if (target === 0) {
      setCount(0);
      return;
    }
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        setCount(target);
      }
    };
    frameId = window.requestAnimationFrame(step);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [end, duration]);

  return <span>{count.toLocaleString()}{suffix}</span>;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [healthCenters, setHealthCenters] = useState([]);
  const [stats, setStats] = useState({
    totalCases: 0,
    totalReferrals: 0,
    totalEmergencies: 0,
    totalHealthCenters: 0
  });

  useEffect(() => {
    // Fetch health centres for map
    apiRequest('/api/health-centers')
      .then(res => setHealthCenters(res.data || []))
      .catch(err => console.error('Failed to load health centres:', err));

    // Fetch real overview stats
    apiRequest('/api/health-centers/stats')
      .then(res => {
        if (res.data) setStats(res.data);
      })
      .catch(err => console.error('Failed to load stats:', err));
  }, []);

  return (
    <div className="landing-page" style={{ background: '#fff' }}>
      {/* Navbar for Landing */}
      <nav className="landing-nav" style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 3rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="brand-mark" style={{ height: '2.2rem', width: '2.2rem', fontSize: '1.2rem' }}>C</div>
          <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--ink)', letterSpacing: '-0.04em' }}>CareOS</div>
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
          <a href="#connected-health-centres" style={{ color: 'var(--muted)', transition: 'color 0.2s', textDecoration: 'none' }} onMouseOver={e => e.target.style.color='var(--teal)'} onMouseOut={e => e.target.style.color='var(--muted)'}>Health Centres</a>
          <a href="#why-careos" style={{ color: 'var(--muted)', transition: 'color 0.2s', textDecoration: 'none' }} onMouseOver={e => e.target.style.color='var(--teal)'} onMouseOut={e => e.target.style.color='var(--muted)'}>Why CareOS</a>
          <button style={{ background: 'var(--teal-soft)', color: 'var(--teal-dark)', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => navigate('/role-selection')}>Sign In</button>
        </div>
      </nav>

      <main>
        {/* Section 1: Hero */}
        <section style={{ padding: '3rem 3rem 6rem', maxWidth: '1400px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <h1 className="fade-up" style={{ fontSize: 'clamp(3rem, 5vw, 4.5rem)', lineHeight: 1.1, margin: '0 0 1rem' }}>
              CareOS
            </h1>
            <p className="fade-up delay-1" style={{ fontSize: '1.5rem', color: 'var(--teal)', fontWeight: 700, margin: '0 0 1.5rem' }}>
              Rural healthcare, connected.
            </p>
            <p className="fade-up delay-1" style={{ fontSize: '1.15rem', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 2.5rem', maxWidth: '32rem' }}>
              CareOS connects patients, health workers, and healthcare centres. Delivering timely, accessible, and high-quality care across rural communities seamlessly.
            </p>
            <div className="fade-up delay-2" style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => navigate('/role-selection?role=patient')} style={{ padding: '1rem 1.8rem', background: '#fff', border: '2px solid var(--line)', color: 'var(--ink)', borderRadius: '12px', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', boxShadow: 'var(--shadow-soft)' }}>
                I'm a Patient
              </button>
              <button onClick={() => navigate('/role-selection?role=worker')} style={{ padding: '1rem 1.8rem', background: 'var(--teal)', border: '2px solid var(--teal)', color: '#fff', borderRadius: '12px', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', boxShadow: 'var(--shadow-soft)' }}>
                I'm a Health Worker
              </button>
            </div>
          </div>

          <div className="fade-in delay-3">
            <div className="video-hero-container" style={{ height: '500px' }}>
              <div className="video-hero-glow"></div>
              <video 
                src="/careos-healthcare.mp4" 
                autoPlay 
                loop 
                muted 
                playsInline 
                preload="metadata"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>
        </section>

        {/* Section 2: Why CareOS */}
        <section id="why-careos" style={{ padding: '6rem 3rem', maxWidth: '1200px', margin: '0 auto', scrollMarginTop: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '2.5rem', margin: '0 0 1rem' }}>Why CareOS</h2>
            <p style={{ fontSize: '1.1rem', color: 'var(--muted)' }}>Built specifically for the operational challenges of rural healthcare deployment.</p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem' }}>
            {[
              { title: 'Multi-channel Intake', text: 'Patients can reach out via WhatsApp, SMS, IVR, or direct web portal for seamless onboarding without needing an app.', border: 'var(--teal)' },
              { title: 'Emergency Support', text: 'Immediate routing and alerting for critical cases to the nearest equipped health centre with available beds.', border: 'var(--red)' },
              { title: 'Smart Referral', text: 'Effortless case transfer between primary centres and specialized hospitals to ensure continuous care.', border: 'var(--blue)' },
              { title: 'AI Document Intelligence', text: 'Extract information from handwritten prescriptions and lab reports instantly using advanced OCR.', border: 'var(--amber)' }
            ].map(card => (
              <div 
                key={card.title} 
                style={{ 
                  background: '#fff', 
                  border: '1px solid var(--line)', 
                  borderTop: `4px solid ${card.border}`,
                  padding: '2rem', 
                  borderRadius: '16px', 
                  boxShadow: 'var(--shadow-soft)',
                  transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                  cursor: 'default'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
                }}
              >
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.25rem', color: 'var(--ink)' }}>{card.title}</h3>
                <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6, fontSize: '0.95rem' }}>{card.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Connected Healthcare Centres Map */}
        <section id="connected-health-centres" style={{ background: 'var(--teal-dark)', padding: '6rem 3rem', color: '#fff', scrollMarginTop: '2rem' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '4rem', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '2.5rem', margin: '0 0 1rem', color: '#fff' }}>Connected Healthcare Centres</h2>
              <p style={{ fontSize: '1.1rem', color: 'var(--teal-soft)', lineHeight: 1.6, marginBottom: '2rem' }}>
                CareOS connects healthcare facilities across communities. Our interactive network maps active capacity, available services, and emergency readiness in real-time.
              </p>
              <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '1.2rem 1.8rem', borderRadius: '14px' }}>
                <span style={{ display: 'block', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--teal-soft)' }}>Connected Facilities</span>
                <strong style={{ fontSize: '2.8rem', lineHeight: 1 }}>
                  <AnimatedCounter end={healthCenters.length} />
                </strong>
              </div>
            </div>
            <div>
              <HealthCentreMap healthCenters={healthCenters} />
            </div>
          </div>
        </section>

        {/* Section 4: Healthcare that stays connected (Exactly 4 animated stat cards) */}
        <section style={{ padding: '6rem 3rem', background: 'var(--paper)' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2.5rem', margin: '0 0 1rem', letterSpacing: '-0.02em' }}>Healthcare that stays connected.</h2>
            <p style={{ fontSize: '1.15rem', color: 'var(--muted)', marginBottom: '3.5rem', lineHeight: 1.6, maxWidth: '680px', margin: '0 auto 3.5rem' }}>
              Real-time synchronization across rural health posts, secondary referral centers, and emergency response teams.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
              {[
                { label: 'Active Cases Triaged', value: stats.totalCases, color: 'var(--teal)' },
                { label: 'Referrals Coordinated', value: stats.totalReferrals, color: 'var(--blue)' },
                { label: 'Emergencies Handled', value: stats.totalEmergencies, color: 'var(--red)' },
                { label: 'Connected Health Centres', value: stats.totalHealthCenters || healthCenters.length, color: 'var(--amber)' }
              ].map(stat => (
                <div 
                  key={stat.label}
                  style={{
                    background: '#fff',
                    border: '1px solid var(--line)',
                    padding: '2.2rem 1.5rem',
                    borderRadius: '16px',
                    boxShadow: 'var(--shadow-soft)',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                    cursor: 'default'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
                  }}
                >
                  <div style={{ fontSize: '2.5rem', fontWeight: 900, color: stat.color, marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
                    <AnimatedCounter end={stat.value} />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ink)' }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
