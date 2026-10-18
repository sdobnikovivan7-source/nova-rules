/** Действия с пунктом, общие для панели, контекстного меню и горячих клавиш */
import { api } from './api';
import { useApp } from './store';

/** Пункт в буфер обмена в формате для жалобы (§10.6) + тост */
export async function copyRule(ruleId: string): Promise<void> {
  try {
    await api.copyRule(ruleId);
    useApp.getState().showToast('Скопировано');
  } catch {
    useApp.getState().showToast('Не удалось скопировать');
  }
}
