export interface ServiceProducedEvent {
  name: string;
  topic?: string;
  schema?: Record<string, unknown>;
}

export interface ServiceConsumedEvent {
  name: string;
  topic?: string;
  schema?: Record<string, unknown>;
}

export interface ServiceApi {
  method: string;
  path: string;
  description?: string;
  requestSchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
}

export interface ServiceConsumedApi {
  service: string;
  method: string;
  path: string;
}

export interface ServiceDatabase {
  type: string;
  name: string;
}

export interface AIAnalysisResult {
  language: string;
  framework: string;
  producesEvents: ServiceProducedEvent[];
  consumesEvents: ServiceConsumedEvent[];
  exposesApis: ServiceApi[];
  consumesApis: ServiceConsumedApi[];
  databases: ServiceDatabase[];
  kafkaTopics?: string[];
  healthEndpoint: string | null;
  summary: string;
}

export interface TopologyNode {
  id: string;
  type: 'service' | 'database' | 'broker';
  label: string;
  data: Record<string, unknown>;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type: 'kafka' | 'rest' | 'grpc' | 'database' | 'event';
  label?: string;
  details?: Record<string, unknown>;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface RegressionFlow {
  id: string;
  name: string;
  description: string;
  steps: RegressionFlowStep[];
}

export interface RegressionFlowStep {
  serviceName: string;
  type: 'api_call' | 'event_produce' | 'event_consume' | 'db_write' | 'db_read' | 'health_check';
  name: string;
  description?: string;
  input?: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
}
