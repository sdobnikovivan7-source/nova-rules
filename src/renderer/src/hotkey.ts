/**
 * Запись горячей клавиши в настройках: KeyboardEvent → accelerator Electron
 * ('Control+Shift+Space'). Нужен Ctrl, Alt или Win (иначе сочетание мешает печатать в игре);
 * F1–F24 можно и без них.
 */

/** Поля KeyboardEvent (без DOM-типов: модуль проверяется и тестами под Node) */
type KeyLike = {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

const NAMED: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
};

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/** Клавиша без модификаторов в записи Electron; null — модификатор или неподдерживаемая */
export function keyName(code: string): string | null {
  if (MODIFIER_CODES.test(code)) return null;
  let m: RegExpMatchArray | null;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1]!;
  if ((m = code.match(/^Digit(\d)$/))) return m[1]!;
  if ((m = code.match(/^Numpad(\d)$/))) return `num${m[1]}`;
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

export type HotkeyResult =
  | { kind: 'pending'; parts: string[] } // нажаты только модификаторы
  | { kind: 'done'; accel: string }
  | { kind: 'invalid'; reason: string };

export function hotkeyFromEvent(e: KeyLike): HotkeyResult {
  const mods = [
    e.ctrlKey && 'Control',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.metaKey && 'Super',
  ].filter((m): m is string => Boolean(m));
  if (MODIFIER_CODES.test(e.code)) return { kind: 'pending', parts: mods };
  const key = keyName(e.code);
  if (!key) return { kind: 'invalid', reason: 'Эту клавишу нельзя назначить' };
  const fKey = /^F\d+$/.test(key);
  if (!fKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    return { kind: 'invalid', reason: 'Нужен Ctrl, Alt или Win вместе с клавишей' };
  }
  return { kind: 'done', accel: [...mods, key].join('+') };
}

/** 'Control+Shift+Space' → ['Ctrl', 'Shift', 'Space'] — для kbd в настройках */
export function hotkeyParts(accel: string): string[] {
  return accel.split('+').map((p) => {
    if (/^(Control|CommandOrControl|CmdOrCtrl|Ctrl)$/.test(p)) return 'Ctrl';
    if (p === 'Super' || p === 'Meta') return 'Win';
    if (p === 'Plus') return '+';
    const num = p.match(/^num(\d|add|sub|mult|div|dec)$/);
    if (num) {
      const sym = { add: '+', sub: '−', mult: '*', div: '/', dec: '.' }[num[1]!] ?? num[1];
      return `Num ${sym}`;
    }
    return p;
  });
}
