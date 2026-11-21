import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs an async loader whenever `deps` change. Keeps showing the previous data while
 * refreshing (no flicker) and ignores results of stale calls.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const callId = useRef(0);
  // Always call the latest loader; re-run is keyed on `deps` (not on the loader's identity,
  // which is stable for module-level functions and would otherwise never refetch).
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const id = ++callId.current;
    setLoading(true);
    fnRef
      .current()
      .then((d) => {
        if (id !== callId.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== callId.current) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (id === callId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
