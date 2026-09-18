import { NavLink } from 'react-router-dom';
import { FileText, Send, Smartphone, Zap, BarChart3, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAppStore } from '../../stores/app-store';

const items = [
  { to: '/sessions', label: 'Sessions', icon: Smartphone },
  { to: '/send', label: 'Send Message', icon: Send },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/campaigns', label: 'Campaigns', icon: BarChart3 },
  { to: '/audiences', label: 'Audiences', icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);

  return (
    <div className={`appShell ${collapsed ? 'sidebarCollapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebarBrand">
          <div className="brandMark"><Zap size={18} /></div>
          <div className="brandCopy"><strong>Evolution Manager</strong><span>WhatsApp control center</span></div>
        </div>
        <nav className="sidebarNav" aria-label="Primary navigation">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'navItem active' : 'navItem'}>
              <Icon size={17} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebarFooter"><span className="liveDot" /> Evolution API v2 · BFF connected</div>
      </aside>
      <div className="appContent">{children}</div>
    </div>
  );
}
