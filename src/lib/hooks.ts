import { useCallback, useEffect, useState } from 'react';
import { pb } from './pb';

interface ListOptions {
  filter?: string;
  sort?: string;
  expand?: string;
  /** Désactive la requête tant que false (ex. en attendant un id). */
  enabled?: boolean;
}

/**
 * Charge la liste complète d'une collection et se réabonne au flux temps
 * réel PocketBase : toute création/modification/suppression déclenche un
 * rechargement, pour que tous les relecteurs voient la même chose.
 */
export function useList<T>(collection: string, options: ListOptions = {}, deps: unknown[] = []) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!enabled) {
      // Réinitialisation volontaire quand la requête est désactivée
      // (ex. en attendant qu'un id soit connu).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    pb.collection(collection)
      .getFullList<T>({
        filter: options.filter || undefined,
        sort: options.sort || undefined,
        expand: options.expand || undefined,
      })
      .then((res) => {
        if (!cancelled) {
          setItems(res);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, options.filter, options.sort, options.expand, enabled, tick, ...deps]);

  useEffect(() => {
    if (!enabled) return;
    let unsub: (() => void) | undefined;
    pb.collection(collection)
      .subscribe('*', () => reload())
      .then((u) => {
        unsub = u;
      })
      .catch(() => {
        /* temps réel indisponible : l'app reste utilisable */
      });
    return () => {
      unsub?.();
    };
  }, [collection, enabled, reload]);

  return { items, loading, error, reload };
}

/** Prochain numéro séquentiel (remarques ou décisions) pour un projet. */
export async function nextNumber(collection: 'remarks' | 'decisions', projectId: string): Promise<number> {
  const res = await pb.collection(collection).getList(1, 1, {
    filter: `project = "${projectId}"`,
    sort: '-number',
    skipTotal: true,
  });
  const max = res.items.length ? (res.items[0] as unknown as { number: number }).number : 0;
  return max + 1;
}
