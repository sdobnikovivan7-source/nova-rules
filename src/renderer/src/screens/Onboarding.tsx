/**
 * Первый запуск (макета нет — стиль карточек настроек): что умеет приложение,
 * горячая клавиша быстрого поиска и ограничение полноэкранного режима, автозапуск.
 * Показывается поверх окна, пока в настройках не отмечено `onboarded`.
 */
import { BookOpen, History, Keyboard, Search } from 'lucide-react';
import { type ReactNode, useEffect, useId } from 'react';
import { Button, Kbd, Toggle } from '../components/ui';
import { hotkeyParts } from '../hotkey';
import { useApp } from '../store';

function Feature({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="onb-feature">
      <span className="onb-icon" aria-hidden>
        {icon}
      </span>
      <div>
        <div className="onb-feature-title">{title}</div>
        <div className="onb-feature-text">{children}</div>
      </div>
    </li>
  );
}

export function Onboarding() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const titleId = useId();
  const autostartId = useId();

  const done = () => void update({ onboarded: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void useApp.getState().updateSettings({ onboarded: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!settings) return null;
  return (
    <div className="onb-backdrop">
      <div className="onb" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="onb-head">
          <span className="brand-logo onb-logo" aria-hidden>
            <BookOpen size={22} strokeWidth={2.2} />
          </span>
          <div>
            <h1 id={titleId} className="onb-title">
              NOVA Rules
            </h1>
            <p className="onb-sub">Справочник правил NOVA RP — всегда под рукой</p>
          </div>
        </div>

        <ul className="onb-features">
          <Feature icon={<Search size={18} />} title="Поиск по всем правилам">
            По словам в любой форме, с опечатками и сленгом («дм», «рк», «капт») или по номеру
            пункта: «1.2», «крайм 1.2».
          </Feature>
          <Feature icon={<History size={18} />} title="Изменения в правилах">
            Правила проверяются каждый день. Что поменялось — видно в разделе «Изменения», о новых
            правках придёт уведомление.
          </Feature>
          <Feature icon={<Keyboard size={18} />} title="Быстрый поиск поверх игры">
            <span className="onb-keys">
              {hotkeyParts(settings.hotkey).map((k) => (
                <Kbd key={k} size="lg">
                  {k}
                </Kbd>
              ))}
            </span>
            Работает, когда игра запущена в режиме «В окне» или «Без рамки». В полноэкранном режиме
            Windows окно поверх игры не покажет. Сочетание можно сменить в настройках.
          </Feature>
        </ul>

        <div className="set-row onb-autostart">
          <div className="set-label">
            <div id={autostartId}>Запускать вместе с Windows</div>
            <div className="set-hint">
              Приложение будет ждать в трее — горячая клавиша сработает сразу
            </div>
          </div>
          <Toggle
            checked={settings.autostart}
            labelledBy={autostartId}
            onChange={(autostart) => void update({ autostart })}
          />
        </div>

        <div className="onb-foot">
          <p className="onb-disclaimer">
            Неофициальный справочник, не связан с администрацией NOVA RP. Актуальная редакция правил
            — на форуме проекта.
          </p>
          <Button variant="primary" autoFocus onClick={done}>
            Начать
          </Button>
        </div>
      </div>
    </div>
  );
}
