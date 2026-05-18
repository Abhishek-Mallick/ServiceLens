'use client';
import { useEffect, useRef } from 'react';

export type EventKind = 'health' | 'incident_opened' | 'incident_updated' | 'incident_resolved' | 'log' | 'chaos' | 'ping' | 'hello';

export interface ArchitectureEvent {
  kind: EventKind;
  at: number;
  payload: Record<string, unknown>;
}

// Subscribes to the per-architecture SSE multiplex. Auto-reconnects on error.
// Returns a stable handle so consumers can disconnect during route changes.
export function useArchitectureEvents(architectureId: string | null, onEvent: (ev: ArchitectureEvent) => void) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!architectureId) return;
    let es: EventSource | null = null;
    let cancelled = false;
    let backoff = 1000;

    const connect = () => {
      if (cancelled) return;
      es = new EventSource(`/api/architectures/${architectureId}/events`);
      const handle = (kind: EventKind) => (raw: MessageEvent) => {
        try {
          const data = JSON.parse(raw.data);
          cbRef.current({ kind, at: data.at ?? Date.now(), payload: data });
        } catch { /* swallow */ }
      };
      for (const k of ['hello', 'ping', 'health', 'incident_opened', 'incident_updated', 'incident_resolved', 'log', 'chaos'] as const) {
        es.addEventListener(k, handle(k) as EventListener);
      }
      es.onerror = () => {
        es?.close();
        if (cancelled) return;
        backoff = Math.min(backoff * 2, 30_000);
        setTimeout(connect, backoff);
      };
      es.onopen = () => { backoff = 1000; };
    };
    connect();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [architectureId]);
}
