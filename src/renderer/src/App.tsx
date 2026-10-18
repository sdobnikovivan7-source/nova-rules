import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { WindowControls } from './components/WindowControls';
import { Category } from './screens/Category';
import { Changes } from './screens/Changes';
import { Document } from './screens/Document';
import { Favorites } from './screens/Favorites';
import { Search } from './screens/Search';
import { Settings } from './screens/Settings';
import { subscribeToMain, useApp } from './store';

/**
 * Маршруты (hash):
 *   /search · /category/:id · /doc/:id · /changes · /favorites · /settings
 */
export function App() {
  const navigate = useNavigate();
  const ready = useApp((s) => s.ready);

  useEffect(() => {
    void useApp.getState().load();
    return subscribeToMain((route) => void navigate(route));
  }, [navigate]);

  return (
    <div className="app">
      <Sidebar />
      <div className="app-main">
        <header className="titlebar">
          <WindowControls />
        </header>
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
    </div>
  );
}
