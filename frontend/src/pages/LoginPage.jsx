import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'patient' ? 'PATIENT' : 'HEALTH_WORKER';

  const [role, setRole] = useState(initialRole);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both identity and password.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const userData = await login(username, password);
      const userRole = userData?.role || role; // fallback to selected if missing
      navigate(userRole === 'HEALTH_WORKER' ? '/worker' : '/patient', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-visual">
        <div className="auth-visual-content">
          <div className="brand-lockup" style={{ marginBottom: '4rem', cursor: 'pointer' }} onClick={() => navigate('/')}>
            <div className="brand-mark" style={{ background: '#fff', color: 'var(--teal)' }}>C</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="brand-kicker" style={{ color: '#9fe1d8' }}>CareOS</span>
              <h1 className="brand-name" style={{ color: '#fff' }}>Platform</h1>
            </div>
          </div>
          <h1 style={{ fontSize: '3rem', letterSpacing: '-0.04em' }}>Welcome back.</h1>
          <p>Access your {role === 'PATIENT' ? 'healthcare journey and medical records' : 'connected health centres, patients, and operational data'}.</p>
        </div>
        <div style={{ position: 'absolute', right: '-10%', bottom: '-10%', opacity: 0.1 }}>
          <svg width="600" height="600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
      </div>
      
      <div className="auth-form-container">
        <div style={{ maxWidth: '400px', width: '100%', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Sign In</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '2.5rem' }}>Enter your details to access your account.</p>
          
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', background: 'var(--paper)', padding: '0.4rem', borderRadius: '12px' }}>
            <button 
              type="button"
              onClick={() => setRole('HEALTH_WORKER')}
              style={{ flex: 1, padding: '0.6rem', border: 'none', background: role === 'HEALTH_WORKER' ? '#fff' : 'transparent', borderRadius: '8px', fontWeight: 800, color: role === 'HEALTH_WORKER' ? 'var(--ink)' : 'var(--muted)', cursor: 'pointer', boxShadow: role === 'HEALTH_WORKER' ? 'var(--shadow-soft)' : 'none', transition: 'all 0.2s' }}
            >
              Health Worker
            </button>
            <button 
              type="button"
              onClick={() => setRole('PATIENT')}
              style={{ flex: 1, padding: '0.6rem', border: 'none', background: role === 'PATIENT' ? '#fff' : 'transparent', borderRadius: '8px', fontWeight: 800, color: role === 'PATIENT' ? 'var(--ink)' : 'var(--muted)', cursor: 'pointer', boxShadow: role === 'PATIENT' ? 'var(--shadow-soft)' : 'none', transition: 'all 0.2s' }}
            >
              Patient
            </button>
          </div>

          {error && <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '1rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '1.5rem' }}>{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="username">Email or Username *</label>
              <input 
                id="username"
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                placeholder="Enter your email or username"
                required 
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <input 
                id="password"
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
                required 
              />
            </div>
            
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          
          <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
            Don't have an account? <a href={`/signup?role=${role === 'PATIENT' ? 'patient' : 'worker'}`} style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none' }}>Sign up</a>
          </p>
        </div>
      </div>
    </div>
  );
}
