import type { MqttClient } from 'mqtt';
import { pool } from '../db';

let cliente: MqttClient | undefined;

// Lo llama index.ts con el mismo cliente que ya devuelve iniciarSuscriptorMqtt(),
// para no abrir una segunda conexion al broker (mismo patron que calibracion.ts).
export function inicializarClienteEnchufes(mqttClient: MqttClient) {
  cliente = mqttClient;
}

// Un topico por enchufe y por sentido (deseado/reportado), en vez de uno
// compartido para todos los canales: asi el broker retiene por separado la
// ultima orden de cada enchufe. Con un unico topico retenido para los dos
// canales, una orden al enchufe 2 pisaria el mensaje retenido de la orden al
// enchufe 1, y si la placa estuviera desconectada en ese momento, al
// reconectarse solo recibiria la ultima de las dos.
function topicoDeseado(identificadorHardware: string, canal: number): string {
  return `acuarios/${identificadorHardware}/enchufes/${canal}/deseado`;
}

function topicoReportado(identificadorHardware: string, canal: number): string {
  return `acuarios/${identificadorHardware}/enchufes/${canal}/reportado`;
}

// Se usa para suscribirse a los dos canales de todos los dispositivos de una
// sola vez, con los comodines + de MQTT en el lugar del identificador y del
// numero de canal.
export const TOPIC_ENCHUFES_REPORTADO = 'acuarios/+/enchufes/+/reportado';

// Con QoS 1 la publicacion termina recien cuando el broker acusa recibo. Si
// el backend perdio la conexion con el broker, la libreria guarda el mensaje
// en cola y ese acuse nunca llega a tiempo: sin este limite, el pedido HTTP
// de la app quedaria esperando indefinidamente.
const TIEMPO_MAXIMO_PUBLICACION_MS = 5000;

// Publica la orden con QoS 1 (al menos una entrega) y retenida: si la placa
// esta desconectada, el broker guarda este mensaje y se lo entrega apenas
// vuelva a conectarse y se suscriba. Un reenvio duplicado no es un problema,
// porque aplicar dos veces el mismo estado da el mismo resultado.
export function publicarComandoEnchufe(
  identificadorHardware: string,
  canal: number,
  encendido: boolean
): Promise<void> {
  if (!cliente) return Promise.reject(new Error('El cliente MQTT todavia no esta listo'));

  const topic = topicoDeseado(identificadorHardware, canal);
  const payload = JSON.stringify({ estado: encendido, marcaTemporal: new Date().toISOString() });

  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(
      () => reject(new Error('El broker no confirmo la recepcion de la orden')),
      TIEMPO_MAXIMO_PUBLICACION_MS
    );
    cliente!.publish(topic, payload, { qos: 1, retain: true }, (error) => {
      clearTimeout(temporizador);
      if (error) reject(error);
      else resolve();
    });
  });
}

// Se llama desde subscriber.ts cuando llega un mensaje en
// acuarios/+/enchufes/+/reportado -- tanto si la placa acaba de aplicar un
// cambio como si es el mensaje retenido que llega apenas el backend se
// suscribe, con el ultimo estado real que la placa haya informado.
export async function manejarEstadoReportado(
  identificadorHardware: string,
  canal: number,
  payload: Buffer
) {
  let mensaje: { estado?: unknown };
  try {
    mensaje = JSON.parse(payload.toString());
  } catch {
    console.warn(`MQTT: estado reportado con JSON invalido de ${identificadorHardware}, canal ${canal}`);
    return;
  }

  if (typeof mensaje.estado !== 'boolean') {
    console.warn(`MQTT: estado reportado sin "estado" booleano de ${identificadorHardware}, canal ${canal}`);
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

  const enchufeResultado = await pool.query(
    `INSERT INTO enchufe (dispositivo_id, numero_canal, nombre, estado_actual)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (dispositivo_id, numero_canal)
     DO UPDATE SET estado_actual = EXCLUDED.estado_actual
     RETURNING id`,
    [dispositivoId, canal, `Enchufe ${canal}`, mensaje.estado]
  );

  // Solo se confirma la orden mas reciente del enchufe, y solo si pedia el
  // estado que la placa acaba de informar. Las ordenes anteriores que
  // quedaron sin confirmar fueron reemplazadas antes de llegar a la placa
  // (por ejemplo, encender y apagar varias veces mientras estaba
  // desconectada): quedan en el historial como no ejecutadas.
  await pool.query(
    `UPDATE accionamiento SET fecha_confirmacion = now()
     WHERE id = (
       SELECT id FROM accionamiento WHERE enchufe_id = $1
       ORDER BY fecha_hora DESC LIMIT 1
     )
     AND fecha_confirmacion IS NULL
     AND estado_final = $2`,
    [enchufeResultado.rows[0].id, mensaje.estado]
  );
}
