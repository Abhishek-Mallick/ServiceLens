import jwt from 'jsonwebtoken';

const ACK_AUD = 'servicelens-ack';
const ACK_EXPIRY = '24h';

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('NEXTAUTH_SECRET is required for magic-link tokens');
  return s;
}

export function signAckToken(incidentId: string, userId: string | null): string {
  return jwt.sign(
    { incidentId, userId },
    secret(),
    { audience: ACK_AUD, expiresIn: ACK_EXPIRY }
  );
}

export interface AckTokenPayload {
  incidentId: string;
  userId: string | null;
}

export function verifyAckToken(token: string): AckTokenPayload {
  const decoded = jwt.verify(token, secret(), { audience: ACK_AUD }) as jwt.JwtPayload & AckTokenPayload;
  if (!decoded.incidentId) throw new Error('invalid ack token');
  return { incidentId: decoded.incidentId, userId: decoded.userId ?? null };
}
