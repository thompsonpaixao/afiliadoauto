'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  QrCode,
  RefreshCw,
  Phone,
  User,
  Users2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ExternalLink,
  Send,
  Terminal,
  LogOut,
  Sparkles,
  Link2,
  Check,
  AlertCircle,
  Power,
  Zap,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function WhatsAppPage() {
  const { toast } = useToast();

  const [status, setStatus] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  // Test send modal
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [selectedTargetJid, setSelectedTargetJid] = useState('');
  const [testMessage, setTestMessage] = useState('🔥 *Oferta Especial de Teste!*\n\nConfira esta oferta incrível encontrada no Afiliado Auto.');
  const [testUrl, setTestUrl] = useState('https://s.shopee.com.br/exemplo');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const checkConnectionStatus = async (showNotification = false) => {
    setTestingConnection(true);
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      setStatus(data);

      if (showNotification) {
        if (data.status === 'CONNECTED') {
          toast('WhatsApp conectado com sucesso via Evolution API!', 'success');
        } else if (data.status === 'AUTH_ERROR') {
          toast('Erro de autenticação: EVOLUTION_API_KEY inválida.', 'error');
        } else if (data.status === 'SERVICE_UNAVAILABLE') {
          toast('Evolution API indisponível na porta 8080.', 'error');
        } else {
          toast('WhatsApp desconectado ou aguardando leitura do QR Code.', 'info');
        }
      }
    } catch (e: any) {
      setStatus({ status: 'SERVICE_UNAVAILABLE', connected: false, error: e.message });
      if (showNotification) {
        toast('Falha ao comunicar com o servidor: ' + e.message, 'error');
      }
    } finally {
      setTestingConnection(false);
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        toast('Instância inicializada! Escaneie o QR Code abaixo.', 'info');
        await checkConnectionStatus(false);
      } else {
        toast('Erro ao inicializar conexão: ' + (data.error || 'Falha desconhecida'), 'error');
      }
    } catch (e: any) {
      toast('Falha ao solicitar conexão: ' + e.message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar a sessão do WhatsApp?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast('Sessão desconectada com sucesso.', 'info');
        await checkConnectionStatus(false);
      } else {
        toast('Falha ao desconectar: ' + (data.error || 'Erro'), 'error');
      }
    } catch (e: any) {
      toast('Erro ao desconectar: ' + e.message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/whatsapp/groups');
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    checkConnectionStatus(false);
    fetchGroups();

    // Auto-poll status periodically
    const interval = setInterval(() => {
      fetch('/api/whatsapp/status')
        .then((r) => r.json())
        .then((data) => setStatus(data))
        .catch(() => {});
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  const handleSyncGroups = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/sync-groups', { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.success) {
        toast(`${data.syncedCount || 0} grupos sincronizados com sucesso do WhatsApp!`, 'success');
        fetchGroups();
      } else {
        toast(data.error || 'Falha ao sincronizar grupos', 'error');
      }
    } catch (e: any) {
      toast('Erro de comunicação: ' + e.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenTestModal = (group?: any) => {
    if (group) {
      setSelectedTargetJid(group.provider_group_id || group.groupJid);
    } else if (groups.length > 0) {
      setSelectedTargetJid(groups[0].provider_group_id || groups[0].groupJid);
    }
    setTestResult(null);
    setTestModalOpen(true);
  };

  const handleExecuteSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetJid) {
      toast('Selecione um grupo de destino.', 'error');
      return;
    }
    if (!testMessage.trim()) {
      toast('Digite o conteúdo da mensagem.', 'error');
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedTargetJid,
          message: testMessage,
          url: testUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      setTestResult(data);

      if (data.success) {
        toast('Mensagem enviada com sucesso para o WhatsApp!', 'success');
      } else {
        toast('Falha no envio: ' + (data.error || data.result?.error || 'Erro desconhecido'), 'error');
      }
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
      toast('Erro de conexão: ' + e.message, 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const filteredGroups = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.provider_group_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main flex items-center gap-2">
            <span>WhatsApp</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-primary-soft text-primary font-semibold">
              Evolution API (Baileys)
            </span>
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Conexão direta com a Evolution API utilizando o protocolo nativo Baileys
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => checkConnectionStatus(true)}
            disabled={testingConnection}
            className="px-3.5 py-2 rounded-xl border border-border hover:bg-gray-50 text-xs font-semibold text-text-main flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
            <span>Testar conexão</span>
          </button>

          {status?.status !== 'CONNECTED' ? (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <QrCode className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
              <span>{connecting ? 'Gerando QR...' : 'Conectar / Gerar QR'}</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3.5 py-2 rounded-xl border border-danger/30 text-danger hover:bg-danger-soft text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <LogOut className={`w-3.5 h-3.5 ${disconnecting ? 'animate-spin' : ''}`} />
              <span>Desconectar</span>
            </button>
          )}

          <button
            onClick={handleSyncGroups}
            disabled={syncing || status?.status !== 'CONNECTED'}
            className="px-4 py-2 bg-[#181A1D] hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Users2 className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar grupos</span>
          </button>

          <button
            onClick={() => handleOpenTestModal()}
            disabled={status?.status !== 'CONNECTED' || groups.length === 0}
            className="px-4 py-2 border border-primary/30 bg-primary-soft hover:bg-primary-soft/80 text-primary text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Disparar teste</span>
          </button>
        </div>
      </div>

      {/* Connection State Card */}
      <div className="bg-white rounded-card border border-border p-6 shadow-card">
        {/* Status Indicator Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
          <div className="flex items-center gap-3.5">
            {status?.status === 'CONNECTED' ? (
              <div className="w-12 h-12 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            ) : status?.status === 'AUTH_ERROR' ? (
              <div className="w-12 h-12 rounded-2xl bg-[#FEF7E6] text-warning flex items-center justify-center shadow-sm">
                <AlertTriangle className="w-6 h-6" />
              </div>
            ) : status?.status === 'SERVICE_UNAVAILABLE' ? (
              <div className="w-12 h-12 rounded-2xl bg-danger-soft text-danger flex items-center justify-center shadow-sm">
                <XCircle className="w-6 h-6" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-gray-100 text-text-muted flex items-center justify-center shadow-sm">
                <MessageSquare className="w-6 h-6" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-text-main">
                  {status?.status === 'CONNECTED' && 'Conectado (WhatsApp Web / Baileys)'}
                  {status?.status === 'DISCONNECTED' && 'Desconectado — Aguardando leitura do QR Code'}
                  {status?.status === 'AUTH_ERROR' && 'Erro de Autenticação'}
                  {status?.status === 'SERVICE_UNAVAILABLE' && 'Serviço Indisponível (Evolution API)'}
                  {!status?.status && 'Verificando...'}
                </h3>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                    status?.status === 'CONNECTED'
                      ? 'bg-primary-soft text-primary border border-primary/20'
                      : status?.status === 'AUTH_ERROR'
                      ? 'bg-warning-soft text-warning border border-warning/20'
                      : status?.status === 'SERVICE_UNAVAILABLE'
                      ? 'bg-danger-soft text-danger border border-danger/20'
                      : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                  }`}
                >
                  {status?.status || 'STATUS_CHECK'}
                </span>
              </div>

              <p className="text-xs text-text-muted mt-0.5">
                {status?.status === 'CONNECTED' &&
                  'Sessão Baileys autenticada e pronta para disparo de mensagens e prévias de link.'}
                {status?.status === 'DISCONNECTED' &&
                  'Instância Evolution API online. Escaneie o QR Code abaixo com seu celular.'}
                {status?.status === 'AUTH_ERROR' &&
                  'A chave EVOLUTION_API_KEY enviada não corresponde à chave configurada no servidor.'}
                {status?.status === 'SERVICE_UNAVAILABLE' &&
                  'Não foi possível conectar com a Evolution API na porta 8080. Inicie o serviço local ou via Docker.'}
              </p>
            </div>
          </div>

          <div className="text-right text-xs font-mono text-text-muted">
            <span className="block">Endpoint: {status?.endpoint || 'http://127.0.0.1:8080'}</span>
            <span className="block text-[11px] text-gray-400 mt-0.5">Instância: {status?.instance || 'afiliado-auto'}</span>
          </div>
        </div>

        {/* Connected account details */}
        {status?.status === 'CONNECTED' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F9FAFB] border border-border">
              <span className="text-text-muted block text-[11px] mb-1">Nome da Conta / Perfil</span>
              <span className="font-semibold text-text-main text-sm">
                {status.pushname || 'Afiliado Auto Admin'}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F9FAFB] border border-border">
              <span className="text-text-muted block text-[11px] mb-1">Número Conectado</span>
              <span className="font-semibold text-text-main text-sm font-mono">
                {status.phone ? `+${status.phone}` : 'Sessão Ativa'}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F9FAFB] border border-border">
              <span className="text-text-muted block text-[11px] mb-1">Total de Grupos Ativos</span>
              <span className="font-semibold text-text-main text-sm font-mono">
                {groups.filter((g) => g.active).length} grupos
              </span>
            </div>
          </div>
        )}

        {/* Disconnected QR Code & Instructions */}
        {status?.status === 'DISCONNECTED' && (
          <div className="pt-6 space-y-4">
            {status?.qrCode ? (
              <div className="p-6 rounded-2xl border border-border bg-[#FBFBFC] text-center max-w-sm mx-auto space-y-3 shadow-sm">
                <span className="text-xs font-semibold text-text-main block">
                  Escaneie com seu WhatsApp:
                </span>
                <div className="bg-white p-3 rounded-xl border border-border inline-block shadow-sm">
                  <img src={status.qrCode} alt="WhatsApp QR Code" className="w-56 h-56 mx-auto" />
                </div>
                <span className="text-[11px] text-text-muted block">
                  Abra WhatsApp &rarr; Aparelhos conectados &rarr; Conectar um aparelho
                </span>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-gray-50 text-[11px] font-semibold text-text-muted"
                >
                  Atualizar QR Code
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-2xl border border-border bg-[#FBFBFC] text-center max-w-md mx-auto space-y-3 text-xs text-text-muted">
                <QrCode className="w-10 h-10 text-primary mx-auto" />
                <p className="font-semibold text-text-main text-sm">Instância pronta para conexão</p>
                <p>Clique no botão abaixo para gerar o QR Code da Evolution API.</p>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
                >
                  {connecting ? 'Gerando...' : 'Gerar QR Code Agora'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Instructions box when Service Unavailable */}
        {status?.status === 'SERVICE_UNAVAILABLE' && (
          <div className="mt-5 p-5 rounded-2xl bg-[#181A1D] text-white space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-gray-400 border-b border-gray-700/60 pb-2">
              <span className="flex items-center gap-2 font-sans font-semibold text-xs text-gray-200">
                <Terminal className="w-4 h-4 text-primary" />
                Como iniciar a Evolution API localmente:
              </span>
              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded">
                127.0.0.1:8080
              </span>
            </div>

            <div className="space-y-2 text-[11px]">
              <p className="font-sans text-gray-300 font-semibold">Opção A (Sem Docker — Recomendado no Windows):</p>
              <div className="bg-black/50 p-2.5 rounded-lg border border-gray-800 text-green-400 select-all">
                cd whatsapp-worker && npm start
              </div>

              <p className="font-sans text-gray-300 font-semibold pt-1">Opção B (Com Docker Compose):</p>
              <div className="bg-black/50 p-2.5 rounded-lg border border-gray-800 text-green-400 select-all">
                docker compose -f evolution/docker-compose.yml up -d
              </div>
            </div>

            <p className="text-[11px] text-gray-400 font-sans pt-1">
              Assim que o serviço subir na porta 8080, clique em <strong>Testar conexão</strong> ou <strong>Conectar / Gerar QR</strong> acima.
            </p>
          </div>
        )}
      </div>

      {/* Simple Direct Send Test Card */}
      <div className="bg-white rounded-card border border-border p-6 shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-main">Teste Simples de Envio para Grupo</h3>
              <p className="text-xs text-text-muted">
                Envie uma mensagem de teste direta para qualquer grupo sem precisar criar uma automação
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleExecuteSendTest} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">
              Grupo de Destino *
            </label>
            <select
              value={selectedTargetJid}
              onChange={(e) => setSelectedTargetJid(e.target.value)}
              className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-xl text-xs text-text-main focus:outline-none focus:border-primary focus:bg-white"
            >
              <option value="">Selecione um grupo...</option>
              {groups.map((g) => {
                const jid = g.provider_group_id || g.groupJid;
                return (
                  <option key={jid} value={jid}>
                    {g.name} ({jid})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">
              Link Opcional
            </label>
            <input
              type="url"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="https://s.shopee.com.br/exemplo (opcional)"
              className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-xl text-xs font-mono text-text-main focus:outline-none focus:border-primary focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">
              Mensagem *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Digite a mensagem de teste..."
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-border rounded-xl text-xs text-text-main focus:outline-none focus:border-primary focus:bg-white"
              />
              <button
                type="submit"
                disabled={sendingTest || !selectedTargetJid || status?.status !== 'CONNECTED'}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-sm transition-all whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sendingTest ? 'Enviando...' : 'Enviar teste'}</span>
              </button>
            </div>
          </div>
        </form>

        {testResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-mono animate-fade-in ${
              testResult.success
                ? 'bg-primary-soft/40 border-primary/30 text-primary-900'
                : 'bg-danger-soft/40 border-danger/30 text-danger-900'
            }`}
          >
            <span className="font-bold font-sans block mb-1">
              {testResult.success ? '✅ Mensagem enviada com sucesso ao WhatsApp!' : '❌ Falha no envio:'}
            </span>
            <span>{testResult.error || (testResult.success ? `ID da mensagem: ${testResult.provider_message_id || testResult.result?.provider_message_id || 'Enviado'}` : JSON.stringify(testResult, null, 2))}</span>
          </div>
        )}
      </div>

      {/* Synced Groups Section */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-text-main">
              Grupos Reais Sincronizados ({groups.length})
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Identificadores originais (@g.us) mantidos para os disparos automáticos
            </p>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar grupos..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-text-muted">Carregando grupos...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-12 text-center text-text-muted space-y-2">
            <Users2 className="w-8 h-8 text-gray-300 mx-auto" />
            <p className="text-sm font-semibold text-text-main">Nenhum grupo sincronizado ainda</p>
            <p className="text-xs">
              Conecte sua conta do WhatsApp e clique no botão <strong>Sincronizar grupos</strong> acima.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Grupo</th>
                  <th className="py-3 px-4">Identificador (@g.us)</th>
                  <th className="py-3 px-4 text-center">Participantes</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border">
                {filteredGroups.map((group) => (
                  <tr key={group.provider_group_id || group.id} className="hover:bg-[#FBFBFC] transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-text-main">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {group.name ? group.name.substring(0, 2).toUpperCase() : 'GP'}
                        </div>
                        <span className="truncate max-w-xs">{group.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-text-muted">
                      {group.provider_group_id || group.groupJid}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {group.participants_count || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-primary border border-green-200">
                        Ativo
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleOpenTestModal(group)}
                        disabled={status?.status !== 'CONNECTED'}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-border hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                      >
                        Enviar Teste
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Test Send Modal */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-border shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-text-main flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                <span>Disparo de Teste Manual (Evolution API)</span>
              </h3>
              <button
                onClick={() => setTestModalOpen(false)}
                className="text-text-muted hover:text-text-main text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleExecuteSendTest} className="space-y-4 text-xs">
              <div>
                <label className="block text-text-main font-semibold mb-1">
                  Grupo de Destino (@g.us):
                </label>
                <select
                  value={selectedTargetJid}
                  onChange={(e) => setSelectedTargetJid(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-border bg-[#F9FAFB] font-mono text-xs focus:outline-none focus:border-primary"
                >
                  {groups.map((g) => (
                    <option key={g.provider_group_id || g.groupJid} value={g.provider_group_id || g.groupJid}>
                      {g.name} ({g.provider_group_id || g.groupJid})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-text-main font-semibold mb-1">
                  URL / Link da Oferta (Opcional para teste de prévia):
                </label>
                <input
                  type="url"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  placeholder="https://s.shopee.com.br/..."
                  className="w-full p-2.5 rounded-xl border border-border font-mono text-xs focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-text-main font-semibold mb-1">
                  Mensagem Promocional:
                </label>
                <textarea
                  rows={4}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-border font-mono text-xs focus:outline-none focus:border-primary"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs font-mono ${
                    testResult.success
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  <div className="font-semibold">{testResult.success ? '✅ Enviado com Sucesso!' : '❌ Falha no Envio'}</div>
                  <pre className="text-[10px] mt-1 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setTestModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-gray-50 font-semibold"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={sendingTest}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${sendingTest ? 'animate-spin' : ''}`} />
                  <span>{sendingTest ? 'Enviando...' : 'Enviar Agora'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
