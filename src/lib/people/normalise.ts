export function normalisePersonQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .replace(/[_-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shardPrefixForQuery(query: string, largePrefixes: string[] = []): string | null {
  const normalised = normalisePersonQuery(query).replace(/\s/g, '');
  if (normalised.length < 2) return null;

  const two = normalised.slice(0, 2);
  if (largePrefixes.includes(two) && normalised.length >= 3) return normalised.slice(0, 3);
  return two;
}
