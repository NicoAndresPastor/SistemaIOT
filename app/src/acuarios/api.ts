import { pedir } from '../apiClient';

export interface Acuario {
  id: string;
  nombre: string;
  volumen_litros: number | null;
  tipo_agua: 'DULCE' | 'SALADA' | null;
  fecha_creacion: string;
  temperatura: number | null;
  temperatura_marca_temporal: string | null;
  temperatura_fuera_de_rango: boolean | null;
  ph: number | null;
  ph_marca_temporal: string | null;
  ph_fuera_de_rango: boolean | null;
  conductividad: number | null;
  conductividad_marca_temporal: string | null;
  conductividad_fuera_de_rango: boolean | null;
  dispositivo_id: string | null;
  identificador_hardware: string | null;
  ultima_comunicacion: string | null;
}

export type AcuarioResumen = Pick<
  Acuario,
  'id' | 'nombre' | 'volumen_litros' | 'tipo_agua' | 'fecha_creacion'
>;

export interface Vinculacion {
  id: string;
  fecha_inicio: string;
}

export interface DatosAcuario {
  nombre: string;
  volumenLitros: number | null;
  tipoAgua: 'DULCE' | 'SALADA' | null;
}

export function listarAcuarios(accessToken: string): Promise<Acuario[]> {
  return pedir<Acuario[]>('/acuarios', { accessToken });
}

export function obtenerAcuario(accessToken: string, id: string): Promise<Acuario> {
  return pedir<Acuario>(`/acuarios/${id}`, { accessToken });
}

export function crearAcuario(accessToken: string, datos: DatosAcuario): Promise<AcuarioResumen> {
  return pedir<AcuarioResumen>('/acuarios', {
    method: 'POST',
    accessToken,
    body: datos,
  });
}

export function editarAcuario(
  accessToken: string,
  id: string,
  datos: DatosAcuario
): Promise<AcuarioResumen> {
  return pedir<AcuarioResumen>(`/acuarios/${id}`, {
    method: 'PUT',
    accessToken,
    body: datos,
  });
}

export function eliminarAcuario(accessToken: string, id: string): Promise<void> {
  return pedir<void>(`/acuarios/${id}`, { method: 'DELETE', accessToken });
}

export function vincularDispositivo(
  accessToken: string,
  id: string,
  identificadorHardware: string
): Promise<Vinculacion> {
  return pedir<Vinculacion>(`/acuarios/${id}/dispositivo`, {
    method: 'POST',
    accessToken,
    body: { identificadorHardware },
  });
}

export function desvincularDispositivo(accessToken: string, id: string): Promise<void> {
  return pedir<void>(`/acuarios/${id}/dispositivo`, { method: 'DELETE', accessToken });
}

export type ParametroCalibrable = 'TEMP' | 'PH' | 'COND';

export interface PuntoCalibracion {
  valorReferencia: number;
  lecturaAntes: number;
  lecturaDespues: number;
}

export function calibrarLeer(
  accessToken: string,
  id: string,
  parametro: ParametroCalibrable
): Promise<{ lectura: number }> {
  return pedir<{ lectura: number }>(`/acuarios/${id}/calibracion/leer`, {
    method: 'POST',
    accessToken,
    body: { parametro },
  });
}

export function calibrarPunto(
  accessToken: string,
  id: string,
  parametro: ParametroCalibrable,
  punto: number,
  valorReferencia: number
): Promise<{ lecturaAntes: number; lecturaDespues: number }> {
  return pedir<{ lecturaAntes: number; lecturaDespues: number }>(`/acuarios/${id}/calibracion/punto`, {
    method: 'POST',
    accessToken,
    body: { parametro, punto, valorReferencia },
  });
}

export function calibrarGuardar(
  accessToken: string,
  id: string,
  parametro: ParametroCalibrable,
  puntos: PuntoCalibracion[]
): Promise<{ id: string; fechaHora: string; puntos: number }> {
  return pedir<{ id: string; fechaHora: string; puntos: number }>(`/acuarios/${id}/calibracion`, {
    method: 'POST',
    accessToken,
    body: { parametro, puntos },
  });
}
