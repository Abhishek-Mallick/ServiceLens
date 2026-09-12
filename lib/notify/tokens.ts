import jwt from 'jsonwebtoken';

const ACK_AUD = 'servicelens-ack';
const ACK_EXPIRY = '24h';

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('NEXTAUTH_SECRET is required for magic-link tokens');
  return s;
}

// `email` identifies non-user recipients (e.g. an on-call engineer from the
// roster who has no ServiceLens account) so the ack is attributed correctly.
export function signAckToken(incidentId: string, userId: string | null, email?: string | null): string {
  return jwt.sign(
    { incidentId, userId, email: email ?? null },
    secret(),
    { audience: ACK_AUD, expiresIn: ACK_EXPIRY }
  );
}

export interface AckTokenPayload {
  incidentId: string;
  userId: string | null;
  email: string | null;
}

export function verifyAckToken(token: string): AckTokenPayload {
  const decoded = jwt.verify(token, secret(), { audience: ACK_AUD }) as jwt.JwtPayload & AckTokenPayload;
  if (!decoded.incidentId) throw new Error('invalid ack token');
  return { incidentId: decoded.incidentId, userId: decoded.userId ?? null, email: decoded.email ?? null };
}
