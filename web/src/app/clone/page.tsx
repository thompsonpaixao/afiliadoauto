'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Copy,
  Radio,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Package,
  Layers,
  Check,
  X,
  Eye,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function ClonePage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Configuration state
  const [active, setActive] = useState(false);
  const [sourceGroupJid, setSourceGroupJid] = useState('');
  const [mode, setMode] = useState<'manual_approval' | 'auto_automation'>('manual_approval');
  const [targetAutomationId, setTargetAutomationId] = useState('');
  const [subId1, setSubId1] = useState('');
  const [subId2, setSubId2] = useState('');
  const [antiLoopHours, setAntiLoopHours] = useState(24);

  // Data lists
  const [whatsappGroups, setWhatsappGroups] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({
    totalCaptured: 0,
    waitingApproval: 0,
    approved: 0,
    autoAdded: 0,
    ignored: 0,
    errors: 0,
    lastProcessedTimestamp: null,
    lastProcessedMessageId: null,
    activatedAt: null,
    isActive: false,
  });

  // Filter tabs
  const [activeTab, setActiveTab] = useState<'all' | 'waiting' | 'approved' | 'ignored' | 'error'>('waiting');

  const loadData = async () => {
    try {
      const [cfgRes, itemsRes, waRes, autoRes] = await Promise.all([
        fetch('/api/clone/config'),
        fetch('/api/clone/items'),
        fetch('/api/whatsapp/groups'),
        fetch('/api/automations'),
      ]);

      if (cfgRes.ok) {
        const data = await cfgRes.json();
        if (data.config) {
          setActive(Boolean(data.config.active));
          setSourceGroupJid(data.config.sourceGroupJid || '');
          setMode(data.config.mode || 'manual_approval');
          setTargetAutomationId(data.config.targetAutomationId || '');
          setAntiLoopHours(data.config.antiLoopHours || 24);
          if (Array.isArray(data.config.subIds)) {
            setSubId1(data.config.subIds[0] || '');
            setSubId2(data.config.subIds[1] || '');
          }
        }
      }

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data.items || []);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }

      if (waRes.ok) {
        const data = await waRes.json();
        setWhatsappGroups(data.groups || []);
      }

      if (autoRes.ok) {
        const data = await autoRes.json();
        setAutomations(data.automations || []);
      }
    } catch (e: any) {
      toast('Erro ao carregar dados do Clone: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      fetch('/api/clone/items')
        .then((r) => r.json())
        .then((d) => {
          if (d.items) setItems(d.items);
          if (d.metrics) setMetrics(d.metrics);
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveConfig = async (newActiveState?: boolean) => {
    setSavingConfig(true);
    const finalActive = newActiveState !== undefined ? newActiveState : active;

    const selectedGroup = whatsappGroups.find(
      (g) => (g.provider_group_id || g.groupJid) === sourceGroupJid
    );

    const subIds = [subId1, subId2].map((s) => s.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/clone/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: finalActive,
          sourceGroupJid,
          sourceGroupName: selectedGroup?.name || sourceGroupJid,
          mode,
          targetAutomationId: mode === 'auto_automation' ? targetAutomationId : null,
          subIds,
          antiLoopHours: Number(antiLoopHours) || 24,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setActive(finalActive);
        toast(
          finalActive
            ? 'Monitoramento Clone ATIVADO! Ouvindo novas mensagens do grupo selecionado.'
            : 'Configurações salvas (Monitoramento Clone Inativo).',
          'success'
        );
        loadData();
      } else {
        toast(data.error || 'Erro ao salvar configurações', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleToggleActive = () => {
    if (!active && !sourceGroupJid) {
      toast('Selecione um grupo de origem antes de ativar o monitoramento.', 'error');
      return;
    }
    const nextState = !active;
    setActive(nextState);
    handleSaveConfig(nextState);
  };

  const handlePollNow = async () => {
    setPolling(true);
    try {
      const res = await fetch('/api/clone/poll', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.captured > 0) {
          toast(`${data.captured} oferta(s) capturada(s) e convertida(s) com sucesso!`, 'success');
        } else if (data.ignored > 0) {
          toast(`${data.ignored} mensagem(ns) verificadas e ignoradas pelas regras Anti-Loop.`, 'info');
        } else {
          toast(data.messages?.[0] || 'Nenhuma nova mensagem recebida desde a última verificação.', 'info');
        }
        loadData();
      } else {
        toast(data.error || 'Erro ao verificar mensagens', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setPolling(false);
    }
  };

  const handleApproveItem = async (itemId: string, autoId?: string) => {
    try {
      const res = await fetch('/api/clone/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, targetAutomationId: autoId || null }),
      });
      const data = await res.json();
      if (res.ok) {
        toast('Produto aprovado e salvo na biblioteca com sucesso!', 'success');
        loadData();
      } else {
        toast(data.error || 'Erro ao aprovar item', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleRejectItem = async (itemId: string) => {
    try {
      const res = await fetch('/api/clone/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) {
        toast('Item rejeitado.', 'info');
        loadData();
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Deseja limpar todo o histórico de mensagens capturadas do Clone?')) return;
    try {
      await fetch('/api/clone/items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      toast('Histórico do Clone limpo com sucesso.', 'info');
      loadData();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeTab === 'waiting') return item.status === 'waiting_approval';
    if (activeTab === 'approved') return item.status === 'approved' || item.status === 'auto_added';
    if (activeTab === 'ignored') return item.status === 'ignored';
    if (activeTab === 'error') return item.status === 'error';
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-text-main">Clone de Ofertas</h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                active
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-gray-100 text-text-muted border border-border'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              {active ? 'Monitoramento Ativo' : 'Inativo'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Monitore grupos de ofertas do WhatsApp, capture links concorrentes e reconstrua ofertas automaticamente com seus links de afiliado e template padrão.
          </p>
        </div>

        {/* Global Quick Action */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePollNow}
            disabled={polling || !active}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-all shadow-subtle ${
              active
                ? 'bg-white hover:bg-gray-50 border-border text-text-main'
                : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${polling ? 'animate-spin text-primary' : 'text-text-muted'}`} />
            <span>{polling ? 'Verificando mensagens...' : 'Verificar agora'}</span>
          </button>

          <button
            onClick={handleToggleActive}
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm ${
              active
                ? 'bg-danger text-white hover:bg-danger/90'
                : 'bg-primary text-white hover:bg-primary-hover'
            }`}
          >
            {active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
            <span>{active ? 'Pausar Monitoramento' : 'Ativar Monitoramento'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-card border border-border p-4 shadow-subtle">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">Capturados</span>
          <div className="text-2xl font-bold text-text-main mt-1 font-mono">{metrics.totalCaptured || 0}</div>
          <span className="text-[10px] text-text-muted mt-0.5 block">Ofertas Shopee encontradas</span>
        </div>

        <div className="bg-white rounded-card border border-amber-200 bg-amber-50/20 p-4 shadow-subtle">
          <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">Aguardando Aprovação</span>
          <div className="text-2xl font-bold text-amber-700 mt-1 font-mono">{metrics.waitingApproval || 0}</div>
          <span className="text-[10px] text-amber-700/80 mt-0.5 block">Requer revisão manual</span>
        </div>

        <div className="bg-white rounded-card border border-emerald-200 bg-emerald-50/20 p-4 shadow-subtle">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">Convertidos / Adicionados</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {(metrics.approved || 0) + (metrics.autoAdded || 0)}
          </div>
          <span className="text-[10px] text-emerald-700/80 mt-0.5 block">Prontos para disparo</span>
        </div>

        <div className="bg-white rounded-card border border-border p-4 shadow-subtle">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block">Ignorados (Anti-Loop)</span>
          <div className="text-2xl font-bold text-text-muted mt-1 font-mono">{metrics.ignored || 0}</div>
          <span className="text-[10px] text-text-muted mt-0.5 block">Autodisparo ou duplicados</span>
        </div>

        <div className="bg-white rounded-card border border-danger/20 p-4 shadow-subtle">
          <span className="text-[11px] font-semibold text-danger uppercase tracking-wider block">Erros de Conversão</span>
          <div className="text-2xl font-bold text-danger mt-1 font-mono">{metrics.errors || 0}</div>
          <span className="text-[10px] text-text-muted mt-0.5 block">Falha na API da Shopee</span>
        </div>
      </div>

      {/* Main Configuration Card */}
      <div className="bg-white rounded-card border border-border p-6 shadow-card space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-soft flex items-center justify-center text-primary">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">Configuração do Monitor de Grupos</h2>
              <p className="text-xs text-text-muted">
                Selecione o grupo que deseja escutar e escolha o modo de aprovação.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleSaveConfig()}
            disabled={savingConfig}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
          >
            {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Source Group Selection */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1.5">
                Grupo de Origem (WhatsApp Monitorado) *
              </label>
              <select
                value={sourceGroupJid}
                onChange={(e) => setSourceGroupJid(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl text-xs text-text-main focus:outline-none focus:border-primary"
              >
                <option value="">Selecione um grupo para monitorar...</option>
                {whatsappGroups.map((g) => {
                  const jid = g.provider_group_id || g.groupJid;
                  return (
                    <option key={jid} value={jid}>
                      {g.name} ({g.participants_count || g.participantsCount || 0} membros)
                    </option>
                  );
                })}
              </select>
              <span className="text-[11px] text-text-muted mt-1 block">
                O robô escutará novas mensagens que chegarem neste grupo após a ativação.
              </span>
            </div>

            {/* Sub IDs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">Sub ID 1 (Opcional)</label>
                <input
                  type="text"
                  placeholder="ex: clone"
                  value={subId1}
                  onChange={(e) => setSubId1(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">Sub ID 2 (Opcional)</label>
                <input
                  type="text"
                  placeholder="ex: grupoorigem"
                  value={subId2}
                  onChange={(e) => setSubId2(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Anti-Loop Window */}
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                Janela Anti-Loop de Produto Duplicado (Horas)
              </label>
              <input
                type="number"
                min={1}
                max={168}
                value={antiLoopHours}
                onChange={(e) => setAntiLoopHours(Number(e.target.value) || 24)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
              />
              <span className="text-[11px] text-text-muted mt-1 block">
                Impede clonar o mesmo Item ID dentro deste período (padrão: 24h).
              </span>
            </div>
          </div>

          {/* Operation Mode */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-2">Modo de Operação *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode('manual_approval')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    mode === 'manual_approval'
                      ? 'border-primary bg-primary-soft/40 shadow-sm'
                      : 'border-border bg-white hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xs font-bold text-text-main block flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    <span>Revisar antes (Padrão)</span>
                  </span>
                  <span className="text-[11px] text-text-muted block mt-1">
                    As ofertas capturadas entram na fila para aprovação manual antes de serem postadas.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('auto_automation')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    mode === 'auto_automation'
                      ? 'border-primary bg-primary-soft/40 shadow-sm'
                      : 'border-border bg-white hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xs font-bold text-text-main block flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Automático Direto</span>
                  </span>
                  <span className="text-[11px] text-text-muted block mt-1">
                    Converte o link e adiciona diretamente na automação selecionada sem intervenção.
                  </span>
                </button>
              </div>
            </div>

            {/* Target Automation (if auto mode) */}
            {mode === 'auto_automation' && (
              <div>
                <label className="block text-xs font-semibold text-text-main mb-1.5">
                  Automação de Destino *
                </label>
                <select
                  value={targetAutomationId}
                  onChange={(e) => setTargetAutomationId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl text-xs text-text-main focus:outline-none focus:border-primary"
                >
                  <option value="">Selecione a automação que receberá os produtos...</option>
                  {automations
                    .filter((a) => (a.type || 'product') === 'product')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.status})
                      </option>
                    ))}
                </select>
                <span className="text-[11px] text-text-muted mt-1 block">
                  Os produtos serão adicionados ao final da fila desta automação.
                </span>
              </div>
            )}

            {/* Anti-Loop Protections Info Box */}
            <div className="bg-[#FBFBFC] rounded-xl border border-border p-3.5 text-xs space-y-1.5">
              <span className="font-semibold text-text-main flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" />
                <span>Proteções Anti-Loop Ativas:</span>
              </span>
              <ul className="list-disc pl-5 text-[11px] text-text-muted space-y-0.5">
                <li>Ignora mensagens enviadas pelo próprio Afiliado Auto / seu WhatsApp.</li>
                <li>Ignora grupos configurados como destino de envio das suas automações.</li>
                <li>Gera sempre link próprio via Shopee API (nunca usa o link de terceiro).</li>
                <li>Reconstrói a oferta usando seu modelo padrão (nunca copia texto concorrente).</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Captured Items Table Section */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        {/* Table Header with Tabs */}
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-text-main">Fila de Mensagens e Produtos Capturados</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {items.length} registro(s) no histórico do monitor de grupos
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Tabs */}
            <div className="flex items-center border border-border rounded-lg p-0.5 bg-gray-50">
              <button
                onClick={() => setActiveTab('waiting')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'waiting' ? 'bg-white shadow-sm text-text-main font-semibold' : 'text-text-muted'
                }`}
              >
                Aguardando ({metrics.waitingApproval || 0})
              </button>
              <button
                onClick={() => setActiveTab('approved')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'approved' ? 'bg-white shadow-sm text-text-main font-semibold' : 'text-text-muted'
                }`}
              >
                Aprovados ({(metrics.approved || 0) + (metrics.autoAdded || 0)})
              </button>
              <button
                onClick={() => setActiveTab('ignored')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'ignored' ? 'bg-white shadow-sm text-text-main font-semibold' : 'text-text-muted'
                }`}
              >
                Ignorados ({metrics.ignored || 0})
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'all' ? 'bg-white shadow-sm text-text-main font-semibold' : 'text-text-muted'
                }`}
              >
                Todos ({items.length})
              </button>
            </div>

            <button
              onClick={handleClearHistory}
              title="Limpar histórico do clone"
              className="p-1.5 border border-border rounded-lg hover:bg-danger-soft/40 text-text-muted hover:text-danger transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FBFBFC] border-b border-border text-text-muted font-medium">
              <tr>
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Produto & Imagem</th>
                <th className="py-3 px-4">Preço</th>
                <th className="py-3 px-4">Novo Link Afiliado</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-sans">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">
                    <Copy className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <span>Nenhum item encontrado nesta aba.</span>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const dateStr = item.createdAt
                    ? new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';

                  const isWaiting = item.status === 'waiting_approval';
                  const isApproved = item.status === 'approved' || item.status === 'auto_added';
                  const isIgnored = item.status === 'ignored';
                  const isError = item.status === 'error';

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-text-muted font-mono">
                        {dateStr}
                        <span className="block text-[10px] text-gray-400 truncate max-w-[120px]">
                          {item.sourceGroupName || item.sourceGroupJid}
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-sm">
                        <div className="flex items-center gap-3">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.productName || 'Produto'}
                              className="w-10 h-10 object-cover rounded-lg border border-border bg-gray-100 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg border border-border bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0">
                              <Package className="w-5 h-5" />
                            </div>
                          )}
                          <div className="truncate">
                            <span className="font-semibold text-text-main block truncate">
                              {item.productName || 'Mensagem sem produto'}
                            </span>
                            <span className="text-[10px] text-text-muted font-mono truncate block">
                              {item.capturedUrl || 'Link não extraído'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-text-main">
                        {item.currentPrice ? `R$ ${item.currentPrice.toFixed(2).replace('.', ',')}` : '--'}
                      </td>

                      <td className="py-3 px-4 max-w-xs truncate">
                        {item.generatedAffiliateUrl ? (
                          <a
                            href={item.generatedAffiliateUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-primary hover:underline flex items-center gap-1 text-[11px] truncate"
                          >
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{item.generatedAffiliateUrl}</span>
                          </a>
                        ) : (
                          <span className="text-text-muted text-[11px]">--</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {isWaiting && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Aguardando Aprovação
                          </span>
                        )}
                        {item.status === 'approved' && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Aprovado
                          </span>
                        )}
                        {item.status === 'auto_added' && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Adicionado Automático
                          </span>
                        )}
                        {isIgnored && (
                          <span
                            title={item.ignoreReason || 'Ignorado'}
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-border"
                          >
                            Ignorado ({item.ignoreReason || 'Anti-Loop'})
                          </span>
                        )}
                        {isError && (
                          <span
                            title={item.error || 'Erro'}
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-danger-soft text-danger border border-danger/20"
                          >
                            Erro na Shopee API
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isWaiting && (
                            <>
                              <button
                                onClick={() => handleApproveItem(item.id)}
                                title="Aprovar e adicionar à biblioteca"
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shadow-subtle"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Aprovar</span>
                              </button>
                              <button
                                onClick={() => handleRejectItem(item.id)}
                                title="Rejeitar oferta"
                                className="p-1 rounded-lg border border-border hover:bg-gray-100 text-text-muted transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <Link
                              href="/produtos"
                              className="px-2.5 py-1 border border-border rounded-lg text-text-main hover:bg-gray-50 text-xs font-semibold flex items-center gap-1 transition-colors"
                            >
                              <Package className="w-3.5 h-3.5 text-primary" />
                              <span>Ver na Biblioteca</span>
                            </Link>
                          )}

                          {item.capturedUrl && (
                            <a
                              href={item.capturedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir URL capturada no concorrente"
                              className="p-1 rounded-lg border border-border hover:bg-gray-100 text-text-muted transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
