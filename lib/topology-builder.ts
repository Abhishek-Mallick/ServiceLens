import type { Service } from '@prisma/client';
import { parseJson } from './utils';
import type {
  AIAnalysisResult,
  ServiceConsumedApi,
  ServiceConsumedEvent,
  ServiceDatabase,
  ServiceProducedEvent,
  TopologyEdge,
  TopologyGraph,
  TopologyNode,
} from './types';

export interface ServiceForTopology {
  id: string;
  name: string;
  language: string | null;
  framework: string | null;
  healthStatus: string;
  summary: string | null;
  producesEvents: string | null;
  consumesEvents: string | null;
  exposesApis: string | null;
  consumesApis: string | null;
  databases: string | null;
  kafkaTopics: string | null;
}

export interface DetectedDependency {
  dependentId: string;
  dependencyId: string;
  type: 'kafka' | 'rest' | 'grpc' | 'database' | 'event';
  details: Record<string, unknown>;
}

export function buildTopology(services: ServiceForTopology[]): {
  graph: TopologyGraph;
  dependencies: DetectedDependency[];
} {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  const dependencies: DetectedDependency[] = [];

  const brokerNodeIds = new Map<string, string>();
  const dbNodeIds = new Map<string, string>();

  for (const svc of services) {
    nodes.push({
      id: `svc-${svc.id}`,
      type: 'service',
      label: svc.name,
      data: {
        serviceId: svc.id,
        language: svc.language,
        framework: svc.framework,
        health: svc.healthStatus,
        summary: svc.summary,
      },
    });
  }

  // Kafka topic matching: producer -> topic node -> consumer
  for (const producer of services) {
    const produces = parseJson<ServiceProducedEvent[]>(producer.producesEvents, []);
    for (const evt of produces) {
      if (!evt.topic) continue;
      const topicKey = `topic:${evt.topic}`;
      if (!brokerNodeIds.has(topicKey)) {
        const nodeId = `broker-${evt.topic}`;
        brokerNodeIds.set(topicKey, nodeId);
        nodes.push({
          id: nodeId,
          type: 'broker',
          label: evt.topic,
          data: { kind: 'kafka-topic', topic: evt.topic },
        });
      }
      const brokerNodeId = brokerNodeIds.get(topicKey)!;
      edges.push({
        id: `e-${producer.id}-produces-${evt.topic}-${evt.name}`,
        source: `svc-${producer.id}`,
        target: brokerNodeId,
        type: 'event',
        label: evt.name,
        details: { eventName: evt.name, topic: evt.topic, direction: 'produces' },
      });

      for (const consumer of services) {
        if (consumer.id === producer.id) continue;
        const consumes = parseJson<ServiceConsumedEvent[]>(consumer.consumesEvents, []);
        const match = consumes.find(
          (c) => c.topic === evt.topic && (!c.name || c.name === evt.name || c.name === '*')
        );
        if (match) {
          edges.push({
            id: `e-${evt.topic}-to-${consumer.id}-${match.name}`,
            source: brokerNodeId,
            target: `svc-${consumer.id}`,
            type: 'event',
            label: match.name,
            details: { eventName: match.name, topic: evt.topic, direction: 'consumes' },
          });
          dependencies.push({
            dependentId: consumer.id,
            dependencyId: producer.id,
            type: 'kafka',
            details: { topic: evt.topic, event: evt.name },
          });
        }
      }
    }
  }

  // REST API matching
  for (const caller of services) {
    const callerApis = parseJson<ServiceConsumedApi[]>(caller.consumesApis, []);
    for (const apiCall of callerApis) {
      const target = services.find(
        (s) => s.id !== caller.id && s.name.toLowerCase() === apiCall.service.toLowerCase()
      );
      if (target) {
        edges.push({
          id: `e-rest-${caller.id}-${target.id}-${apiCall.method}-${apiCall.path}`,
          source: `svc-${caller.id}`,
          target: `svc-${target.id}`,
          type: 'rest',
          label: `${apiCall.method} ${apiCall.path}`,
          details: apiCall as unknown as Record<string, unknown>,
        });
        dependencies.push({
          dependentId: caller.id,
          dependencyId: target.id,
          type: 'rest',
          details: apiCall as unknown as Record<string, unknown>,
        });
      }
    }
  }

  // Databases
  for (const svc of services) {
    const dbs = parseJson<ServiceDatabase[]>(svc.databases, []);
    for (const db of dbs) {
      const dbKey = `db:${db.type}:${db.name}`;
      if (!dbNodeIds.has(dbKey)) {
        const nodeId = `db-${db.type}-${db.name}`;
        dbNodeIds.set(dbKey, nodeId);
        nodes.push({
          id: nodeId,
          type: 'database',
          label: `${db.name}`,
          data: { kind: 'database', dbType: db.type, name: db.name },
        });
      }
      const dbNodeId = dbNodeIds.get(dbKey)!;
      edges.push({
        id: `e-db-${svc.id}-${db.type}-${db.name}`,
        source: `svc-${svc.id}`,
        target: dbNodeId,
        type: 'database',
        label: db.type,
        details: db as unknown as Record<string, unknown>,
      });
    }
  }

  return { graph: { nodes, edges }, dependencies };
}
