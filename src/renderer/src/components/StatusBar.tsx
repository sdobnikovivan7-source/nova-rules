/** Строка состояния — каркас; состояния синхронизации и дизайн — этап 4.7 */
import { useApp } from '../store';

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

export function StatusBar() {
  const info = useApp((s) => s.info);
  const date = fmt(info?.dataBuiltAt);
  return (
    <footer className="statusbar">
      <span>{date ? `Правила от ${date}` : 'Правил пока нет — дождитесь синхронизации'}</span>
      <span className="mono">v{info?.version}</span>
    </footer>
  );
}
