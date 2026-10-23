import { Hono } from 'hono';
import { Env } from '../types';
import { DatabaseService } from '../services/db';
import { signJwt, verifyPassword, verifyJwt } from '../middleware/auth';

export const authRoutes = new Hono<{ Bindings: Env }>();

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  try {
    const { username, password } = await c.req.json();

    if (!username || !password) {
      return c.json({ error: 'Usuário e senha são obrigatórios.' }, 400);
    }

    const db = new DatabaseService(c.env.DB);
    await db.ensureInitialized();
    const admin = await db.getAdmin();

    if (!admin || admin.username.toLowerCase() !== username.trim().toLowerCase()) {
      return c.json({ error: 'Credenciais inválidas.' }, 401);
    }

    const isValid = await verifyPassword(password, admin.password_hash);
    if (!isValid) {
      return c.json({ error: 'Credenciais inválidas.' }, 401);
    }

    const secret = c.env.JWT_SECRET || 'afiliado-auto-super-jwt-secret-key-2026';
    const token = await signJwt({ id: admin.id, username: admin.username }, secret);

    // Set HTTP-only Cookie for security
    const isProd = c.env.ENVIRONMENT === 'production';
    const cookieHeader = `afiliado_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${isProd ? '; Secure' : ''}`;

    c.header('Set-Cookie', cookieHeader);

    return c.json({
      success: true,
      token,
      admin: { id: admin.id, username: admin.username },
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Erro interno no servidor' }, 500);
  }
});

// GET /api/auth/login or GET /api/auth/me
authRoutes.get('/login', async (c) => {
  const secret = c.env.JWT_SECRET || 'afiliado-auto-super-jwt-secret-key-2026';
  const authHeader = c.req.header('Authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
  } else {
    const cookieHeader = c.req.header('Cookie') || '';
    const match = cookieHeader.match(/afiliado_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    return c.json({ authenticated: false }, 401);
  }

  const payload = await verifyJwt(token, secret);
  if (!payload) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({ authenticated: true, admin: payload });
});

// POST /api/auth/logout
authRoutes.post('/logout', async (c) => {
  c.header('Set-Cookie', 'afiliado_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return c.json({ success: true, message: 'Desconectado com sucesso' });
});
