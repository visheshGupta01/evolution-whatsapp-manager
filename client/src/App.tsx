import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell';
import { Topbar } from './components/layout/Topbar';
import { DashboardPage } from './pages/DashboardPage';
import { SessionsPage } from './pages/SessionsPage';
import { MessagesPage } from './pages/MessagesPage';
import { ContactsPage } from './pages/ContactsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CreateSessionModal } from './components/sessions/CreateSessionModal';
import { useState } from 'react';
import { useSessions } from './hooks/use-sessions';
import { useRealtime } from './hooks/use-realtime';

export function App() {
  const [createOpen, setCreateOpen] = useState(false);
  const { refetch } = useSessions();
  useRealtime();

  return <BrowserRouter>
    <Toaster theme="dark" position="bottom-right" richColors />
    <AppShell>
      <Topbar onRefresh={() => void refetch()} onAdd={() => setCreateOpen(true)} />
      <main><Routes>
        <Route path="/" element={<DashboardPage onCreate={() => setCreateOpen(true)} />} />
        <Route path="/sessions" element={<SessionsPage onCreate={() => setCreateOpen(true)} />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes></main>
      {createOpen && <CreateSessionModal close={() => setCreateOpen(false)} />}
    </AppShell>
  </BrowserRouter>;
}
