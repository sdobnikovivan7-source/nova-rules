/** Короткое сообщение внизу окна («Скопировано») — из стора, общий для обоих окон */
import { Check } from 'lucide-react';
import { useApp } from '../store';

export function Toast() {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  return (
    <div key={toast.id} className="toast" role="status">
      <Check size={16} strokeWidth={2.4} aria-hidden />
      {toast.text}
    </div>
  );
}
