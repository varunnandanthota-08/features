import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api';

export default function PatientProfile() {
  const { user, logout } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
    gender: 'prefer_not_to_say',
    village: '',
    language: 'en'
  });
  const [patientIdDisplay, setPatientIdDisplay] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Password update state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await apiRequest('/api/patients/me');
        if (res?.data) {
          const p = res.data.patient;
          const u = res.data.user;
          setFormData({
            name: p?.name || u?.name || '',
            phone: p?.phone || u?.phone || '',
            age: p?.age !== undefined && p?.age !== null ? String(p.age) : '',
            gender: p?.gender || 'prefer_not_to_say',
            village: p?.location?.village || '',
            language: p?.language || 'en'
          });
          setPatientIdDisplay(p?._id || u?.patientId || '');
        }
      } catch (err) {
        if (user) {
          setFormData({
            name: user.name || '',
            phone: user.phone || '',
            age: user.age || '',
            gender: user.gender || 'prefer_not_to_say',
            village: user.village || user.location?.village || '',
            language: user.language || 'en'
          });
          setPatientIdDisplay(user.patientId || '');
        }
      }
    }
    loadProfile();
  }, [user]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await apiRequest('/api/patients/me', {
        method: 'PUT',
        body: JSON.stringify(formData)
      });
      if (res?.data?.patient) {
        const p = res.data.patient;
        const u = res.data.user;
        setFormData({
          name: p?.name || u?.name || formData.name,
          phone: p?.phone || u?.phone || formData.phone,
          age: p?.age !== undefined && p?.age !== null ? String(p.age) : formData.age,
          gender: p?.gender || formData.gender,
          village: p?.location?.village || formData.village,
          language: p?.language || formData.language
        });
        setPatientIdDisplay(p?._id || u?.patientId || patientIdDisplay);
      }
      setMessage({ text: 'Health profile updated successfully!', type: 'success' });
    } catch (err) {
      setMessage({ text: err.message || 'Failed to update profile.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = (e) => {
    setPasswordData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordMessage({ text: '', type: '' });

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ text: 'New password and confirmation do not match.', type: 'error' });
      setPasswordLoading(false);
      return;
    }

    try {
      await apiRequest('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify(passwordData)
      });
      setPasswordMessage({ text: 'Password updated successfully!', type: 'success' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordMessage({ text: err.message || 'Failed to update password.', type: 'error' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="details-page" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      <header className="cc-header">
        <div className="cc-header-main">
          <h1>My Health Profile</h1>
          <p className="cc-subtitle">Keep your health information up to date.</p>
        </div>
        <div className="cc-header-context">
          <Link to="/patient" style={{ textDecoration: 'none' }}>
            <div className="cc-user" style={{ cursor: 'pointer' }}>
              <div className="cc-identity-text">
                <strong>Back to Dashboard</strong>
              </div>
            </div>
          </Link>
        </div>
      </header>

      {message.text && (
        <div style={{ padding: '1rem', marginBottom: '2rem', borderRadius: '8px', background: message.type === 'success' ? 'var(--teal-soft)' : 'var(--red-soft)', color: message.type === 'success' ? 'var(--teal-dark)' : 'var(--red)', border: `1px solid ${message.type === 'success' ? 'var(--teal)' : 'var(--red)'}` }}>
          {message.text}
        </div>
      )}

      <div className="care-workspace-grid" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column' }}>
        <section className="details-panel" aria-labelledby="personal-info-heading">
          <h2 id="personal-info-heading">Complete Health Profile</h2>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
            
            <div className="form-group">
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Full Name</label>
              <input 
                type="text" 
                name="name" 
                value={formData.name} 
                onChange={handleChange}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                placeholder="Your full name"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Age</label>
                <input 
                  type="number" 
                  name="age" 
                  value={formData.age} 
                  onChange={handleChange}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                  min="1" max="120"
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Gender</label>
                <select 
                  name="gender" 
                  value={formData.gender} 
                  onChange={handleChange}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                >
                  <option value="prefer_not_to_say">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Village / Location</label>
              <input 
                type="text" 
                name="village" 
                value={formData.village} 
                onChange={handleChange}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
                placeholder="Your village or town"
                required
              />
            </div>

            <div className="form-group">
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Preferred Language</label>
              <select 
                name="language" 
                value={formData.language} 
                onChange={handleChange}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)' }}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="te">Telugu</option>
              </select>
            </div>

            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Phone Number *</label>
              <input 
                type="tel"
                name="phone"
                value={formData.phone} 
                onChange={handleChange}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: user?.phone ? 'var(--paper)' : '#fff', color: user?.phone ? 'var(--muted)' : 'var(--ink)' }}
                disabled={!!user?.phone}
                required
                placeholder="+91..."
              />
              {!user?.phone && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Please provide your phone number to link your health profile.</span>}
            </div>
            
            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>Patient ID (Read Only)</label>
              <input 
                type="text" 
                value={patientIdDisplay || user?.patientId || 'Pending Assignment'} 
                disabled
                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--muted)' }}
              />
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button 
                type="submit" 
                disabled={loading}
                style={{ padding: '1rem 2rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: loading ? 'wait' : 'pointer' }}
              >
                {loading ? 'Saving...' : 'Update Health Profile'}
              </button>
            </div>

          </form>
        </section>

        <section className="details-panel" aria-labelledby="account-settings-heading" style={{ marginTop: '1.5rem' }}>
          <h2 id="account-settings-heading">Account Settings</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Manage your account security and preferences.</p>
          
          {passwordMessage.text && (
            <div style={{ padding: '0.8rem 1rem', marginBottom: '1.5rem', borderRadius: '8px', background: passwordMessage.type === 'success' ? 'var(--teal-soft)' : 'var(--red-soft)', color: passwordMessage.type === 'success' ? 'var(--teal-dark)' : 'var(--red)', border: `1px solid ${passwordMessage.type === 'success' ? 'var(--teal)' : 'var(--red)'}`, fontSize: '0.9rem' }}>
              {passwordMessage.text}
            </div>
          )}

          {!showPasswordForm ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button 
                className="action-button" 
                style={{ alignSelf: 'flex-start', background: 'var(--paper)', color: 'var(--ink)' }}
                onClick={() => { setShowPasswordForm(true); setPasswordMessage({ text: '', type: '' }); }}
              >
                Update Password
              </button>
              <button className="action-button action-button-secondary" style={{ alignSelf: 'flex-start' }} onClick={logout}>Sign Out</button>
            </div>
          ) : (
            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', maxWidth: '500px', background: 'var(--paper)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--line)' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--ink)' }}>Change Your Password</h3>
              
              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Current Password *</label>
                <input 
                  type="password" 
                  name="currentPassword" 
                  value={passwordData.currentPassword} 
                  onChange={handlePasswordChange}
                  required
                  placeholder="Enter current password"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>New Password *</label>
                <input 
                  type="password" 
                  name="newPassword" 
                  value={passwordData.newPassword} 
                  onChange={handlePasswordChange}
                  required
                  placeholder="At least 6 characters"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.85rem' }}>Confirm New Password *</label>
                <input 
                  type="password" 
                  name="confirmPassword" 
                  value={passwordData.confirmPassword} 
                  onChange={handlePasswordChange}
                  required
                  placeholder="Repeat new password"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--line)', background: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button 
                  type="submit" 
                  disabled={passwordLoading}
                  style={{ padding: '0.75rem 1.5rem', background: 'var(--teal)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: passwordLoading ? 'wait' : 'pointer' }}
                >
                  {passwordLoading ? 'Updating...' : 'Save Password'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowPasswordForm(false)}
                  style={{ padding: '0.75rem 1.5rem', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
