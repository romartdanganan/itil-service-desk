/**
 * A proper Fisher-Yates shuffle. Worth having as a named, shared utility
 * rather than each call site reaching for `.sort(() => Math.random() - 0.5)`
 * — that classic one-liner doesn't actually produce a uniform shuffle,
 * some orderings come out more likely than others. Doesn't matter for a
 * coin flip, but "which calls/tickets you get" is worth getting right.
 */
export function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
