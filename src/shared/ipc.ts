/**
 * Контракт IPC между main и renderer (§9 плана): типы `window.api` и имена каналов.
 * Renderer не имеет доступа к Node — всё только через эти методы.
 */
import type { ChangeEntry, PunishKind, Rule, RuleDoc } from './schema';

/** Репозиторий проекта: Issues, Releases */
export const REPO_URL = 'https://github.com/sdobnikovivan7-source/nova-rules';

/** Тема на форуме по id — для документов, которых уже нет в данных */
export const threadUrl = (docId: number) => `https://forum.grand-rp.su/threads/${docId}/`;

export type Theme = 'dark' | 'light' | 'system';
export type SyncMode = 'auto' | 'direct';

export type Settings = {
  theme: Theme;
  /** 0.9 … 1.4 */
  fontScale: number;
  autostart: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  /** Accelerator Electron, например 'Control+Shift+Space' */
  hotkey: string;
  quickAlwaysOnTop: boolean;
  notifyChanges: boolean;
  syncMode: SyncMode;
  /** Окно первого запуска уже показано */
  onboarded: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  fontScale: 1,
  autostart: false,
  startMinimized: false,
  closeToTray: true,
  hotkey: 'Control+Shift+Space',
  quickAlwaysOnTop: false,
  notifyChanges: true,
  syncMode: 'auto',
  onboarded: false,
};

export const FONT_SCALE_MIN = 0.9;
export const FONT_SCALE_MAX = 1.4;

export type CategoryView = {
  id: string;
  title: string;
  fullTitle: string;
  icon: string;
  order: number;
  docCount: number;
};

export type DocSummary = {
  id: number;
  categoryId: string;
  title: string;
  url: string;
  createdAt: string;
  editedAt?: string;
  important: boolean;
  ruleCount: number;
};

/** Пункт с контекстом: для правой панели, избранного, копирования */
export type RuleView = Rule & {
  docId: number;
  docTitle: string;
  docUrl: string;
  categoryId: string;
  sectionTitle: string | null;
  /** «Документ › Раздел» */
  path: string;
};

/** Плоская строка для индекса поиска */
export type SearchRow = {
  id: string;
  docId: number;
  categoryId: string;
  docTitle: string;
  sectionTitle: string | null;
  number: string | null;
  text: string;
  /** Текст примечаний через пробел */
  notes: string;
  /** Наказание как в правилах («JAIL до 90 минут») */
  punish: string | null;
  punishKinds: PunishKind[];
  important: boolean;
};

export type ChangeView = ChangeEntry & { seen: boolean };

export type Favorite = {
  ruleId: string;
  /** Текст пункта на момент добавления */
  snapshot: string;
  addedAt: string;
  /** null — пункта больше нет в правилах */
  rule: RuleView | null;
  changed: boolean;
};

/**
 * idle — данные актуальны; checking — идёт проверка (в режиме direct — «Загрузка с форума»);
 * offline — нет сети, показываются сохранённые данные; error — прочая ошибка.
 */
export type SyncState = 'idle' | 'checking' | 'offline' | 'error';

export type SyncStatus = {
  state: SyncState;
  /** Каким способом идёт / шла последняя синхронизация */
  mode: 'central' | 'direct';
  /** Последняя успешная проверка */
  lastSuccessAt?: string;
  dataVersion: number;
  /** Когда данные последний раз изменились */
  dataBuiltAt?: string;
  error?: string;
  /** Данные требуют более новой версии приложения (schemaVersion / minAppVersion) */
  appOutdated?: boolean;
};

/**
 * Обновление приложения: checking — идёт проверка; downloading — скачивается в фоне;
 * ready — скачано, установится при перезапуске или выходе.
 */
export type UpdateStatus = {
  state: 'idle' | 'checking' | 'downloading' | 'ready';
  version?: string;
  /** Скачано, % */
  percent?: number;
};

export type AppInfo = {
  version: string;
  dataVersion: number;
  dataBuiltAt?: string;
  /** Глобальная горячая клавиша зарегистрирована (не занята другой программой) */
  hotkeyRegistered: boolean;
};

/** Что выбрали в контекстном меню пункта (выполняет renderer — с тостом и обновлением) */
export type RuleMenuAction = 'copy' | 'favorite' | 'forum' | 'report';

export type ChangesQuery = { days?: number; categoryId?: string };

/** Пользовательские счётчики для боковой панели и кнопок «В избранное» */
export type UserState = { unseenChanges: number; favoriteIds: string[] };

/** Методы «запрос — ответ» (ipcRenderer.invoke ↔ ipcMain.handle) */
export interface InvokeApi {
  getCategories(): Promise<CategoryView[]>;
  getDocs(categoryId: string): Promise<DocSummary[]>;
  getDoc(docId: number): Promise<RuleDoc | null>;
  getRule(ruleId: string): Promise<RuleView | null>;
  getSearchCorpus(): Promise<SearchRow[]>;
  getSynonyms(): Promise<Record<string, string[]>>;
  getChanges(query?: ChangesQuery): Promise<ChangeView[]>;
  /** Без ids — все */
  markChangesSeen(ids?: string[]): Promise<void>;

  getFavorites(): Promise<Favorite[]>;
  /** → true, если пункт теперь в избранном */
  toggleFavorite(ruleId: string): Promise<boolean>;
  getUserState(): Promise<UserState>;

  syncNow(): Promise<void>;
  getSyncStatus(): Promise<SyncStatus>;

  /** Только белый список доменов (forum.grand-rp.su, репозиторий проекта) */
  openExternal(url: string): Promise<void>;
  /** Текст пункта + номер + ссылка в буфер обмена (§10.6) */
  copyRule(ruleId: string): Promise<void>;
  /** Системное контекстное меню пункта → выбранное действие (null — меню закрыли) */
  showRuleMenu(ruleId: string): Promise<RuleMenuAction | null>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  openLogsFolder(): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  getUpdateStatus(): Promise<UpdateStatus>;
  /** Перезапустить и установить скачанное обновление */
  installUpdate(): Promise<void>;
}

export const INVOKE_METHODS = [
  'getCategories',
  'getDocs',
  'getDoc',
  'getRule',
  'getSearchCorpus',
  'getSynonyms',
  'getChanges',
  'markChangesSeen',
  'getFavorites',
  'toggleFavorite',
  'getUserState',
  'syncNow',
  'getSyncStatus',
  'openExternal',
  'copyRule',
  'showRuleMenu',
  'getSettings',
  'setSettings',
  'openLogsFolder',
  'getAppInfo',
  'getUpdateStatus',
  'installUpdate',
] as const satisfies readonly (keyof InvokeApi)[];

// все методы InvokeApi перечислены в INVOKE_METHODS
type _AllListed =
  Exclude<keyof InvokeApi, (typeof INVOKE_METHODS)[number]> extends never ? true : never;
export const _allListed: _AllListed = true;

export const invokeChannel = (method: keyof InvokeApi) => `api:${method}`;

/** События main → renderer */
export const EVENTS = {
  syncStatus: 'event:syncStatus',
  dataUpdated: 'event:dataUpdated',
  /** Изменилось избранное или «просмотрено» (из любого окна) */
  userStateChanged: 'event:userStateChanged',
  /** Перейти по hash-маршруту (из трея, быстрого поиска, уведомления) */
  navigate: 'event:navigate',
  /** Настройки изменились (в любом окне) — новое значение */
  settingsChanged: 'event:settingsChanged',
  /** Окно быстрого поиска показано — фокус в поле */
  quickShown: 'event:quickShown',
  updateStatus: 'event:updateStatus',
} as const;

/** Команды renderer → main без ответа */
export const COMMANDS = {
  windowMinimize: 'cmd:windowMinimize',
  windowClose: 'cmd:windowClose',
  quickShow: 'cmd:quickShow',
  quickHide: 'cmd:quickHide',
  quickOpenInMain: 'cmd:quickOpenInMain',
  /** Забыть положение и размер быстрого поиска — снова по центру */
  quickResetBounds: 'cmd:quickResetBounds',
  /** Запись нового сочетания в настройках: снять / вернуть глобальную клавишу */
  hotkeyPause: 'cmd:hotkeyPause',
} as const;

export interface Api extends InvokeApi {
  onSyncStatus(cb: (s: SyncStatus) => void): () => void;
  onDataUpdated(cb: () => void): () => void;
  onUserStateChanged(cb: () => void): () => void;
  onNavigate(cb: (route: string) => void): () => void;
  onSettingsChanged(cb: (s: Settings) => void): () => void;
  onQuickShown(cb: () => void): () => void;
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void;
  window: { minimize(): void; close(): void };
  quick: { show(): void; hide(): void; openInMain(route: string): void; resetBounds(): void };
  pauseHotkey(pause: boolean): void;
}
