import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticate, authorize, AuthenticatedRequest } from '../lib/auth';
import { CustomerStatus, CustomerType, Role } from '@prisma/client';

const router = Router();

const customerSchema = z.object({
  name: z.string().min(2),
  mobile: z.string().min(7),
  email: z.string().email().optional().or(z.literal('')),
  businessName: z.string().optional().or(z.literal('')),
  gstNumber: z.string().optional().or(z.literal('')),
  customerType: z.nativeEnum(CustomerType),
  address: z.string().optional().or(z.literal('')),
  status: z.nativeEnum(CustomerStatus).optional(),
  followUpDate: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal(''))
});

const noteSchema = z.object({ note: z.string().min(1) });

router.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const search = String(req.query.search || '');
    const status = req.query.status ? String(req.query.status) : undefined;
    const where = {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { businessName: { contains: search, mode: 'insensitive' as const } },
        { mobile: { contains: search, mode: 'insensitive' as const } }
      ],
      ...(status ? { status: status as CustomerStatus } : {})
    };

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { notes: true }
      }),
      prisma.customer.count({ where })
    ]);

    res.json({ data: items, page, limit, total });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize(Role.ADMIN, Role.SALES), async (req, res, next) => {
  try {
    const data = customerSchema.parse(req.body);
    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        mobile: data.mobile,
        email: data.email || null,
        businessName: data.businessName || null,
        gstNumber: data.gstNumber || null,
        customerType: data.customerType,
        address: data.address || null,
        status: data.status || CustomerStatus.LEAD,
        followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
        notes: data.notes ? { create: [{ note: data.notes }] } : undefined
      }
    });
    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize(Role.ADMIN, Role.SALES), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = customerSchema.parse(req.body);
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        mobile: data.mobile,
        email: data.email || null,
        businessName: data.businessName || null,
        gstNumber: data.gstNumber || null,
        customerType: data.customerType,
        address: data.address || null,
        status: data.status || existing.status,
        followUpDate: data.followUpDate ? new Date(data.followUpDate) : null
      }
    });
    res.json(customer);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const customer = await prisma.customer.findUnique({ where: { id }, include: { notes: true } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/notes', authenticate, authorize(Role.ADMIN, Role.SALES), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = noteSchema.parse(req.body);
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const note = await prisma.customerNote.create({ data: { customerId: id, note: data.note } });
    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
});

export { router as customerRouter };
