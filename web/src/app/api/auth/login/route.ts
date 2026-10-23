import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { signToken, verifyAdminPassword, getSessionAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Usuário e senha são obrigatórios.' },
        { status: 400 }
      );
    }

    const data = db.read();
    const admin = data.admins[0];

    if (!admin || admin.username.toLowerCase() !== username.trim().toLowerCase()) {
      return NextResponse.json(
        { error: 'Credenciais inválidas.' },
        { status: 401 }
      );
    }

    const isValid = verifyAdminPassword(password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Credenciais inválidas.' },
        { status: 401 }
      );
    }

    const token = signToken({ id: admin.id, username: admin.username });

    const response = NextResponse.json({
      success: true,
      admin: { id: admin.id, username: admin.username },
    });

    response.cookies.set('afiliado_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}

export async function GET() {
  const session = getSessionAdmin();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, admin: session });
}
