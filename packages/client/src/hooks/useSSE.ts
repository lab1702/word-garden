import { useEffect, useRef } from 'react';

type EventHandler = (data: any) => void;

export function useSSE(handlers: Record<string, EventHandler>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Resubscribe when the set of event names changes
  const eventKeys = Object.keys(handlers).sort().join(',');

  useEffect(() => {
    const basePath = import.meta.env.VITE_BASE_PATH || '';
    const es = new EventSource(`${basePath}/api/events`, { withCredentials: true } as any);
    let errorCount = 0;

    for (const event of eventKeys.split(',')) {
      if (!event) continue;
      es.addEventListener(event, (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        handlersRef.current[event]?.(data);
      });
    }

    es.onopen = () => { errorCount = 0; };
    es.onerror = () => {
      errorCount++;
      if (errorCount > 5) {
        es.close();
      }
    };

    return () => es.close();
  }, [eventKeys]);
}
