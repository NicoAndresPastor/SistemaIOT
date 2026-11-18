import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db';
import { pedirCalibracion } from '../mqtt/calibracion';
import { publicarComandoEnchufe } from '../mqtt/enchufes';
import { subirImagen, borrarImagen, publicIdDesdeUrl } from '../bitacora/cloudinary';

export const acuariosRouter = Router();

const TAMANO_MAXIMO_FOTO_BYTES = 8 * 1024 * 1024;

// Los ids llegan como texto (query string o formulario multipart).
async function tipoEventoValido(valor: unknown): Promise<number | null> {
  const id = Number(valor);
  if (typeof valor !== 'string' || !Number.isInteger(id) || id < 1) return null;
  const resultado = await pool.query('SELECT id FROM tipo_evento WHERE id = $1', [id]);
  return resultado.rows.length > 0 ? id : null;
}

function consultarEntradasBitacora(condicion: string, parametros: unknown[]) {
  return pool.query(
    `SELECT e.id, e.tipo_evento_id, t.nombre AS tipo_evento_nombre, e.observacion,
            e.fecha_evento, e.fecha_registro,
            COALESCE(
              json_agg(
                json_build_object('id', i.id, 'url', i.ruta_archivo, 'nombreArchivo', i.nombre_archivo)
                ORDER BY i.fecha_carga
              ) FILTER (WHERE i.id IS NOT NULL),
              '[]'
            ) AS imagenes
     FROM entrada_bitacora e
     JOIN tipo_evento t ON t.id = e.tipo_evento_id
     LEFT JOIN imagen i ON i.entrada_bitacora_id = e.id
     WHERE ${condicion}
     GROUP BY e.id, t.nombre
     ORDER BY e.fecha_evento DESC`,
    parametros
  );
}

const subidaFotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_FOTO_BYTES, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new Error('TIPO_NO_PERMITIDO'));
      return;
    }
    cb(null, true);
  },
});

// multer informa sus errores (limite de tamaño, de cantidad, tipo no
// permitido) llamando a next(err) en vez de lanzar -- se traduce aca a un
// 400 con el mensaje puntual, en vez de dejar que caiga en el manejador
// generico de errores (que respondería 500).
function manejarSubidaFotos(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  subidaFotos.array('fotos', 5)(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Cada foto no puede superar los 8 MB' });
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({ error: 'No se pueden subir mas de 5 fotos' });
      return;
    }
    if (err instanceof Error && err.message === 'TIPO_NO_PERMITIDO') {
      res.status(400).json({ error: 'Las fotos deben ser JPEG, PNG o WEBP' });
      return;
    }
    res.status(400).json({ error: 'No se pudieron procesar las fotos' });
  });
}

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

// GET /acuarios/:id/bitacora  (CU-23: listar y filtrar por tipo de evento)
acuariosRouter.get('/:id/bitacora', async (req, res) => {
  const acuario = await pool.query('SELECT id FROM acuario WHERE id = $1 AND usuario_id = $2', [
    req.params.id,
    req.usuarioId,
  ]);
  if (acuario.rows.length === 0) {
    res.status(404).json({ error: 'Acuario no encontrado' });
    return;
  }

  if (req.query.tipoEventoId === undefined) {
    const resultado = await consultarEntradasBitacora('e.acuario_id = $1', [req.params.id]);
    res.json(resultado.rows);
    return;
  }

  const tipoEventoId = await tipoEventoValido(req.query.tipoEventoId);
  if (tipoEventoId === null) {
    res.status(400).json({ error: 'Tipo de evento desconocido' });
    return;
  }
  const resultado = await consultarEntradasBitacora('e.acuario_id = $1 AND e.tipo_evento_id = $2', [
    req.params.id,
    tipoEventoId,
  ]);
  res.json(resultado.rows);
});

// POST /acuarios/:id/bitacora  (CU-20: crear una entrada con sus fotos)
acuariosRouter.post('/:id/bitacora', manejarSubidaFotos, async (req, res) => {
  const acuario = await pool.query('SELECT id FROM acuario WHERE id = $1 AND usuario_id = $2', [
    req.params.id,
    req.usuarioId,
  ]);
  if (acuario.rows.length === 0) {
    res.status(404).json({ error: 'Acuario no encontrado' });
    return;
  }

  const { observacion, fechaEvento } = req.body;
  const tipoEventoId = await tipoEventoValido(req.body.tipoEventoId);
  if (tipoEventoId === null) {
    res.status(400).json({ error: 'Tipo de evento desconocido' });
    return;
  }
  if (typeof fechaEvento !== 'string' || Number.isNaN(Date.parse(fechaEvento))) {
    res.status(400).json({ error: 'Falta la fecha del evento' });
    return;
  }

  const archivos = (req.files as Express.Multer.File[] | undefined) ?? [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const entradaResultado = await client.query(
      `INSERT INTO entrada_bitacora (acuario_id, tipo_evento_id, observacion, fecha_evento)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.params.id, tipoEventoId, observacion ?? null, fechaEvento]
    );
    const entradaId = entradaResultado.rows[0].id;

    for (const archivo of archivos) {
      const subida = await subirImagen(archivo.buffer);
      await client.query(
        `INSERT INTO imagen (entrada_bitacora_id, ruta_archivo, nombre_archivo, tamano_bytes)
         VALUES ($1, $2, $3, $4)`,
        [entradaId, subida.url, archivo.originalname, archivo.size]
      );
    }

    await client.query('COMMIT');
    const creada = await consultarEntradasBitacora('e.id = $1', [entradaId]);
    res.status(201).json(creada.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// DELETE /acuarios/:id/bitacora/:entradaId  (CU-22)
acuariosRouter.delete('/:id/bitacora/:entradaId', async (req, res) => {
  const entrada = await pool.query(
    `SELECT e.id
     FROM entrada_bitacora e
     JOIN acuario a ON a.id = e.acuario_id
     WHERE e.id = $1 AND e.acuario_id = $2 AND a.usuario_id = $3`,
    [req.params.entradaId, req.params.id, req.usuarioId]
  );
  if (entrada.rows.length === 0) {
    res.status(404).json({ error: 'Entrada no encontrada' });
    return;
  }

  const imagenes = await pool.query('SELECT ruta_archivo FROM imagen WHERE entrada_bitacora_id = $1', [
    req.params.entradaId,
  ]);
  for (const fila of imagenes.rows) {
    const publicId = publicIdDesdeUrl(fila.ruta_archivo);
    if (publicId) {
      await borrarImagen(publicId).catch(() => {
        console.warn('Bitacora: no se pudo borrar una imagen en Cloudinary', publicId);
      });
    }
  }

  await pool.query('DELETE FROM entrada_bitacora WHERE id = $1', [req.params.entradaId]);
  res.status(204).send();
});

// PUT /acuarios/:id/bitacora/:entradaId  (editar: datos, sacar fotos existentes y agregar nuevas)
acuariosRouter.put('/:id/bitacora/:entradaId', manejarSubidaFotos, async (req, res) => {
  const entrada = await pool.query(
    `SELECT e.id
     FROM entrada_bitacora e
     JOIN acuario a ON a.id = e.acuario_id
     WHERE e.id = $1 AND e.acuario_id = $2 AND a.usuario_id = $3`,
    [req.params.entradaId, req.params.id, req.usuarioId]
  );
  if (entrada.rows.length === 0) {
    res.status(404).json({ error: 'Entrada no encontrada' });
    return;
  }

  const { observacion, fechaEvento } = req.body;
  const tipoEventoId = await tipoEventoValido(req.body.tipoEventoId);
  if (tipoEventoId === null) {
    res.status(400).json({ error: 'Tipo de evento desconocido' });
    return;
  }
  if (typeof fechaEvento !== 'string' || Number.isNaN(Date.parse(fechaEvento))) {
    res.status(400).json({ error: 'Falta la fecha del evento' });
    return;
  }

  let idsAEliminar: string[] = [];
  const fotosAEliminar = req.body.fotosAEliminar;
  if (typeof fotosAEliminar === 'string' && fotosAEliminar.length > 0) {
    idsAEliminar = fotosAEliminar.split(',');
  } else if (Array.isArray(fotosAEliminar)) {
    idsAEliminar = fotosAEliminar;
  }

  const archivosNuevos = (req.files as Express.Multer.File[] | undefined) ?? [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE entrada_bitacora SET tipo_evento_id = $1, observacion = $2, fecha_evento = $3 WHERE id = $4`,
      [tipoEventoId, observacion ?? null, fechaEvento, req.params.entradaId]
    );

    if (idsAEliminar.length > 0) {
      const aBorrar = await client.query(
        `SELECT id, ruta_archivo FROM imagen WHERE entrada_bitacora_id = $1 AND id = ANY($2::uuid[])`,
        [req.params.entradaId, idsAEliminar]
      );
      await client.query(
        `DELETE FROM imagen WHERE entrada_bitacora_id = $1 AND id = ANY($2::uuid[])`,
        [req.params.entradaId, idsAEliminar]
      );
      for (const fila of aBorrar.rows) {
        const publicId = publicIdDesdeUrl(fila.ruta_archivo);
        if (publicId) {
          await borrarImagen(publicId).catch(() => {
            console.warn('Bitacora: no se pudo borrar una imagen en Cloudinary', publicId);
          });
        }
      }
    }

    for (const archivo of archivosNuevos) {
      const subida = await subirImagen(archivo.buffer);
      await client.query(
        `INSERT INTO imagen (entrada_bitacora_id, ruta_archivo, nombre_archivo, tamano_bytes)
         VALUES ($1, $2, $3, $4)`,
        [req.params.entradaId, subida.url, archivo.originalname, archivo.size]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const actualizada = await consultarEntradasBitacora('e.id = $1', [req.params.entradaId]);
  res.json(actualizada.rows[0]);
});

// GET /acuarios/:id/enchufes  (CU-29: estado actual de cada enchufe)
acuariosRouter.get('/:id/enchufes', async (req, res) => {
  const resuelto = await resolverDispositivoVinculado(req.params.id, req.usuarioId!);
  if ('error' in resuelto) {
    res.status(resuelto.error).json({ error: resuelto.mensaje });
    return;
  }

  const resultado = await pool.query(
    'SELECT id, numero_canal, nombre, estado_actual FROM enchufe WHERE dispositivo_id = $1 ORDER BY numero_canal',
    [resuelto.dispositivoId]
  );
  res.json(resultado.rows);
});

// PUT /acuarios/:id/enchufes/:canal  (CU-28: encender o apagar un enchufe)
//
// No espera que la placa confirme: registra la orden, la publica y devuelve
// 202. El estado real llega despues por MQTT (topico .../reportado), que
// actualiza el enchufe y marca la orden como confirmada -- la app lo ve al
// volver a consultar GET /enchufes.
acuariosRouter.put('/:id/enchufes/:canal', async (req, res) => {
  const resuelto = await resolverDispositivoVinculado(req.params.id, req.usuarioId!);
  if ('error' in resuelto) {
    res.status(resuelto.error).json({ error: resuelto.mensaje });
    return;
  }

  const canal = Number(req.params.canal);
  if (!Number.isInteger(canal) || canal < 1) {
    res.status(400).json({ error: 'Canal invalido' });
    return;
  }

  const { encendido } = req.body;
  if (typeof encendido !== 'boolean') {
    res.status(400).json({ error: 'Falta indicar si el enchufe debe encenderse o apagarse' });
    return;
  }

  const enchufeActual = await pool.query(
    'SELECT id, estado_actual FROM enchufe WHERE dispositivo_id = $1 AND numero_canal = $2',
    [resuelto.dispositivoId, canal]
  );
  if (enchufeActual.rows.length === 0) {
    res.status(404).json({ error: 'Enchufe no encontrado' });
    return;
  }

  // Se registra antes de publicar: en una red local la placa puede informar
  // el nuevo estado en milisegundos, y la confirmacion tiene que encontrar
  // esta fila ya creada para poder marcarla.
  const accionamiento = await pool.query(
    `INSERT INTO accionamiento (enchufe_id, usuario_id, estado_inicial, estado_final)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [enchufeActual.rows[0].id, req.usuarioId, enchufeActual.rows[0].estado_actual, encendido]
  );

  try {
    await publicarComandoEnchufe(resuelto.identificadorHardware, canal, encendido);
  } catch {
    await pool.query('DELETE FROM accionamiento WHERE id = $1', [accionamiento.rows[0].id]);
    res.status(504).json({ error: 'No se pudo enviar la orden al dispositivo' });
    return;
  }

  res.status(202).json({ canal, encendidoSolicitado: encendido });
});
