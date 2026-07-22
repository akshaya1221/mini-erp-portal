import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticate, authorize, AuthenticatedRequest } from '../lib/auth';
import { MovementType, Role } from '@prisma/client';

const router = Router();

const stockMovementSchema = z.object({
  productId: z.number().int().positive(),
  quantityChanged: z.number().int(),
  movementType: z.nativeEnum(MovementType),
  reason: z.string().min(1)
});

router.post('/', authenticate, authorize(Role.WAREHOUSE), async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = stockMovementSchema.parse(req.body);
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    if (data.movementType === MovementType.OUT && product.currentStock + data.quantityChanged < 0) {
      return res.status(400).json({ error: 'Insufficient stock for this adjustment' });
    }

    const updatedProduct = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id: data.productId } });
      if (!current) throw new Error('Product not found');
      if (data.movementType === MovementType.OUT && current.currentStock < data.quantityChanged) {
        throw Object.assign(new Error('Insufficient stock for this adjustment'), { statusCode: 400 });
      }
      const nextStock = data.movementType === MovementType.IN ? current.currentStock + data.quantityChanged : current.currentStock - data.quantityChanged;
      const updated = await tx.product.update({ where: { id: data.productId }, data: { currentStock: nextStock } });
      await tx.stockMovement.create({
        data: {
          productId: data.productId,
          quantityChanged: data.quantityChanged,
          movementType: data.movementType,
          reason: data.reason,
          createdById: req.user!.id
        }
      });
      return updated;
    });

    res.status(201).json(updatedProduct);
  } catch (error: any) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

export { router as stockMovementRouter };
