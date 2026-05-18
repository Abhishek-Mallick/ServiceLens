// In-process pub/sub bus for SSE-driven realtime updates.
//
// Single-instance only — survives HMR via `globalThis` caching but does not
// federate across processes. Phase 7 swaps the implementation for Redis
// pub/sub without changing the public API.
//
// Channels are scoped to an architecture; subscribers receive every event
// for that architecture and filter client-side.

import { EventEmitter } from 'node:events';

export type EventKind =
  | 'health'         // a probe wrote a HealthRecord
  | 'incident_opened'
  | 'incident_updated'
  | 'incident_resolved'
  | 'log'            // a log entry was ingested (real or synthetic)
  | 'chaos'          // a chaos drill fired or completed
  | 'ping';          // heartbeat

export interface RealtimeEvent {
  kind: EventKind;
  architectureId: string;
  at: number;
  payload?: Record<string, unknown>;
}

type Listener = (ev: RealtimeEvent) => void;

interface BusGlobal {
  __servicelens_bus?: EventEmitter;
}

function bus(): EventEmitter {
  const g = globalThis as unknown as BusGlobal;
  if (!g.__servicelens_bus) {
    const e = new EventEmitter();
    e.setMaxListeners(1000); // SSE connections can stack quickly in dev
    g.__servicelens_bus = e;
  }
  return g.__servicelens_bus!;
}

function channel(architectureId: string): string {
  return `arch:${architectureId}`;
}

export function publish(architectureId: string, kind: EventKind, payload: Record<string, unknown> = {}): void {
  bus().emit(channel(architectureId), { kind, architectureId, at: Date.now(), payload });
}

export function subscribe(architectureId: string, listener: Listener): () => void {
  bus().on(channel(architectureId), listener);
  return () => bus().off(channel(architectureId), listener);
}
