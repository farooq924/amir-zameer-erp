import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/** Re-renders whenever the IndexedDB data read by `query` changes (Dexie liveQuery). */
export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: () => undefined });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
