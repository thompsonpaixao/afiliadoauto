'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Link2,
  Plus,
  Trash2,
  Upload,
  Copy,
  Check,
  FileText,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  List as ListIcon,
  LayoutGrid,
  Sparkles,
  ArrowRight,
  ExternalLink,
  X,
  FileUp,
  Package,
  CheckSquare,
  Square,
  RotateCcw,
  Eye,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/context/ToastContext';

export default function ConversorPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [tabMethod, setTabMethod] = useState<'manual' | 'paste' | 'file'>('paste');

  // Manual inputs
  const [manualLinks, setManualLinks] = useState<string[]>(['']);

  // Paste input
  const [pasteText, setPasteText] = useState('');

  // File import
  const [file, setFile] = useState<File | null>(null);
  const [parsedStructuredItems, setParsedStructuredItems] = useState<any[]>([]);
  const [ambiguousColumns, setAmbiguousColumns] = useState<any[]>([]);
  const [selectedColumn, setSelectedColumn] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sub IDs toggle
  const [useSubIds, setUseSubIds] = useState(false);
  const [subId1, setSubId1] = useState('');
  const [subId2, setSubId2] = useState('');
  const [subId3, setSubId3] = useState('');
  const [subId4, setSubId4] = useState('');
  const [subId5, setSubId5] = useState('');

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    converted: 0,
    duplicates: 0,
    errors: 0,
    waiting: 0,
  });

  // Results & View Modes (table | grid | links)
  const [results, setResults] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'links'>('table');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const [selectedConvIds, setSelectedConvIds] = useState<string[]>([]);
  const [detailItem, setDetailItem] = useState<any | null>(null);

  // Load persisted conversion history across page reloads
  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/shopee/convert');
      if (res.ok) {
        const data = await res.json();
        if (data.conversions) {
          setResults(data.conversions);
          if (data.stats) {
            setStats(data.stats);
          }
        }
      }
    } catch (err: any) {
      console.warn('Falha ao carregar histórico de conversões:', err.message);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleToggleSelectConv = (id: string) => {
    setSelectedConvIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllConv = () => {
    if (selectedConvIds.length === results.length && results.length > 0) {
      setSelectedConvIds([]);
    } else {
      setSelectedConvIds(results.map((r) => r.id).filter(Boolean));
    }
  };

  const handleDeleteSelectedConv = async () => {
    if (selectedConvIds.length === 0) return;
    if (!confirm(`Deseja remover ${selectedConvIds.length} item(ns) do histórico? (Os produtos na biblioteca permanecerão salvos)`)) {
      return;
    }

    try {
      await fetch('/api/shopee/convert', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedConvIds }),
      });
      setSelectedConvIds([]);
      fetchHistory();
      toast(`${selectedConvIds.length} item(ns) removido(s) do histórico.`, 'info');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!batchId) return;
    if (!confirm(`Deseja remover todos os registros do lote #${batchId.slice(-6)} do histórico? (Os produtos na biblioteca não serão excluídos)`)) {
      return;
    }

    try {
      await fetch('/api/shopee/convert', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      fetchHistory();
      toast(`Lote #${batchId.slice(-6)} removido do histórico.`, 'info');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleRetryError = async (item: any) => {
    toast(`Tentando reconverter "${item.productName || item.originalUrl}"...`, 'info');
    try {
      const res = await fetch('/api/shopee/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [item.originalUrl], subIds: item.subIds || [] }),
      });
      const data = await res.json();
      if (res.ok) {
        toast('Item reconvertido com sucesso!', 'success');
        fetchHistory();
      } else {
        toast(data.error || 'Falha ao reconverter', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await fetch('/api/shopee/convert', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setResults((prev) => prev.filter((r) => r.id !== id));
      setSelectedConvIds((prev) => prev.filter((i) => i !== id));
      toast('Item removido do histórico.', 'info');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Deseja limpar todo o histórico de conversões? (Os produtos salvos na biblioteca NÃO serão excluídos)')) return;
    try {
      await fetch('/api/shopee/convert', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setResults([]);
      setSelectedConvIds([]);
      setStats({ total: 0, converted: 0, duplicates: 0, errors: 0, waiting: 0 });
      toast('Histórico de conversões limpo com sucesso.', 'info');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  // Parse Shopee URLs in pasted text
  const detectPastedUrls = (text: string): string[] => {
    const lines = text.split(/[\r\n,;]+/);
    const urls: string[] = [];
    const shopeeRegex = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)?(shopee\.com\.br|shope\.ee|s\.shopee\.com\.br|shp\.ee|collshp\.com)\/[^\s<>"'{}|\\^`]+/i;

    for (const raw of lines) {
      const match = raw.match(shopeeRegex);
      if (match) {
        let u = match[0].trim();
        if (!u.startsWith('http')) u = `https://${u}`;
        urls.push(u);
      }
    }
    return Array.from(new Set(urls));
  };

  // Detect non-Shopee URLs (Amazon, Mercado Livre, etc.)
  const detectNonShopeeUrls = (text: string): string[] => {
    const lines = text.split(/[\r\n,;]+/);
    const nonShopee: string[] = [];
    const urlRegex = /(https?:\/\/[^\s<>"'{}|\\^`]+)/i;
    const shopeeRegex = /(shopee\.com\.br|shope\.ee|s\.shopee\.com\.br|shp\.ee|collshp\.com)/i;

    for (const raw of lines) {
      const match = raw.match(urlRegex);
      if (match) {
        const u = match[0].trim();
        if (!shopeeRegex.test(u)) {
          nonShopee.push(u);
        }
      }
    }
    return Array.from(new Set(nonShopee));
  };

  const detectedPastedCount = detectPastedUrls(pasteText).length;
  const detectedNonShopee = detectNonShopeeUrls(pasteText);

  const handleAddManualLink = () => {
    setManualLinks((prev) => [...prev, '']);
  };

  const handleUpdateManualLink = (index: number, val: string) => {
    setManualLinks((prev) => {
      const updated = [...prev];
      updated[index] = val;
      return updated;
    });
  };

  const handleRemoveManualLink = (index: number) => {
    if (manualLinks.length === 1) {
      setManualLinks(['']);
      return;
    }
    setManualLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setAmbiguousColumns([]);
    setSelectedColumn('');
    setParsedStructuredItems([]);

    const formData = new FormData();
    formData.append('file', uploadedFile);

    try {
      const res = await fetch('/api/shopee/parse-file', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.needsColumnSelection) {
        setAmbiguousColumns(data.detectedColumns || []);
        toast(data.message, 'info');
      } else if (data.items || data.urls) {
        if (data.items && data.items.length > 0) {
          setParsedStructuredItems(data.items);
        }
        setPasteText(data.urls?.join('\n') || '');
        setTabMethod('paste');
        toast(
          data.isStructured
            ? `${data.totalFound} produtos detectados automaticamente no arquivo ${uploadedFile.name}`
            : `${data.totalFound} links encontrados no arquivo ${uploadedFile.name}`,
          'success'
        );
      } else if (data.error) {
        toast(data.error, 'error');
      }
    } catch (e: any) {
      toast('Erro ao processar arquivo: ' + e.message, 'error');
    }
  };

  const handleSelectAmbiguousColumn = async (colName: string) => {
    if (!file) return;
    setSelectedColumn(colName);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('column', colName);

    try {
      const res = await fetch('/api/shopee/parse-file', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.urls) {
        if (data.items && data.items.length > 0) {
          setParsedStructuredItems(data.items);
        }
        setPasteText(data.urls.join('\n'));
        setTabMethod('paste');
        setAmbiguousColumns([]);
        toast(`${data.totalFound} links selecionados da coluna ${colName}`, 'success');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleCancelConversion = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProcessing(false);
    toast('Conversão interrompida pelo usuário.', 'info');
  };

  const handleStartConversion = async (overrideItems?: any[]) => {
    let itemsToProcess: any[] = [];

    if (overrideItems && overrideItems.length > 0) {
      itemsToProcess = overrideItems;
    } else if (tabMethod === 'file' && parsedStructuredItems.length > 0) {
      itemsToProcess = parsedStructuredItems;
    } else {
      let finalUrls: string[] = [];
      if (tabMethod === 'manual') {
        finalUrls = manualLinks.map((l) => l.trim()).filter(Boolean);
      } else {
        finalUrls = detectPastedUrls(pasteText);
      }

      if (finalUrls.length === 0) {
        const nonShopee = detectNonShopeeUrls(pasteText);
        if (nonShopee.length > 0) {
          toast('Links de outros sites detectados! Use o botão "Adicionar como produto manual".', 'info');
        } else {
          toast('Nenhum link Shopee detectado para conversão.', 'error');
        }
        return;
      }
      itemsToProcess = finalUrls.map((u) => ({ rawUrl: u }));
    }

    const totalCount = itemsToProcess.length;
    if (totalCount === 0) return;

    setModalOpen(false);
    setProcessing(true);
    setProgressPercent(0);
    setProgressText(`0 / ${totalCount} (0%) processados`);

    const activeSubIds = useSubIds
      ? [subId1, subId2, subId3, subId4, subId5]
          .map((s) => s.trim().replace(/[^a-zA-Z0-9]/g, ''))
          .filter(Boolean)
      : [];

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const CHUNK_SIZE = 5;
    let accumulatedResults: any[] = [];
    let convertedSum = 0;
    let duplicateSum = 0;
    let errorSum = 0;

    try {
      for (let i = 0; i < totalCount; i += CHUNK_SIZE) {
        if (controller.signal.aborted) {
          break;
        }

        const chunk = itemsToProcess.slice(i, i + CHUNK_SIZE);
        const res = await fetch('/api/shopee/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ items: chunk, subIds: activeSubIds }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Erro na resposta do servidor.');
        }

        const data = await res.json();
        if (data.results) {
          accumulatedResults = [...accumulatedResults, ...data.results];
          setResults((prev) => {
            const merged = [
              ...data.results,
              ...prev.filter((p: any) => !data.results.some((r: any) => r.originalUrl === p.originalUrl)),
            ];
            return merged;
          });
        }

        convertedSum += data.stats?.converted || 0;
        duplicateSum += data.stats?.duplicates || 0;
        errorSum += data.stats?.errors || 0;

        const processedSoFar = Math.min(totalCount, i + chunk.length);
        const percent = Math.round((processedSoFar / totalCount) * 100);

        setProgressPercent(percent);
        setProgressText(`${processedSoFar} / ${totalCount} (${percent}%) processados`);

        setStats({
          total: totalCount,
          converted: convertedSum,
          duplicates: duplicateSum,
          errors: errorSum,
          waiting: totalCount - processedSoFar,
        });
      }

      if (!controller.signal.aborted) {
        setProgressPercent(100);
        setProgressText(`${totalCount} / ${totalCount} (100%) concluído`);
        toast(`${convertedSum} links convertidos com sucesso!`, 'success');
        if (errorSum > 0) {
          toast(`${errorSum} link(s) apresentaram erro. Você pode tentar novamente.`, 'error');
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        toast('Conversão cancelada pelo usuário.', 'info');
      } else {
        toast('Erro durante processamento: ' + err.message, 'error');
      }
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
      fetchHistory();
    }
  };

  const handleRetryAllErrors = () => {
    const errorItems = results.filter((r) => r.status === 'error' || r.error);
    if (errorItems.length === 0) {
      toast('Nenhum item com erro para reprocessar.', 'info');
      return;
    }
    toast(`Tentando reconverter ${errorItems.length} item(ns) com erro...`, 'info');
    const retryPayload = errorItems.map((item) => ({
      rawUrl: item.originalUrl,
      productLink: item.originalUrl,
      itemName: item.productName !== 'Erro na conversão' ? item.productName : undefined,
    }));
    handleStartConversion(retryPayload);
  };

  const handleCopyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast('Link copiado para a área de transferência!', 'success');
  };

  const handleCopyAll = () => {
    const list = results
      .filter((r) => r.affiliateUrl)
      .map((r) => `${r.productName}\n${r.affiliateUrl}`)
      .join('\n\n');

    navigator.clipboard.writeText(list);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
    toast('Todos os links foram copiados!', 'success');
  };

  const exportTxt = () => {
    const content = results
      .filter((r) => r.affiliateUrl)
      .map((r) => `${r.productName}\n${r.affiliateUrl}`)
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `afiliado-auto-shopee-${Date.now()}.txt`;
    a.click();
  };

  const exportCsv = () => {
    const rows = [
      ['Produto', 'Link Original', 'Link Afiliado', 'Preco', 'SubIDs', 'Status'],
      ...results.map((r) => [
        r.productName,
        r.originalUrl,
        r.affiliateUrl,
        r.priceMin || '',
        r.subIds ? r.subIds.join(',') : '',
        r.status,
      ]),
    ];

    const csvContent = '\uFEFF' + rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `afiliado-auto-shopee-${Date.now()}.csv`;
    a.click();
  };

  const exportXlsx = () => {
    const rows = results.map((r) => ({
      Produto: r.productName,
      'Link Original': r.originalUrl,
      'Link Afiliado': r.affiliateUrl,
      Preço: r.priceMin,
      'Sub IDs': r.subIds ? r.subIds.join(', ') : '',
      Status: r.status,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Links Shopee');
    XLSX.writeFile(wb, `afiliado-auto-shopee-${Date.now()}.xlsx`);
  };

  const formatPrice = (val: number | null | undefined) => {
    if (val === null || val === undefined || val === 0) return '--';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">Conversor Shopee</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Transforme links da Shopee em links de afiliado com Sub IDs e envie para a Biblioteca
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/produtos?action=manual"
            className="px-3.5 py-2 bg-white border border-border hover:border-primary text-text-main text-xs font-semibold rounded-xl shadow-subtle transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>Produto Manual</span>
          </Link>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Links Shopee</span>
          </button>
        </div>
      </div>

      {/* Progress & Counters */}
      {(processing || stats.total > 0) && (
        <div className="bg-white rounded-card border border-border p-5 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Status do Processamento
              </span>
              <div className="text-lg font-bold text-text-main font-mono mt-0.5">
                {progressText || `${stats.converted} / ${stats.total} processados`}
              </div>
            </div>

            {/* Counters and Controls */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium">
              <span className="px-2.5 py-1 rounded-md bg-primary-soft text-primary border border-primary/20">
                {stats.converted} Convertidos
              </span>
              <span className="px-2.5 py-1 rounded-md bg-gray-100 text-text-muted border border-border">
                {stats.duplicates} Duplicados
              </span>
              <span className="px-2.5 py-1 rounded-md bg-danger-soft text-danger border border-danger/20">
                {stats.errors} Com erro
              </span>

              {processing && (
                <button
                  type="button"
                  onClick={handleCancelConversion}
                  className="px-3 py-1 rounded-md bg-danger-soft text-danger border border-danger/30 hover:bg-danger-soft/80 font-semibold flex items-center gap-1 transition-all shadow-subtle"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancelar</span>
                </button>
              )}

              {stats.errors > 0 && !processing && (
                <button
                  type="button"
                  onClick={handleRetryAllErrors}
                  className="px-3 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 font-semibold flex items-center gap-1.5 transition-all shadow-subtle"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Tentar novamente erros ({stats.errors})</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{
                width: processing
                  ? `${Math.max(15, progressPercent)}%`
                  : stats.total > 0
                  ? `${Math.round(((stats.converted + stats.errors) / stats.total) * 100)}%`
                  : '0%',
              }}
            />
          </div>
        </div>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
          <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-text-main">Seus links estão prontos</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {results.length} links processados e salvos na Biblioteca de Produtos
              </p>
            </div>

            {/* View Mode switch and export actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center border border-border rounded-lg p-0.5 bg-gray-50">
                <button
                  onClick={() => setViewMode('table')}
                  title="Visualização em Tabela"
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                    viewMode === 'table' ? 'bg-white shadow-sm text-text-main font-semibold' : 'text-text-muted'
                  }`}
                >
                  <ListIcon className="w-3.5 h-3.5" />
                  <span>Tabela</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  title="Visualização em Grade"
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                    viewMode === 'grid' ? 'bg-white shadow-sm text-text-main font-semibold' : 'text-text-muted'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grade</span>
                </button>
                <button
                  onClick={() => setViewMode('links')}
                  title="Visualização Só Links"
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                    viewMode === 'links' ? 'bg-white shadow-sm text-text-main font-semibold' : 'text-text-muted'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Só Links</span>
                </button>
              </div>

              {selectedConvIds.length > 0 && (
                <div className="flex items-center gap-2 bg-primary-soft/50 px-2.5 py-1 rounded-lg border border-primary/20 text-xs">
                  <span className="font-semibold text-primary font-mono">{selectedConvIds.length} selecionado(s)</span>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={handleDeleteSelectedConv}
                    className="text-danger hover:underline font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir selecionados</span>
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => setSelectedConvIds([])}
                    className="text-text-muted hover:text-text-main"
                  >
                    Desmarcar
                  </button>
                </div>
              )}

              <button
                onClick={handleCopyAll}
                className="px-3 py-1.5 rounded-lg border border-border hover:bg-gray-50 text-xs font-medium text-text-main flex items-center gap-1.5 transition-colors"
              >
                {allCopied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-text-muted" />}
                <span>Copiar todos</span>
              </button>

              <button
                onClick={handleClearHistory}
                title="Limpar histórico da tela (não exclui produtos salvos)"
                className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-danger-soft/30 hover:text-danger text-xs font-medium text-text-muted flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpar histórico</span>
              </button>

              <button
                onClick={exportTxt}
                title="Exportar TXT formatado"
                className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-gray-50 text-xs font-medium text-text-muted hover:text-text-main flex items-center gap-1 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>TXT</span>
              </button>

              <button
                onClick={exportCsv}
                title="Exportar CSV"
                className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-gray-50 text-xs font-medium text-text-muted hover:text-text-main flex items-center gap-1 transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                onClick={exportXlsx}
                title="Exportar XLSX"
                className="px-2.5 py-1.5 rounded-lg border border-border hover:bg-gray-50 text-xs font-medium text-text-muted hover:text-text-main flex items-center gap-1 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>XLSX</span>
              </button>
            </div>
          </div>

          {/* Mode 1: Table View */}
          {viewMode === 'table' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F9FAFB] border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-3 w-10">
                      <button onClick={handleSelectAllConv} className="p-0.5 text-text-muted hover:text-text-main">
                        {selectedConvIds.length === results.length && results.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-4">Produto</th>
                    <th className="py-3 px-4">Lote / Motivo</th>
                    <th className="py-3 px-4">Sub IDs</th>
                    <th className="py-3 px-4">Preço</th>
                    <th className="py-3 px-4">Link Afiliado</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y border-border">
                  {results.map((res: any, idx: number) => {
                    const isSelected = selectedConvIds.includes(res.id);

                    return (
                      <tr key={res.id || idx} className={`hover:bg-[#FBFBFC] transition-colors ${isSelected ? 'bg-primary-soft/30' : ''}`}>
                        <td className="py-3.5 px-3">
                          <button onClick={() => handleToggleSelectConv(res.id)} className="p-0.5 text-text-muted hover:text-text-main">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-text-main max-w-xs">
                          <div className="flex items-center gap-2.5">
                            {res.imageUrl ? (
                              <img
                                src={res.imageUrl}
                                alt=""
                                className="w-10 h-10 rounded-lg object-cover border border-border shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setDetailItem(res)}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-gray-400 cursor-pointer hover:bg-gray-200 transition-colors"
                                onClick={() => setDetailItem(res)}
                              >
                                <Package className="w-5 h-5" />
                              </div>
                            )}
                            <div
                              className="truncate font-semibold cursor-pointer hover:text-primary transition-colors"
                              onClick={() => setDetailItem(res)}
                            >
                              {res.productName}
                            </div>
                          </div>
                          {res.error && (
                            <div className="text-[11px] text-danger font-mono truncate mt-0.5 ml-12">
                              {res.error}
                            </div>
                          )}
                          <div className="text-[10px] text-text-muted truncate font-mono ml-12 mt-0.5">
                            {res.originalUrl}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-text-muted whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-text-main">
                              {res.batchId ? `#${res.batchId.slice(-6)}` : '--'}
                            </span>
                            <span className="text-[10px] text-text-muted">
                              {res.reason === 'batch_import' ? 'Importação em Lote' : res.reason === 'reconversion' ? 'Reconversão' : 'Manual'}
                              {res.createdAt ? ` • ${new Date(res.createdAt).toLocaleDateString('pt-BR')}` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-text-muted max-w-[120px] truncate">
                          {res.subIds && res.subIds.length > 0 ? res.subIds.join(', ') : '--'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-text-main whitespace-nowrap">
                          {formatPrice(res.currentPrice || res.priceMin)}
                          {(res.originalPrice || res.pricePrevious) && (res.originalPrice || res.pricePrevious) > (res.currentPrice || res.priceMin) && (
                            <div className="text-[10px] text-text-muted line-through">
                              {formatPrice(res.originalPrice || res.pricePrevious)}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] max-w-xs truncate">
                          {res.affiliateUrl ? (
                            <span className="text-primary font-medium">{res.affiliateUrl}</span>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {res.status === 'converted' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-soft text-primary">
                              Convertido
                            </span>
                          )}
                          {res.status === 'duplicate' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-text-muted">
                              Duplicado
                            </span>
                          )}
                          {(res.status === 'error' || res.status === 'partial') && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft text-danger">
                              {res.status === 'partial' ? 'Pendente' : 'Com erro'}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setDetailItem(res)}
                              title="Ver detalhes com imagem grande"
                              className="p-1.5 rounded-lg border border-border hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {res.status === 'error' && (
                              <button
                                onClick={() => handleRetryError(res)}
                                title="Tentar reconverter"
                                className="px-2 py-1 rounded-lg border border-primary/30 bg-primary-soft text-primary font-medium text-[11px] hover:bg-primary hover:text-white transition-colors"
                              >
                                Tentar novamente
                              </button>
                            )}
                            {res.affiliateUrl ? (
                              <button
                                onClick={() => handleCopyLink(res.affiliateUrl, `res-${idx}`)}
                                className="p-1.5 rounded-lg border border-border hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors inline-flex items-center gap-1 font-mono text-xs"
                              >
                                {copiedId === `res-${idx}` ? (
                                  <Check className="w-3.5 h-3.5 text-primary" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                <span className="hidden sm:inline">Copiar</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => router.push(`/produtos?action=manual&link=${encodeURIComponent(res.originalUrl)}`)}
                                className="px-2 py-1 rounded-lg border border-primary/30 bg-primary-soft text-primary font-semibold text-[11px] transition-colors"
                              >
                                Salvar Manual
                              </button>
                            )}
                            {res.batchId && (
                              <button
                                onClick={() => handleDeleteBatch(res.batchId)}
                                title="Excluir este lote do histórico"
                                className="px-1.5 py-1 rounded-lg border border-border hover:bg-gray-100 text-text-muted hover:text-text-main text-[10px] font-mono transition-colors"
                              >
                                Lote
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteItem(res.id)}
                              title="Remover do histórico"
                              className="p-1.5 rounded-lg border border-border hover:bg-danger-soft/40 text-text-muted hover:text-danger transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Mode 2: Grid View (Cards com imagem grande) */}
          {viewMode === 'grid' && (
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-[#FBFBFC]">
              {results.map((res: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-white rounded-card border border-border shadow-sm flex flex-col justify-between overflow-hidden group hover:border-gray-300 transition-all"
                >
                  <div
                    className="relative aspect-square w-full bg-gray-50 border-b border-border overflow-hidden cursor-pointer"
                    onClick={() => setDetailItem(res)}
                  >
                    {res.imageUrl ? (
                      <img
                        src={res.imageUrl}
                        alt={res.productName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Package className="w-16 h-16 stroke-1" />
                      </div>
                    )}

                    <div className="absolute top-2.5 right-2.5">
                      {res.status === 'converted' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 text-primary shadow-sm border border-primary/20">
                          Convertido
                        </span>
                      )}
                      {res.status === 'duplicate' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 text-text-muted shadow-sm border border-gray-200">
                          Duplicado
                        </span>
                      )}
                      {(res.status === 'error' || res.status === 'partial') && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 text-danger shadow-sm border border-red-200">
                          {res.status === 'partial' ? 'Pendente' : 'Com erro'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <h4
                        className="text-xs font-bold text-text-main line-clamp-2 leading-snug cursor-pointer hover:text-primary transition-colors"
                        onClick={() => setDetailItem(res)}
                      >
                        {res.productName}
                      </h4>
                      {res.error && (
                        <p className="text-[10px] text-danger font-mono truncate mt-0.5">{res.error}</p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-text-main">
                        {formatPrice(res.priceMin || res.currentPrice)}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDetailItem(res)}
                          title="Ver detalhes"
                          className="p-1 rounded-md border border-border hover:bg-gray-50 text-text-muted hover:text-text-main transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        {res.status === 'error' && (
                          <button
                            onClick={() => handleRetryError(res)}
                            title="Tentar novamente"
                            className="px-2 py-1 rounded-md border border-primary/30 bg-primary-soft text-primary font-medium text-[10px]"
                          >
                            Repetir
                          </button>
                        )}
                        {res.affiliateUrl ? (
                          <button
                            onClick={() => handleCopyLink(res.affiliateUrl, `grid-${idx}`)}
                            className="px-2 py-1 rounded-md border border-border hover:bg-gray-50 text-xs font-mono text-text-main flex items-center gap-1 transition-colors"
                          >
                            {copiedId === `grid-${idx}` ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedId === `grid-${idx}` ? 'Copiado' : 'Copiar'}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => router.push(`/produtos?action=manual&link=${encodeURIComponent(res.originalUrl)}`)}
                            className="px-2 py-1 rounded-md border border-primary/30 bg-primary-soft text-primary font-semibold text-[10px]"
                          >
                            Salvar Manual
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteItem(res.id)}
                          title="Remover"
                          className="p-1 rounded-md border border-border hover:bg-danger-soft/40 text-text-muted hover:text-danger transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mode 3: Só Links View */}
          {viewMode === 'links' && (
            <div className="p-6 bg-[#F9FAFB] font-mono text-xs space-y-3 max-h-[500px] overflow-y-auto">
              {results.map((r, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-border flex items-center justify-between gap-3 shadow-subtle">
                  <div className="truncate max-w-lg">
                    <div className="font-semibold text-text-main truncate font-sans">{r.productName}</div>
                    <div className="text-primary truncate">{r.affiliateUrl || r.originalUrl}</div>
                  </div>

                  {r.affiliateUrl && (
                    <button
                      onClick={() => handleCopyLink(r.affiliateUrl, `link-${idx}`)}
                      className="px-2.5 py-1 rounded-md border border-border hover:bg-gray-50 text-xs text-text-main flex items-center gap-1 font-mono transition-colors shrink-0"
                    >
                      {copiedId === `link-${idx}` ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === `link-${idx}` ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State before any conversion */}
      {!processing && results.length === 0 && (
        <div className="bg-white rounded-card border border-border p-12 text-center shadow-card max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary flex items-center justify-center mx-auto shadow-sm">
            <Link2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-main">Nenhum lote convertido ainda</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              Cole links da Shopee ou importe planilhas XLSX, CSV ou TXT para gerar links de afiliado com Sub IDs.
            </p>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar primeiros links</span>
          </button>
        </div>
      )}

      {/* Large Modal / Drawer for Adding Links */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-card border border-border shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-modal overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-text-main">Adicionar Links da Shopee</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Escolha como deseja importar os links para conversão em lote
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Methods Tabs */}
            <div className="p-5 border-b border-border bg-[#FBFBFC]">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTabMethod('paste')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    tabMethod === 'paste'
                      ? 'bg-white border-primary text-primary shadow-subtle'
                      : 'border-border text-text-muted hover:text-text-main bg-white'
                  }`}
                >
                  Colar lista de links
                </button>
                <button
                  type="button"
                  onClick={() => setTabMethod('file')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    tabMethod === 'file'
                      ? 'bg-white border-primary text-primary shadow-subtle'
                      : 'border-border text-text-muted hover:text-text-main bg-white'
                  }`}
                >
                  Importar arquivo
                </button>
                <button
                  type="button"
                  onClick={() => setTabMethod('manual')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    tabMethod === 'manual'
                      ? 'bg-white border-primary text-primary shadow-subtle'
                      : 'border-border text-text-muted hover:text-text-main bg-white'
                  }`}
                >
                  Adicionar manualmente
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* External Non-Shopee Link Detection Banner */}
              {detectedNonShopee.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Detectamos <strong>{detectedNonShopee.length}</strong> link(s) externo(s) de outros afiliados (Amazon, Mercado Livre, etc.).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setModalOpen(false);
                      router.push(`/produtos?action=manual&link=${encodeURIComponent(detectedNonShopee[0])}`);
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs whitespace-nowrap shadow-sm transition-colors"
                  >
                    Cadastrar como manual
                  </button>
                </div>
              )}

              {/* Method 1: Colar Lista */}
              {tabMethod === 'paste' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-main">
                      Cole sua lista (1 link por linha)
                    </label>
                    <span className="text-xs font-mono font-medium text-primary">
                      {detectedPastedCount} links Shopee encontrados
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="https://shopee.com.br/product/...&#10;https://s.shopee.com.br/...&#10;https://shope.ee/..."
                    className="w-full p-3.5 bg-[#F9FAFB] border border-border rounded-xl text-xs font-mono text-text-main placeholder:text-gray-400 focus:outline-none focus:border-primary focus:bg-white transition-colors"
                  />
                  <p className="text-[11px] text-text-muted">
                    Aceita links curtos (s.shopee.com.br, shope.ee) e links longos de produto.
                  </p>
                </div>
              )}

              {/* Method 2: Importar Arquivo */}
              {tabMethod === 'file' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) {
                        handleFileUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    className="border-2 border-dashed border-border hover:border-primary rounded-2xl p-8 text-center bg-[#FBFBFC] transition-colors cursor-pointer"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.txt,.csv,.xlsx,.xls';
                      input.onchange = (e: any) => {
                        if (e.target.files?.[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      };
                      input.click();
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center mx-auto mb-3">
                      <FileUp className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-text-main block">
                      {file ? file.name : 'Arraste ou clique para selecionar'}
                    </span>
                    <span className="text-xs text-text-muted mt-1 block">
                      Formatos aceitos: .xlsx, .xls, .csv, .txt
                    </span>
                  </div>

                  {/* Ambiguous Column Selector */}
                  {ambiguousColumns.length > 0 && (
                    <div className="p-4 rounded-xl border border-warning/30 bg-warning-soft/30 space-y-2">
                      <span className="text-xs font-semibold text-text-main block">
                        Selecione a coluna que contém os links da Shopee:
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {ambiguousColumns.map((col, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectAmbiguousColumn(col.name)}
                            className="p-2.5 rounded-lg border border-border bg-white text-left hover:border-primary transition-colors text-xs"
                          >
                            <span className="font-semibold text-text-main block">{col.name}</span>
                            <span className="text-[11px] text-text-muted block">{col.urlCount} links detectados</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Method 3: Adicionar Manualmente */}
              {tabMethod === 'manual' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-text-main block">
                    Adicione links individualmente
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {manualLinks.map((link, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-text-muted w-14 shrink-0">
                          Link {idx + 1}
                        </span>
                        <input
                          type="url"
                          value={link}
                          onChange={(e) => handleUpdateManualLink(idx, e.target.value)}
                          placeholder="https://shopee.com.br/..."
                          className="flex-1 py-2 px-3 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveManualLink(idx)}
                          className="p-2 text-text-muted hover:text-danger rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddManualLink}
                    className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1.5 transition-colors pt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar outro link</span>
                  </button>
                </div>
              )}

              {/* Sub IDs Section */}
              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-text-main block">Rastreamento por Sub ID</span>
                    <span className="text-[11px] text-text-muted block">
                      Adicione tags de rastreamento para identificar vendas por lote
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useSubIds}
                      onChange={(e) => setUseSubIds(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {useSubIds && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 animate-fade-in">
                    <div>
                      <label className="text-[10px] text-text-muted uppercase font-semibold">Sub ID 1</label>
                      <input
                        type="text"
                        value={subId1}
                        onChange={(e) => setSubId1(e.target.value)}
                        placeholder="campanha"
                        className="w-full mt-1 p-2 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-muted uppercase font-semibold">Sub ID 2</label>
                      <input
                        type="text"
                        value={subId2}
                        onChange={(e) => setSubId2(e.target.value)}
                        placeholder="grupo_vip"
                        className="w-full mt-1 p-2 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-muted uppercase font-semibold">Sub ID 3</label>
                      <input
                        type="text"
                        value={subId3}
                        onChange={(e) => setSubId3(e.target.value)}
                        placeholder="opcional"
                        className="w-full mt-1 p-2 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-muted uppercase font-semibold">Sub ID 4</label>
                      <input
                        type="text"
                        value={subId4}
                        onChange={(e) => setSubId4(e.target.value)}
                        placeholder="opcional"
                        className="w-full mt-1 p-2 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-muted uppercase font-semibold">Sub ID 5</label>
                      <input
                        type="text"
                        value={subId5}
                        onChange={(e) => setSubId5(e.target.value)}
                        placeholder="opcional"
                        className="w-full mt-1 p-2 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-[#FBFBFC] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 border border-border rounded-xl text-xs font-semibold text-text-muted hover:text-text-main hover:bg-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleStartConversion()}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
              >
                <span>Converter links</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal (com imagem grande) */}
      {detailItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-card border border-border shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-modal overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold text-text-main truncate">
                Detalhes do Item
              </h3>
              <button
                onClick={() => setDetailItem(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Big Image */}
              <div className="w-full h-64 rounded-xl bg-gray-50 border border-border overflow-hidden flex items-center justify-center">
                {detailItem.imageUrl ? (
                  <img
                    src={detailItem.imageUrl}
                    alt={detailItem.productName}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-300 gap-2">
                    <Package className="w-16 h-16 stroke-1" />
                    <span className="text-xs text-text-muted font-medium">Sem imagem disponível</span>
                  </div>
                )}
              </div>

              {/* Title & Status */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      detailItem.status === 'converted'
                        ? 'bg-primary-soft text-primary'
                        : detailItem.status === 'duplicate'
                        ? 'bg-gray-100 text-text-muted'
                        : 'bg-danger-soft text-danger'
                    }`}
                  >
                    {detailItem.status === 'converted' && 'Convertido'}
                    {detailItem.status === 'duplicate' && 'Duplicado'}
                    {detailItem.status === 'error' && 'Com erro'}
                    {detailItem.status === 'partial' && 'Pendente'}
                  </span>
                  {detailItem.batchId && (
                    <span className="text-[10px] font-mono text-text-muted">
                      Lote #{detailItem.batchId.slice(-6)}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-text-main leading-snug">
                  {detailItem.productName}
                </h4>
              </div>

              {/* Pricing */}
              <div className="flex items-baseline gap-3 p-3 bg-gray-50 rounded-xl border border-border">
                <div>
                  <div className="text-[10px] text-text-muted uppercase font-semibold">Preço Atual</div>
                  <div className="text-base font-bold font-mono text-text-main">
                    {formatPrice(detailItem.priceMin || detailItem.currentPrice)}
                  </div>
                </div>
                {(detailItem.originalPrice || detailItem.pricePrevious) && (
                  <div>
                    <div className="text-[10px] text-text-muted uppercase font-semibold">Preço Anterior</div>
                    <div className="text-xs font-mono text-text-muted line-through">
                      {formatPrice(detailItem.originalPrice || detailItem.pricePrevious)}
                    </div>
                  </div>
                )}
                {detailItem.itemId && (
                  <div className="ml-auto text-right">
                    <div className="text-[10px] text-text-muted uppercase font-semibold">Item ID</div>
                    <div className="text-xs font-mono text-text-muted">{detailItem.itemId}</div>
                  </div>
                )}
              </div>

              {/* Links */}
              <div className="space-y-2">
                {detailItem.affiliateUrl && (
                  <div>
                    <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">
                      Link de Afiliado (Convertido)
                    </label>
                    <div className="flex items-center gap-1.5 p-2 bg-primary-soft/30 border border-primary/20 rounded-xl">
                      <span className="font-mono text-xs text-primary truncate flex-1">
                        {detailItem.affiliateUrl}
                      </span>
                      <button
                        onClick={() => handleCopyLink(detailItem.affiliateUrl, 'modal-detail')}
                        className="px-2.5 py-1 bg-white border border-primary/30 rounded-lg text-xs font-semibold text-primary hover:bg-primary hover:text-white transition-colors flex items-center gap-1 shrink-0"
                      >
                        {copiedId === 'modal-detail' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedId === 'modal-detail' ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">
                    Link Original
                  </label>
                  <div className="flex items-center gap-1.5 p-2 bg-gray-50 border border-border rounded-xl">
                    <span className="font-mono text-xs text-text-muted truncate flex-1">
                      {detailItem.originalUrl}
                    </span>
                    <a
                      href={detailItem.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-200 transition-colors shrink-0"
                      title="Abrir no navegador"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {detailItem.subIds && detailItem.subIds.length > 0 && (
                  <div>
                    <label className="text-[10px] text-text-muted uppercase font-semibold block mb-1">
                      Sub IDs
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {detailItem.subIds.map((s: string, sIdx: number) => (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 rounded-md bg-gray-100 border border-border text-[11px] font-mono text-text-muted"
                        >
                          Sub {sIdx + 1}: {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-border bg-[#FBFBFC] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 border border-border rounded-xl text-xs font-semibold text-text-muted hover:text-text-main hover:bg-white transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
