import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { label: 'Overview', to: '/' },
  { label: 'Emergency alerts', to: '/emergency-alerts' },
  { label: 'Cases', to: '/cases' },
  { label: 'Health centres', to: '/health-centres' }
];

export default function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">RH</div>
        <div>
          <p className="brand-kicker">Rural Health</p>
          <p className="brand-name">Operations</p>
        </div>
        <nav className="main-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              end={item.to === '/'}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-note">Frontend foundation</p>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
