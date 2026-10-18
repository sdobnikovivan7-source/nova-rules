/**
 * Строка состояния (§7.10 дизайна): точка статуса + «Правила от …» → состояние →
 * «Проверить» → (справа) подсказка горячей клавиши → версия.
 */
import { CircleArrowUp, RefreshCw } from 'lucide-react';
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

export function StatusBar() {
  const sync = useApp((s) => s.sync);
  const info = useApp((s) => s.info);
  const hotkey = useApp((s) => s.settings?.hotkey);
  const update = useApp((s) => s.update);
  if (!sync) return <footer className="statusbar" />;

  const date = fmtDate(sync.dataBuiltAt);
  const view = statusView(sync);
  const busy = sync.state === 'checking';

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
      <button
        type="button"
        className="status-check"
        disabled={busy}
        onClick={() => void api.syncNow()}
        title="Проверить обновления правил (F5)"
      >
        <RefreshCw size={13} className={busy ? 'spin' : undefined} />
        Проверить
      </button>
      <span className="status-right">
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
