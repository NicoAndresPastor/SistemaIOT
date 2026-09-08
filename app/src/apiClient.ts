import { API_URL } from './config';

export class ApiError extends Error {}

interface Opciones {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  accessToken?: string;
}

interface Cabeceras {
  'Content-Type'?: string;
  Authorization?: string;
}

export async function pedir<T>(path: string, opciones: Opciones = {}): Promise<T> {
  const headers: Cabeceras = {};

  if (opciones.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (opciones.accessToken) {
    headers['Authorization'] = `Bearer ${opciones.accessToken}`;
  }

  let metodo: 'GET' | 'POST' | 'PUT' | 'DELETE';
  if (opciones.method === undefined) {
    metodo = 'GET';
  } else {
    metodo = opciones.method;
  }

  let cuerpo: string | undefined;
  if (opciones.body !== undefined) {
    cuerpo = JSON.stringify(opciones.body);
  } else {
    cuerpo = undefined;
  }

  const respuesta = await fetch(`${API_URL}${path}`, {
    method: metodo,
    headers: headers as Record<string, string>,
    body: cuerpo,
  });

  let datos;
  if (respuesta.status === 204) {
    datos = null;
  } else {
    datos = await respuesta.json();
  }

  if (!respuesta.ok) { 
    let mensaje = 'Error inesperado del servidor';
    if (datos !== null && datos.error !== undefined) {
      mensaje = datos.error;
    }
    throw new ApiError(mensaje);
  }

  return datos as T;
}
