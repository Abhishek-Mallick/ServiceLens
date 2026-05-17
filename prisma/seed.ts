import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { stringify } from '../lib/utils';
import { buildTopology } from '../lib/topology-builder';

const prisma = new PrismaClient();

interface ServiceSeed {
  name: string;
  repoUrl: string;
  language: string;
  framework: string;
  summary: string;
  healthEndpoint: string | null;
  producesEvents: Array<{ name: string; topic?: string; schema?: Record<string, unknown> }>;
  consumesEvents: Array<{ name: string; topic?: string; schema?: Record<string, unknown> }>;
  exposesApis: Array<{ method: string; path: string; description?: string }>;
  consumesApis: Array<{ service: string; method: string; path: string }>;
  databases: Array<{ type: string; name: string }>;
  kafkaTopics: string[];
}

const services: ServiceSeed[] = [
  {
    name: 'API Gateway',
    repoUrl: 'https://github.com/microservices-demo/front-end',
    language: 'TypeScript',
    framework: 'Express',
    summary: 'Edge router that authenticates and dispatches requests to downstream microservices.',
    healthEndpoint: '/healthz',
    producesEvents: [
      { name: 'RequestReceived', topic: 'gateway.requests', schema: { requestId: 'string', path: 'string', userId: 'string?' } },
    ],
    consumesEvents: [],
    exposesApis: [
      { method: 'ANY', path: '/api/*', description: 'Proxies all downstream service routes' },
      { method: 'GET', path: '/healthz' },
    ],
    consumesApis: [
      { service: 'User Service', method: 'POST', path: '/api/users/verify' },
      { service: 'Product Service', method: 'GET', path: '/api/products' },
      { service: 'Order Service', method: 'POST', path: '/api/orders' },
    ],
    databases: [],
    kafkaTopics: ['gateway.requests'],
  },
  {
    name: 'User Service',
    repoUrl: 'https://github.com/microservices-demo/user',
    language: 'TypeScript',
    framework: 'NestJS',
    summary: 'Owns user identity, profile, and authentication sessions.',
    healthEndpoint: '/health',
    producesEvents: [
      { name: 'UserCreated', topic: 'users', schema: { userId: 'string', email: 'string' } },
      { name: 'UserUpdated', topic: 'users', schema: { userId: 'string', changes: 'object' } },
    ],
    consumesEvents: [],
    exposesApis: [
      { method: 'GET', path: '/api/users/:id' },
      { method: 'POST', path: '/api/users' },
      { method: 'POST', path: '/api/users/verify' },
    ],
    consumesApis: [],
    databases: [{ type: 'postgres', name: 'users_db' }],
    kafkaTopics: ['users'],
  },
  {
    name: 'Product Service',
    repoUrl: 'https://github.com/microservices-demo/catalogue',
    language: 'Java',
    framework: 'Spring Boot',
    summary: 'Canonical source of product catalog entries and pricing.',
    healthEndpoint: '/actuator/health',
    producesEvents: [
      { name: 'ProductUpdated', topic: 'products', schema: { sku: 'string', price: 'number' } },
    ],
    consumesEvents: [],
    exposesApis: [
      { method: 'GET', path: '/api/products' },
      { method: 'GET', path: '/api/products/:sku' },
    ],
    consumesApis: [],
    databases: [{ type: 'postgres', name: 'products_db' }],
    kafkaTopics: ['products'],
  },
  {
    name: 'Order Service',
    repoUrl: 'https://github.com/microservices-demo/orders',
    language: 'TypeScript',
    framework: 'Express',
    summary: 'Creates, cancels, and tracks customer orders.',
    healthEndpoint: '/health',
    producesEvents: [
      { name: 'OrderCreated', topic: 'orders', schema: { orderId: 'string', userId: 'string', total: 'number' } },
      { name: 'OrderCancelled', topic: 'orders', schema: { orderId: 'string', reason: 'string' } },
    ],
    consumesEvents: [
      { name: 'UserCreated', topic: 'users' },
    ],
    exposesApis: [
      { method: 'POST', path: '/api/orders' },
      { method: 'GET', path: '/api/orders/:id' },
      { method: 'DELETE', path: '/api/orders/:id' },
    ],
    consumesApis: [
      { service: 'Product Service', method: 'GET', path: '/api/products/:sku' },
    ],
    databases: [{ type: 'postgres', name: 'orders_db' }],
    kafkaTopics: ['orders', 'users'],
  },
  {
    name: 'Payment Service',
    repoUrl: 'https://github.com/microservices-demo/payment',
    language: 'Python',
    framework: 'FastAPI',
    summary: 'Authorizes, captures, and reconciles payments against orders.',
    healthEndpoint: '/health',
    producesEvents: [
      { name: 'PaymentProcessed', topic: 'payments', schema: { orderId: 'string', amount: 'number', status: 'string' } },
      { name: 'PaymentFailed', topic: 'payments', schema: { orderId: 'string', reason: 'string' } },
    ],
    consumesEvents: [
      { name: 'OrderCreated', topic: 'orders' },
    ],
    exposesApis: [
      { method: 'POST', path: '/api/payments/charge' },
      { method: 'POST', path: '/api/payments/refund' },
    ],
    consumesApis: [],
    databases: [{ type: 'postgres', name: 'payments_db' }],
    kafkaTopics: ['payments', 'orders'],
  },
  {
    name: 'Inventory Service',
    repoUrl: 'https://github.com/microservices-demo/carts',
    language: 'Go',
    framework: 'Standard',
    summary: 'Maintains stock levels and reserves inventory for orders.',
    healthEndpoint: '/health',
    producesEvents: [
      { name: 'StockUpdated', topic: 'inventory', schema: { sku: 'string', count: 'number' } },
      { name: 'StockDepleted', topic: 'inventory', schema: { sku: 'string' } },
    ],
    consumesEvents: [
      { name: 'OrderCreated', topic: 'orders' },
      { name: 'PaymentProcessed', topic: 'payments' },
    ],
    exposesApis: [
      { method: 'GET', path: '/api/inventory/:sku' },
    ],
    consumesApis: [],
    databases: [{ type: 'postgres', name: 'inventory_db' }, { type: 'redis', name: 'inventory_cache' }],
    kafkaTopics: ['inventory', 'orders', 'payments'],
  },
  {
    name: 'Notification Service',
    repoUrl: 'https://github.com/microservices-demo/queue-master',
    language: 'TypeScript',
    framework: 'Node.js',
    summary: 'Delivers email and SMS notifications triggered by mesh events.',
    healthEndpoint: '/health',
    producesEvents: [],
    consumesEvents: [
      { name: 'OrderCreated', topic: 'orders' },
      { name: 'PaymentProcessed', topic: 'payments' },
      { name: 'PaymentFailed', topic: 'payments' },
      { name: 'StockDepleted', topic: 'inventory' },
    ],
    exposesApis: [
      { method: 'POST', path: '/api/notifications/send' },
    ],
    consumesApis: [],
    databases: [{ type: 'mongodb', name: 'notifications_log' }],
    kafkaTopics: ['orders', 'payments', 'inventory'],
  },
  {
    name: 'Shipping Service',
    repoUrl: 'https://github.com/microservices-demo/shipping',
    language: 'Java',
    framework: 'Spring Boot',
    summary: 'Schedules carrier pickups and tracks shipment status.',
    healthEndpoint: '/actuator/health',
    producesEvents: [
      { name: 'ShipmentCreated', topic: 'shipping', schema: { shipmentId: 'string', carrier: 'string' } },
      { name: 'ShipmentDelivered', topic: 'shipping', schema: { shipmentId: 'string', deliveredAt: 'string' } },
    ],
    consumesEvents: [
      { name: 'PaymentProcessed', topic: 'payments' },
    ],
    exposesApis: [
      { method: 'GET', path: '/api/shipments/:id' },
    ],
    consumesApis: [],
    databases: [{ type: 'postgres', name: 'shipping_db' }],
    kafkaTopics: ['shipping', 'payments'],
  },
  {
    name: 'Analytics Service',
    repoUrl: 'https://github.com/microservices-demo/load-test',
    language: 'Python',
    framework: 'FastAPI',
    summary: 'Aggregates every mesh event into a warehouse for reporting.',
    healthEndpoint: '/health',
    producesEvents: [],
    consumesEvents: [
      { name: 'UserCreated', topic: 'users' },
      { name: 'UserUpdated', topic: 'users' },
      { name: 'OrderCreated', topic: 'orders' },
      { name: 'OrderCancelled', topic: 'orders' },
      { name: 'PaymentProcessed', topic: 'payments' },
      { name: 'PaymentFailed', topic: 'payments' },
      { name: 'StockUpdated', topic: 'inventory' },
      { name: 'ShipmentCreated', topic: 'shipping' },
    ],
    exposesApis: [],
    consumesApis: [],
    databases: [{ type: 'clickhouse', name: 'analytics_warehouse' }],
    kafkaTopics: ['users', 'orders', 'payments', 'inventory', 'shipping'],
  },
  {
    name: 'Search Service',
    repoUrl: 'https://github.com/microservices-demo/registry',
    language: 'TypeScript',
    framework: 'Node.js',
    summary: 'Keeps the product search index in sync with catalog and inventory changes.',
    healthEndpoint: '/health',
    producesEvents: [],
    consumesEvents: [
      { name: 'ProductUpdated', topic: 'products' },
      { name: 'StockUpdated', topic: 'inventory' },
    ],
    exposesApis: [
      { method: 'GET', path: '/api/search' },
    ],
    consumesApis: [],
    databases: [{ type: 'elasticsearch', name: 'product_index' }],
    kafkaTopics: ['products', 'inventory'],
  },
];

function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  console.log('🌱 Seeding ServiceLens demo data…');

  // User
  const passwordHash = await bcrypt.hash('demo123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@servicelens.com' },
    update: {},
    create: {
      email: 'demo@servicelens.com',
      name: 'Demo User',
      password: passwordHash,
    },
  });

  // Clear prior architectures for this user to keep seed idempotent
  await prisma.architecture.deleteMany({ where: { userId: user.id } });

  // Architecture
  const architecture = await prisma.architecture.create({
    data: {
      userId: user.id,
      name: 'E-Commerce Platform',
      description: '10-service retail mesh: commerce, payments, inventory, search, and analytics. Seeded for demo.',
      status: 'ready',
    },
  });

  // Services
  const createdServices = [];
  for (const s of services) {
    const rng = mulberry(hash32(s.name));
    const rand = rng();
    let health: 'healthy' | 'degraded' | 'down' = 'healthy';
    if (/payment/i.test(s.name) && rand > 0.6) health = 'degraded';
    if (/search/i.test(s.name) && rand > 0.7) health = 'down';

    const created = await prisma.service.create({
      data: {
        architectureId: architecture.id,
        name: s.name,
        repoUrl: s.repoUrl,
        branch: 'main',
        analysisStatus: 'completed',
        language: s.language,
        framework: s.framework,
        summary: s.summary,
        producesEvents: stringify(s.producesEvents),
        consumesEvents: stringify(s.consumesEvents),
        exposesApis: stringify(s.exposesApis),
        consumesApis: stringify(s.consumesApis),
        databases: stringify(s.databases),
        kafkaTopics: stringify(s.kafkaTopics),
        healthEndpoint: s.healthEndpoint,
        healthStatus: health,
        lastHealthCheck: new Date(),
        simulated: true,
        analysisResult: stringify({ ...s, summary: s.summary }),
      },
    });
    createdServices.push(created);
  }

  // Topology + dependencies
  const { graph, dependencies } = buildTopology(createdServices);
  for (const d of dependencies) {
    await prisma.serviceDependency.upsert({
      where: {
        dependentId_dependencyId_type: {
          dependentId: d.dependentId,
          dependencyId: d.dependencyId,
          type: d.type,
        },
      },
      update: { details: stringify(d.details) },
      create: { ...d, details: stringify(d.details) },
    });
  }
  await prisma.architecture.update({
    where: { id: architecture.id },
    data: { topologyData: stringify(graph) },
  });

  // 7 days of health records, every 30 minutes = 336 checks per service
  console.log('  · generating health history (336 records × 10 services)…');
  const now = Date.now();
  const intervalMs = 30 * 60 * 1000;
  const total = 336;
  const healthRecords: Array<{
    serviceId: string;
    status: string;
    responseTime: number;
    details: string;
    simulated: boolean;
    checkedAt: Date;
  }> = [];

  for (const svc of createdServices) {
    const rng = mulberry(hash32(svc.name));
    const baseline = 60 + (hash32(svc.name) % 160);
    for (let i = total - 1; i >= 0; i--) {
      const t = now - i * intervalMs;
      const r = rng();
      let status: 'healthy' | 'degraded' | 'down' = 'healthy';
      let rt = Math.floor(baseline + r * 180);
      if (/payment/i.test(svc.name) && r > 0.8) {
        status = 'degraded';
        rt = Math.floor(rt * 2.3);
      }
      if (/search/i.test(svc.name)) {
        // One block of downtime between 48 and 56 steps ago
        if (i > 48 && i < 56) {
          status = 'down';
          rt = 0;
        } else if (r > 0.92) {
          status = 'degraded';
          rt = Math.floor(rt * 1.8);
        }
      } else {
        if (r > 0.97) {
          status = 'down';
          rt = 0;
        } else if (r > 0.9) {
          status = 'degraded';
          rt = Math.floor(rt * 1.6);
        }
      }
      healthRecords.push({
        serviceId: svc.id,
        status,
        responseTime: rt,
        details: stringify({ simulated: true }),
        simulated: true,
        checkedAt: new Date(t),
      });
    }
  }

  // createMany is a lot faster than looped create
  await prisma.healthRecord.createMany({ data: healthRecords });

  // 3 completed regression runs
  console.log('  · generating regression runs…');
  const runConfigs = [
    { daysAgo: 0.5, passRate: 1.0 },
    { daysAgo: 2, passRate: 0.87 },
    { daysAgo: 5, passRate: 0.95 },
  ];

  const allSteps = [
    { name: 'API Gateway routes /api/orders', type: 'api_call', serviceName: 'API Gateway' },
    { name: 'Order Service creates OrderCreated event', type: 'event_produce', serviceName: 'Order Service' },
    { name: 'Payment Service consumes OrderCreated', type: 'event_consume', serviceName: 'Payment Service' },
    { name: 'Payment Service produces PaymentProcessed', type: 'event_produce', serviceName: 'Payment Service' },
    { name: 'Inventory Service consumes PaymentProcessed', type: 'event_consume', serviceName: 'Inventory Service' },
    { name: 'Inventory Service produces StockUpdated', type: 'event_produce', serviceName: 'Inventory Service' },
    { name: 'Search Service consumes StockUpdated', type: 'event_consume', serviceName: 'Search Service' },
    { name: 'Notification Service consumes PaymentProcessed', type: 'event_consume', serviceName: 'Notification Service' },
    { name: 'Shipping Service consumes PaymentProcessed', type: 'event_consume', serviceName: 'Shipping Service' },
    { name: 'Analytics consumes all order events', type: 'event_consume', serviceName: 'Analytics Service' },
    { name: 'User Service /api/users/verify', type: 'api_call', serviceName: 'User Service' },
    { name: 'Product Service /api/products', type: 'api_call', serviceName: 'Product Service' },
    { name: 'Health: API Gateway', type: 'health_check', serviceName: 'API Gateway' },
    { name: 'Health: User Service', type: 'health_check', serviceName: 'User Service' },
    { name: 'Health: Order Service', type: 'health_check', serviceName: 'Order Service' },
    { name: 'Health: Payment Service', type: 'health_check', serviceName: 'Payment Service' },
    { name: 'Schema validation: OrderCreated payload', type: 'event_produce', serviceName: 'Order Service' },
    { name: 'Schema validation: PaymentProcessed payload', type: 'event_produce', serviceName: 'Payment Service' },
    { name: 'Contract: Gateway → User Service', type: 'api_call', serviceName: 'API Gateway' },
    { name: 'Contract: Gateway → Order Service', type: 'api_call', serviceName: 'API Gateway' },
  ];

  const svcByName = new Map(createdServices.map((s) => [s.name, s]));

  for (const cfg of runConfigs) {
    const startedAt = new Date(now - cfg.daysAgo * 24 * 60 * 60 * 1000);
    const completedAt = new Date(startedAt.getTime() + 18_000 + Math.random() * 30_000);
    const totalSteps = allSteps.length;
    const passed = Math.round(totalSteps * cfg.passRate);
    const failed = totalSteps - passed;

    const run = await prisma.regressionRun.create({
      data: {
        architectureId: architecture.id,
        status: failed === 0 ? 'completed' : 'completed',
        triggeredBy: 'demo@servicelens.com',
        startedAt,
        completedAt,
        totalSteps,
        passedSteps: passed,
        failedSteps: failed,
        simulated: true,
        summary: stringify({
          summary:
            failed === 0
              ? `All ${totalSteps} steps passed. Mesh is healthy end-to-end.`
              : `${passed} of ${totalSteps} steps passed. ${failed} contract drift issue(s) detected in the payment + inventory path — recommend reviewing the schema for PaymentProcessed.`,
          recommendations:
            failed === 0
              ? ['Consider adding load-based scenarios to catch latency regressions.']
              : [
                  'Align PaymentProcessed schema between producer and Inventory consumer.',
                  'Add circuit breaker around Product Service lookups from Order Service.',
                ],
        }),
        createdAt: startedAt,
      },
    });

    for (let i = 0; i < allSteps.length; i++) {
      const step = allSteps[i];
      const svc = svcByName.get(step.serviceName) ?? createdServices[0];
      const status = i < passed ? 'passed' : 'failed';
      await prisma.regressionTestStep.create({
        data: {
          runId: run.id,
          serviceId: svc.id,
          stepOrder: i,
          name: step.name,
          type: step.type,
          status,
          duration: Math.floor(80 + Math.random() * 320),
          input: status === 'failed' ? stringify({ payload: { orderId: 'abc-123' } }) : null,
          expectedOutput: stringify({ statusCode: 200 }),
          actualOutput: status === 'passed' ? stringify({ statusCode: 200 }) : null,
          errorMessage:
            status === 'failed'
              ? 'Schema mismatch: consumer expected field "paymentMethod", producer emitted "method".'
              : null,
          executedAt: new Date(startedAt.getTime() + i * 500),
        },
      });
    }
  }

  console.log('✅ Seeded user=demo@servicelens.com / demo123');
  console.log(`   architecture=${architecture.name}, ${createdServices.length} services`);
  console.log(`   ${healthRecords.length} health records, ${runConfigs.length} regression runs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
