import { describe, it, expect } from 'vitest';
import { buildTopology, type ServiceForTopology } from '@/lib/topology-builder';
import { stringify } from '@/lib/utils';

function svc(overrides: Partial<ServiceForTopology>): ServiceForTopology {
  return {
    id: 'x',
    name: 'Svc',
    language: 'TypeScript',
    framework: 'Express',
    healthStatus: 'healthy',
    summary: null,
    producesEvents: null,
    consumesEvents: null,
    exposesApis: null,
    consumesApis: null,
    databases: null,
    kafkaTopics: null,
    ...overrides,
  };
}

describe('buildTopology', () => {
  it('creates one broker node per kafka topic and links producer and consumer', () => {
    const services: ServiceForTopology[] = [
      svc({
        id: '1',
        name: 'Producer',
        producesEvents: stringify([{ name: 'OrderCreated', topic: 'orders' }]),
      }),
      svc({
        id: '2',
        name: 'Consumer',
        consumesEvents: stringify([{ name: 'OrderCreated', topic: 'orders' }]),
      }),
    ];
    const { graph, dependencies } = buildTopology(services);
    const brokerNodes = graph.nodes.filter((n) => n.type === 'broker');
    expect(brokerNodes).toHaveLength(1);
    expect(brokerNodes[0].label).toBe('orders');
    // producer->topic and topic->consumer edges
    const eventEdges = graph.edges.filter((e) => e.type === 'event');
    expect(eventEdges.length).toBeGreaterThanOrEqual(2);
    expect(dependencies.find((d) => d.type === 'kafka' && d.dependencyId === '1' && d.dependentId === '2')).toBeTruthy();
  });

  it('matches REST consumer to exposing service by name', () => {
    const services: ServiceForTopology[] = [
      svc({
        id: 'a',
        name: 'Gateway',
        consumesApis: stringify([{ service: 'User Service', method: 'GET', path: '/users' }]),
      }),
      svc({
        id: 'b',
        name: 'User Service',
        exposesApis: stringify([{ method: 'GET', path: '/users' }]),
      }),
    ];
    const { graph, dependencies } = buildTopology(services);
    const restEdges = graph.edges.filter((e) => e.type === 'rest');
    expect(restEdges).toHaveLength(1);
    expect(restEdges[0].source).toBe('svc-a');
    expect(restEdges[0].target).toBe('svc-b');
    expect(dependencies.some((d) => d.type === 'rest')).toBe(true);
  });

  it('consolidates shared databases into one node with edges from each service', () => {
    const services: ServiceForTopology[] = [
      svc({ id: '1', name: 'A', databases: stringify([{ type: 'postgres', name: 'shared' }]) }),
      svc({ id: '2', name: 'B', databases: stringify([{ type: 'postgres', name: 'shared' }]) }),
    ];
    const { graph } = buildTopology(services);
    const dbNodes = graph.nodes.filter((n) => n.type === 'database');
    expect(dbNodes).toHaveLength(1);
    const dbEdges = graph.edges.filter((e) => e.type === 'database');
    expect(dbEdges).toHaveLength(2);
  });
});
