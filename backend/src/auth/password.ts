import bcrypt from 'bcrypt';

const COST_FACTOR = 10;

export function hashearContrasena(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, COST_FACTOR);
}

export function verificarContrasena(contrasena: string, hash: string): Promise<boolean> {
  return bcrypt.compare(contrasena, hash);
}
