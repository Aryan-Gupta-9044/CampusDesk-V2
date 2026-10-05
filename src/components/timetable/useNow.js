import { useEffect, useState } from "react";
import { istNow } from "../../lib/dates";

/** Re-renders every 30s so current/next class stay accurate without a refresh. */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => istNow());
  useEffect(() => {
    const t = setInterval(() => setNow(istNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
