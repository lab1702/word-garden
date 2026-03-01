import { useEffect, useRef } from 'react';

type EventHandler = (data: any) => void;

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_ERRORS = 5;

export function useSSE(handlers: Record<string, EventHandler>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const eventKeys = Object.keys(handlers).sort().join(',');

  useEffect(() => {
    let backoff = INITIAL_BACKOFF_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let es: EventSource | null = null;

    function connect() {
      if (disposed) return;
      const basePath = import.meta.env.VITE_BASE_PATH || '';
      es = new EventSource(`${basePath}/api/events`, { withCredentials: true } as any);
      let errorCount = 0;

      for (const event of eventKeys.split(',')) {
        if (!event) continue;
        es.addEventListener(event, (e) => {
          const data = JSON.parse((e as MessageEvent).data);
          handlersRef.current[event]?.(data);
        });
      }

      es.onopen = () => { errorCount = 0; backoff = INITIAL_BACKOFF_MS; };
      es.onerror = () => {
        errorCount++;
        if (errorCount > MAX_ERRORS) {
          es?.close();
          es = null;
          if (!disposed) {
            reconnectTimer = setTimeout(connect, backoff);
            backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
          }
        }
      };
    }

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [eventKeys]);
}
