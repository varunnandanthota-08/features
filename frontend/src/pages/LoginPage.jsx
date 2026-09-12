import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(username, password);
      if (user?.role === 'PATIENT') {
        navigate('/patient-portal');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center', 
      minHeight: '100vh', backgroundColor: '#f0f4f8'
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'white', padding: '2rem', borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '400px', width: '100%'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ margin: '0 0 0.5rem', color: '#1a365d' }}>Rural Healthcare</h1>
          <p style={{ margin: 0, color: '#4a5568' }}>Sign in to continue</p>
        </div>

        {error && (
          <div style={{
            background: '#fed7d7', color: '#c53030', padding: '0.75rem',
            borderRadius: '4px', marginBottom: '1rem', fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#2d3748' }}>Username</label>
          <input 
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{
              width: '100%', padding: '0.75rem', border: '1px solid #e2e8f0', 
              borderRadius: '4px', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: '#2d3748' }}>Password</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%', padding: '0.75rem', border: '1px solid #e2e8f0', 
              borderRadius: '4px', boxSizing: 'border-box'
            }}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{
            width: '100%', padding: '0.75rem', background: '#3182ce', 
            color: 'white', border: 'none', borderRadius: '4px', 
            fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
