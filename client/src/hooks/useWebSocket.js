import { useEffect, useRef, useCallback } from 'react';

/**
 * Opens a persistent WebSocket connection and exposes a `send` method for
 * request/response style actions.
 *
 * Broadcast events (server-push) are delivered to `onMessage(event, data)`.
 * Action responses are routed back to their originating `send()` promise.
 *
 * @param {(event: string, data: unknown) => void} onMessage
 * @returns {{ send: (action: string, payload?: object) => Promise<unknown> }}
 */
export function useWebSocket(onMessage) {
  const handlerRef  = useRef(onMessage);
  const pendingRef  = useRef(new Map()); // id → { resolve, reject }
  const wsRef       = useRef(null);

  useEffect(() => { handlerRef.current = onMessage; });

  useEffect(() => {
    let ws;
    let timer;
    let destroyed = false;

    function rejectAll(reason) {
      for (const { reject } of pendingRef.current.values()) reject(new Error(reason));
      pendingRef.current.clear();
    }

    function connect() {
      if (destroyed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          // Response to a send() call
          if (typeof msg.id === 'string' && pendingRef.current.has(msg.id)) {
            const { resolve, reject } = pendingRef.current.get(msg.id);
            pendingRef.current.delete(msg.id);
            if (msg.error) {
              const err = new Error(msg.error);
              err.status = msg.status;
              reject(err);
            } else {
              resolve(msg.data);
            }
            return;
          }
          // Server-push broadcast
          if (typeof msg.event === 'string') {
            handlerRef.current(msg.event, msg.data);
          }
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        rejectAll('WebSocket disconnected');
        if (!destroyed) timer = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      destroyed = true;
      clearTimeout(timer);
      ws?.close();
      rejectAll('Component unmounted');
    };
  }, []);

  /**
   * Send an action to the server and return a Promise that resolves with the
   * response data or rejects with an error (including `err.status`).
   */
  const send = useCallback((action, payload = {}) => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const id = crypto.randomUUID();
      const timeout = setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 15000);

      pendingRef.current.set(id, {
        resolve: (data) => { clearTimeout(timeout); resolve(data); },
        reject:  (err)  => { clearTimeout(timeout); reject(err); },
      });
      ws.send(JSON.stringify({ id, action, payload }));
    });
  }, []);

  return { send };
}
