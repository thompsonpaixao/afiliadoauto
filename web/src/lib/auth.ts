import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'afiliado-auto-super-jwt-secret-key-2026';
const COOKIE_NAME = 'afiliado_token';

export interface AdminPayload {
  id: string;
  username: string;
}

export function signToken(payload: AdminPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AdminPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AdminPayload;
  } catch {
    return null;
  }
}

export function getSessionAdmin(): AdminPayload | null {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function getAuthFromHeader(authorization?: string | null): AdminPayload | null {
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, '');
  return verifyToken(token);
}

export function verifyAdminPassword(password: string): boolean {
  const data = db.read();
  const admin = data.admins[0];
  if (!admin) return false;
  return bcrypt.compareSync(password, admin.passwordHash);
}

export function updateAdmin(username?: string, newPassword?: string): { success: boolean; error?: string } {
  try {
    db.update((data) => {
      if (!data.admins[0]) {
        throw new Error('Nenhum administrador encontrado');
      }
      if (username && username.trim()) {
        data.admins[0].username = username.trim();
      }
      if (newPassword && newPassword.trim()) {
        if (newPassword.length < 4) {
          throw new Error('A nova senha deve ter pelo menos 4 caracteres');
        }
        data.admins[0].passwordHash = bcrypt.hashSync(newPassword, 10);
      }
      data.admins[0].updatedAt = new Date().toISOString();
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
