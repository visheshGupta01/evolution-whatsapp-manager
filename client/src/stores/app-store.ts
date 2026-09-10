import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

type AppState = {
  theme: Theme;
  sidebarCollapsed: boolean;
  selectedInstance: string | null;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSelectedInstance: (instance: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  theme: 'system',
  sidebarCollapsed: false,
  selectedInstance: null,
  setTheme: (theme) => set({ theme }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSelectedInstance: (selectedInstance) => set({ selectedInstance }),
}));
