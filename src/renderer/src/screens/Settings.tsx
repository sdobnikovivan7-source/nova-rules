/** Настройки — этап 9 */
import { WindowControls } from '../components/WindowControls';

export function Settings() {
  return (
    <section className="panel">
      <header className="screen-head">
        <h1 className="screen-title">Настройки</h1>
        <WindowControls />
      </header>
      <p className="muted screen">Экран появится на этапе 9.</p>
    </section>
  );
}
