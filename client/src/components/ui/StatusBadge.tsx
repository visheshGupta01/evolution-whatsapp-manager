export function StatusBadge({ connected, pending, label }: { connected: boolean; pending: boolean; label?: string }) {
  const text = label || (connected ? 'Connected' : pending ? 'Connecting' : 'Offline');
  return <span className={`status ${connected ? 'online' : pending ? 'pending' : 'offline'}`}><i />{text}</span>;
}
