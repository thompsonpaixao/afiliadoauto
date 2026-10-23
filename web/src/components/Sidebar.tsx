'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Link2,
  Package,
  Users2,
  Zap,
  MessageSquare,
  History,
  Boxes,
  Settings,
  LogOut,
  Sparkles,
  Copy,
} from 'lucide-react';

interface IntegrationStatus {
  shopee: boolean;
  whatsapp: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<IntegrationStatus>({ shopee: false, whatsapp: false });

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setStatus({
          shopee: Boolean(data.integrations?.shopee?.connected),
          whatsapp: Boolean(data.integrations?.whatsapp?.connected),
        });
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  const navItems = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Conversor Shopee', href: '/conversor', icon: Link2 },
    { label: 'Produtos', href: '/produtos', icon: Package },
    { label: 'Grupos', href: '/grupos', icon: Users2 },
    { label: 'Automações', href: '/automacoes', icon: Zap },
    { label: 'Clone', href: '/clone', icon: Copy },
    { label: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
    { label: 'Histórico', href: '/historico', icon: History },
    { label: 'Integrações', href: '/integracoes', icon: Boxes },
    { label: 'Configurações', href: '/configuracoes', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border h-screen flex flex-col justify-between fixed left-0 top-0 z-40 select-none">
      {/* Brand Header */}
      <div>
        <div className="h-16 px-6 border-b border-border flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-base text-text-main tracking-tight">Afiliado Auto</span>
              <span className="block text-[10px] font-mono text-text-muted uppercase tracking-wider">v1.0 Pro</span>
            </div>
          </Link>
        </div>

        {/* Navigation List */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary-soft text-primary font-semibold shadow-subtle'
                    : 'text-text-muted hover:text-text-main hover:bg-[#F9FAFB]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-[#9CA3AF]'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Status Indicators */}
      <div className="p-4 border-t border-border bg-[#FBFBFC]">
        <div className="space-y-2 mb-3 text-xs">
          {/* Shopee Status */}
          <div className="flex items-center justify-between px-2 py-1 rounded-md bg-white border border-border">
            <span className="text-text-muted font-medium">Shopee</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  status.shopee ? 'bg-primary shadow-[0_0_8px_rgba(22,163,106,0.5)]' : 'bg-[#9CA3AF]'
                }`}
              />
              <span className={`text-[11px] font-medium ${status.shopee ? 'text-primary' : 'text-text-muted'}`}>
                {status.shopee ? 'Conectada' : 'Desconectada'}
              </span>
            </div>
          </div>

          {/* WhatsApp Status */}
          <div className="flex items-center justify-between px-2 py-1 rounded-md bg-white border border-border">
            <span className="text-text-muted font-medium">WhatsApp</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  status.whatsapp ? 'bg-primary shadow-[0_0_8px_rgba(22,163,106,0.5)]' : 'bg-[#E5484D]'
                }`}
              />
              <span className={`text-[11px] font-medium ${status.whatsapp ? 'text-primary' : 'text-danger'}`}>
                {status.whatsapp ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>

        {/* Logout action */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-text-muted hover:text-danger hover:bg-danger-soft/40 rounded-lg transition-colors border border-transparent hover:border-danger/20"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair da conta</span>
        </button>
      </div>
    </aside>
  );
}
