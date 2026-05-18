// Lightweight architecture templates. Phase 5.4 v1: name + template picker
// stamps a starter set of stubbed services so users don't stare at an empty
// canvas. Users then bind real Git repos via the existing Add Service flow.
// The richer drag-and-drop visual canvas is tracked for a follow-up.

export interface TemplateService {
  name: string;
  repoUrl: string; // placeholder; user can edit / rebind later
  language: string;
  framework: string;
  summary: string;
  healthEndpoint: string | null;
}

export interface ArchitectureTemplate {
  id: 'blank' | 'ecommerce' | 'saas' | 'streaming';
  name: string;
  tagline: string;
  description: string;
  services: TemplateService[];
}

export const TEMPLATES: ArchitectureTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    tagline: 'Start from scratch',
    description: 'No services pre-populated. Add them one by one with the Add service button.',
    services: [],
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce',
    tagline: 'Catalog · Orders · Payments',
    description: 'A classic retail mesh: gateway, user, product, order, payment, inventory.',
    services: [
      { name: 'API Gateway', repoUrl: 'https://github.com/your-org/api-gateway', language: 'TypeScript', framework: 'Express', summary: 'Edge router and authentication.', healthEndpoint: '/healthz' },
      { name: 'User Service', repoUrl: 'https://github.com/your-org/user-service', language: 'TypeScript', framework: 'NestJS', summary: 'Identity, profile, sessions.', healthEndpoint: '/health' },
      { name: 'Product Service', repoUrl: 'https://github.com/your-org/product-service', language: 'Java', framework: 'Spring Boot', summary: 'Catalog and pricing.', healthEndpoint: '/actuator/health' },
      { name: 'Order Service', repoUrl: 'https://github.com/your-org/order-service', language: 'TypeScript', framework: 'Express', summary: 'Order lifecycle.', healthEndpoint: '/health' },
      { name: 'Payment Service', repoUrl: 'https://github.com/your-org/payment-service', language: 'Python', framework: 'FastAPI', summary: 'Authorize, capture, refund.', healthEndpoint: '/health' },
      { name: 'Inventory Service', repoUrl: 'https://github.com/your-org/inventory-service', language: 'Go', framework: 'Standard', summary: 'Stock levels and reservations.', healthEndpoint: '/health' },
    ],
  },
  {
    id: 'saas',
    name: 'SaaS platform',
    tagline: 'Auth · Billing · Webhooks',
    description: 'A multi-tenant SaaS skeleton with auth, billing, dashboard API, and webhooks.',
    services: [
      { name: 'Auth Service', repoUrl: 'https://github.com/your-org/auth-service', language: 'TypeScript', framework: 'NestJS', summary: 'Tenant + user identity.', healthEndpoint: '/health' },
      { name: 'Billing Service', repoUrl: 'https://github.com/your-org/billing-service', language: 'TypeScript', framework: 'Express', summary: 'Stripe + invoicing.', healthEndpoint: '/health' },
      { name: 'Dashboard API', repoUrl: 'https://github.com/your-org/dashboard-api', language: 'TypeScript', framework: 'Next.js', summary: 'BFF for the web app.', healthEndpoint: '/api/health' },
      { name: 'Webhook Dispatcher', repoUrl: 'https://github.com/your-org/webhooks', language: 'Go', framework: 'Standard', summary: 'Outbound webhook delivery.', healthEndpoint: '/healthz' },
    ],
  },
  {
    id: 'streaming',
    name: 'Streaming pipeline',
    tagline: 'Ingest · Enrich · Sink',
    description: 'An event-streaming pipeline: ingest → enrichment → warehouse + alerting.',
    services: [
      { name: 'Ingest Service', repoUrl: 'https://github.com/your-org/ingest', language: 'Go', framework: 'Standard', summary: 'HTTP/Kafka ingest gateway.', healthEndpoint: '/healthz' },
      { name: 'Enrichment Worker', repoUrl: 'https://github.com/your-org/enrichment', language: 'Python', framework: 'FastAPI', summary: 'Joins lookup data + emits enriched topic.', healthEndpoint: '/health' },
      { name: 'Warehouse Sink', repoUrl: 'https://github.com/your-org/warehouse-sink', language: 'Java', framework: 'Spring Boot', summary: 'Drains to ClickHouse / BigQuery.', healthEndpoint: '/actuator/health' },
      { name: 'Alerting Service', repoUrl: 'https://github.com/your-org/alerting', language: 'TypeScript', framework: 'Express', summary: 'Triggers downstream notifications.', healthEndpoint: '/health' },
    ],
  },
];

export function getTemplate(id: string): ArchitectureTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
