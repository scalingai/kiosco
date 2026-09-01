import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, Truck } from 'lucide-react';

export default function Layout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">KIOSCO</div>
        <ul className="sidebar-nav">
          <li>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
              <BarChart3 size={18} /> Resumen Anual
            </NavLink>
          </li>
          <li>
            <NavLink to="/proveedores" className={({ isActive }) => isActive ? 'active' : ''}>
              <Truck size={18} /> Proveedores
            </NavLink>
          </li>
        </ul>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
