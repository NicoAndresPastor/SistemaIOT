import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET as string;
const ACCESS_EXPIRES_MIN = Number(process.env.JWT_ACCESS_EXPIRES_MIN ?? 15);
const REFRESH_EXPIRES_DIAS = Number(process.env.REFRESH_TOKEN_EXPIRES_DIAS ?? 30);

export interface AccessTokenPayload {
  usuarioId: string;
}


export function generarAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${ACCESS_EXPIRES_MIN}m` });
}

export function verificarAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
}


export function generarRefreshToken(): { token: string; hash: string; fechaExpiracion: Date } {
  const token = crypto.randomBytes(48).toString('base64url');
  const hash = hashearRefreshToken(token);
  const fechaExpiracion = new Date();
  fechaExpiracion.setDate(fechaExpiracion.getDate() + REFRESH_EXPIRES_DIAS);
  return { token, hash, fechaExpiracion };
}

export function hashearRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
