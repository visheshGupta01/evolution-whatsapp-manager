import type { ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) { return <div className="modalBackdrop" onMouseDown={e => e.currentTarget === e.target && close()}><div className="modal"><div className="modalHead"><strong>{title}</strong><button className="iconBtn" aria-label="Close" onClick={close}><X size={17}/></button></div>{children}</div></div>; }
