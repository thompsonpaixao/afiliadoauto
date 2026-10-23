'use client';

import React, { useEffect, useState } from 'react';
import {
  History,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function HistoricoPage() {
  const { toast } = useToast();

  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'error'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?status=${statusFilter}&period=${periodFilter}`);
      const data = await res.json();
      if (res.ok) {
        setJobs(data.jobs || []);
      }
    } catch (e: any) {
      toast('Erro ao carregar histórico: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [statusFilter, periodFilter]);

  const handleRetryJob = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });

      const data = await res.json();
      if (data.success) {
        toast('Reenvio disparado com sucesso!', 'success');
        fetchHistory();
      } else {
        toast(data.error || 'Falha ao reenviar', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-main">Histórico de Disparos</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Acompanhe todos os envios realizados, pendentes e falhas por grupo
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-card border border-border p-4 shadow-card flex flex-wrap items-center justify-between gap-4">
        {/* Status filters */}
        <div className="flex items-center gap-1.5 border border-border rounded-lg p-1 bg-gray-50 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'all' ? 'bg-white text-text-main shadow-sm' : 'text-text-muted'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setStatusFilter('sent')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'sent' ? 'bg-white text-primary shadow-sm' : 'text-text-muted'
            }`}
          >
            Enviados
          </button>
          <button
            onClick={() => setStatusFilter('error')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              statusFilter === 'error' ? 'bg-white text-danger shadow-sm' : 'text-text-muted'
            }`}
          >
            Erros
          </button>
        </div>

        {/* Period filters */}
        <div className="flex items-center gap-1.5 border border-border rounded-lg p-1 bg-gray-50 text-xs">
          <button
            onClick={() => setPeriodFilter('all')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              periodFilter === 'all' ? 'bg-white text-text-main shadow-sm' : 'text-text-muted'
            }`}
          >
            Todo o período
          </button>
          <button
            onClick={() => setPeriodFilter('today')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              periodFilter === 'today' ? 'bg-white text-text-main shadow-sm' : 'text-text-muted'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setPeriodFilter('7d')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              periodFilter === '7d' ? 'bg-white text-text-main shadow-sm' : 'text-text-muted'
            }`}
          >
            7 dias
          </button>
          <button
            onClick={() => setPeriodFilter('30d')}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              periodFilter === '30d' ? 'bg-white text-text-main shadow-sm' : 'text-text-muted'
            }`}
          >
            30 dias
          </button>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-text-muted space-y-3">
            <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <History className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-text-main">Nenhum disparo encontrado</p>
            <p className="text-xs text-text-muted">
              Os registros de envio aparecerão aqui conforme as automações forem executadas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-5">Data/Hora</th>
                  <th className="py-3 px-5">Produto</th>
                  <th className="py-3 px-5">Grupo WhatsApp</th>
                  <th className="py-3 px-5">Sub ID</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5">Tentativas</th>
                  <th className="py-3 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[#FBFBFC] transition-colors">
                    <td className="py-3.5 px-5 font-mono text-[11px] text-text-muted whitespace-nowrap">
                      {new Date(job.sentAt || job.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-text-main max-w-xs truncate">
                      {job.productName}
                    </td>
                    <td className="py-3.5 px-5 text-text-muted max-w-xs truncate">
                      {job.groupName}
                    </td>
                    <td className="py-3.5 px-5 font-mono text-[11px] text-text-muted">
                      {job.subIdUsed || '-'}
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap">
                      {job.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-soft text-primary">
                          <CheckCircle2 className="w-3 h-3" />
                          Enviado
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-danger-soft text-danger"
                          title={job.error || 'Erro'}
                        >
                          <XCircle className="w-3 h-3" />
                          Erro
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 font-mono text-text-muted">
                      {job.attempts || 1}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      {(job.status === 'failed' || (job.status as any) === 'error') && (
                        <button
                          onClick={() => handleRetryJob(job.id)}
                          disabled={retryingId === job.id}
                          className="px-2.5 py-1 rounded-md border border-border hover:bg-gray-100 text-[11px] font-semibold text-text-main inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className={`w-3 h-3 ${retryingId === job.id ? 'animate-spin' : ''}`} />
                          <span>Reenviar</span>
                        </button>
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
