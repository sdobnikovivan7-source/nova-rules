/**
 * Боковая панель (§7.1 дизайна): логотип, «Поиск», категории со счётчиками документов,
 * «Изменения» с бейджем непросмотренных, «Избранное», плашка с числом игроков,
 * «Настройки» внизу и дисклеймер.
 */
import {
  BookOpen,
  Crosshair,
  Download,
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
  UsersRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { DOWNLOADS, plural, PLAYERS } from '../format';
import { useApp } from '../store';

/** Меньше — число не показываем: «≈ 3 игрока» скорее отпугивает */
const MIN_SHOWN = 10;

/** «47», от 50 — вниз до десятков с плюсом: «50+», «120+» */
const roughly = (n: number) =>
  n < 50 ? `${n}` : `${(Math.floor(n / 10) * 10).toLocaleString('ru-RU')}+`;

/**
 * Плашка под «Избранным» (этап 12): примерное число игроков в день — оценка по запросам
 * stats.json за неделю. Пока игроков меньше 10 (статистика jsDelivr копится несколько дней) —
 * сколько раз скачали установщик. Оба числа настоящие, из data/stats.json.
 */
function PlayersBadge() {
  const stats = useApp((s) => s.stats);
  if (!stats) return null;
  const players = stats.players >= MIN_SHOWN;
  const downloads = stats.downloads ?? 0;
  if (!players && downloads < MIN_SHOWN) return null;
  return (
    <div
      className="players"
      title={
        players
          ? 'Сколько игроков в среднем открывают программу за день — оценка по числу проверок правил за последние 7 дней. Программа не отправляет данных о вас.'
          : 'Сколько раз скачали установщик с GitHub, вместе с обновлениями. Когда накопится статистика, здесь будет число игроков в день.'
      }
    >
      <span className="players-icon" aria-hidden>
        {players ? (
          <UsersRound size={17} strokeWidth={2} />
        ) : (
          <Download size={17} strokeWidth={2} />
        )}
      </span>
      <span className="players-text">
        {players ? (
          <span className="players-count">
            ≈ {stats.players.toLocaleString('ru-RU')} <span>{plural(stats.players, PLAYERS)}</span>
          </span>
        ) : (
          <span className="players-count">
            {roughly(downloads)}{' '}
            <span>
              {plural(downloads < 50 ? downloads : Math.floor(downloads / 10) * 10, DOWNLOADS)}
            </span>
          </span>
        )}
        <span className="players-sub">{players ? 'в среднем в день' : 'программы с GitHub'}</span>
      </span>
    </div>
  );
}

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
      <PlayersBadge />

      <NavItem to="/settings" icon={SlidersHorizontal} label="Настройки" className="nav-settings" />
      <p className="sidebar-disclaimer">
        Неофициальный справочник. Актуальная редакция — на форуме проекта.
      </p>
    </nav>
  );
}
