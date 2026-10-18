/**
 * Боковая панель (§7.1 дизайна): логотип, «Поиск», категории со счётчиками документов,
 * «Изменения» с бейджем непросмотренных, «Избранное», «Настройки» внизу и дисклеймер.
 */
import {
  BookOpen,
  Crosshair,
  FileText,
  Flag,
  History,
  type LucideIcon,
  MessageSquare,
  Search,
  Shield,
  SlidersHorizontal,
  Star,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useApp } from '../store';

/** Имена иконок из config/sources.json */
const ICONS: Record<string, LucideIcon> = {
  FileText,
  Flag,
  Crosshair,
  Shield,
  Users,
  MessageSquare,
};

function NavItem(props: {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: ReactNode;
  active?: boolean;
  className?: string;
}) {
  const Icon = props.icon;
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) =>
        ['nav-item', props.className, (props.active ?? isActive) && 'active']
          .filter(Boolean)
          .join(' ')
      }
      aria-current={props.active ? 'page' : undefined}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden />
      <span className="nav-label">{props.label}</span>
      {props.end}
    </NavLink>
  );
}

export function Sidebar() {
  const categories = useApp((s) => s.categories);
  const unseen = useApp((s) => s.unseenChanges);
  const favCount = useApp((s) => s.favoriteIds.size);
  // открыт документ — подсвечиваем его категорию
  const docCategory = useApp((s) => s.openDocCategory);

  return (
    <nav className="sidebar" aria-label="Разделы">
      <div className="brand">
        <span className="brand-logo" aria-hidden>
          <BookOpen size={17} strokeWidth={2.2} />
        </span>
        <span className="brand-name">NOVA Rules</span>
      </div>

      <NavItem to="/search" icon={Search} label="Поиск" />

      <div className="nav-group" id="nav-categories">
        Категории
      </div>
      <div role="list" aria-labelledby="nav-categories" className="nav-list">
        {categories.map((c) => (
          <div role="listitem" key={c.id}>
            <NavItem
              to={`/category/${c.id}`}
              icon={ICONS[c.icon] ?? FileText}
              label={c.title}
              active={docCategory === c.id || undefined}
              end={<span className="nav-count">{c.docCount}</span>}
            />
          </div>
        ))}
      </div>

      <div className="nav-divider" />

      <NavItem
        to="/changes"
        icon={History}
        label="Изменения"
        end={
          unseen > 0 && (
            <span className="nav-badge" aria-label={`${unseen} непросмотренных`}>
              {unseen > 99 ? '99+' : unseen}
            </span>
          )
        }
      />
      <NavItem
        to="/favorites"
        icon={Star}
        label="Избранное"
        end={favCount > 0 && <span className="nav-count">{favCount}</span>}
      />

      <NavItem to="/settings" icon={SlidersHorizontal} label="Настройки" className="nav-settings" />
      <p className="sidebar-disclaimer">
        Неофициальный справочник. Актуальная редакция — на форуме проекта.
      </p>
    </nav>
  );
}
