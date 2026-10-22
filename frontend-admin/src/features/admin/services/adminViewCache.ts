/** Component-owned memory only: discarded on logout/unmount. */
export function createAdminViewCache<T>(limit = 60) {
  const entries = new Map<string, T>();
  return {
    get(key: string) {
      const entry = entries.get(key);
      if (entry !== undefined) { entries.delete(key); entries.set(key, entry); }
      return entry;
    },
    set(key: string, entry: T) {
      entries.delete(key); entries.set(key, entry);
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    clear() { entries.clear(); },
  };
}
