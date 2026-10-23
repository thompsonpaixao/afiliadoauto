'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PackageCheck,
  Clock,
  Send,
  Zap,
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function DashboardPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleManualDispatch = async (automationId: string) => {
    try {
      const res = await fetch(`/api/automations/${automationId}/dispatch`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        toast('Disparo disparado com sucesso!', 'success');
        loadDashboard();
      } else {
        toast('Erro no disparo: ' + (json.error || 'Falha'), 'error');
      }
    } catch (e: any) {
      toast('Erro de comunicação: ' + e.message, 'error');
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-card border border-border"></div>
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.stats || {
    availableProducts: 0,
    waitingProducts: 0,
    postedToday: 0,
    activeAutomations: 0,
    errorsCount: 0,
  };

  const shopee = data?.integrations?.shopee || {};
  const whatsapp = data?.integrations?.whatsapp || {};
  const activeAutomations = data?.activeAutomations || [];
  const recentActivity = data?.recentActivity || [];

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">Dashboard Geral</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Visão consolidada de suas ofertas, automações e disparos
          </p>
        </div>
        <Link
          href="/conversor"
          className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-xl shadow-sm transition-all flex items-center gap-2"
        >
          <span>+ Adicionar links</span>
        </Link>
      </div>

      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Disponíveis */}
        <div className="bg-card rounded-card border border-border p-5 shadow-card">
          <div className="flex items-center justify-between text-text-muted mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Disponíveis</span>
            <div className="w-8 h-8 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-text-main font-mono">
            {stats.availableProducts}
          </div>
          <span className="text-[11px] text-text-muted mt-1 block">Prontos para envio</span>
        </div>

        {/* Aguardando Postagem */}
        <div className="bg-card rounded-card border border-border p-5 shadow-card">
          <div className="flex items-center justify-between text-text-muted mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Aguardando</span>
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#3B82F6] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-text-main font-mono">
            {stats.waitingProducts}
          </div>
          <span className="text-[11px] text-text-muted mt-1 block">Na fila de automação</span>
        </div>

        {/* Postados Hoje */}
        <div className="bg-card rounded-card border border-border p-5 shadow-card">
          <div className="flex items-center justify-between text-text-muted mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Postados Hoje</span>
            <div className="w-8 h-8 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-text-main font-mono">
            {stats.postedToday}
          </div>
          <span className="text-[11px] text-text-muted mt-1 block">Disparos concluídos</span>
        </div>

        {/* Automações Ativas */}
        <div className="bg-card rounded-card border border-border p-5 shadow-card">
          <div className="flex items-center justify-between text-text-muted mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Automações</span>
            <div className="w-8 h-8 rounded-lg bg-[#FEF7E6] text-[#F5A524] flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-text-main font-mono">
            {stats.activeAutomations}
          </div>
          <span className="text-[11px] text-text-muted mt-1 block">Rotinas em execução</span>
        </div>

        {/* Erros */}
        <div className="bg-card rounded-card border border-border p-5 shadow-card">
          <div className="flex items-center justify-between text-text-muted mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Erros</span>
            <div className="w-8 h-8 rounded-lg bg-danger-soft text-danger flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-text-main font-mono">
            {stats.errorsCount}
          </div>
          <span className="text-[11px] text-text-muted mt-1 block">Requerem atenção</span>
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card Shopee */}
        <div className="bg-card rounded-card border border-border p-6 shadow-card">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Integração Oficial</span>
              <h3 className="text-lg font-bold text-text-main">Shopee Affiliate</h3>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                shopee.connected
                  ? 'bg-primary-soft text-primary border border-primary/20'
                  : 'bg-gray-100 text-text-muted border border-border'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${shopee.connected ? 'bg-primary' : 'bg-gray-400'}`} />
              {shopee.connected ? 'Conectada' : 'Desconectada'}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 py-3 border-y border-border text-xs">
            <div>
              <span className="text-text-muted block">Produtos Cadastrados</span>
              <span className="text-sm font-semibold text-text-main font-mono mt-0.5 block">
                {shopee.totalProducts || 0}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Última Conversão</span>
              <span className="text-sm font-medium text-text-main mt-0.5 block">
                {shopee.lastConversion ? new Date(shopee.lastConversion).toLocaleString('pt-BR') : 'Nenhuma'}
              </span>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Link
              href="/integracoes"
              className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1 transition-colors"
            >
              <span>Gerenciar credenciais</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Card WhatsApp */}
        <div className="bg-card rounded-card border border-border p-6 shadow-card">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Disparador Persistente</span>
              <h3 className="text-lg font-bold text-text-main">WhatsApp (OpenWA)</h3>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                whatsapp.connected
                  ? 'bg-primary-soft text-primary border border-primary/20'
                  : 'bg-danger-soft text-danger border border-danger/20'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${whatsapp.connected ? 'bg-primary' : 'bg-danger'}`} />
              {whatsapp.connected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 py-3 border-y border-border text-xs">
            <div>
              <span className="text-text-muted block">Grupos Sincronizados</span>
              <span className="text-sm font-semibold text-text-main font-mono mt-0.5 block">
                {whatsapp.totalGroups || 0} grupos
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Última Sincronização</span>
              <span className="text-sm font-medium text-text-main mt-0.5 block">
                {whatsapp.lastSync ? new Date(whatsapp.lastSync).toLocaleTimeString('pt-BR') : 'Pendente'}
              </span>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Link
              href="/whatsapp"
              className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1 transition-colors"
            >
              <span>Gerenciar WhatsApp e QR Code</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Automações Ativas */}
      <div className="bg-card rounded-card border border-border shadow-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-text-main">Automações Ativas</h2>
            <p className="text-xs text-text-muted mt-0.5">Filas em processamento no momento</p>
          </div>
          <Link
            href="/automacoes"
            className="text-xs font-medium text-primary hover:text-primary-hover flex items-center gap-1"
          >
            <span>Ver todas</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {activeAutomations.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            Nenhuma automação ativa no momento.{' '}
            <Link href="/automacoes" className="text-primary font-medium hover:underline">
              Criar automação
            </Link>
          </div>
        ) : (
          <div className="divide-y border-border">
            {activeAutomations.map((auto: any) => (
              <div key={auto.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-text-main">{auto.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-text-muted font-medium">
                      {auto.groupName}
                    </span>
                  </div>
                  <div className="text-xs text-text-muted flex items-center gap-2">
                    <span>Item atual: <strong>{auto.currentProductName}</strong></span>
                    <span>&bull;</span>
                    <span>Enviados: <strong>{auto.total - auto.remaining}</strong> de {auto.total}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full md:w-48 space-y-1">
                  <div className="flex justify-between text-[11px] font-mono text-text-muted">
                    <span>Progresso</span>
                    <span>{auto.progressPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${auto.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Action button */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleManualDispatch(auto.id)}
                    title="Disparar próximo item agora"
                    className="px-3 py-1.5 rounded-lg border border-border hover:bg-gray-50 text-xs font-medium text-text-main flex items-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3 h-3 text-primary fill-primary" />
                    <span>Disparar agora</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Atividade Recente */}
      <div className="bg-card rounded-card border border-border shadow-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-text-main">Atividade Recente</h2>
            <p className="text-xs text-text-muted mt-0.5">Últimos disparos realizados para os grupos</p>
          </div>
          <Link
            href="/historico"
            className="text-xs font-medium text-primary hover:text-primary-hover flex items-center gap-1"
          >
            <span>Ver histórico completo</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            Nenhum disparo registrado ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-5">Horário</th>
                  <th className="py-3 px-5">Produto</th>
                  <th className="py-3 px-5">Automação</th>
                  <th className="py-3 px-5">Grupo</th>
                  <th className="py-3 px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border">
                {recentActivity.map((act: any) => (
                  <tr key={act.id} className="hover:bg-[#FBFBFC] transition-colors">
                    <td className="py-3.5 px-5 font-mono text-text-muted whitespace-nowrap">
                      {act.time ? new Date(act.time).toLocaleTimeString('pt-BR') : '--:--'}
                    </td>
                    <td className="py-3.5 px-5 font-medium text-text-main max-w-xs truncate">
                      {act.productName}
                    </td>
                    <td className="py-3.5 px-5 text-text-muted">{act.automationName}</td>
                    <td className="py-3.5 px-5 text-text-muted">{act.groupName}</td>
                    <td className="py-3.5 px-5 whitespace-nowrap">
                      {act.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-soft text-primary">
                          <CheckCircle2 className="w-3 h-3" />
                          Enviado
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft text-danger"
                          title={act.error || 'Erro'}
                        >
                          <XCircle className="w-3 h-3" />
                          Erro
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
