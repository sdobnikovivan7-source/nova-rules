import { Minus, X } from 'lucide-react';
import { api } from '../api';

/** Свои кнопки окна: системной рамки нет (frameless) */
export function WindowControls() {
  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-btn"
        aria-label="Свернуть"
        onClick={() => api.window.minimize()}
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        className="window-btn"
        aria-label="Закрыть"
        onClick={() => api.window.close()}
      >
        <X size={16} />
      </button>
    </div>
  );
}
