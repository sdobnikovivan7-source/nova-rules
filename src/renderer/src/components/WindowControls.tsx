import { Minus, X } from 'lucide-react';
import { api } from '../api';
import { Button } from './ui';

/** Свои кнопки окна 36×36: системной рамки нет (frameless) */
export function WindowControls() {
  return (
    <div className="window-controls">
      <Button variant="window" aria-label="Свернуть" onClick={() => api.window.minimize()}>
        <Minus size={17} strokeWidth={2} />
      </Button>
      <Button variant="window" aria-label="Закрыть" onClick={() => api.window.close()}>
        <X size={17} strokeWidth={2} />
      </Button>
    </div>
  );
}
