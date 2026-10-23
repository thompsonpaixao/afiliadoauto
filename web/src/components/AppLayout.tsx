'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { ToastProvider } from '@/context/ToastContext';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  // If on login page, render children directly without sidebar
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (isLoginPage) {
      setCheckingAuth(false);
      return;
    }

    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/login');
        if (!res.ok) {
          router.push('/login');
        } else {
          setCheckingAuth(false);
        }
      } catch {
        router.push('/login');
      }
    };

    checkSession();

    // Background scheduler heartbeat (ticks every 30 seconds)
    const tickInterval = setInterval(async () => {
      try {
        await fetch('/api/cron/tick');
      } catch {}
    }, 30000);

    return () => clearInterval(tickInterval);
  }, [isLoginPage, router]);

  if (isLoginPage) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3" />
        <span className="text-xs font-mono text-text-muted">Carregando painel privado...</span>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background text-text-main flex">
        <Sidebar />
        <div className="flex-1 ml-64 flex flex-col min-h-screen">
          {/* Top Bar */}
          <header className="h-16 px-8 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-soft text-primary border border-primary/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                Administrador
              </span>
              <span className="text-xs text-text-muted font-mono">Fuso Horário: America/Bahia</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/cron/tick');
                    window.location.reload();
                  } catch {}
                }}
                title="Sincronizar e verificar automações agora"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-main hover:bg-[#F3F4F6] border border-border transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar</span>
              </button>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
