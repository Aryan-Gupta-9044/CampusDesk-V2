import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Run an async loader and expose { data, loading, error, reload }.
 * Raw errors are logged to the console in development only; the UI shows a
 * friendly message instead (see ErrorState).
 */
export function useAsync(loader, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((error) => {
        if (import.meta.env.DEV) console.error("[CampusDesk] load failed:", error);
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
