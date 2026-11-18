import { Router } from 'express';
import { pool } from '../db';

export const tiposEventoRouter = Router();

// GET /tipos-evento  (opciones para registrar o filtrar entradas de la bitacora)
tiposEventoRouter.get('/', async (req, res) => {
  const resultado = await pool.query('SELECT id, nombre FROM tipo_evento ORDER BY id');
  res.json(resultado.rows);
});
