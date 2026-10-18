/** Окно быстрого поиска (горячая клавиша): то же хранилище и поиск, что у главного окна */
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Toast } from './components/Toast';
import { useFontScale } from './fontScale';
import { QuickSearch } from './quick/QuickSearch';
import { subscribeToMain, useApp } from './store';
import './styles/tokens.css';
import './styles/theme-light.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/quick.css';

function Quick() {
  const ready = useApp((s) => s.ready);
  useFontScale();
  useEffect(() => {
    void useApp.getState().load();
    // переходы по маршрутам — только у главного окна
    return subscribeToMain(() => {});
  }, []);
  return (
    <>
      {ready && <QuickSearch />}
      <Toast />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Quick />
  </StrictMode>,
);
