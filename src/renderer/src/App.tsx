import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { api } from './api';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { useFontScale } from './fontScale';
import { Category } from './screens/Category';
import { Changes } from './screens/Changes';
import { Document } from './screens/Document';
import { Favorites } from './screens/Favorites';
import { Search } from './screens/Search';
import { Settings } from './screens/Settings';
import { subscribeToMain, useApp } from './store';

/**
 * Маршруты (hash):
 *   /search · /category/:id · /doc/:id[?rule=<id пункта>] · /changes ·
 *   /favorites · /settings
 */
export function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ready = useApp((s) => s.ready);
  useFontScale();

  useEffect(() => {
    void useApp.getState().load();
    return subscribeToMain((route) => void navigate(route));
  }, [navigate]);

  // клавиши главного окна (§10.5): F5 — проверить обновления (вместо перезагрузки страницы),
  // Ctrl+1…6 — категории. Ctrl+F и «/» — в TopBar, Ctrl+D и Ctrl+Shift+C — в панели пункта,
  // Ctrl +/− — fontScale.ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        void api.syncNow();
        return;
      }
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (e.ctrlKey && !e.shiftKey && !e.altKey && digit) {
        const cat = useApp.getState().categories[Number(digit[1]) - 1];
        if (!cat) return;
        e.preventDefault();
        void navigate(`/category/${cat.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="app">
      <Sidebar />
      <div className="main-col">
        {/* у «Настроек» по макету нет поля поиска — заголовок и кнопки окна внутри панели */}
        {pathname !== '/settings' && <TopBar />}
        <main className="content">
          {ready && (
            <Routes>
              <Route path="/" element={<Navigate to="/search" replace />} />
              <Route path="/search" element={<Search />} />
              <Route path="/category/:id" element={<Category />} />
              <Route path="/doc/:id" element={<Document />} />
              <Route path="/changes" element={<Changes />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/search" replace />} />
            </Routes>
          )}
        </main>
      </div>
      <StatusBar />
      <Toast />
    </div>
  );
}
