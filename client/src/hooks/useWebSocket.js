import { useEffect, useRef } from 'react';

export function useWebSocket(onMessage) {
  // Always call the latest handler without recreating the connection on re-renders
  const handlerRef = useRef(onMessage);
  useEffect(() => { handlerRef.current = onMessage; });

  useEffect(() => {
    let ws;
    let timer;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws`);

      ws.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data);
          handlerRef.current(event, data);
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        if (!destroyed) timer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      destroyed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);
}
