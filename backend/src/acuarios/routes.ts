import { Router } from 'express';
import { pool } from '../db';
import { pedirCalibracion } from '../mqtt/calibracion';

export const acuariosRouter = Router();

// Usado por las tres rutas de calibracion: confirma que el acuario es del
// usuario y que tiene un dispositivo vinculado, y devuelve tanto su id como
// su identificador_hardware (uno para persistir en la base, el otro para
// armar el topico MQTT).
type DispositivoVinculado =
  | { error: 404; mensaje: string }
  | { dispositivoId: string; identificadorHardware: string };

async function resolverDispositivoVinculado(
  acuarioId: string,
  usuarioId: string
): Promise<DispositivoVinculado> {
  const acuario = await pool.query('SELECT id FROM acuario WHERE id = $1 AND usuario_id = $2', [
    acuarioId,
    usuarioId,
  ]);
  if (acuario.rows.length === 0) {
    return { error: 404 as const, mensaje: 'Acuario no encontrado' };
  }

  const resultado = await pool.query(
    `SELECT d.id AS dispositivo_id, d.identificador_hardware
     FROM vinculacion v JOIN dispositivo d ON d.id = v.dispositivo_id
     WHERE v.acuario_id = $1 AND v.fecha_fin IS NULL`,
    [acuarioId]
  );
  if (resultado.rows.length === 0) {
    return { error: 404 as const, mensaje: 'Este acuario no tiene un dispositivo vinculado' };
  }

  return {
    dispositivoId: resultado.rows[0].dispositivo_id as string,
    identificadorHardware: resultado.rows[0].identificador_hardware as string,
  };
}

acuariosRouter.post('/', async (req, res) => {
  const { nombre, volumenLitros, tipoAgua } = req.body;

  if (typeof nombre !== 'string' || nombre.trim().length === 0 || nombre.length > 100) {
    res.status(400).json({ error: 'El nombre es obligatorio y debe tener hasta 100 caracteres' });
    return;
  }
  if (tipoAgua !== undefined && tipoAgua !== null && !['DULCE', 'SALADA'].includes(tipoAgua)) {
    res.status(400).json({ error: 'tipoAgua debe ser DULCE o SALADA' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resultadoAcuario = await client.query(
      `INSERT INTO acuario (usuario_id, nombre, volumen_litros, tipo_agua) VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, volumen_litros, tipo_agua, fecha_creacion`,
      [req.usuarioId, nombre.trim(), volumenLitros ?? null, tipoAgua ?? null]
    );
    const acuario = resultadoAcuario.rows[0];

    await client.query(
      `INSERT INTO configuracion_parametro (acuario_id, parametro_id, valor_minimo, valor_maximo)
       SELECT $1, id, min_por_defecto, max_por_defecto FROM parametro`,
      [acuario.id]
    );

    await client.query('COMMIT');
    res.status(201).json(acuario);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

const CONSULTA_ACUARIOS = `
  SELECT
      a.id, a.nombre, a.volumen_litros, a.tipo_agua, a.fecha_creacion,
      temp.valor AS temperatura, temp.marca_temporal AS temperatura_marca_temporal,
      temp.fuera_de_rango AS temperatura_fuera_de_rango,
      ph.valor AS ph, ph.marca_temporal AS ph_marca_temporal,
      ph.fuera_de_rango AS ph_fuera_de_rango,
      cond.valor AS conductividad, cond.marca_temporal AS conductividad_marca_temporal,
      cond.fuera_de_rango AS conductividad_fuera_de_rango,
      v.dispositivo_id, d.identificador_hardware, d.ultima_comunicacion
   FROM acuario a
   LEFT JOIN LATERAL (
      SELECT m.valor, m.marca_temporal,
             (m.valor < cp.valor_minimo OR m.valor > cp.valor_maximo) AS fuera_de_rango
      FROM medicion m
      JOIN parametro p ON p.id = m.parametro_id
      LEFT JOIN configuracion_parametro cp ON cp.acuario_id = a.id AND cp.parametro_id = p.id
      WHERE m.acuario_id = a.id AND p.codigo = 'TEMP'
      ORDER BY m.marca_temporal DESC
      LIMIT 1
   ) temp ON true
   LEFT JOIN LATERAL (
      SELECT m.valor, m.marca_temporal,
             (m.valor < cp.valor_minimo OR m.valor > cp.valor_maximo) AS fuera_de_rango
      FROM medicion m
      JOIN parametro p ON p.id = m.parametro_id
      LEFT JOIN configuracion_parametro cp ON cp.acuario_id = a.id AND cp.parametro_id = p.id
      WHERE m.acuario_id = a.id AND p.codigo = 'PH'
      ORDER BY m.marca_temporal DESC
      LIMIT 1
   ) ph ON true
   LEFT JOIN LATERAL (
      SELECT m.valor, m.marca_temporal,
             (m.valor < cp.valor_minimo OR m.valor > cp.valor_maximo) AS fuera_de_rango
      FROM medicion m
      JOIN parametro p ON p.id = m.parametro_id
      LEFT JOIN configuracion_parametro cp ON cp.acuario_id = a.id AND cp.parametro_id = p.id
      WHERE m.acuario_id = a.id AND p.codigo = 'COND'
      ORDER BY m.marca_temporal DESC
      LIMIT 1
   ) cond ON true
   LEFT JOIN vinculacion v ON v.acuario_id = a.id AND v.fecha_fin IS NULL
   LEFT JOIN dispositivo d ON d.id = v.dispositivo_id`;

acuariosRouter.get('/', async (req, res) => {
  const resultado = await pool.query(
    `${CONSULTA_ACUARIOS}
     WHERE a.usuario_id = $1
     ORDER BY a.fecha_creacion DESC`,
    [req.usuarioId]
  );
  res.json(resultado.rows);
});

acuariosRouter.get('/:id', async (req, res) => {
  const resultado = await pool.query(
    `${CONSULTA_ACUARIOS}
     WHERE a.usuario_id = $1 AND a.id = $2`,
    [req.usuarioId, req.params.id]
  );

  if (resultado.rows.length === 0) {
    res.status(404).json({ error: 'Acuario no encontrado' });
    return;
  }
  res.json(resultado.rows[0]);
});

acuariosRouter.put('/:id', async (req, res) => {
  const { nombre, volumenLitros, tipoAgua } = req.body;

  if (typeof nombre !== 'string' || nombre.trim().length === 0 || nombre.length > 100) {
    res.status(400).json({ error: 'El nombre es obligatorio y debe tener hasta 100 caracteres' });
    return;
  }
  if (tipoAgua !== undefined && tipoAgua !== null && !['DULCE', 'SALADA'].includes(tipoAgua)) {
    res.status(400).json({ error: 'tipoAgua debe ser DULCE o SALADA' });
    return;
  }

  const resultado = await pool.query(
    `UPDATE acuario SET nombre = $1, volumen_litros = $2, tipo_agua = $3
     WHERE id = $4 AND usuario_id = $5
     RETURNING id, nombre, volumen_litros, tipo_agua, fecha_creacion`,
    [nombre.trim(), volumenLitros ?? null, tipoAgua ?? null, req.params.id, req.usuarioId]
  );

  if (resultado.rows.length === 0) {
    res.status(404).json({ error: 'Acuario no encontrado' });
    return;
  }
  res.json(resultado.rows[0]);
});

acuariosRouter.delete('/:id', async (req, res) => {
  const resultado = await pool.query(
    'DELETE FROM acuario WHERE id = $1 AND usuario_id = $2 RETURNING id',
    [req.params.id, req.usuarioId]
  );

  if (resultado.rows.length === 0) {
    res.status(404).json({ error: 'Acuario no encontrado' });
    return;
  }
  res.status(204).send();
});

acuariosRouter.post('/:id/dispositivo', async (req, res) => {
  const { identificadorHardware } = req.body;
  const acuarioId = req.params.id;

  const acuario = await pool.query(
    'SELECT id FROM acuario WHERE id = $1 AND usuario_id = $2',
    [acuarioId, req.usuarioId]
  );
  if (acuario.rows.length === 0) {
    res.status(404).json({ error: 'Acuario no encontrado' });
    return;
  }

  const dispositivo = await pool.query(
    'SELECT id FROM dispositivo WHERE identificador_hardware = $1',
    [identificadorHardware]
  );
  if (dispositivo.rows.length === 0) {
    res.status(400).json({ error: 'El identificador no corresponde a ningun dispositivo conocido' });
    return;
  }
  const dispositivoId = dispositivo.rows[0].id;

  const vinculacionActiva = await pool.query(
    `SELECT a.nombre, a.usuario_id
     FROM vinculacion v JOIN acuario a ON a.id = v.acuario_id
     WHERE v.dispositivo_id = $1 AND v.fecha_fin IS NULL`,
    [dispositivoId]
  );
  if (vinculacionActiva.rows.length > 0) {
    const otroAcuario = vinculacionActiva.rows[0];
    if (otroAcuario.usuario_id !== req.usuarioId) {
      res.status(409).json({ error: 'Ese equipo ya esta en uso' });
    } else {
      res.status(409).json({ error: `Ese dispositivo ya esta vinculado a tu acuario "${otroAcuario.nombre}"` });
    }
    return;
  }

  const acuarioYaTieneDispositivo = await pool.query(
    'SELECT 1 FROM vinculacion WHERE acuario_id = $1 AND fecha_fin IS NULL',
    [acuarioId]
  );
  if (acuarioYaTieneDispositivo.rows.length > 0) {
    res.status(409).json({ error: 'Este acuario ya tiene un dispositivo vinculado' });
    return;
  }

  const resultado = await pool.query(
    `INSERT INTO vinculacion (acuario_id, dispositivo_id) VALUES ($1, $2)
     RETURNING id, fecha_inicio`,
    [acuarioId, dispositivoId]
  );
  res.status(201).json(resultado.rows[0]);
});

acuariosRouter.delete('/:id/dispositivo', async (req, res) => {
  const acuario = await pool.query(
    'SELECT id FROM acuario WHERE id = $1 AND usuario_id = $2',
    [req.params.id, req.usuarioId]
  );
  if (acuario.rows.length === 0) {
    res.status(404).json({ error: 'Acuario no encontrado' });
    return;
  }

  const resultado = await pool.query(
    `UPDATE vinculacion SET fecha_fin = now()
     WHERE acuario_id = $1 AND fecha_fin IS NULL
     RETURNING dispositivo_id`,
    [req.params.id]
  );
  if (resultado.rows.length === 0) {
    res.status(404).json({ error: 'Este acuario no tiene un dispositivo vinculado' });
    return;
  }
  res.status(204).send();
});

// POST /acuarios/:id/calibracion/leer  (CU-12: pide una lectura cruda en vivo)
acuariosRouter.post('/:id/calibracion/leer', async (req, res) => {
  const { parametro } = req.body;
  if (typeof parametro !== 'string') {
    res.status(400).json({ error: 'Falta el parametro a leer' });
    return;
  }

  const resuelto = await resolverDispositivoVinculado(req.params.id, req.usuarioId!);
  if ('error' in resuelto) {
    res.status(resuelto.error).json({ error: resuelto.mensaje });
    return;
  }

  const parametroFila = await pool.query('SELECT id FROM parametro WHERE codigo = $1', [parametro]);
  if (parametroFila.rows.length === 0) {
    res.status(400).json({ error: 'Parametro desconocido' });
    return;
  }

  try {
    const respuesta = await pedirCalibracion(resuelto.identificadorHardware, { accion: 'leer', parametro });
    if (!respuesta.ok) {
      res.status(502).json({ error: respuesta.error ?? 'El dispositivo no pudo completar la lectura' });
      return;
    }
    res.json({ lectura: respuesta.lectura });
  } catch (err) {
    res.status(504).json({ error: err instanceof Error ? err.message : 'No se pudo contactar al dispositivo' });
  }
});

// POST /acuarios/:id/calibracion/punto  (CU-12: fija un punto de calibracion en la placa)
acuariosRouter.post('/:id/calibracion/punto', async (req, res) => {
  const { parametro, punto, valorReferencia } = req.body;
  if (typeof parametro !== 'string') {
    res.status(400).json({ error: 'Falta el parametro' });
    return;
  }
  if (!Number.isInteger(punto) || punto < 1 || punto > 3) {
    res.status(400).json({ error: 'El punto debe ser 1, 2 o 3' });
    return;
  }
  if (typeof valorReferencia !== 'number') {
    res.status(400).json({ error: 'Falta el valor de referencia de la solucion patron' });
    return;
  }

  const resuelto = await resolverDispositivoVinculado(req.params.id, req.usuarioId!);
  if ('error' in resuelto) {
    res.status(resuelto.error).json({ error: resuelto.mensaje });
    return;
  }

  const parametroFila = await pool.query('SELECT id FROM parametro WHERE codigo = $1', [parametro]);
  if (parametroFila.rows.length === 0) {
    res.status(400).json({ error: 'Parametro desconocido' });
    return;
  }

  try {
    const respuesta = await pedirCalibracion(resuelto.identificadorHardware, {
      accion: 'fijarPunto',
      parametro,
      punto,
      valorReferencia,
    });
    if (!respuesta.ok) {
      res.status(502).json({ error: respuesta.error ?? 'El dispositivo no pudo fijar el punto' });
      return;
    }
    res.json({ lecturaAntes: respuesta.lecturaAntes, lecturaDespues: respuesta.lecturaDespues });
  } catch (err) {
    res.status(504).json({ error: err instanceof Error ? err.message : 'No se pudo contactar al dispositivo' });
  }
});

// POST /acuarios/:id/calibracion  (CU-12: registra la calibracion ya terminada)
//
// La app llama a este endpoint recien cuando el usuario completo todos los
// puntos que necesitaba el sensor -- "leer" y "punto" de arriba no tocan la
// base, solo dialogan con la placa en vivo.
acuariosRouter.post('/:id/calibracion', async (req, res) => {
  const { parametro, puntos } = req.body;
  if (typeof parametro !== 'string') {
    res.status(400).json({ error: 'Falta el parametro' });
    return;
  }
  if (!Array.isArray(puntos) || puntos.length === 0) {
    res.status(400).json({ error: 'Faltan los puntos de calibracion' });
    return;
  }
  for (const punto of puntos) {
    if (
      typeof punto?.valorReferencia !== 'number' ||
      typeof punto?.lecturaAntes !== 'number' ||
      typeof punto?.lecturaDespues !== 'number'
    ) {
      res.status(400).json({ error: 'Cada punto debe tener valorReferencia, lecturaAntes y lecturaDespues numericos' });
      return;
    }
  }

  const resuelto = await resolverDispositivoVinculado(req.params.id, req.usuarioId!);
  if ('error' in resuelto) {
    res.status(resuelto.error).json({ error: resuelto.mensaje });
    return;
  }

  const parametroFila = await pool.query('SELECT id FROM parametro WHERE codigo = $1', [parametro]);
  if (parametroFila.rows.length === 0) {
    res.status(400).json({ error: 'Parametro desconocido' });
    return;
  }
  const parametroId = parametroFila.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const calibracionResultado = await client.query(
      `INSERT INTO calibracion (dispositivo_id, parametro_id) VALUES ($1, $2)
       RETURNING id, fecha_hora`,
      [resuelto.dispositivoId, parametroId]
    );
    const calibracionId = calibracionResultado.rows[0].id;

    for (const punto of puntos) {
      await client.query(
        `INSERT INTO punto_calibracion (calibracion_id, valor_referencia, lectura_antes, lectura_despues)
         VALUES ($1, $2, $3, $4)`,
        [calibracionId, punto.valorReferencia, punto.lecturaAntes, punto.lecturaDespues]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      id: calibracionId,
      fechaHora: calibracionResultado.rows[0].fecha_hora,
      puntos: puntos.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
