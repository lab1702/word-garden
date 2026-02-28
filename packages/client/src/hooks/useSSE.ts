import { useEffect, useRef } from 'react';

type EventHandler = (data: any) => void;

export function useSSE(handlers: Record<string, EventHandler>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const basePath = import.meta.env.VITE_BASE_PATH || '';
    const es = new EventSource(`${basePath}/api/events`, { withCredentials: true } as any);

    for (const event of Object.keys(handlersRef.current)) {
      es.addEventListener(event, (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        handlersRef.current[event]?.(data);
      });
    }

    return () => es.close();
  }, []);
}
