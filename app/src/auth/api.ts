import { pedir } from '../apiClient';

export interface Usuario {
  id: string;
  email: string;
  fecha_alta: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenNuevo {
  accessToken: string;
}

export function registrar(email: string, contrasena: string): Promise<Usuario> {
  return pedir<Usuario>('/auth/registro', {
    method: 'POST', 
    body: { email: email, contrasena: contrasena, consentimiento: true },
  });
}

export function iniciarSesion(
  email: string,
  contrasena: string,
  sistemaOperativo: 'IOS' | 'ANDROID'
): Promise<Tokens> {
  return pedir<Tokens>('/auth/login', {
    method: 'POST',
    body: { email: email, contrasena: contrasena, sistemaOperativo: sistemaOperativo },
  });
}

export function refrescarToken(refreshToken: string): Promise<AccessTokenNuevo> {
  return pedir<AccessTokenNuevo>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: refreshToken },
  });
}

export function cerrarSesion(refreshToken: string): Promise<void> {
  return pedir<void>('/auth/logout', {
    method: 'POST',
    body: { refreshToken: refreshToken },
  });
}

export interface MiCuenta {
  email: string;
}

export function obtenerMiCuenta(accessToken: string): Promise<MiCuenta> {
  return pedir<MiCuenta>('/auth/me', { accessToken });
}

export function eliminarCuenta(accessToken: string): Promise<void> {
  return pedir<void>('/auth/me', { method: 'DELETE', accessToken });
}
