"use client";

import { useCallback, useEffect, useState } from "react";
import { portalGet } from "./portal-api";

export type ResourceState<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "error"; httpStatus: number };

/** GET a portal resource. Keeps the previous data visible while reloading. */
export function useResource<T>(path: string, parse: (data: unknown) => T | null) {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await portalGet(path);
      if (cancelled) return;
      const data = result.ok ? parse(result.data) : null;
      if (data !== null) setState({ status: "ready", data });
      else setState({ status: "error", httpStatus: result.ok ? 500 : result.status });
    })();
    return () => {
      cancelled = true;
    };
    // parse is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { state, reload };
}
