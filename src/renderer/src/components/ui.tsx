/**
 * Базовые элементы интерфейса (§7.5–7.7, 7.12 дизайна): кнопки, чипы, сегменты, тумблер, kbd.
 * Стили — styles/components.css.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary — жёлтая, secondary — на подложке, outline — только обводка, window — кнопка окна */
  variant?: 'primary' | 'secondary' | 'outline' | 'window' | 'ghost';
  size?: 'md' | 'sm';
  icon?: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  active?: boolean;
  /** toc — чип оглавления, filter — чип-фильтр в поиске (активный жёлтый) */
  variant?: 'toc' | 'filter';
  count?: number;
  children: ReactNode;
};

export function Chip({
  active = false,
  variant = 'filter',
  count,
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx('chip', `chip-${variant}`, active && 'active', className)}
      {...rest}
    >
      <span className="chip-label">{children}</span>
      {count !== undefined && <span className="chip-count">{count}</span>}
    </button>
  );
}

type SegmentGroupProps<T extends string | number> = {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange(value: T): void;
  /** inset — подложка как в настройках */
  variant?: 'raised' | 'inset';
  size?: 'md' | 'sm';
  label: string;
};

export function SegmentGroup<T extends string | number>({
  value,
  options,
  onChange,
  variant = 'raised',
  size = 'md',
  label,
}: SegmentGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx('segments', `segments-${variant}`, size === 'sm' && 'segments-sm')}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          className={cx('segment', o.value === value && 'active')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type ToggleProps = {
  checked: boolean;
  onChange(checked: boolean): void;
  /** Подпись для скринридера, если рядом нет связанного текста */
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, label, labelledBy, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={cx('toggle', checked && 'on')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

/** Клавиша: sm — подсказки, lg — горячая клавиша в настройках */
export function Kbd({ children, size = 'sm' }: { children: ReactNode; size?: 'sm' | 'lg' }) {
  return <kbd className={cx('kbd', size === 'lg' && 'kbd-lg')}>{children}</kbd>;
}

export { cx };
