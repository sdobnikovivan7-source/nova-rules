/** Боковая панель — каркас; дизайн по макету — этап 5.5 */
import { NavLink } from 'react-router';
import { useApp } from '../store';

export function Sidebar() {
  const categories = useApp((s) => s.categories);
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">NOVA Rules</div>
      <NavLink to="/search">Поиск</NavLink>
      <div className="sidebar-group">Категории</div>
      {categories.map((c) => (
        <NavLink key={c.id} to={`/category/${c.id}`}>
          {c.title}
          <span className="count">{c.docCount}</span>
        </NavLink>
      ))}
      <hr />
      <NavLink to="/changes">Изменения</NavLink>
      <NavLink to="/favorites">Избранное</NavLink>
      <NavLink to="/settings" className="sidebar-settings">
        Настройки
      </NavLink>
    </nav>
  );
}
