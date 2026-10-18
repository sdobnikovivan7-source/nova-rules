/**
 * Настройки (макет «Настройки»): карточки «Внешний вид», «Быстрый поиск», «Запуск и трей»,
 * «Обновление правил», «О программе». Каждое изменение сразу сохраняется в main.
 */
import { Minus, Plus, RefreshCw } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  REPO_URL,
  type Settings as SettingsT,
  type SyncMode,
  type Theme,
} from '@shared/ipc';
import { api } from '../api';
import { WindowControls } from '../components/WindowControls';
import { Button, Kbd, SegmentGroup, Toggle } from '../components/ui';
import { changeFontScale } from '../fontScale';
import { fmtDay, fmtWhen } from '../format';
import { hotkeyFromEvent, hotkeyParts } from '../hotkey';
import { useApp } from '../store';

const THEMES = [
  { value: 'dark', label: 'Тёмная' },
  { value: 'light', label: 'Светлая' },
  { value: 'system', label: 'Как в Windows' },
] as const satisfies readonly { value: Theme; label: string }[];

const SYNC_MODES = [
  { value: 'auto', label: 'Автоматически' },
  { value: 'direct', label: 'С форума' },
] as const satisfies readonly { value: SyncMode; label: string }[];

function Card({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`set-card${wide ? ' wide' : ''}`}>
      <h2 className="set-card-title">{title}</h2>
      {children}
    </section>
  );
}

/** Строка настройки: подпись (+ пояснение) слева, элемент управления справа */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: (labelId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="set-row">
      <div className="set-label">
        <div id={id}>{label}</div>
        {hint && <div className="set-hint">{hint}</div>}
      </div>
      {children(id)}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  setting,
}: {
  label: string;
  hint?: string;
  setting: 'autostart' | 'startMinimized' | 'closeToTray' | 'quickAlwaysOnTop' | 'notifyChanges';
}) {
  const value = useApp((s) => s.settings?.[setting] ?? false);
  const update = useApp((s) => s.updateSettings);
  return (
    <Row label={label} hint={hint}>
      {(id) => (
        <Toggle checked={value} labelledBy={id} onChange={(v) => void update({ [setting]: v })} />
      )}
    </Row>
  );
}

/** Горячая клавиша: «Изменить» → нажать новое сочетание (Esc — отмена) */
function HotkeyRow({ settings }: { settings: SettingsT }) {
  const update = useApp((s) => s.updateSettings);
  const registered = useApp((s) => s.info?.hotkeyRegistered !== false);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    api.pauseHotkey(true);
    // в фазе перехвата на window: остальные клавиши окна (Ctrl+1…6, F5, Ctrl +/−) не срабатывают
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'keyup') {
        if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) setPreview([]);
        return;
      }
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setRecording(false);
        return;
      }
      const r = hotkeyFromEvent(e);
      if (r.kind === 'pending') {
        setPreview(hotkeyParts(r.parts.join('+')));
        setError(null);
      } else if (r.kind === 'invalid') {
        setError(r.reason);
      } else {
        setRecording(false);
        setError(null);
        update({ hotkey: r.accel }).catch(() =>
          setError(`${hotkeyParts(r.accel).join('+')} занято другой программой`),
        );
      }
    };
    const stop = () => setRecording(false);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', stop);
      api.pauseHotkey(false);
      setPreview([]);
    };
  }, [recording, update]);

  const keys = recording ? preview : hotkeyParts(settings.hotkey);
  return (
    <>
      <Row label="Горячая клавиша">
        {(id) => (
          <div className="set-hotkey" aria-labelledby={id}>
            <span className="set-keys" aria-live="polite">
              {recording && keys.length === 0 ? (
                <span className="set-recording">Нажмите сочетание…</span>
              ) : (
                keys.map((k) => (
                  <Kbd key={k} size="lg">
                    {k}
                  </Kbd>
                ))
              )}
            </span>
            <Button
              variant="outline"
              onClick={() => {
                setError(null);
                setRecording(!recording);
              }}
            >
              {recording ? 'Отмена' : 'Изменить'}
            </Button>
          </div>
        )}
      </Row>
      {recording && (
        <p className="set-note">Esc — отмена. Нужен Ctrl, Alt или Win; F1–F12 можно без них.</p>
      )}
      {error && <p className="set-note warn">{error}</p>}
      {!recording && !error && !registered && (
        <p className="set-note warn">Сочетание занято другой программой — выберите другое.</p>
      )}
    </>
  );
}

function FontScaleRow({ scale }: { scale: number }) {
  return (
    <Row label="Размер текста" hint="Ctrl + плюс или минус">
      {(id) => (
        <div className="set-stepper" role="group" aria-labelledby={id}>
          <Button
            variant="outline"
            size="sm"
            aria-label="Уменьшить"
            disabled={scale <= FONT_SCALE_MIN}
            onClick={() => changeFontScale(-0.1)}
          >
            <Minus size={15} />
          </Button>
          <span className="mono set-scale" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            aria-label="Увеличить"
            disabled={scale >= FONT_SCALE_MAX}
            onClick={() => changeFontScale(0.1)}
          >
            <Plus size={15} />
          </Button>
        </div>
      )}
    </Row>
  );
}

function SyncCard({ mode }: { mode: SyncMode }) {
  const update = useApp((s) => s.updateSettings);
  const sync = useApp((s) => s.sync);
  const busy = sync?.state === 'checking';
  const checked = sync?.lastSuccessAt
    ? `Проверено ${fmtWhen(sync.lastSuccessAt)}`
    : 'Ещё не проверялось';

  return (
    <Card title="Обновление правил">
      <ToggleRow
        label="Сообщать об изменениях"
        hint="Уведомление Windows после проверки"
        setting="notifyChanges"
      />
      <Row
        label="Откуда брать правила"
        hint={mode === 'direct' ? 'Каждый раз скачивать темы с форума — дольше' : undefined}
      >
        {() => (
          <SegmentGroup
            label="Откуда брать правила"
            variant="inset"
            value={mode}
            options={SYNC_MODES}
            onChange={(syncMode) => void update({ syncMode })}
          />
        )}
      </Row>
      <div className="set-row">
        <span className="set-hint" role="status">
          {busy ? (mode === 'direct' ? 'Загрузка с форума…' : 'Проверяю…') : checked}
          {!busy && sync?.state !== 'idle' && sync?.error && (
            <span className="warn"> · {sync.error}</span>
          )}
        </span>
        <Button
          variant="primary"
          disabled={busy}
          icon={<RefreshCw size={17} className={busy ? 'spin' : undefined} />}
          onClick={() => void api.syncNow()}
        >
          Проверить сейчас
        </Button>
      </div>
    </Card>
  );
}

/** Новая задача в GitHub Issues с версиями приложения и данных */
function bugReportUrl(version?: string, dataVersion?: number): string {
  const body = [
    `**Версия приложения:** ${version ?? '—'}`,
    `**Версия данных:** ${dataVersion ?? '—'}`,
    '',
    '**Что случилось:**',
    '',
  ].join('\n');
  return `${REPO_URL}/issues/new?${new URLSearchParams({ body }).toString()}`;
}

function AboutCard() {
  const info = useApp((s) => s.info);
  const data = info?.dataBuiltAt ? `данные от ${fmtDay(info.dataBuiltAt)}` : 'данных пока нет';
  return (
    <Card title="О программе" wide>
      <div className="set-about">
        <p className="set-about-text">
          Версия {info?.version ?? '—'}, {data}. Неофициальный справочник, не связан с
          администрацией NOVA RP. Без телеметрии: приложение обращается только к серверу с
          правилами, GitHub и форуму.
        </p>
        <div className="set-about-actions">
          <Button
            variant="outline"
            onClick={() => void api.openExternal(bugReportUrl(info?.version, info?.dataVersion))}
          >
            Сообщить об ошибке
          </Button>
          <Button variant="outline" onClick={() => void api.openLogsFolder()}>
            Папка логов
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function Settings() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);

  return (
    <section className="panel">
      <header className="screen-head">
        <h1 className="screen-title">Настройки</h1>
        <WindowControls />
      </header>
      {settings && (
        <div className="scroll">
          <div className="set-grid">
            <Card title="Внешний вид">
              <Row label="Тема">
                {() => (
                  <SegmentGroup
                    label="Тема"
                    variant="inset"
                    value={settings.theme}
                    options={THEMES}
                    onChange={(theme) => void update({ theme })}
                  />
                )}
              </Row>
              <FontScaleRow scale={settings.fontScale} />
            </Card>

            <Card title="Быстрый поиск">
              <HotkeyRow settings={settings} />
              <ToggleRow
                label="Не скрывать окно при переключении в игру"
                setting="quickAlwaysOnTop"
              />
              <p className="set-note">
                Окно появляется поверх игры в режимах «В окне» и «Без рамки». В полноэкранном режиме
                Windows его не покажет.
              </p>
            </Card>

            <Card title="Запуск и трей">
              <ToggleRow label="Запускать вместе с Windows" setting="autostart" />
              <ToggleRow label="Сразу сворачивать в трей" setting="startMinimized" />
              <ToggleRow
                label="Крестик сворачивает в трей"
                hint={
                  settings.closeToTray
                    ? 'Выход — через меню значка в трее'
                    : 'Крестик закрывает приложение'
                }
                setting="closeToTray"
              />
            </Card>

            <SyncCard mode={settings.syncMode} />
            <AboutCard />
          </div>
        </div>
      )}
    </section>
  );
}
