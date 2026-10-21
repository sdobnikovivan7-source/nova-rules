/**
 * Строка состояния (§7.10 дизайна): точка статуса + «Правила от …» → состояние →
 * «Проверить» (правила и новая версия приложения) → (справа) обновление, подсказка
 * горячей клавиши → версия.
 */
import { Check, CircleArrowUp, Download, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SyncStatus } from '@shared/ipc';
import { api } from '../api';
import { fmtDate, fmtHotkey } from '../format';
import { useApp } from '../store';

type View = { tone: 'ok' | 'busy' | 'warn'; text: string | null };

export function statusView(s: SyncStatus): View {
  switch (s.state) {
    case 'checking':
      return { tone: 'busy', text: s.mode === 'direct' ? 'Загрузка с форума' : 'Проверяю…' };
    case 'offline':
      return {
        tone: 'warn',
        text: `${s.error ?? 'Нет сети'}, данные от ${fmtDate(s.dataBuiltAt) ?? '—'}`,
      };
    case 'error':
      return { tone: 'warn', text: s.error ?? 'Ошибка синхронизации' };
    default:
      if (s.mode === 'direct') return { tone: 'warn', text: 'Режим «напрямую с форума»' };
      // до первой проверки «Актуально» не обещаем
      return { tone: 'ok', text: s.lastSuccessAt ? 'Актуально' : null };
  }
}

/** Проверка короче — анимацию всё равно показываем столько, чтобы её было видно */
const MIN_SPIN_MS = 1100;
/** Сколько держится итог «Всё актуально» / «Найдена версия» */
const RESULT_MS = 2600;

type Phase = { kind: 'idle' } | { kind: 'checking' } | { kind: 'done'; text: string };

/**
 * «Проверить»: вращающийся значок и бегущая полоса, пока идёт проверка (по кнопке, F5, трею
 * или по расписанию), затем коротко итог. Найдена новая версия — справа появится её загрузка.
 */
function CheckButton({ busy }: { busy: boolean }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const run = async () => {
    clearTimeout(timer.current);
    setPhase({ kind: 'checking' });
    const started = Date.now();
    await api.syncNow().catch(() => undefined);
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_SPIN_MS - (Date.now() - started))));
    const { sync, update } = useApp.getState();
    if (sync?.state === 'error' || sync?.state === 'offline') {
      // причина уже написана рядом — «Нет сети», «Сервер данных недоступен»
      setPhase({ kind: 'idle' });
      return;
    }
    const found = update.state === 'downloading' || update.state === 'ready';
    setPhase({ kind: 'done', text: found ? `Найдена версия ${update.version}` : 'Всё актуально' });
    timer.current = setTimeout(() => setPhase({ kind: 'idle' }), RESULT_MS);
  };

  const checking = phase.kind === 'checking' || busy;
  const done = phase.kind === 'done' && !checking;
  return (
    <button
      type="button"
      className={`status-check${checking ? ' checking' : ''}${done ? ' done' : ''}`}
      disabled={checking}
      aria-busy={checking}
      onClick={() => void run()}
      title="Проверить обновления правил и новую версию приложения (F5)"
    >
      {done ? (
        <Check size={13} strokeWidth={2.6} className="status-check-icon" />
      ) : (
        <RefreshCw size={13} className={checking ? 'spin' : undefined} />
      )}
      <span aria-live="polite">{checking ? 'Проверяю…' : done ? phase.text : 'Проверить'}</span>
    </button>
  );
}

export function StatusBar() {
  const sync = useApp((s) => s.sync);
  const info = useApp((s) => s.info);
  const hotkey = useApp((s) => s.settings?.hotkey);
  const update = useApp((s) => s.update);
  if (!sync) return <footer className="statusbar" />;

  const date = fmtDate(sync.dataBuiltAt);
  const view = statusView(sync);
  const busy = sync.state === 'checking' || update.state === 'checking';

  return (
    <footer className="statusbar">
      <span className="status-date">
        <span className={`status-dot ${view.tone}`} aria-hidden />
        {date ? `Правила от ${date}` : 'Правил пока нет'}
      </span>
      {view.text && (
        <span className={`status-text ${view.tone}`} role="status">
          {view.text}
        </span>
      )}
      <CheckButton busy={busy} />
      <span className="status-right">
        {update.state === 'downloading' && (
          <span className="status-download" title="Новая версия скачивается в фоне">
            <Download size={13} />
            Загружаю версию {update.version} — {update.percent ?? 0} %
            <span className="status-download-bar" aria-hidden>
              <span style={{ width: `${update.percent ?? 0}%` }} />
            </span>
          </span>
        )}
        {update.state === 'ready' && (
          <button
            type="button"
            className="status-update"
            title="Перезапустить приложение и установить новую версию"
            onClick={() => void api.installUpdate()}
          >
            <CircleArrowUp size={13} />
            Доступна версия {update.version} — перезапустить
          </button>
        )}
        {hotkey && (
          <button
            type="button"
            className={`status-link${info?.hotkeyRegistered === false ? ' warn' : ''}`}
            title={
              info?.hotkeyRegistered === false
                ? 'Сочетание занято другой программой — выберите другое в настройках'
                : 'Открыть окно быстрого поиска'
            }
            onClick={() => api.quick.show()}
          >
            Быстрый поиск — {fmtHotkey(hotkey)}
            {info?.hotkeyRegistered === false && ' (занято)'}
          </button>
        )}
        <span className="mono status-version">v{info?.version}</span>
      </span>
    </footer>
  );
}
