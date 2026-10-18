import { create } from 'zustand';
import type { AppInfo, CategoryView, Settings, SyncStatus } from '@shared/ipc';
import { api } from './api';

type AppState = {
  ready: boolean;
  categories: CategoryView[];
  settings: Settings | null;
  sync: SyncStatus | null;
  info: AppInfo | null;
  /** Растёт при каждом `data:updated` — экраны перечитывают данные */
  dataRevision: number;
  load(): Promise<void>;
  reloadData(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
};

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  categories: [],
  settings: null,
  sync: null,
  info: null,
  dataRevision: 0,

  async load() {
    const [categories, settings, sync, info] = await Promise.all([
      api.getCategories(),
      api.getSettings(),
      api.getSyncStatus(),
      api.getAppInfo(),
    ]);
    set({ categories, settings, sync, info, ready: true });
  },

  async reloadData() {
    const [categories, info] = await Promise.all([api.getCategories(), api.getAppInfo()]);
    set({ categories, info, dataRevision: get().dataRevision + 1 });
  },

  async updateSettings(patch) {
    set({ settings: await api.setSettings(patch) });
  },
}));

/** Подписка на события main → renderer; вызывается один раз при старте */
export function subscribeToMain(navigate: (route: string) => void): () => void {
  const offs = [
    api.onSyncStatus((sync) => useApp.setState({ sync })),
    api.onDataUpdated(() => void useApp.getState().reloadData()),
    api.onNavigate(navigate),
  ];
  return () => offs.forEach((off) => off());
}
