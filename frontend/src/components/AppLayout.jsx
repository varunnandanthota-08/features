import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const navigation = [
  { label: 'Dashboard', shortLabel: 'DB', to: '/' },
  { label: 'Cases', shortLabel: 'CS', to: '/cases' },
  { label: 'Emergencies', shortLabel: 'EM', to: '/emergency-alerts' },
  { label: 'Referrals', shortLabel: 'RF', to: '/referrals', unavailable: true },
  { label: 'Patients', shortLabel: 'PT', to: '/patients', unavailable: true },
  { label: 'Documents', shortLabel: 'DC', to: '/documents', unavailable: true }
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isPatient = user?.role === 'PATIENT';
  const navItems = isPatient ? [
    { label: 'Patient Portal', shortLabel: 'PP', to: '/patient-portal' }
  ] : navigation;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">+</div>
          <div>
            <p className="brand-kicker">Rural Health</p>
            <p className="brand-name">CareOS</p>
          </div>
        </div>
        <div className="sidebar-context">
          <span className="context-dot" />
          <div>
            <strong>{isPatient ? 'Patient access' : 'Field operations'}</strong>
            <span>{isPatient ? 'Patient portal' : 'Health worker portal'}</span>
          </div>
        </div>
        <div className="sidebar-nav-label">Workspace</div>
        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavLink
              aria-disabled={item.unavailable ? 'true' : undefined}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${item.unavailable ? ' unavailable' : ''}`}
              end={item.to === '/'}
              key={item.to}
              title={item.unavailable ? `${item.label} is not connected yet` : item.label}
              to={item.to}
            >
              <span className="nav-icon">{item.shortLabel}</span>
              <span>{item.label}</span>
              {item.unavailable && <span className="nav-soon">Soon</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-avatar">{isPatient ? 'PT' : 'HW'}</div>
          <div className="user-copy">
            <strong>{user?.username || 'User'}</strong>
            <span>{isPatient ? 'Patient' : 'Health Worker'}</span>
          </div>
          <button className="user-menu" onClick={handleLogout} title="Logout" style={{background:'none', border:'none', cursor:'pointer', color:'#a0aec0'}}>
            Logout
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
