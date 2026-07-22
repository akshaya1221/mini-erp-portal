import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticate, authorize, AuthenticatedRequest } from '../lib/auth';
import { Role } from '@prisma/client';

const router = Router();

const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(2),
  category: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  currentStock: z.number().int().nonnegative(),
  minStockAlert: z.number().int().nonnegative(),
  warehouseLocation: z.string().min(1)
});

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const search = String(req.query.search || '');
    const where = {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { sku: { contains: search, mode: 'insensitive' as const } },
        { category: { contains: search, mode: 'insensitive' as const } }
      ]
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    res.json({ data: items, page, limit, total });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body);
    const product = await prisma.product.create({ data });
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = productSchema.parse(req.body);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    const product = await prisma.product.update({ where: { id }, data });
    res.json(product);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/movements', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const movements = await prisma.stockMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true }
    });
    res.json({ data: movements });
  } catch (error) {
    next(error);
  }
});

export { router as productRouter };
