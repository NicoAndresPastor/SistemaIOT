import { Request, Response, NextFunction } from 'express';
import { verificarAccessToken } from './tokens';

declare global {
  namespace Express {
    interface Request {
      usuarioId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta el token de acceso' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verificarAccessToken(token);
    req.usuarioId = payload.usuarioId;
    next();
  } catch {
    res.status(401).json({ error: 'Token de acceso invalido o expirado' });
  }
}
