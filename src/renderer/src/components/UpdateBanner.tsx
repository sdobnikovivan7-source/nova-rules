/**
 * Баннер над экраном, когда новые данные требуют версию приложения новее (§11.2):
 * обновление уже скачано — перезапустить; скачивается — прогресс; иначе — ссылка на Releases.
 */
import { CircleAlert } from 'lucide-react';
import { REPO_URL } from '@shared/ipc';
import { api } from '../api';
import { useApp } from '../store';
import { Button } from './ui';

export function UpdateBanner() {
  const outdated = useApp((s) => s.sync?.appOutdated);
  const update = useApp((s) => s.update);
  if (!outdated) return null;

  return (
    <div className="update-banner" role="alert">
      <CircleAlert size={18} />
      <span className="update-banner-text">
        Обновите приложение, чтобы получать новые правила.
        {update.state === 'downloading' &&
          ` Скачиваю версию ${update.version ?? ''}… ${update.percent ?? 0}%`}
      </span>
      {update.state === 'ready' ? (
        <Button variant="primary" size="sm" onClick={() => void api.installUpdate()}>
          Перезапустить и обновить
        </Button>
      ) : (
        update.state !== 'downloading' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void api.openExternal(`${REPO_URL}/releases/latest`)}
          >
            Скачать с GitHub
          </Button>
        )
      )}
    </div>
  );
}
