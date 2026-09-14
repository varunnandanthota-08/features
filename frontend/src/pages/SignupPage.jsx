import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useAuth } from '../components/AuthContext';

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get('role') === 'patient' ? 'PATIENT' : 'HEALTH_WORKER';

  const [role, setRole] = useState(initialRole);
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Worker fields
  const [healthCenterId, setHealthCenterId] = useState('');
  const [healthCenters, setHealthCenters] = useState([]);
  const [loadingCenters, setLoadingCenters] = useState(true);
  const [centersError, setCentersError] = useState('');

  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch health centers for the dropdown
  useEffect(() => {
    setLoadingCenters(true);
    apiRequest('/api/health-centers')
      .then(res => {
        const centers = res.data || [];
        setHealthCenters(centers);
        if (centers.length > 0 && !healthCenterId) {
          setHealthCenterId(centers[0].healthCenterId);
        }
      })
      .catch(err => {
        console.error('Failed to load health centers', err);
        setCentersError('Failed to load health centres. Please try again later.');
      })
      .finally(() => setLoadingCenters(false));
  }, []); // eslint-disable-line

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if ((!username && !email) || !password) throw new Error('Username/Email and Password are required.');
      if (password !== confirmPassword) throw new Error('Passwords do not match.');

      const payload = {
        username: username || email, // Fallback to email as username if not provided
        email,
        password,
        role
      };

      if (role === 'HEALTH_WORKER') {
        if (!healthCenterId) throw new Error('Please select a Health Centre.');
        payload.healthCenterId = healthCenterId;
      }

      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      await login(username, password);
      navigate(role === 'HEALTH_WORKER' ? '/worker' : '/patient', { replace: true });
    } catch (err) {
      setError(err.message || 'Signup failed.');
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
          <h1 style={{ fontSize: '3rem', letterSpacing: '-0.04em' }}>Join the network.</h1>
          <p>Create an account to connect with the CareOS healthcare ecosystem in your community.</p>
        </div>
        <div style={{ position: 'absolute', right: '-10%', bottom: '-10%', opacity: 0.1 }}>
          <svg width="600" height="600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5zm4 4h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>
        </div>
      </div>
      
      <div className="auth-form-container">
        <div style={{ maxWidth: '400px', width: '100%', margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Create Account</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '2.5rem' }}>Sign up to access your health portal.</p>
          
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

          <form onSubmit={handleSignup}>

            <div className="form-group">
              <label htmlFor="username">{role === 'HEALTH_WORKER' ? 'Username *' : 'Email or Username *'}</label>
              <input id="username" type="text" value={username} onChange={e => setUsername(e.target.value)} required placeholder={role === 'HEALTH_WORKER' ? "Choose a username" : "e.g. john@example.com"} />
            </div>

            {role === 'HEALTH_WORKER' && (
              <div className="form-group">
                <label htmlFor="hw-center">Health Centre *</label>
                <select id="hw-center" value={healthCenterId} onChange={e => setHealthCenterId(e.target.value)} required disabled={loadingCenters || healthCenters.length === 0}>
                  {loadingCenters ? (
                    <option value="">Loading centres...</option>
                  ) : centersError ? (
                    <option value="">{centersError}</option>
                  ) : healthCenters.length === 0 ? (
                    <option value="">No health centres available</option>
                  ) : (
                    healthCenters.map(hc => (
                      <option key={hc.healthCenterId} value={hc.healthCenterId}>{hc.name}</option>
                    ))
                  )}
                </select>
                {centersError && <small style={{ color: 'var(--red)' }}>{centersError}</small>}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password *</label>
                <input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="••••••••" />
              </div>
            </div>
            
            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          
          <p style={{ textAlign: 'center', margin: '2rem 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
            Already have an account? <a href="/login" style={{ color: 'var(--teal)', fontWeight: 800, textDecoration: 'none' }}>Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
