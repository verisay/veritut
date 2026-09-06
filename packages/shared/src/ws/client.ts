/**
 * WS istemcisi — canlı çalıştırma logu ve olay akışı (plan §3.1 Realtime).
 * Aynı origin, çerez otomatik gider; yeniden bağlanma üstel geri çekilme ile.
 */
export interface WsClientOptions {
  path: string;
  onMessage: (data: unknown) => void;
  onStatus?: (s: 'connecting' | 'open' | 'closed') => void;
  maxRetries?: number;
}

export function connectWs(opts: WsClientOptions): { close: () => void } {
  let ws: WebSocket | null = null;
  let retries = 0;
  let closed = false;
  const max = opts.maxRetries ?? 8;

  const open = (): void => {
    if (closed) return;
    opts.onStatus?.('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}${opts.path}`);
    ws.onopen = () => {
      retries = 0;
      opts.onStatus?.('open');
    };
    ws.onmessage = (ev) => {
      try {
        opts.onMessage(JSON.parse(String(ev.data)));
      } catch {
        opts.onMessage(ev.data);
      }
    };
    ws.onclose = () => {
      opts.onStatus?.('closed');
      if (closed || retries >= max) return;
      const wait = Math.min(30_000, 500 * 2 ** retries++);
      setTimeout(open, wait);
    };
  };
  open();
  return {
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
