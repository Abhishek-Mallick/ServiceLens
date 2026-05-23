export interface Endpoint {
  method: string;
  path: string;
  file: string;
  line: number;
  handlerName?: string;
}

export interface OutboundDep {
  envVar: string;
  urlExample?: string;
  file: string;
  line: number;
}

export interface EnvVar {
  name: string;
  defaultValue?: string;
}

export interface ServiceContract {
  endpoints: Endpoint[];
  outboundDeps: OutboundDep[];
  envVars: EnvVar[];
  framework: 'express' | 'nextjs-app' | 'nextjs-pages' | 'fastify' | 'unknown';
  commitSha?: string;
}
