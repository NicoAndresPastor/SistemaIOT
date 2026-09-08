import express, { Request, Response, NextFunction } from 'express';
import { authRouter } from './auth/routes';
import { requireAuth } from './auth/middleware';
import { acuariosRouter } from './acuarios/routes';
import { iniciarSuscriptorMqtt } from './mqtt/subscriber';

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Servidor del sistema de acuarios funcionando');
});

app.use('/auth', authRouter);
app.use('/acuarios', requireAuth, acuariosRouter);

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  const statusCode = typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500
    ? err.statusCode
    : 500;
  const mensaje = statusCode < 500 ? 'Solicitud invalida' : 'Error interno del servidor';
  res.status(statusCode).json({ error: mensaje });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

iniciarSuscriptorMqtt();