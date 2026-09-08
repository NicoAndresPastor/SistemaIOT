import type { Acuario } from './api';
import { formatearTiempoRelativo } from '../ui/tiempo';
import { colores } from '../ui/colores';

export const SIN_COMUNICACION_MS = 15 * 60 * 1000;

export type Estado = 'ok' | 'alerta' | 'sinComunicacion' | 'manual';

export function calcularEstado(acuario: Acuario): Estado {
  if (!acuario.dispositivo_id) return 'manual';
  const comunicoRecien =
    acuario.ultima_comunicacion !== null &&
    Date.now() - new Date(acuario.ultima_comunicacion).getTime() < SIN_COMUNICACION_MS;
  if (!comunicoRecien) return 'sinComunicacion';
  const algoFueraDeRango =
    acuario.temperatura_fuera_de_rango || acuario.ph_fuera_de_rango || acuario.conductividad_fuera_de_rango;
  return algoFueraDeRango ? 'alerta' : 'ok';
}

export const COLOR_ESTADO: Record<Estado, string> = {
  ok: colores.estadoOk,
  alerta: colores.estadoAlerta,
  sinComunicacion: colores.textoOscuro,
  manual: colores.blanco,
};

export function textoEstado(estado: Estado, acuario: Acuario): string {
  if (estado === 'manual') return 'Carga manual';
  if (estado === 'sinComunicacion') return `Sin comunicación ${formatearTiempoRelativo(acuario.ultima_comunicacion)}`;
  return `Comunicado ${formatearTiempoRelativo(acuario.ultima_comunicacion)}`;
}
