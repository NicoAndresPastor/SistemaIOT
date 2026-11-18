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

export interface TipoEvento {
  id: number;
  nombre: string;
}

export function listarTiposEvento(accessToken: string): Promise<TipoEvento[]> {
  return pedir<TipoEvento[]>('/tipos-evento', { accessToken });
}

export interface ImagenBitacora {
  id: string;
  url: string;
  nombreArchivo: string;
}

export interface EntradaBitacora {
  id: string;
  tipo_evento_id: number;
  tipo_evento_nombre: string;
  observacion: string | null;
  fecha_evento: string;
  fecha_registro: string;
  imagenes: ImagenBitacora[];
}

export interface FotoNueva {
  uri: string;
  nombre: string;
  tipo: string;
}

export function listarBitacora(
  accessToken: string,
  acuarioId: string,
  tipoEventoId?: number
): Promise<EntradaBitacora[]> {
  const query = tipoEventoId !== undefined ? `?tipoEventoId=${tipoEventoId}` : '';
  return pedir<EntradaBitacora[]>(`/acuarios/${acuarioId}/bitacora${query}`, { accessToken });
}

export function crearEntradaBitacora(
  accessToken: string,
  acuarioId: string,
  datos: { tipoEventoId: number; observacion: string; fechaEvento: string; fotos: FotoNueva[] }
): Promise<EntradaBitacora> {
  const formData = new FormData();
  formData.append('tipoEventoId', String(datos.tipoEventoId));
  formData.append('observacion', datos.observacion);
  formData.append('fechaEvento', datos.fechaEvento);
  for (const foto of datos.fotos) {
    formData.append(
      'fotos',
      { uri: foto.uri, name: foto.nombre, type: foto.tipo } as unknown as Blob
    );
  }

  return pedir<EntradaBitacora>(`/acuarios/${acuarioId}/bitacora`, {
    method: 'POST',
    accessToken,
    body: formData,
  });
}

export function eliminarEntradaBitacora(
  accessToken: string,
  acuarioId: string,
  entradaId: string
): Promise<void> {
  return pedir<void>(`/acuarios/${acuarioId}/bitacora/${entradaId}`, { method: 'DELETE', accessToken });
}

export function editarEntradaBitacora(
  accessToken: string,
  acuarioId: string,
  entradaId: string,
  datos: {
    tipoEventoId: number;
    observacion: string;
    fechaEvento: string;
    fotosAEliminar: string[];
    fotosNuevas: FotoNueva[];
  }
): Promise<EntradaBitacora> {
  const formData = new FormData();
  formData.append('tipoEventoId', String(datos.tipoEventoId));
  formData.append('observacion', datos.observacion);
  formData.append('fechaEvento', datos.fechaEvento);
  formData.append('fotosAEliminar', datos.fotosAEliminar.join(','));
  for (const foto of datos.fotosNuevas) {
    formData.append(
      'fotos',
      { uri: foto.uri, name: foto.nombre, type: foto.tipo } as unknown as Blob
    );
  }

  return pedir<EntradaBitacora>(`/acuarios/${acuarioId}/bitacora/${entradaId}`, {
    method: 'PUT',
    accessToken,
    body: formData,
  });
}

export interface Enchufe {
  id: string;
  numero_canal: number;
  nombre: string;
  estado_actual: boolean;
}

export function listarEnchufes(accessToken: string, acuarioId: string): Promise<Enchufe[]> {
  return pedir<Enchufe[]>(`/acuarios/${acuarioId}/enchufes`, { accessToken });
}

export function cambiarEstadoEnchufe(
  accessToken: string,
  acuarioId: string,
  canal: number,
  encendido: boolean
): Promise<{ canal: number; encendidoSolicitado: boolean }> {
  return pedir<{ canal: number; encendidoSolicitado: boolean }>(`/acuarios/${acuarioId}/enchufes/${canal}`, {
    method: 'PUT',
    accessToken,
    body: { encendido },
  });
}
