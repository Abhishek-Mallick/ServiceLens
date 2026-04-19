import { describe, it, expect } from 'vitest';
import { heuristicAnalyze, detectLanguage } from '@/lib/code-analyzer';

describe('detectLanguage', () => {
  it('recognises NestJS from dependencies', () => {
    const files = [{ path: 'package.json', content: JSON.stringify({ dependencies: { '@nestjs/core': '^10' } }) }];
    const r = detectLanguage(files);
    expect(r.framework).toBe('NestJS');
    expect(r.language).toBe('TypeScript');
  });

  it('falls back to Node.js for generic package.json', () => {
    const files = [{ path: 'package.json', content: JSON.stringify({ dependencies: {} }) }];
    expect(detectLanguage(files).framework).toBe('Node.js');
  });

  it('detects Go from go.mod', () => {
    expect(detectLanguage([{ path: 'go.mod', content: 'module x' }])).toEqual({ language: 'Go', framework: 'Standard' });
  });
});

describe('heuristicAnalyze', () => {
  it('extracts REST routes and health endpoint', () => {
    const files = [
      { path: 'package.json', content: JSON.stringify({ dependencies: { express: '^4' } }) },
      {
        path: 'routes/app.ts',
        content: `
          app.get('/health', ...)
          app.post('/api/orders', ...)
          app.get('/api/orders/:id', ...)
        `,
      },
    ];
    const result = heuristicAnalyze('OrderService', files);
    expect(result.framework).toBe('Express');
    expect(result.exposesApis.some((a) => a.path === '/health')).toBe(true);
    expect(result.exposesApis.some((a) => a.method === 'POST' && a.path === '/api/orders')).toBe(true);
    expect(result.healthEndpoint).toBe('/health');
  });

  it('captures Kafka topic references', () => {
    const files = [
      { path: 'package.json', content: '{}' },
      { path: 'events/producer.ts', content: `const topic = 'orders'; producer.send({ topic: 'orders' });` },
    ];
    const result = heuristicAnalyze('X', files);
    expect(result.kafkaTopics).toContain('orders');
  });
});
