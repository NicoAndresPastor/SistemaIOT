import mqtt from 'mqtt';
import { pool } from '../db';
import { manejarRespuestaCalibracion } from './calibracion';
import { manejarEstadoReportado, TOPIC_ENCHUFES_REPORTADO } from './enchufes';

const BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const TOPIC_MEDICIONES = 'acuarios/+/mediciones';
const TOPIC_CALIBRACION_RESPUESTA = 'acuarios/+/calibracion/respuesta';

interface LecturaRecibida {
  parametro: string;
  valor: number;
  // Opcional: si falta, se usa mensaje.marcaTemporal (compatibilidad con
  // el envio en vivo, donde las 3 lecturas del ciclo comparten un mismo
  // instante). Al reenviar el buffer offline, cada lectura trae la suya.
  marcaTemporal?: string;
}

interface MensajeMediciones {
  marcaTemporal: string;
  lecturas: LecturaRecibida[];
}

export function iniciarSuscriptorMqtt() {
  const client = mqtt.connect(BROKER_URL);

  client.on('connect', () => {
    console.log('MQTT: conectado al broker', BROKER_URL);
    client.subscribe(TOPIC_MEDICIONES);
    client.subscribe(TOPIC_CALIBRACION_RESPUESTA);
    // QoS 1 en la suscripcion: le pide al broker que, si el mensaje retenido
    // o uno nuevo se publico con QoS 1, tambien se lo entregue con QoS 1 al
    // backend (como minimo una vez), en vez de degradarlo a QoS 0.
    client.subscribe(TOPIC_ENCHUFES_REPORTADO, { qos: 1 });
  });

  client.on('message', (topic, payload) => {
    if (topic.endsWith('/calibracion/respuesta')) {
      manejarRespuestaCalibracion(payload);
      return;
    }
    // acuarios/{identificador}/enchufes/{canal}/reportado
    const partes = topic.split('/');
    if (partes.length === 5 && partes[2] === 'enchufes' && partes[4] === 'reportado') {
      const identificadorHardware = partes[1];
      const canal = Number(partes[3]);
      if (!Number.isInteger(canal)) {
        console.warn('MQTT: topico de enchufe reportado con canal invalido', topic);
        return;
      }
      manejarEstadoReportado(identificadorHardware, canal, payload).catch((error) => {
        console.error('MQTT: error procesando estado reportado de', topic, error);
      });
      return;
    }
    procesarMensaje(topic, payload).catch((error) => {
      console.error('MQTT: error procesando mensaje de', topic, error);
    });
  });

  client.on('error', (error) => {
    console.error('MQTT: error de conexion', error);
  });

  return client;
}

async function procesarMensaje(topic: string, payload: Buffer) {
  const identificadorHardware = topic.split('/')[1];

  let mensaje: MensajeMediciones;
  try {
    mensaje = JSON.parse(payload.toString());
  } catch {
    console.warn(`MQTT: mensaje con JSON invalido de ${identificadorHardware}`);
    return;
  }

  if (!Array.isArray(mensaje.lecturas) || mensaje.lecturas.length === 0) {
    console.warn(`MQTT: mensaje sin lecturas de ${identificadorHardware}`);
    return;
  }

  const dispositivoResultado = await pool.query(
    'SELECT id FROM dispositivo WHERE identificador_hardware = $1',
    [identificadorHardware]
  );
  if (dispositivoResultado.rows.length === 0) {
    console.warn(`MQTT: dispositivo desconocido "${identificadorHardware}"`);
    return;
  }
  const dispositivoId = dispositivoResultado.rows[0].id;

  const vinculacionResultado = await pool.query(
    'SELECT acuario_id FROM vinculacion WHERE dispositivo_id = $1 AND fecha_fin IS NULL',
    [dispositivoId]
  );
  if (vinculacionResultado.rows.length === 0) {
    console.warn(`MQTT: dispositivo "${identificadorHardware}" no esta vinculado a ningun acuario`);
    return;
  }
  const acuarioId = vinculacionResultado.rows[0].acuario_id;

  for (const lectura of mensaje.lecturas) {
    const parametroResultado = await pool.query(
      'SELECT id FROM parametro WHERE codigo = $1',
      [lectura.parametro]
    );
    if (parametroResultado.rows.length === 0) {
      console.warn(`MQTT: parametro desconocido "${lectura.parametro}"`);
      continue;
    }
    const parametroId = parametroResultado.rows[0].id;
    const marcaTemporal = lectura.marcaTemporal ?? mensaje.marcaTemporal;

    try {
      await pool.query(
        `INSERT INTO medicion (acuario_id, parametro_id, dispositivo_id, valor, marca_temporal, origen)
         VALUES ($1, $2, $3, $4, $5, 'AUTOMATICA')
         ON CONFLICT DO NOTHING`,
        [acuarioId, parametroId, dispositivoId, lectura.valor, marcaTemporal]
      );
    } catch (error) {
      // Una lectura invalida (ej. marcaTemporal con formato incorrecto) no
      // debe tirar abajo el resto del lote -- importante cuando se reenvia
      // un buffer de varias lecturas acumuladas offline.
      console.warn(`MQTT: no se pudo guardar la lectura de "${lectura.parametro}"`, error);
    }
  }

  await pool.query('UPDATE dispositivo SET ultima_comunicacion = now() WHERE id = $1', [dispositivoId]);
}
