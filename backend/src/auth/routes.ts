import { Router } from 'express';
import { pool } from '../db';
import { hashearContrasena, verificarContrasena } from './password';
import { generarAccessToken, generarRefreshToken, hashearRefreshToken } from './tokens';
import { requireAuth } from './middleware';

export const authRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTRASENA_MIN_LENGTH = 8;

authRouter.post('/registro', async (req, res) => {
  const { email, contrasena, consentimiento } = req.body;

  if (consentimiento !== true) {
    res.status(400).json({ error: 'Debe aceptar el tratamiento de datos personales' });
    return;
  }
  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'El correo no tiene un formato valido' });
    return;
  }
  if (typeof contrasena !== 'string' || contrasena.length < CONTRASENA_MIN_LENGTH) {
    res.status(400).json({ error: `La contrasena debe tener al menos ${CONTRASENA_MIN_LENGTH} caracteres` });
    return;
  }

  const contrasenaHash = await hashearContrasena(contrasena);

  try {
    const resultado = await pool.query(
      `INSERT INTO usuario (email, contrasena_hash, fecha_consentimiento)
       VALUES ($1, $2, now())
       RETURNING id, email, fecha_alta`,
      [email, contrasenaHash]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Ese correo ya tiene una cuenta asociada' });
      return;
    }
    throw error;
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, contrasena, sistemaOperativo, tokenNotificacionesPush } = req.body;

  if (typeof sistemaOperativo !== 'string' || !['IOS', 'ANDROID'].includes(sistemaOperativo)) {
    res.status(400).json({ error: 'sistemaOperativo debe ser IOS o ANDROID' });
    return;
  }

  const resultadoUsuario = await pool.query(
    'SELECT id, contrasena_hash FROM usuario WHERE email = $1',
    [email]
  );
  const usuario = resultadoUsuario.rows[0];

  const credencialesInvalidas = () => res.status(401).json({ error: 'Credenciales invalidas' });

  if (!usuario) {
    credencialesInvalidas();
    return;
  }

  const contrasenaValida = await verificarContrasena(contrasena, usuario.contrasena_hash);
  if (!contrasenaValida) {
    credencialesInvalidas();
    return;
  }

  const accessToken = generarAccessToken({ usuarioId: usuario.id });
  const { token: refreshToken, hash, fechaExpiracion } = generarRefreshToken();

  await pool.query(
    `INSERT INTO sesion (usuario_id, token_refresco_hash, token_notificaciones_push, sistema_operativo, fecha_expiracion)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuario.id, hash, tokenNotificacionesPush ?? null, sistemaOperativo, fechaExpiracion]
  );

  res.json({ accessToken, refreshToken });
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (typeof refreshToken !== 'string') {
    res.status(400).json({ error: 'Falta el refresh token' });
    return;
  }

  const hash = hashearRefreshToken(refreshToken);
  const resultado = await pool.query(
    `SELECT usuario_id FROM sesion
     WHERE token_refresco_hash = $1 AND fecha_fin_sesion IS NULL AND fecha_expiracion > now()`,
    [hash]
  );
  const sesion = resultado.rows[0];

  if (!sesion) {
    res.status(401).json({ error: 'Sesion invalida o expirada' });
    return;
  }

  const accessToken = generarAccessToken({ usuarioId: sesion.usuario_id });
  res.json({ accessToken });
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (typeof refreshToken !== 'string') {
    res.status(400).json({ error: 'Falta el refresh token' });
    return;
  }

  const hash = hashearRefreshToken(refreshToken);
  await pool.query(
    `UPDATE sesion SET fecha_fin_sesion = now()
     WHERE token_refresco_hash = $1 AND fecha_fin_sesion IS NULL`,
    [hash]
  );

  res.status(204).send();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const resultado = await pool.query('SELECT email FROM usuario WHERE id = $1', [req.usuarioId]);
  res.json(resultado.rows[0]);
});

authRouter.delete('/me', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM usuario WHERE id = $1', [req.usuarioId]);
  res.status(204).send();
});
