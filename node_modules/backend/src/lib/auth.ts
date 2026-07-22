import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../server';
import { Role } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: Role;
    email: string;
  };
}

export const hashPassword = async (password: string) => bcrypt.hash(password, 10);
export const comparePassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

export const createToken = (payload: { id: number; role: Role; email: string }) => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
};

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, role: true, email: true } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const authorize = (...roles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
};
