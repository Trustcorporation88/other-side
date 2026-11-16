export type LinkKind = 'url' | 'email' | 'phone';

export type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string; kind: LinkKind };

// Bare domains (no scheme, no www.) are only linked for these endings, so file
// names like "relatorio.pdf" and words glued by a missing space stay plain text.
const BARE_TLDS = [
  'com', 'net', 'org', 'br', 'io', 'me', 'app', 'dev', 'co', 'gov', 'edu', 'info',
  'biz', 'tv', 'ly', 'gl', 'be', 'gg', 'link', 'site', 'online', 'store', 'shop',
  'xyz', 'ai', 'pt', 'uk', 'eu', 'news', 'blog', 'page', 'club', 'live',
];

const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const URL_TAIL = '[^\\s<>"]*';

const PATTERN = new RegExp(
  [
    `([a-z0-9._%+-]+@${LABEL}(?:\\.${LABEL})*\\.[a-z]{2,})`,
    `(https?:\\/\\/[^\\s<>"]+)`,
    `(www\\.${LABEL}${URL_TAIL})`,
    `((?:${LABEL}\\.)+(?:${BARE_TLDS.join('|')})(?![a-z0-9-])(?:[/?#]${URL_TAIL})?)`,
    `(\\+\\d[\\d\\s().-]{7,}\\d)`,
  ].join('|'),
  'gi'
);

const BLOCKED_BEFORE = /[A-Za-z0-9_\u00C0-\u024F.@/:+-]/;
const TRAILING_PUNCTUATION = /[.,;:!?'"…*_~]$/;
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function count(text: string, char: string) {
  return text.split(char).length - 1;
}

function trimUrlTail(url: string) {
  let result = url;
  for (;;) {
    const last = result.at(-1);
    if (!last) return result;
    if (TRAILING_PUNCTUATION.test(last)) {
      result = result.slice(0, -1);
    } else if (last in CLOSERS && count(result, last) > count(result, CLOSERS[last])) {
      result = result.slice(0, -1);
    } else {
      return result;
    }
  }
}

function hasHostAfterScheme(url: string) {
  return /^https?:\/\/[^\s/?#.]+\.[^\s/?#]/i.test(url);
}

export function splitMessageLinks(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  const pushText = (end: number) => {
    if (end > cursor) segments.push({ type: 'text', text: text.slice(cursor, end) });
  };

  PATTERN.lastIndex = 0;
  for (let match = PATTERN.exec(text); match; match = PATTERN.exec(text)) {
    const [, email, scheme, www, bare, phone] = match;
    const start = match.index;
    const before = start > 0 ? text[start - 1] : '';
    if (before && BLOCKED_BEFORE.test(before)) continue;

    let link: { text: string; href: string; kind: LinkKind } | null = null;
    if (email) {
      link = { text: email, href: `mailto:${email}`, kind: 'email' };
    } else if (scheme) {
      const trimmed = trimUrlTail(scheme);
      if (hasHostAfterScheme(trimmed)) link = { text: trimmed, href: trimmed, kind: 'url' };
    } else if (www || bare) {
      const trimmed = trimUrlTail(www ?? bare);
      link = { text: trimmed, href: `https://${trimmed}`, kind: 'url' };
    } else if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) {
        link = { text: phone, href: `tel:+${digits}`, kind: 'phone' };
      }
    }

    if (!link) continue;
    pushText(start);
    segments.push({ type: 'link', ...link });
    cursor = start + link.text.length;
    PATTERN.lastIndex = cursor;
  }

  pushText(text.length);
  return segments;
}
