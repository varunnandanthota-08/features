import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import NotificationsDropdown from './NotificationsDropdown';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isPatient = user?.role === 'PATIENT';
  
  const workerNavigation = [
    { label: 'Dashboard', shortLabel: 'DB', to: '/worker' },
    { label: 'Cases', shortLabel: 'CS', to: '/worker/cases' },
    { label: 'Emergencies', shortLabel: 'EM', to: '/worker/emergencies' },
    { label: 'Referrals', shortLabel: 'RF', to: '/worker/referrals' },
    { label: 'Patients', shortLabel: 'PT', to: '/worker/patients' },
    { label: 'Documents', shortLabel: 'DC', to: '/worker/documents' },
    { label: 'Health Centres', shortLabel: 'HC', to: '/worker/health-centres' },
    { label: 'Profile', shortLabel: 'PR', to: '/worker/profile' }
  ];

  const patientNavigation = [
    { label: 'Dashboard', shortLabel: 'DB', to: '/patient' },
    { label: 'My Cases', shortLabel: 'MC', to: '/patient/cases' },
    { label: 'My Referrals', shortLabel: 'RF', to: '/patient/referrals' },
    { label: 'Medical Records', shortLabel: 'MR', to: '/patient/medical-records' },
    { label: 'Prescriptions', shortLabel: 'PR', to: '/patient/prescriptions' },
    { label: 'Lab Reports', shortLabel: 'LR', to: '/patient/lab-reports' },
    { label: 'Profile', shortLabel: 'PF', to: '/patient/profile' }
  ];

  const navItems = isPatient ? patientNavigation : workerNavigation;

  const isNavActive = (itemTo) => {
    if (itemTo === '/worker') {
      return pathname === '/worker';
    }
    if (itemTo === '/patient') {
      return pathname === '/patient';
    }
    if (itemTo === '/worker/cases') {
      return pathname === '/worker/cases' || pathname.startsWith('/worker/cases/') || pathname.startsWith('/worker/case-details/case/');
    }
    if (itemTo === '/worker/emergencies') {
      return pathname === '/worker/emergencies' || pathname.startsWith('/worker/emergencies/') || pathname.startsWith('/worker/case-details/emergency/');
    }
    if (itemTo === '/worker/referrals') {
      return pathname === '/worker/referrals' || pathname.startsWith('/worker/referrals/');
    }
    return pathname === itemTo || pathname.startsWith(itemTo + '/');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div className="brand-mark" style={{ fontSize: '1.2rem', height: '2.2rem', width: '2.2rem' }}>C</div>
          <div>
            <p className="brand-kicker" style={{ fontSize: '0.55rem' }}>CareOS</p>
            <p className="brand-name" style={{ fontSize: '1rem', marginTop: 0 }}>Platform</p>
          </div>
        </div>
        <div className="sidebar-context">
          <span className="context-dot" />
          <div>
            <strong>{isPatient ? 'Patient Portal' : 'Field Operations'}</strong>
            <span>{user?.healthCenterId || 'Network access'}</span>
          </div>
        </div>
        <div className="sidebar-nav-label">Workspace</div>
        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = isNavActive(item.to);
            return (
              <NavLink
                className={`nav-link${active ? ' active' : ''}`}
                key={item.label}
                to={item.to}
              >
                <span className="nav-icon">{item.shortLabel}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-avatar">{isPatient ? 'PT' : 'HW'}</div>
          <div className="user-copy">
            <strong>{user?.name || user?.username || 'User'}</strong>
            <span>{isPatient ? 'Patient' : 'Health Worker'}</span>
          </div>
          <button className="user-menu" onClick={handleLogout} title="Logout" style={{background:'none', border:'none', cursor:'pointer', color:'#a0aec0'}}>
            Logout
          </button>
        </div>
      </aside>
      <main className="main-content">
        {!['/worker', '/'].includes(location.pathname) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <NotificationsDropdown />
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
