// Shared (client + server) service-name normalisation for on-call matching:
// "Checkout Service" == "checkout-service" == "checkout".
export function serviceKey(name: string): string {
  const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length > 1 && (tokens[tokens.length - 1] === 'service' || tokens[tokens.length - 1] === 'svc')) tokens.pop();
  return tokens.join('-') || name.trim();
}
