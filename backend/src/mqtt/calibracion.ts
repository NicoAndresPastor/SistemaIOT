import { randomUUID } from 'crypto';
import type { MqttClient } from 'mqtt';

const TIMEOUT_RESPUESTA_MS = 10_000;

interface ComandoCalibracion {
  accion: 'leer' | 'fijarPunto';
  parametro: string;
  punto?: number;
  valorReferencia?: number;
}

interface RespuestaCalibracion {
  solicitudId: string;
  ok: boolean;
  lectura?: number;
  lecturaAntes?: number;
  lecturaDespues?: number;
  error?: string;
}

interface SolicitudPendiente {
  resolve: (respuesta: RespuestaCalibracion) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

const solicitudesPendientes = new Map<string, SolicitudPendiente>();

let cliente: MqttClient | undefined;

// Lo llama index.ts con el mismo cliente que ya devuelve iniciarSuscriptorMqtt(),
// para no abrir una segunda conexion al broker.
export function inicializarClienteCalibracion(mqttClient: MqttClient) {
  cliente = mqttClient;
}

export function pedirCalibracion(
  identificadorHardware: string,
  comando: ComandoCalibracion
): Promise<RespuestaCalibracion> {
  if (!cliente) {
    return Promise.reject(new Error('El cliente MQTT todavia no esta listo'));
  }

  const solicitudId = randomUUID();
  const topic = `acuarios/${identificadorHardware}/calibracion/comando`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      solicitudesPendientes.delete(solicitudId);
      reject(new Error('El dispositivo no respondio a tiempo'));
    }, TIMEOUT_RESPUESTA_MS);

    solicitudesPendientes.set(solicitudId, { resolve, reject, timeout });

    cliente!.publish(topic, JSON.stringify({ solicitudId, ...comando }), (error) => {
      if (!error) return;
      clearTimeout(timeout);
      solicitudesPendientes.delete(solicitudId);
      reject(error);
    });
  });
}

// Lo llama subscriber.ts cuando llega un mensaje en
// acuarios/+/calibracion/respuesta.
export function manejarRespuestaCalibracion(payload: Buffer) {
  let respuesta: RespuestaCalibracion;
  try {
    respuesta = JSON.parse(payload.toString());
  } catch {
    console.warn('MQTT: respuesta de calibracion con JSON invalido');
    return;
  }

  const pendiente = solicitudesPendientes.get(respuesta.solicitudId);
  if (!pendiente) {
    // Puede ser una respuesta tardia, ya vencido el timeout: se ignora.
    return;
  }

  clearTimeout(pendiente.timeout);
  solicitudesPendientes.delete(respuesta.solicitudId);
  pendiente.resolve(respuesta);
}
