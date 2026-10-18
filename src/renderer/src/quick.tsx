/** Окно быстрого поиска — этап 8.7; пока заглушка, чтобы был второй вход сборки */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';

function Quick() {
  return <div className="placeholder">Быстрый поиск — этап 8</div>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Quick />
  </StrictMode>,
);
