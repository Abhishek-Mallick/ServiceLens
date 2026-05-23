export const EXPRESS_ROUTE_RE =
  /\b(?:app|router|api|server)\.(get|post|put|patch|delete|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/gi;

export const ENV_URL_RE = /process\.env\.([A-Z][A-Z0-9_]*_(?:URL|ENDPOINT|HOST))\b/g;

export const ENV_LINE_RE = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/gm;

export const NEXT_APP_METHOD_RE =
  /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
