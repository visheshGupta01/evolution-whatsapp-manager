import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell';
import { Topbar } from './components/layout/Topbar';
import { SessionsPage } from './pages/SessionsPage';
import { SendMessagePage } from './pages/SendMessagePage';
import { InteractiveCampaignPage } from './pages/InteractiveCampaignPage';
import { CreateSessionModal } from './components/sessions/CreateSessionModal';
import { useState } from 'react';
import { useSessions } from './hooks/use-sessions';

export function App() {
  const [createOpen, setCreateOpen] = useState(false);
  const { refetch } = useSessions();
  return <BrowserRouter>
    <Toaster theme="dark" position="bottom-right" richColors />
    <AppShell>
      <Topbar onRefresh={() => void refetch()} onAdd={() => setCreateOpen(true)} />
      <main><Routes>
        <Route path="/" element={<Navigate to="/sessions" replace />} />
        <Route path="/sessions" element={<SessionsPage onCreate={() => setCreateOpen(true)} />} />
        <Route path="/send" element={<SendMessagePage />} />
        <Route path="/send/interactive" element={<InteractiveCampaignPage />} />
        <Route path="*" element={<Navigate to="/sessions" replace />} />
      </Routes></main>
      {createOpen && <CreateSessionModal close={() => setCreateOpen(false)} />}
    </AppShell>
  </BrowserRouter>;
}
