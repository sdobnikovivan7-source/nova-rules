/** Бейдж наказания (§7.3): цветной текст на подложке того же цвета, цвета по типу (§2.5) */
import type { PunishKind, Punishment } from '@shared/schema';

const TONE: Record<PunishKind, string> = {
  warn: 'warn',
  removal: 'warn',
  jail: 'jail',
  demorgan: 'jail',
  kick: 'kick',
  mute: 'kick',
  ban: 'ban',
  blacklist: 'black',
  reprimand: 'other',
  territory: 'other',
  leaderWarn: 'other',
  cancel: 'other',
  restriction: 'other',
  other: 'other',
};

/** «JAIL до 90 минут.» → «JAIL до 90 минут» */
export const punishLabel = (p: Punishment) => p.raw.replace(/[.\s]+$/, '');

export function PunishmentBadge({
  punishment,
  size = 'sm',
}: {
  punishment: Punishment;
  /** sm — в списке (в одну строку, длинное обрезается), lg — в правой панели */
  size?: 'sm' | 'lg';
}) {
  const label = punishLabel(punishment);
  return (
    <span
      className={`punish-badge tone-${TONE[punishment.kind]}${size === 'lg' ? ' lg' : ''}`}
      title={size === 'sm' ? label : undefined}
    >
      {label}
    </span>
  );
}
