import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { UserMenu } from '../components/UserMenu';

export function AppShell() {
  const location = useLocation();
  const isWall = location.pathname.startsWith('/wall');

  if (isWall) {
    return <Outlet />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <span className="brand-title">Alamida</span>
            <span className="brand-sub">Monitoring</span>
          </div>
        </div>
        <nav className="topbar-nav" aria-label="Hauptnavigation">
          <NavLink
            to="/disposition"
            className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')}
          >
            Disposition
          </NavLink>
          <NavLink to="/wall" className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')}>
            Wandmonitor
          </NavLink>
          <NavLink to="/widgets" className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')}>
            Widgets
          </NavLink>
        </nav>
        <ThemeSwitch />
        <UserMenu />
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
