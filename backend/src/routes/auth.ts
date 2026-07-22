import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticate, authorize, comparePassword, createToken, hashPassword } from '../lib/auth';
import { Role } from '@prisma/client';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.nativeEnum(Role)
});

router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await comparePassword(data.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createToken({ id: user.id, role: user.role, email: user.email });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
});

router.post('/register', authenticate, authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        role: data.role
      }
    });
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
