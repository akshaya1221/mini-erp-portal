import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { authRouter } from './routes/auth';
import { customerRouter } from './routes/customers';
import { productRouter } from './routes/products';
import { challanRouter } from './routes/challans';
import { stockMovementRouter } from './routes/stockMovements';

import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRouter);
app.use('/customers', customerRouter);
app.use('/products', productRouter);
app.use('/challans', challanRouter);
app.use('/stock-movements', stockMovementRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API Error:', err);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error', details: err.details });
});

async function startServer() {
  try {
    await prisma.$connect();
    // Create sequence if not exists idempotently at DB level
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS challan_number_seq;`);
    
    // Set starting value to max id + 1, so it doesn't collide with existing database entries
    const maxChallan = await prisma.challan.aggregate({ _max: { id: true } });
    const startVal = (maxChallan._max.id || 0) + 1;
    await prisma.$executeRawUnsafe(`SELECT setval('challan_number_seq', ${startVal}, false);`);
    console.log(`Challan sequence initialized to start at ${startVal}`);
  } catch (err) {
    console.error('Database sequence initialization failed:', err);
  }

  app.listen(port, () => {
    console.log(`API running on port ${port}`);
  });
}

startServer();

