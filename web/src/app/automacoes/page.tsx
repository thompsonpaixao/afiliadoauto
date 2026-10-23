'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Zap,
  Plus,
  Play,
  Pause,
  StopCircle,
  Trash2,
  Clock,
  Users2,
  Package,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  X,
  Eye,
  CheckSquare,
  Square,
  Search,
  MessageSquare,
  Repeat,
  Send,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { DEFAULT_MESSAGE_TEMPLATE, formatWhatsAppMessage } from '@/lib/message-formatter';
import { WhatsAppPreviewBubble } from '@/components/WhatsAppPreviewBubble';

export default function AutomacoesPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [automations, setAutomations] = useState<any[]>([]);
  const [configGroups, setConfigGroups] = useState<any[]>([]);
  const [whatsappGroups, setWhatsappGroups] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<number>(1);

  // Wizard form data
  const [autoType, setAutoType] = useState<'product' | 'message' | 'recurring_message'>('product');
  const [autoName, setAutoName] = useState('');
  const [groupSelectionMode, setGroupSelectionMode] = useState<'config' | 'direct'>('config');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedTargetGroupIds, setSelectedTargetGroupIds] = useState<string[]>([]);
  
  // Product automation data
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE_TEMPLATE);
  
  // Message / Recurring data
  const [freeformText, setFreeformText] = useState('');
  const [optionalLink, setOptionalLink] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // Timing
  const [intervalValue, setIntervalValue] = useState(15);
  const [intervalUnit, setIntervalUnit] = useState<'minutes' | 'hours'>('minutes');
  const [groupDelaySeconds, setGroupDelaySeconds] = useState(2);
  const [productOrder, setProductOrder] = useState<'random' | 'sequential'>('random');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('22:00');
  const [timezone, setTimezone] = useState('America/Bahia');
  const [onComplete, setOnComplete] = useState<'stop' | 'restart'>('stop');

  // Wizard product selection search
  const [prodSearch, setProdSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [autoRes, grpRes, prodRes, waRes] = await Promise.all([
        fetch('/api/automations'),
        fetch('/api/groups'),
        fetch('/api/products?status=all'),
        fetch('/api/whatsapp/groups'),
      ]);

      if (autoRes.ok) {
        const data = await autoRes.json();
        setAutomations(data.automations || []);
      }
      if (grpRes.ok) {
        const data = await grpRes.json();
        setConfigGroups(data.configurationGroups || []);
      }
      if (prodRes.ok) {
        const data = await prodRes.json();
        setProducts(data.products || []);
      }
      if (waRes.ok) {
        const data = await waRes.json();
        setWhatsappGroups(data.groups || []);
      }
    } catch (e: any) {
      toast('Erro ao carregar dados: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Silent lightweight polling every 4 seconds to update counters, status, nextRun and lastRun without F5
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetch('/api/automations')
          .then((res) => res.json())
          .then((d) => {
            if (d?.automations) {
              setAutomations(d.automations);
            }
          })
          .catch(() => {});
      }
    }, 4000);

    // Check if preselected products came from Produtos page
    const preselected = sessionStorage.getItem('automation_preselected_products');
    if (preselected || searchParams.get('action') === 'create') {
      if (preselected) {
        try {
          const ids = JSON.parse(preselected);
          setSelectedProductIds(ids);
          sessionStorage.removeItem('automation_preselected_products');
        } catch {}
      }
      setAutoType('product');
      setWizardOpen(true);
    }

    return () => clearInterval(pollInterval);
  }, []);

  const openCreateWizard = (type: 'product' | 'message' | 'recurring_message' = 'product') => {
    setAutoType(type);
    setAutoName('');
    setGroupSelectionMode('config');
    setSelectedGroupId('');
    setSelectedTargetGroupIds([]);
    setSelectedProductIds([]);
    setMessageTemplate(DEFAULT_MESSAGE_TEMPLATE);
    setFreeformText('');
    setOptionalLink('');
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    setIntervalValue(15);
    setIntervalUnit('minutes');
    setGroupDelaySeconds(2);
    setStartTime('08:00');
    setEndTime('22:00');
    setTimezone('America/Bahia');
    setOnComplete('stop');
    setStep(1);
    setWizardOpen(true);
  };

  const handleToggleProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleToggleDirectGroup = (jid: string) => {
    setSelectedTargetGroupIds((prev) =>
      prev.includes(jid) ? prev.filter((i) => i !== jid) : [...prev, jid]
    );
  };

  const handleToggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const filteredProducts = products.filter((p) =>
    p.productName?.toLowerCase().includes(prodSearch.toLowerCase()) ||
    (p.subIds && p.subIds.some((s: string) => s.toLowerCase().includes(prodSearch.toLowerCase())))
  );

  const handleSelectAllVisibleProducts = () => {
    const visibleIds = filteredProducts.map((p) => p.id);
    const allSelected = visibleIds.every((id) => selectedProductIds.includes(id));

    if (allSelected) {
      setSelectedProductIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedProductIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Sample product for live message preview
  const sampleProduct = useMemo(() => {
    if (selectedProductIds.length > 0) {
      const found = products.find((p) => p.id === selectedProductIds[0]);
      if (found) return found;
    }
    return (
      products[0] || {
        productName: 'Fone de Ouvido Bluetooth Sem Fio Estéreo TWS',
        priceMin: 39.9,
        pricePrevious: 79.9,
        ratingStar: 5,
        priceDiscountRate: 50,
        couponCode: 'PROMO10',
        affiliateLink: 'https://s.shopee.com.br/exemplo',
        commission: 4.5,
      }
    );
  }, [selectedProductIds, products]);

  const livePreviewMessage = useMemo(() => {
    if (autoType === 'product') {
      return formatWhatsAppMessage({
        product: sampleProduct,
        template: messageTemplate,
      });
    }
    const text = freeformText.trim();
    const link = optionalLink.trim();
    if (text && link) return `${text}\n\n${link}`;
    return text || link || 'Sua mensagem aparecerá aqui...';
  }, [autoType, sampleProduct, messageTemplate, freeformText, optionalLink]);

  // Determine total steps based on type
  const totalSteps = useMemo(() => {
    if (autoType === 'product') return 5;
    if (autoType === 'message') return 3;
    if (autoType === 'recurring_message') return 4;
    return 5;
  }, [autoType]);

  const handleSaveAutomation = async (sendNow = false) => {
    if (!autoName.trim()) {
      toast('Informe o nome da automação.', 'error');
      setStep(1);
      return;
    }

    const hasGroups =
      (groupSelectionMode === 'config' && selectedGroupId) ||
      (groupSelectionMode === 'direct' && selectedTargetGroupIds.length > 0);

    if (!hasGroups) {
      toast('Selecione pelo menos um grupo ou Grupo de Configuração.', 'error');
      setStep(1);
      return;
    }

    if (autoType === 'product' && selectedProductIds.length === 0) {
      toast('Selecione pelo menos um produto para a automação de Ofertas.', 'error');
      setStep(2);
      return;
    }

    if ((autoType === 'message' || autoType === 'recurring_message') && !freeformText.trim() && !optionalLink.trim()) {
      toast('Escreva o texto da mensagem ou informe um link.', 'error');
      setStep(2);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: autoName,
          type: autoType,
          configurationGroupId: groupSelectionMode === 'config' ? selectedGroupId : null,
          targetGroups: groupSelectionMode === 'direct' ? selectedTargetGroupIds : undefined,
          content: freeformText,
          linkUrl: optionalLink,
          productIds: autoType === 'product' ? selectedProductIds : [],
          messageTemplate,
          intervalValue,
          intervalUnit,
          groupDelaySeconds,
          productOrder: autoType === 'product' ? productOrder : undefined,
          startTime,
          endTime,
          daysOfWeek: autoType === 'recurring_message' ? selectedDays : undefined,
          timezone,
          onComplete,
          sendNow,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (sendNow) {
          toast(`Mensagem enviada com sucesso para os grupos e registrada no histórico!`, 'success');
        } else {
          toast(`Automação "${autoName}" criada com sucesso!`, 'success');
        }
        setWizardOpen(false);
        loadData();
      } else {
        toast(data.error || 'Erro ao criar automação', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, action: 'pause' | 'resume' | 'stop' | 'restart') => {
    if (action === 'stop' && !confirm('Deseja realmente parar esta automação? O histórico será preservado.')) {
      return;
    }

    try {
      const res = await fetch('/api/automations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });

      if (res.ok) {
        toast(
          action === 'pause'
            ? 'Automação pausada.'
            : action === 'resume'
            ? 'Automação retomada.'
            : action === 'restart'
            ? 'Automação reiniciada! Um novo ciclo foi iniciado.'
            : 'Automação parada.',
          'info'
        );
        loadData();
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleManualDispatch = async (id: string) => {
    try {
      const res = await fetch(`/api/automations/${id}/dispatch`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast('Mensagem disparada com sucesso para os grupos!', 'success');
        loadData();
      } else {
        toast(data.error || 'Fila já finalizada ou nenhum produto pendente. Clique em "Reiniciar" para iniciar um novo ciclo.', 'info');
        loadData();
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleDeleteAutomation = async (id: string, name: string) => {
    if (!confirm(`Deseja excluir a automação "${name}"?`)) return;

    try {
      const res = await fetch('/api/automations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        toast('Automação excluída.', 'success');
        loadData();
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const getTypeName = (type: string) => {
    if (type === 'message') return 'Mensagem';
    if (type === 'recurring_message') return 'Mensagem Recorrente';
    return 'Produto/Oferta';
  };

  const getTypeBadgeClass = (type: string) => {
    if (type === 'message') return 'bg-purple-50 text-purple-700 border-purple-200';
    if (type === 'recurring_message') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  };

  const formatTime = (isoString?: string | null): string => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const formatRelativeTime = (isoString?: string | null): string => {
    if (!isoString) return '';
    try {
      const target = new Date(isoString).getTime();
      const diffMs = target - Date.now();
      if (diffMs <= 0) return '(agora)';
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 1) return '(em menos de 1 min)';
      if (diffMins === 1) return '(em 1 min)';
      if (diffMins < 60) return `(em ${diffMins} min)`;
      const diffHours = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;
      return `(em ${diffHours}h ${remMins}m)`;
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">Automações de Disparo</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Crie fluxos de ofertas, mensagens avulsas ou comunicações recorrentes para seus grupos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreateWizard('product')}
            className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Automação</span>
          </button>
        </div>
      </div>

      {/* Type quick filter / launch chips */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={() => openCreateWizard('product')}
          className="px-3 py-1.5 rounded-lg border border-border bg-white hover:border-primary text-xs font-medium text-text-main flex items-center gap-1.5 transition-colors shadow-subtle"
        >
          <Package className="w-3.5 h-3.5 text-primary" />
          <span>+ Nova Oferta/Produto</span>
        </button>
        <button
          onClick={() => openCreateWizard('message')}
          className="px-3 py-1.5 rounded-lg border border-border bg-white hover:border-purple-500 text-xs font-medium text-text-main flex items-center gap-1.5 transition-colors shadow-subtle"
        >
          <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
          <span>+ Enviar Mensagem Avulsa</span>
        </button>
        <button
          onClick={() => openCreateWizard('recurring_message')}
          className="px-3 py-1.5 rounded-lg border border-border bg-white hover:border-indigo-500 text-xs font-medium text-text-main flex items-center gap-1.5 transition-colors shadow-subtle"
        >
          <Repeat className="w-3.5 h-3.5 text-indigo-600" />
          <span>+ Nova Mensagem Recorrente</span>
        </button>
      </div>

      {/* Automations List */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-white rounded-card border border-border animate-pulse" />
          ))}
        </div>
      ) : automations.length === 0 ? (
        <div className="bg-white rounded-card border border-border p-12 text-center shadow-card max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary flex items-center justify-center mx-auto shadow-sm">
            <Zap className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-main">Nenhuma automação cadastrada</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              Crie automações de ofertas da Shopee, avisos recorrentes ou dispare mensagens livres para seus grupos.
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <button
              onClick={() => openCreateWizard('product')}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar Automação</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {automations.map((auto) => {
            const isProd = !auto.type || auto.type === 'product';
            const isRecur = auto.type === 'recurring_message';
            const isMsg = auto.type === 'message';
            const cycleLabel = auto.cycleText || (auto.onComplete === 'stop' ? 'Ciclo único' : `Ciclo ${auto.currentCycle || 1}`);

            return (
              <div
                key={auto.id}
                className="bg-white rounded-card border border-border p-5 shadow-card space-y-4"
              >
                {/* Header Row: Name, Badges & Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-text-main">{auto.name}</h3>
                      
                      {/* Type Badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getTypeBadgeClass(auto.type)}`}>
                        {getTypeName(auto.type)}
                      </span>

                      {/* Cycle Badge */}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border border-gray-200 bg-gray-50 text-text-muted">
                        {cycleLabel}
                      </span>

                      {/* Status Badge */}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          auto.status === 'active'
                            ? 'bg-primary-soft text-primary'
                            : auto.status === 'paused'
                            ? 'bg-warning-soft text-warning'
                            : auto.status === 'completed'
                            ? 'bg-blue-50 text-[#3B82F6]'
                            : 'bg-gray-100 text-text-muted'
                        }`}
                      >
                        {auto.status === 'active' && 'Ativa'}
                        {auto.status === 'paused' && 'Pausada'}
                        {auto.status === 'completed' && 'Concluída'}
                        {auto.status === 'stopped' && 'Parada'}
                      </span>
                    </div>

                    {/* Metadata line: Groups, Window, Real Next Run & Last Run */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Users2 className="w-3.5 h-3.5" />
                        {auto.groupName} ({auto.groupCount} grupos)
                      </span>
                      <span>&bull;</span>
                      
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        A cada {auto.intervalMinutes} min ({auto.startTime} às {auto.endTime})
                      </span>
                      <span>&bull;</span>

                      {/* Real Next Run from scheduler */}
                      <span className="flex items-center gap-1 font-medium">
                        <span className="text-text-muted">Próximo envio:</span>
                        <strong className={auto.status === 'active' ? 'text-primary font-mono' : 'text-text-muted'}>
                          {auto.status === 'active' && auto.nextRunAt
                            ? `${formatTime(auto.nextRunAt)} ${formatRelativeTime(auto.nextRunAt)}`
                            : auto.status === 'completed'
                            ? 'Concluído'
                            : auto.status === 'paused'
                            ? 'Pausado'
                            : '—'}
                        </strong>
                      </span>
                      <span>&bull;</span>

                      {/* Real Last Run */}
                      <span className="flex items-center gap-1">
                        <span className="text-text-muted">Último envio:</span>
                        <strong className="text-text-main font-mono">
                          {auto.lastRunAt ? formatTime(auto.lastRunAt) : 'Nenhum ainda'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-start md:self-center">
                    {auto.status === 'active' ? (
                      <>
                        <button
                          onClick={() => handleManualDispatch(auto.id)}
                          title="Enviar apenas o próximo item da fila agora sem criar duplicatas"
                          className="px-3 py-1.5 rounded-lg border border-border hover:bg-gray-50 text-xs font-semibold text-text-main flex items-center gap-1.5 transition-colors shadow-subtle"
                        >
                          <Send className="w-3 h-3 text-primary" />
                          <span>Enviar próximo agora</span>
                        </button>
                        <button
                          onClick={() => handleStatusChange(auto.id, 'pause')}
                          title="Pausar automação"
                          className="p-1.5 rounded-lg border border-border hover:bg-gray-50 text-text-muted hover:text-text-main transition-colors"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      </>
                    ) : (auto.status === 'paused' || auto.status === 'draft') ? (
                      <button
                        onClick={() => handleStatusChange(auto.id, 'resume')}
                        title="Iniciar agendador da automação normalmente"
                        className="px-3 py-1.5 rounded-lg border border-primary/30 bg-primary-soft text-primary hover:bg-primary-soft/80 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-primary" />
                        <span>Iniciar automação</span>
                      </button>
                    ) : null}

                    {(auto.status === 'completed' || auto.status === 'stopped') && (
                      <button
                        onClick={() => handleStatusChange(auto.id, 'restart')}
                        title="Reiniciar do começo (Novo ciclo)"
                        className="px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary-soft text-primary hover:bg-primary-soft/80 text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reiniciar</span>
                      </button>
                    )}

                    {auto.status !== 'stopped' && auto.status !== 'completed' && (
                      <button
                        onClick={() => handleStatusChange(auto.id, 'stop')}
                        title="Parar automação"
                        className="p-1.5 rounded-lg border border-border hover:bg-danger-soft/40 text-text-muted hover:text-danger transition-colors"
                      >
                        <StopCircle className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteAutomation(auto.id, auto.name)}
                      title="Excluir automação"
                      className="p-1.5 rounded-lg border border-border hover:bg-danger-soft/40 text-text-muted hover:text-danger transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Section 2: Detailed Stats & Progress Bar */}
                {isProd && (
                  <div className="pt-3 border-t border-border flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                    {/* Stat Chips */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-gray-50 border border-border text-text-main font-medium">
                        Total: <strong className="font-mono">{auto.totalProducts}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
                        Enviados: <strong className="font-mono">{auto.sentCount ?? 0}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#3B82F6] font-medium">
                        Aguardando: <strong className="font-mono">{auto.waitingCount ?? Math.max(0, auto.totalProducts - (auto.sentCount ?? 0))}</strong>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-danger-soft border border-red-200 text-danger font-medium">
                        Erros: <strong className="font-mono">{auto.errorCount ?? auto.totalErrors ?? 0}</strong>
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-muted">
                        Progresso: <strong>{auto.sentCount ?? 0}</strong> de {auto.totalProducts}
                      </span>
                      <div className="w-32 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${auto.progressPercent}%` }}
                        />
                      </div>
                      <span className="font-mono text-text-muted font-bold">{auto.progressPercent}%</span>
                    </div>
                  </div>
                )}

                {/* Section 3: Current Product, Next Product & View Products button */}
                {isProd ? (
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                      {/* Produto Atual */}
                      <div className="flex items-center gap-2.5">
                        {auto.currentProduct?.imageUrl ? (
                          <img
                            src={auto.currentProduct.imageUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center shrink-0 text-gray-400">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-[10px] text-text-muted uppercase font-semibold">Produto Atual</div>
                          <div className="font-semibold text-text-main truncate max-w-xs">
                            {auto.currentProduct ? auto.currentProduct.name : 'Nenhum na fila'}
                          </div>
                          {auto.currentProduct?.price ? (
                            <div className="text-[11px] font-mono text-primary font-bold">
                              R$ {auto.currentProduct.price.toFixed(2).replace('.', ',')}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Próximo Produto */}
                      <div className="flex items-center gap-2.5">
                        {auto.nextProduct?.imageUrl ? (
                          <img
                            src={auto.nextProduct.imageUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white border border-border flex items-center justify-center shrink-0 text-gray-400">
                            <Package className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-[10px] text-text-muted uppercase font-semibold">Próximo Produto</div>
                          <div className="font-semibold text-text-main truncate max-w-xs">
                            {auto.nextProduct
                              ? auto.nextProduct.name
                              : auto.status === 'completed'
                              ? 'Ciclo finalizado'
                              : 'Fim da fila'}
                          </div>
                          {auto.nextProduct?.price ? (
                            <div className="text-[11px] font-mono text-primary font-bold">
                              R$ {auto.nextProduct.price.toFixed(2).replace('.', ',')}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Button: Ver produtos da automação */}
                    <Link
                      href={`/produtos?automationId=${auto.id}`}
                      className="px-3.5 py-2 rounded-xl bg-white border border-border hover:border-primary hover:bg-primary-soft/30 text-xs font-semibold text-text-main hover:text-primary flex items-center gap-1.5 transition-all shadow-subtle shrink-0 self-start md:self-center"
                    >
                      <Package className="w-3.5 h-3.5 text-primary" />
                      <span>Ver produtos da automação</span>
                      <ArrowRight className="w-3 h-3 text-text-muted" />
                    </Link>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-border text-xs text-text-muted flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="truncate max-w-lg">
                      <span className="font-semibold text-text-main">Conteúdo: </span>
                      <span>{auto.content || 'Apenas link'}</span>
                      {auto.linkUrl && (
                        <span className="text-primary font-mono ml-2">({auto.linkUrl})</span>
                      )}
                    </div>
                    {auto.lastRunAt && (
                      <span className="font-mono text-[11px] text-text-muted whitespace-nowrap">
                        Último disparo: {new Date(auto.lastRunAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dynamic Creation Wizard Modal */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-card border border-border shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col animate-modal overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-text-main">
                  {autoType === 'product' && 'Criar Automação de Ofertas/Produtos'}
                  {autoType === 'message' && 'Enviar Mensagem Avulsa'}
                  {autoType === 'recurring_message' && 'Criar Mensagem Recorrente'}
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Passo {step} de {totalSteps}
                </p>
              </div>
              <button
                onClick={() => setWizardOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper indicator bar */}
            <div className="bg-[#FBFBFC] px-6 py-2.5 border-b border-border flex items-center justify-between text-xs font-semibold overflow-x-auto">
              <span className={step >= 1 ? 'text-primary' : 'text-gray-400'}>1. Tipo e Grupos</span>
              <span className="text-gray-300">&rarr;</span>
              
              {autoType === 'product' ? (
                <>
                  <span className={step >= 2 ? 'text-primary' : 'text-gray-400'}>2. Produtos</span>
                  <span className="text-gray-300">&rarr;</span>
                  <span className={step >= 3 ? 'text-primary' : 'text-gray-400'}>3. Mensagem</span>
                  <span className="text-gray-300">&rarr;</span>
                  <span className={step >= 4 ? 'text-primary' : 'text-gray-400'}>4. Agendamento</span>
                  <span className="text-gray-300">&rarr;</span>
                  <span className={step >= 5 ? 'text-primary' : 'text-gray-400'}>5. Revisão</span>
                </>
              ) : autoType === 'message' ? (
                <>
                  <span className={step >= 2 ? 'text-primary' : 'text-gray-400'}>2. Conteúdo</span>
                  <span className="text-gray-300">&rarr;</span>
                  <span className={step >= 3 ? 'text-primary' : 'text-gray-400'}>3. Envio</span>
                </>
              ) : (
                <>
                  <span className={step >= 2 ? 'text-primary' : 'text-gray-400'}>2. Conteúdo</span>
                  <span className="text-gray-300">&rarr;</span>
                  <span className={step >= 3 ? 'text-primary' : 'text-gray-400'}>3. Frequência</span>
                  <span className="text-gray-300">&rarr;</span>
                  <span className={step >= 4 ? 'text-primary' : 'text-gray-400'}>4. Revisão</span>
                </>
              )}
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* STEP 1: Tipo & Grupos */}
              {step === 1 && (
                <div className="space-y-4">
                  {/* Tipo Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-2">
                      Tipo de Automação *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div
                        onClick={() => setAutoType('product')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          autoType === 'product'
                            ? 'border-primary bg-primary-soft/40 shadow-sm'
                            : 'border-border bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Package className={`w-4 h-4 ${autoType === 'product' ? 'text-primary' : 'text-text-muted'}`} />
                          <span className="text-xs font-bold text-text-main">Produto / Oferta</span>
                        </div>
                        <p className="text-[11px] text-text-muted leading-relaxed">
                          Disparo sequencial de produtos da biblioteca para os grupos.
                        </p>
                      </div>

                      <div
                        onClick={() => setAutoType('message')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          autoType === 'message'
                            ? 'border-purple-600 bg-purple-50/50 shadow-sm'
                            : 'border-border bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className={`w-4 h-4 ${autoType === 'message' ? 'text-purple-600' : 'text-text-muted'}`} />
                          <span className="text-xs font-bold text-text-main">Mensagem</span>
                        </div>
                        <p className="text-[11px] text-text-muted leading-relaxed">
                          Texto livre + link opcional com envio imediato ou agendado.
                        </p>
                      </div>

                      <div
                        onClick={() => setAutoType('recurring_message')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          autoType === 'recurring_message'
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                            : 'border-border bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Repeat className={`w-4 h-4 ${autoType === 'recurring_message' ? 'text-indigo-600' : 'text-text-muted'}`} />
                          <span className="text-xs font-bold text-text-main">Mensagem Recorrente</span>
                        </div>
                        <p className="text-[11px] text-text-muted leading-relaxed">
                          Avisos ou promoções em horários/dias pré-definidos.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Nome */}
                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-1.5">
                      Nome da Automação *
                    </label>
                    <input
                      type="text"
                      required
                      value={autoName}
                      onChange={(e) => setAutoName(e.target.value)}
                      placeholder={
                        autoType === 'product'
                          ? 'Ex: Ofertas Shopee Tech Diárias'
                          : autoType === 'message'
                          ? 'Ex: Comunicado Rápido aos Grupos'
                          : 'Ex: Lembrete Matinal de Descontos'
                      }
                      className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl text-xs text-text-main focus:outline-none focus:border-primary focus:bg-white"
                    />
                  </div>

                  {/* Seleção de Grupos: Config Group ou Grupos Diretos */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-text-main">
                        Grupos do WhatsApp de Destino *
                      </label>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setGroupSelectionMode('config')}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            groupSelectionMode === 'config'
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-text-muted hover:text-text-main'
                          }`}
                        >
                          Grupo de Configuração
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupSelectionMode('direct')}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            groupSelectionMode === 'direct'
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-text-muted hover:text-text-main'
                          }`}
                        >
                          Selecionar Grupos Diretos
                        </button>
                      </div>
                    </div>

                    {groupSelectionMode === 'config' ? (
                      configGroups.length === 0 ? (
                        <div className="p-4 rounded-xl border border-warning/30 bg-warning-soft text-xs text-warning-800">
                          Nenhum Grupo de Configuração cadastrado.{' '}
                          <Link href="/grupos" className="underline font-semibold">
                            Crie um grupo primeiro
                          </Link>{' '}
                          ou mude para a opção "Selecionar Grupos Diretos".
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-52 overflow-y-auto">
                          {configGroups.map((g) => (
                            <div
                              key={g.id}
                              onClick={() => setSelectedGroupId(g.id)}
                              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                selectedGroupId === g.id
                                  ? 'border-primary bg-primary-soft/40 shadow-sm'
                                  : 'border-border bg-white hover:bg-gray-50'
                              }`}
                            >
                              <span className="text-xs font-bold text-text-main block">{g.name}</span>
                              <span className="text-[11px] text-text-muted font-mono block mt-0.5">
                                {g.groupJids?.length || 0} grupo(s) do WhatsApp
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="border border-border rounded-xl divide-y border-border max-h-52 overflow-y-auto">
                        {whatsappGroups.length === 0 ? (
                          <div className="p-4 text-xs text-text-muted text-center">
                            Nenhum grupo sincronizado.{' '}
                            <Link href="/whatsapp" className="text-primary underline font-semibold">
                              Sincronize seus grupos no módulo WhatsApp
                            </Link>.
                          </div>
                        ) : (
                          whatsappGroups.map((g) => {
                            const jid = g.provider_group_id || g.groupJid;
                            const isSelected = selectedTargetGroupIds.includes(jid);

                            return (
                              <div
                                key={jid}
                                onClick={() => handleToggleDirectGroup(jid)}
                                className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                                  isSelected ? 'bg-primary-soft/30' : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <button type="button" className="p-0.5 text-text-muted">
                                    {isSelected ? (
                                      <CheckSquare className="w-4 h-4 text-primary" />
                                    ) : (
                                      <Square className="w-4 h-4" />
                                    )}
                                  </button>
                                  <div>
                                    <span className="text-xs font-semibold text-text-main block">
                                      {g.name}
                                    </span>
                                    <span className="text-[10px] text-text-muted font-mono block">
                                      {jid}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2 (Produto): Seleção de Produtos */}
              {step === 2 && autoType === 'product' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-text-main block">
                        Selecione os produtos da biblioteca
                      </span>
                      <span className="text-[11px] text-text-muted font-mono block">
                        {selectedProductIds.length} produtos selecionados (ordem mantida)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleSelectAllVisibleProducts}
                      className="text-xs text-primary font-semibold hover:underline"
                    >
                      {filteredProducts.every((p) => selectedProductIds.includes(p.id))
                        ? 'Desmarcar todos'
                        : 'Selecionar todos'}
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={prodSearch}
                      onChange={(e) => setProdSearch(e.target.value)}
                      placeholder="Pesquisar produtos..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Products list */}
                  <div className="max-h-60 overflow-y-auto border border-border rounded-xl divide-y border-border">
                    {filteredProducts.map((p) => {
                      const isSelected = selectedProductIds.includes(p.id);

                      return (
                        <div
                          key={p.id}
                          onClick={() => handleToggleProduct(p.id)}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary-soft/40' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button type="button" className="p-0.5 text-text-muted">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-primary" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                                <Package className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <span className="text-xs font-semibold text-text-main line-clamp-1">
                                {p.productName}
                              </span>
                              <span className="text-[10px] text-text-muted font-mono">
                                R$ {p.priceMin?.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 2 (Mensagem / Recorrente): Conteúdo Livre + Link */}
              {step === 2 && (autoType === 'message' || autoType === 'recurring_message') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Texto Livre da Mensagem *
                      </label>
                      <textarea
                        rows={7}
                        value={freeformText}
                        onChange={(e) => setFreeformText(e.target.value)}
                        placeholder="Escreva sua mensagem aqui... Use emojis, quebras de linha e texto formatado."
                        className="w-full p-3 text-xs bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Link Opcional
                      </label>
                      <input
                        type="url"
                        value={optionalLink}
                        onChange={(e) => setOptionalLink(e.target.value)}
                        placeholder="https://exemplo.com.br/promocao"
                        className="w-full px-3 py-2 text-xs bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white font-mono"
                      />
                      <p className="text-[11px] text-text-muted mt-1">
                        Se fornecido, será enviado com prévia automática nos grupos.
                      </p>
                    </div>
                  </div>

                  {/* Live WhatsApp Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-main">
                      <Eye className="w-3.5 h-3.5 text-primary" />
                      <span>Prévia Real do WhatsApp</span>
                    </div>
                    <WhatsAppPreviewBubble
                      text={livePreviewMessage}
                      imageUrl={null}
                    />
                  </div>
                </div>
              )}

              {/* STEP 3 (Produto): Mensagem Template com Live Preview */}
              {step === 3 && autoType === 'product' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-text-main">
                      Editor de Modelo da Mensagem
                    </label>
                    <textarea
                      rows={10}
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      className="w-full p-3 font-mono text-xs bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                    />
                    <div className="flex flex-wrap gap-1 text-[10px] font-mono text-text-muted">
                      {['{{nome}}', '{{preco_atual}}', '{{preco_anterior}}', '{{desconto}}', '{{cupom}}', '{{link}}', '{{avaliacao}}', '{{comissao}}'].map(
                        (v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setMessageTemplate((prev) => `${prev} ${v}`)}
                            className="px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-text-main transition-colors"
                          >
                            {v}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-main">
                      <Eye className="w-3.5 h-3.5 text-primary" />
                      <span>Prévia Real do WhatsApp</span>
                    </div>
                    <WhatsAppPreviewBubble
                      text={livePreviewMessage}
                      imageUrl={sampleProduct?.imageUrl || null}
                    />
                  </div>
                </div>
              )}

              {/* STEP 3 (Recorrente): Agendamento e Dias */}
              {step === 3 && autoType === 'recurring_message' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Intervalo entre disparos
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={intervalValue}
                        onChange={(e) => setIntervalValue(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Unidade de tempo
                      </label>
                      <select
                        value={intervalUnit}
                        onChange={(e) => setIntervalUnit(e.target.value as any)}
                        className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                      >
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-1">
                      Intervalo entre grupos (segundos)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={groupDelaySeconds}
                      onChange={(e) => setGroupDelaySeconds(Math.min(30, Math.max(0, Number(e.target.value))))}
                      className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                    />
                    <span className="text-[11px] text-text-muted mt-0.5 block">
                      Pausa entre o envio para cada grupo (padrão: 2s, configurável entre 0 e 30s).
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Horário Inicial
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Horário Final
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Dias da semana */}
                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-2">
                      Dias de Disparo
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { day: 0, label: 'Dom' },
                        { day: 1, label: 'Seg' },
                        { day: 2, label: 'Ter' },
                        { day: 3, label: 'Qua' },
                        { day: 4, label: 'Qui' },
                        { day: 5, label: 'Sex' },
                        { day: 6, label: 'Sáb' },
                      ].map(({ day, label }) => {
                        const isSelected = selectedDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleToggleDay(day)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              isSelected
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-gray-100 text-text-muted hover:bg-gray-200'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3 (Mensagem Avulsa): Revisão e Envio */}
              {step === 3 && autoType === 'message' && (
                <div className="space-y-4">
                  <div className="bg-[#FBFBFC] rounded-2xl border border-border p-5 space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Nome:</span>
                      <span className="font-bold text-text-main">{autoName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Destino:</span>
                      <span className="font-semibold text-text-main">
                        {groupSelectionMode === 'config'
                          ? configGroups.find((g) => g.id === selectedGroupId)?.name
                          : `${selectedTargetGroupIds.length} grupo(s) direto(s)`}
                      </span>
                    </div>
                    {optionalLink && (
                      <div className="flex justify-between">
                        <span className="text-text-muted">Link Anexo:</span>
                        <span className="font-mono text-primary truncate max-w-xs">{optionalLink}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-border">
                      <span className="text-text-muted block mb-1">Mensagem:</span>
                      <div className="bg-white p-3 rounded-lg border border-border font-sans whitespace-pre-wrap text-text-main">
                        {freeformText}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4 (Produto): Agendamento */}
              {step === 4 && autoType === 'product' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Intervalo entre disparos
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={intervalValue}
                        onChange={(e) => setIntervalValue(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Unidade de tempo
                      </label>
                      <select
                        value={intervalUnit}
                        onChange={(e) => setIntervalUnit(e.target.value as any)}
                        className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                      >
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-1">
                      Intervalo entre grupos (segundos)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={groupDelaySeconds}
                      onChange={(e) => setGroupDelaySeconds(Math.min(30, Math.max(0, Number(e.target.value))))}
                      className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                    />
                    <span className="text-[11px] text-text-muted mt-0.5 block">
                      Pausa entre o envio para cada grupo (padrão: 2s, configurável entre 0 e 30s).
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Horário Inicial
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-text-main mb-1">
                        Horário Final
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-lg text-xs font-mono text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-1">
                      Comportamento ao terminar a fila
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setOnComplete('stop')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          onComplete === 'stop'
                            ? 'border-primary bg-primary-soft/40 shadow-sm'
                            : 'border-border bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-text-main block">Parar</span>
                        <span className="text-[11px] text-text-muted block mt-0.5">
                          Status vira "Concluída" e finaliza.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOnComplete('restart')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          onComplete === 'restart'
                            ? 'border-primary bg-primary-soft/40 shadow-sm'
                            : 'border-border bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-text-main block">Reiniciar do começo</span>
                        <span className="text-[11px] text-text-muted block mt-0.5">
                          Inicia um novo ciclo com histórico separado.
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-1">
                      Ordem dos produtos
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setProductOrder('random')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          productOrder === 'random'
                            ? 'border-primary bg-primary-soft/40 shadow-sm'
                            : 'border-border bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-text-main block">Aleatória (Padrão)</span>
                        <span className="text-[11px] text-text-muted block mt-0.5">
                          Embaralha os produtos uma vez no início do ciclo e persiste a ordem.
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setProductOrder('sequential')}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          productOrder === 'sequential'
                            ? 'border-primary bg-primary-soft/40 shadow-sm'
                            : 'border-border bg-white'
                        }`}
                      >
                        <span className="text-xs font-bold text-text-main block">Sequencial</span>
                        <span className="text-[11px] text-text-muted block mt-0.5">
                          Dispara na ordem exata de seleção dos produtos.
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4 (Recorrente): Revisão */}
              {step === 4 && autoType === 'recurring_message' && (
                <div className="space-y-4">
                  <div className="bg-[#FBFBFC] rounded-2xl border border-border p-5 space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Nome:</span>
                      <span className="font-bold text-text-main">{autoName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Destino:</span>
                      <span className="font-semibold text-text-main">
                        {groupSelectionMode === 'config'
                          ? configGroups.find((g) => g.id === selectedGroupId)?.name
                          : `${selectedTargetGroupIds.length} grupo(s) direto(s)`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Intervalo:</span>
                      <span className="font-mono text-text-main">
                        A cada {intervalValue} {intervalUnit === 'minutes' ? 'minutos' : 'horas'} ({startTime} às {endTime})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Dias ativos:</span>
                      <span className="font-semibold text-primary">
                        {selectedDays.length === 7 ? 'Todos os dias' : `${selectedDays.length} dias por semana`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5 (Produto): Revisão */}
              {step === 5 && autoType === 'product' && (
                <div className="space-y-4">
                  <div className="bg-[#FBFBFC] rounded-2xl border border-border p-5 space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-muted">Nome da Automação:</span>
                      <span className="font-bold text-text-main">{autoName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Destino:</span>
                      <span className="font-semibold text-text-main">
                        {groupSelectionMode === 'config'
                          ? configGroups.find((g) => g.id === selectedGroupId)?.name
                          : `${selectedTargetGroupIds.length} grupo(s) direto(s)`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Quantidade de Produtos:</span>
                      <span className="font-bold text-primary font-mono">{selectedProductIds.length} produtos</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Intervalo de Disparo:</span>
                      <span className="font-mono text-text-main">
                        A cada {intervalValue} {intervalUnit === 'minutes' ? 'minutos' : 'horas'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Intervalo entre Grupos:</span>
                      <span className="font-mono text-text-main">{groupDelaySeconds} segundos</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Janela de Horário:</span>
                      <span className="font-mono text-text-main">
                        {startTime} às {endTime} ({timezone})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Ordem dos Produtos:</span>
                      <span className="font-semibold text-text-main">
                        {productOrder === 'random' ? 'Aleatória (Embaralhada)' : 'Sequencial'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-muted">Ao terminar a fila:</span>
                      <span className="font-semibold text-text-main">
                        {onComplete === 'stop' ? 'Parar' : 'Reiniciar em novo ciclo'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-border bg-[#FBFBFC] flex items-center justify-between">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="px-4 py-2 border border-border rounded-xl text-xs font-semibold text-text-muted hover:text-text-main hover:bg-white flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar</span>
                </button>
              ) : (
                <div />
              )}

              {step < totalSteps ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1) {
                      if (!autoName.trim()) {
                        toast('Informe o nome da automação.', 'error');
                        return;
                      }
                      const hasGroups =
                        (groupSelectionMode === 'config' && selectedGroupId) ||
                        (groupSelectionMode === 'direct' && selectedTargetGroupIds.length > 0);
                      if (!hasGroups) {
                        toast('Selecione pelo menos um grupo ou Grupo de Configuração.', 'error');
                        return;
                      }
                    }
                    if (step === 2 && autoType === 'product') {
                      if (selectedProductIds.length === 0) {
                        toast('Selecione pelo menos um produto.', 'error');
                        return;
                      }
                    }
                    if (step === 2 && (autoType === 'message' || autoType === 'recurring_message')) {
                      if (!freeformText.trim() && !optionalLink.trim()) {
                        toast('Escreva o texto da mensagem ou informe um link.', 'error');
                        return;
                      }
                    }
                    setStep((s) => s + 1);
                  }}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <span>Próximo passo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : autoType === 'message' ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveAutomation(false)}
                    className="px-4 py-2.5 border border-border rounded-xl text-xs font-semibold text-text-main hover:bg-white transition-colors"
                  >
                    <span>Salvar Rascunho</span>
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveAutomation(true)}
                    className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{saving ? 'Enviando...' : 'Enviar Agora'}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSaveAutomation(false)}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{saving ? 'Salvando...' : 'Iniciar Automação'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
