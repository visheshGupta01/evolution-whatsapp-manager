import { Menu, Plus, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/app-store';

const titles: Record<string, string> = {
  '/': 'Overview', '/sessions': 'Sessions', '/messages': 'Messages', '/settings': 'Settings',
};

export function Topbar({ onRefresh, onAdd }: { onRefresh: () => void; onAdd: () => void }) {
  const location = useLocation();
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  return (
    <header className="topbar">
      <div className="topbarTitle"><button className="iconBtn menuBtn" aria-label="Toggle navigation" onClick={toggleSidebar}><Menu size={18} /></button><div><span>WORKSPACE</span><strong>{titles[location.pathname] || 'Evolution Manager'}</strong></div></div>
      <div className="topActions"><button className="iconBtn" aria-label="Refresh sessions" onClick={onRefresh}><RefreshCw size={17} /></button><button className="primary" onClick={onAdd}><Plus size={16} /> Add session</button></div>
    </header>
  );
}
