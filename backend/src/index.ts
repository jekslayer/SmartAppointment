import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.routes';
import { dataRouter } from './routes/data.routes';
import { usersRouter } from './routes/users.routes';
import { errorHandler } from './middleware/error.middleware';
import { checkInWithLiff, lineRouter, lineWebhook, verifyLiffPatientLink } from './routes/line.routes';
import { runAppointmentReminders } from './services/appointment-reminders.service';
import { rateLimit, securityHeaders } from './middleware/security.middleware';

dotenv.config();

export function createApp() {
  const app = express();
  const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'apikey']
  }));
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(rateLimit(60_000, 300));
  // Vercel Services can forward a request after removing its route prefix.
  // Keep local `/api/...` routes unchanged while accepting that deployed form.
  app.use((req, _res, next) => {
    if (process.env.VERCEL && !req.url.startsWith('/api/')) req.url = `/api${req.url}`;
    next();
  });
  app.post('/api/line/webhook', express.raw({ type: 'application/json', limit: '1mb' }), rateLimit(60_000, 1_000, 'line-webhook'), lineWebhook);
  app.use(express.json({ limit: '10mb' }));
  app.post('/api/line/link/verify', rateLimit(15 * 60_000, 10, 'line-link'), verifyLiffPatientLink);
  app.post('/api/line/check-in', rateLimit(15 * 60_000, 10, 'line-check-in'), checkInWithLiff);
  app.use('/api/auth', rateLimit(15 * 60_000, 10, 'login'));

  app.use('/api/auth', authRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/line', lineRouter);

  app.get('/api/cron/appointment-reminders', async (req, res, next) => {
    try {
      const cronSecret = process.env.CRON_SECRET;
      const authorization = req.header('authorization') || '';
      if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: { message: 'Unauthorized' } });
      }
      res.json(await runAppointmentReminders());
    } catch (error) { next(error); }
  });

  app.get('/api/health', async (_, res) => {
    try {
      const { error } = await (await import('./db/supabase')).getClient().from('departments').select('id', { head: true, count: 'exact' }).limit(1);
      if (error) throw error;
      res.json({ status: 'ok', database: 'ok', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unavailable', timestamp: new Date().toISOString() });
    }
  });

  app.use(errorHandler);
  return app;
}

const app = createApp();

if (require.main === module) {
  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`Server: http://localhost:${port}`));
}

export default app;
