import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';

export default function WorkerProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [healthCenter, setHealthCenter] = useState(null);

  useEffect(() => {
    if (user?.healthCenterId) {
      apiRequest(`/api/health-centers/${encodeURIComponent(user.healthCenterId)}`)
        .then(res => {
          if (res.data) setHealthCenter(res.data);
        })
        .catch(() => {});
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Calculate completeness based on real fields present
  const fields = [
    user?.username,
    user?.name,
    user?.email,
    user?.phone,
    user?.healthCenterId
  ];
  const filledFields = fields.filter(Boolean).length;
  const completenessPercent = Math.round((filledFields / fields.length) * 100);

  const workerIdDisplay = user?.workerId || user?.userId || user?._id || `HW-${user?.username?.toUpperCase()}`;

  return (
    <div className="worker-profile-page" style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '4rem' }}>
      <header className="page-topline" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', margin: '0 0 0.5rem', color: 'var(--ink)' }}>Health Worker Profile</h1>
          <p className="intro" style={{ margin: 0, color: 'var(--muted)' }}>
            Authenticated workforce identity and operational facility assignment.
          </p>
        </div>
      </header>

      <div className="cc-section" style={{ background: '#fff', padding: '2.5rem', borderRadius: '16px', border: '1px solid var(--line)', boxShadow: 'var(--shadow-soft)' }}>
        
        {/* Worker Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid var(--line)' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--teal-soft)', color: 'var(--teal-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 800 }}>
            {user?.name ? user.name.charAt(0).toUpperCase() : user?.username?.charAt(0).toUpperCase() || 'W'}
          </div>
          <div>
            <h2 style={{ margin: '0 0 0.25rem', color: 'var(--ink)', fontSize: '1.6rem' }}>
              {user?.name || user?.username || 'Health Worker'}
            </h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.95rem' }}>
              Role: <strong style={{ color: 'var(--ink)' }}>Field Health Worker</strong> • Status: <span style={{ color: 'var(--teal)', fontWeight: 700 }}>Active</span>
            </p>
          </div>
        </div>

        {/* Profile Completeness Indicator */}
        <div style={{ background: 'var(--paper)', padding: '1.25rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--ink)' }}>Profile Completeness</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--teal)' }}>{completenessPercent}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'var(--line)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${completenessPercent}%`, height: '100%', background: 'var(--teal)', borderRadius: '4px' }}></div>
          </div>
        </div>

        {/* Actual Profile Fields Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, marginBottom: '0.4rem' }}>
              Full Name
            </label>
            <input 
              type="text" 
              value={user?.name || user?.username || ''} 
              disabled 
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', fontWeight: 600 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, marginBottom: '0.4rem' }}>
              Email / Username
            </label>
            <input 
              type="text" 
              value={user?.email || user?.username || ''} 
              disabled 
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', fontWeight: 600 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, marginBottom: '0.4rem' }}>
              Phone Number
            </label>
            <input 
              type="text" 
              value={user?.phone || 'Not provided'} 
              disabled 
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', fontWeight: 600 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, marginBottom: '0.4rem' }}>
              Worker ID
            </label>
            <input 
              type="text" 
              value={workerIdDisplay} 
              disabled 
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', fontWeight: 600 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, marginBottom: '0.4rem' }}>
              Assigned Health Centre
            </label>
            <input 
              type="text" 
              value={healthCenter?.name || user?.healthCenterId || 'Unassigned'} 
              disabled 
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', fontWeight: 600 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, marginBottom: '0.4rem' }}>
              Centre Location
            </label>
            <input 
              type="text" 
              value={healthCenter ? `${healthCenter.village || healthCenter.location?.village || ''}, ${healthCenter.district || ''}` : 'Regional Network'} 
              disabled 
              style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink)', fontWeight: 600 }}
            />
          </div>

        </div>

        {/* Action Buttons */}
        <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            {user?.healthCenterId && (
              <button 
                onClick={() => navigate(`/health-centres/${user.healthCenterId}`)}
                style={{ padding: '0.8rem 1.6rem', background: 'var(--teal)', border: 'none', color: '#fff', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
              >
                View Health Centre Profile →
              </button>
            )}
          </div>
          <button 
            onClick={handleLogout}
            style={{ padding: '0.8rem 1.6rem', background: '#fff', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
          >
            Logout
          </button>
        </div>

      </div>
    </div>
  );
}
