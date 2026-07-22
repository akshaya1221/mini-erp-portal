import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticate, authorize, AuthenticatedRequest } from '../lib/auth';
import { ChallanStatus, MovementType, Role } from '@prisma/client';

const router = Router();

const itemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive()
});

const challanSchema = z.object({
  customerId: z.number().int().positive(),
  status: z.nativeEnum(ChallanStatus).optional(),
  items: z.array(itemSchema)
});

const buildChallanNumber = async (tx: any = prisma) => {
  const result = await tx.$queryRawUnsafe<{ nextval: number }[]>(`SELECT nextval('challan_number_seq')::int as nextval;`);
  const nextVal = result[0].nextval;
  return `CH-${String(nextVal).padStart(4, '0')}`;
};

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const search = String(req.query.search || '');
    const status = req.query.status ? String(req.query.status) : undefined;
    const where = {
      OR: [
        { challanNumber: { contains: search, mode: 'insensitive' as const } },
        { customer: { name: { contains: search, mode: 'insensitive' as const } } }
      ],
      ...(status ? { status: status as ChallanStatus } : {})
    };

    const [items, total] = await Promise.all([
      prisma.challan.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: true, items: true }
      }),
      prisma.challan.count({ where })
    ]);

    res.json({ data: items, page, limit, total });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize(Role.SALES), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const data = challanSchema.parse(req.body);
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const challan = await prisma.$transaction(async (tx) => {
      const challanNumber = await buildChallanNumber(tx);
      const totalQuantity = data.items.reduce((acc, item) => acc + item.quantity, 0);

      const created = await tx.challan.create({
        data: {
          challanNumber,
          customerId: data.customerId,
          totalQuantity,
          status: data.status || ChallanStatus.DRAFT,
          createdById: req.user!.id,
          items: {
            create: await Promise.all(data.items.map(async (item) => {
              const product = await tx.product.findUnique({ where: { id: item.productId } });
              if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { statusCode: 404 });
              return {
                productId: item.productId,
                productNameSnapshot: product.name,
                productSkuSnapshot: product.sku,
                unitPriceSnapshot: product.unitPrice,
                quantity: item.quantity
              };
            }))
          }
        },
        include: { items: true }
      });
      return created;
    });

    res.status(201).json(challan);
  } catch (error: any) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const challan = await prisma.challan.findUnique({ where: { id }, include: { customer: true, items: true, createdBy: true } });
    if (!challan) return res.status(404).json({ error: 'Challan not found' });
    res.json(challan);
  } catch (error) {
    next(error);
  }
});

router.put('/:id/confirm', authenticate, authorize(Role.SALES), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const id = Number(req.params.id);
    const challan = await prisma.challan.findUnique({ where: { id }, include: { items: true } });
    if (!challan) return res.status(404).json({ error: 'Challan not found' });
    if (challan.status !== ChallanStatus.DRAFT) return res.status(400).json({ error: 'Only draft challans can be confirmed' });

    const insufficient: string[] = [];
    for (const item of challan.items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) return res.status(404).json({ error: `Product ${item.productId} not found` });
      if (product.currentStock < item.quantity) {
        insufficient.push(product.name);
      }
    }

    if (insufficient.length) {
      return res.status(400).json({ error: `Insufficient stock for: ${insufficient.join(', ')}` });
    }

    const updatedChallan = await prisma.$transaction(async (tx) => {
      for (const item of challan.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { statusCode: 404 });
        if (product.currentStock < item.quantity) {
          throw Object.assign(new Error(`Insufficient stock for: ${product.name}`), { statusCode: 400 });
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: product.currentStock - item.quantity }
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            quantityChanged: item.quantity,
            movementType: MovementType.OUT,
            reason: `Challan ${challan.challanNumber}`,
            createdById: req.user!.id
          }
        });
      }

      return tx.challan.update({
        where: { id },
        data: { status: ChallanStatus.CONFIRMED },
        include: { items: true, customer: true }
      });
    });

    res.json(updatedChallan);
  } catch (error: any) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

router.put('/:id/cancel', authenticate, authorize(Role.SALES), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const id = Number(req.params.id);
    const challan = await prisma.challan.findUnique({ where: { id }, include: { items: true } });
    if (!challan) return res.status(404).json({ error: 'Challan not found' });
    if (challan.status !== ChallanStatus.CONFIRMED) return res.status(400).json({ error: 'Only confirmed challans can be cancelled' });

    const updatedChallan = await prisma.$transaction(async (tx) => {
      for (const item of challan.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { statusCode: 404 });
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: product.currentStock + item.quantity }
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            quantityChanged: item.quantity,
            movementType: MovementType.IN,
            reason: `Cancel challan ${challan.challanNumber}`,
            createdById: req.user!.id
          }
        });
      }

      return tx.challan.update({
        where: { id },
        data: { status: ChallanStatus.CANCELLED },
        include: { items: true, customer: true }
      });
    });

    res.json(updatedChallan);
  } catch (error: any) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

export { router as challanRouter };
