import { create } from 'zustand';
import type { AppInfo, CategoryView, Settings, SyncStatus, UpdateStatus } from '@shared/ipc';
import type { Stats } from '@shared/schema';
import { api } from './api';

type AppState = {
  ready: boolean;
  categories: CategoryView[];
  settings: Settings | null;
  sync: SyncStatus | null;
  info: AppInfo | null;
  /** Обновление приложения */
  update: UpdateStatus;
  /** Примерное число игроков (data/stats.json) */
  stats: Stats | null;
  /** Растёт при каждом `data:updated` — экраны перечитывают данные */
  dataRevision: number;
  unseenChanges: number;
  favoriteIds: Set<string>;
  /** Категория открытого документа — для подсветки в боковой панели */
  openDocCategory: string | null;
  /** Короткое сообщение внизу окна («Скопировано») */
  toast: { id: number; text: string } | null;
  load(): Promise<void>;
  reloadData(): Promise<void>;
  reloadUserState(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  toggleFavorite(ruleId: string): Promise<void>;
  showToast(text: string): void;
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  categories: [],
  settings: null,
  sync: null,
  info: null,
  update: { state: 'idle' },
  stats: null,
  dataRevision: 0,
  unseenChanges: 0,
  favoriteIds: new Set(),
  openDocCategory: null,
  toast: null,

  async load() {
    const [categories, settings, sync, info, update, stats] = await Promise.all([
      api.getCategories(),
      api.getSettings(),
      api.getSyncStatus(),
      api.getAppInfo(),
      api.getUpdateStatus(),
      api.getStats(),
      get().reloadUserState(),
    ]);
    set({ categories, settings, sync, info, update, stats, ready: true });
  },

  async reloadData() {
    const [categories, info] = await Promise.all([
      api.getCategories(),
      api.getAppInfo(),
      get().reloadUserState(),
    ]);
    set({ categories, info, dataRevision: get().dataRevision + 1 });
  },

  async reloadUserState() {
    const u = await api.getUserState();
    set({ unseenChanges: u.unseenChanges, favoriteIds: new Set(u.favoriteIds) });
  },

  async updateSettings(patch) {
    set({ settings: await api.setSettings(patch) });
  },

  async toggleFavorite(ruleId) {
    const on = await api.toggleFavorite(ruleId);
    get().showToast(on ? 'Добавлено в избранное' : 'Убрано из избранного');
  },

  showToast(text) {
    clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), text } });
    toastTimer = setTimeout(() => set({ toast: null }), 1800);
  },
}));

/** Подписка на события main → renderer; вызывается один раз при старте */
export function subscribeToMain(navigate: (route: string) => void): () => void {
  const offs = [
    api.onSyncStatus((sync) => useApp.setState({ sync })),
    api.onUpdateStatus((update) => useApp.setState({ update })),
    api.onStatsUpdated((stats) => useApp.setState({ stats })),
    api.onDataUpdated(() => void useApp.getState().reloadData()),
    api.onUserStateChanged(() => void useApp.getState().reloadUserState()),
    api.onSettingsChanged((settings) => {
      useApp.setState({ settings });
      // сменилась горячая клавиша — обновить «занято / свободно»
      void api.getAppInfo().then((info) => useApp.setState({ info }));
    }),
    api.onNavigate(navigate),
  ];
  return () => offs.forEach((off) => off());
}
