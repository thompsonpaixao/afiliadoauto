'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  Search,
  CheckSquare,
  Square,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Zap,
  ExternalLink,
  AlertCircle,
  Tag,
  DollarSign,
  Calendar,
  LayoutGrid,
  List as ListIcon,
  Link2,
  Plus,
  Edit,
  Sparkles,
  X,
  FileText,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function ProdutosPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'all' | 'available' | 'waiting' | 'posted' | 'error'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'links'>('table');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    available: 0,
    waiting: 0,
    posted: 0,
    error: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterAutomationId, setFilterAutomationId] = useState<string | null>(null);
  const [filterAutomationName, setFilterAutomationName] = useState<string | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Manual Product Modal
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [manualAffiliateLink, setManualAffiliateLink] = useState('');
  const [manualImage, setManualImage] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualPricePrevious, setManualPricePrevious] = useState('');
  const [manualCoupon, setManualCoupon] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  // Edit Product Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editLink, setEditLink] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editPricePrevious, setEditPricePrevious] = useState('');
  const [editCoupon, setEditCoupon] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const autoParam = filterAutomationId ? `&automationId=${filterAutomationId}` : '';
      const res = await fetch(`/api/products?status=${activeTab}&search=${encodeURIComponent(search)}${autoParam}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        if (data.counts) {
          setCounts(data.counts);
        }
        if (data.automationName) {
          setFilterAutomationName(data.automationName);
        }
      }
    } catch (err: any) {
      toast('Erro ao carregar produtos: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [activeTab, filterAutomationId]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchProducts();
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Check URL params for manual modal or automation filter request
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoId = params.get('automationId');
    if (autoId) {
      setFilterAutomationId(autoId);
    }
    if (params.get('action') === 'manual') {
      const initialLink = params.get('link') || '';
      openManualModal(initialLink);
    }
  }, []);

  const openManualModal = (initialUrl = '') => {
    setManualName('');
    setManualLink(initialUrl);
    setManualAffiliateLink(initialUrl);
    setManualImage('');
    setManualPrice('');
    setManualPricePrevious('');
    setManualCoupon('');
    setManualDescription('');
    setManualModalOpen(true);

    if (initialUrl && initialUrl.startsWith('http')) {
      handleFetchPreview(initialUrl);
    }
  };

  const handleFetchPreview = async (urlToFetch?: string) => {
    const targetUrl = (urlToFetch || manualLink || manualAffiliateLink).trim();
    if (!targetUrl || !targetUrl.startsWith('http')) {
      toast('Insira um link válido com https:// para obter a prévia.', 'error');
      return;
    }

    setFetchingPreview(true);
    try {
      const res = await fetch('/api/products/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.title && !manualName) setManualName(data.title);
        if (data.image) setManualImage(data.image);
        if (data.description && !manualDescription) setManualDescription(data.description);
        toast('Dados obtidos do link com sucesso!', 'success');
      } else {
        toast('Não foi possível extrair prévia automática. Preencha manualmente.', 'info');
      }
    } catch (e: any) {
      toast('Erro ao buscar dados do link: ' + e.message, 'error');
    } finally {
      setFetchingPreview(false);
    }
  };

  const handleSaveManualProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) {
      toast('Informe o nome do produto.', 'error');
      return;
    }
    const finalLink = (manualAffiliateLink || manualLink).trim();
    if (!finalLink) {
      toast('Informe o link do produto.', 'error');
      return;
    }

    setSavingManual(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_manual',
          productName: manualName.trim(),
          productLink: manualLink.trim() || finalLink,
          affiliateLink: finalLink,
          imageUrl: manualImage.trim() || null,
          priceMin: manualPrice ? Number(manualPrice) : 0,
          pricePrevious: manualPricePrevious ? Number(manualPricePrevious) : null,
          couponCode: manualCoupon.trim() || null,
          description: manualDescription.trim() || null,
          source: 'manual',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast('Produto manual cadastrado com sucesso!', 'success');
        setManualModalOpen(false);
        fetchProducts();
      } else {
        toast(data.error || 'Erro ao cadastrar produto.', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSavingManual(false);
    }
  };

  // Edit product handlers
  const handleOpenEdit = (p: any) => {
    setEditingProduct(p);
    setEditName(p.productName || '');
    setEditLink(p.affiliateLink || p.productLink || '');
    setEditImage(p.imageUrl || '');
    setEditPrice(p.currentPrice || p.priceMin ? String(p.currentPrice || p.priceMin) : '');
    setEditPricePrevious(p.originalPrice || p.pricePrevious ? String(p.originalPrice || p.pricePrevious) : '');
    setEditCoupon(p.couponCode || '');
    setEditDescription(p.description || '');
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setSavingEdit(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          productId: editingProduct.id,
          productName: editName.trim(),
          affiliateLink: editLink.trim(),
          productLink: editLink.trim(),
          imageUrl: editImage.trim() || null,
          currentPrice: editPrice ? Number(editPrice) : 0,
          priceMin: editPrice ? Number(editPrice) : 0,
          originalPrice: editPricePrevious ? Number(editPricePrevious) : null,
          pricePrevious: editPricePrevious ? Number(editPricePrevious) : null,
          couponCode: editCoupon.trim() || null,
          description: editDescription.trim() || null,
          status: editingProduct.status === 'error' ? 'available' : editingProduct.status,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast('Produto atualizado com sucesso!', 'success');
        setEditModalOpen(false);
        fetchProducts();
      } else {
        toast(data.error || 'Erro ao salvar alterações.', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConvertToManual = async (p: any) => {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'convert_to_manual',
          productId: p.id,
          productName: p.productName === 'Erro na conversão Shopee' ? 'Produto Manual' : p.productName,
          affiliateLink: p.productLink,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast('Produto convertido para manual e marcado como disponível!', 'success');
        fetchProducts();
      } else {
        toast(data.error || 'Falha ao converter', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Deseja realmente excluir ${selectedIds.length} produto(s)?`)) return;

    try {
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (res.ok) {
        toast(`${selectedIds.length} produto(s) excluído(s) com sucesso.`, 'success');
        setSelectedIds([]);
        fetchProducts();
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleDeleteAll = async () => {
    if (products.length === 0) return;
    if (!confirm('ATENÇÃO: Deseja realmente excluir TODOS os produtos da biblioteca? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });

      if (res.ok) {
        toast('Todos os produtos foram excluídos da biblioteca.', 'success');
        setSelectedIds([]);
        fetchProducts();
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleDeleteSingle = async (id: string, name: string) => {
    if (!confirm(`Deseja excluir "${name}"?`)) return;

    try {
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });

      if (res.ok) {
        toast('Produto excluído.', 'success');
        fetchProducts();
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleCopyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast('Link copiado!', 'success');
  };

  const handleCopyAllLinks = () => {
    const links = products.map((p) => p.affiliateLink || p.productLink).filter(Boolean);
    if (links.length === 0) {
      toast('Nenhum link disponível para copiar.', 'info');
      return;
    }
    navigator.clipboard.writeText(links.join('\n'));
    toast(`${links.length} links copiados para a área de transferência!`, 'success');
  };

  const handleCreateAutomationWithSelected = () => {
    if (selectedIds.length === 0) {
      toast('Selecione pelo menos um produto para criar a automação.', 'error');
      return;
    }
    sessionStorage.setItem('automation_preselected_products', JSON.stringify(selectedIds));
    router.push('/automacoes?action=create');
  };

  const handleReconvert = async (id: string) => {
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconvert', productId: id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast('Produto reconvertido com sucesso!', 'success');
        fetchProducts();
      } else {
        toast(data.error || 'Falha ao reconverter', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const formatPrice = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '--';
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Title & Top Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">Biblioteca de Produtos</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Gerencie e monitore suas ofertas da Shopee e links afiliados manuais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openManualModal()}
            className="px-3.5 py-2 bg-white border border-border hover:border-primary text-text-main text-xs font-semibold rounded-xl shadow-subtle transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>Cadastrar Manual</span>
          </button>
          <Link
            href="/conversor"
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5"
          >
            <span>+ Importar Shopee</span>
          </Link>
        </div>
      </div>

      {/* Automation Filter Banner */}
      {filterAutomationId && (
        <div className="bg-primary-soft/40 border border-primary/20 rounded-xl p-3 flex items-center justify-between animate-fade-in shadow-subtle">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs text-text-main font-semibold">
              Filtrando produtos da automação: <strong className="text-primary">{filterAutomationName || filterAutomationId}</strong>
            </span>
          </div>
          <button
            onClick={() => {
              setFilterAutomationId(null);
              setFilterAutomationName(null);
              router.push('/produtos');
            }}
            className="text-xs text-text-muted hover:text-text-main font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-white transition-colors border border-transparent hover:border-border"
          >
            <X className="w-3.5 h-3.5" />
            <span>Limpar filtro</span>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('all')}
          className={`py-2.5 px-4 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'all'
              ? 'border-primary text-primary bg-white'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          <span>Todos</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-text-muted font-mono">
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('available')}
          className={`py-2.5 px-4 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'available'
              ? 'border-primary text-primary bg-white'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          <span>Disponíveis</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary-soft text-primary font-mono">
            {counts.available}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('waiting')}
          className={`py-2.5 px-4 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'waiting'
              ? 'border-primary text-primary bg-white'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          <span>Aguardando postagem</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-50 text-[#3B82F6] font-mono">
            {counts.waiting}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('posted')}
          className={`py-2.5 px-4 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'posted'
              ? 'border-primary text-primary bg-white'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          <span>Postados</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-green-50 text-primary font-mono">
            {counts.posted}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('error')}
          className={`py-2.5 px-4 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'error'
              ? 'border-danger text-danger bg-white'
              : 'border-transparent text-text-muted hover:text-text-main'
          }`}
        >
          <span>Com erro</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-danger-soft text-danger font-mono">
            {counts.error}
          </span>
        </button>
      </div>

      {/* Controls Bar: Search, Bulk Actions & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, link ou Sub ID..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-border rounded-xl text-xs text-text-main placeholder:text-gray-400 focus:outline-none focus:border-primary shadow-subtle"
          />
        </div>

        {/* View Switcher & Selection */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {/* View Mode Toggle */}
          <div className="bg-white border border-border rounded-xl p-0.5 flex items-center shadow-subtle">
            <button
              onClick={() => setViewMode('table')}
              title="Visualização em Tabela"
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'table'
                  ? 'bg-primary-soft text-primary font-semibold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tabela</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Visualização em Grade"
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-primary-soft text-primary font-semibold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grade</span>
            </button>
            <button
              onClick={() => setViewMode('links')}
              title="Visualização Só Links"
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'links'
                  ? 'bg-primary-soft text-primary font-semibold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Só links</span>
            </button>
          </div>

          {products.length > 0 && (
            <button
              onClick={handleDeleteAll}
              title="Excluir todos os produtos da biblioteca"
              className="px-2.5 py-1.5 rounded-xl border border-border hover:bg-danger-soft/30 hover:border-danger/30 text-text-muted hover:text-danger text-xs font-medium flex items-center gap-1 transition-colors shadow-subtle"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Excluir todos</span>
            </button>
          )}

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 animate-fade-in bg-white px-3 py-1.5 rounded-xl border border-border shadow-subtle text-xs">
              <span className="font-semibold text-text-main font-mono">
                {selectedIds.length} selecionado(s)
              </span>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleCreateAutomationWithSelected}
                className="text-primary hover:text-primary-hover font-semibold flex items-center gap-1"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Automação</span>
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleDeleteSelected}
                className="text-danger hover:text-red-700 font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={handleClearSelection}
                className="text-text-muted hover:text-text-main"
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: Table / Grid / Links */}
      {loading ? (
        <div className="p-8 space-y-4 bg-white rounded-card border border-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-card border border-border p-12 text-center text-text-muted space-y-3 shadow-card">
          <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-text-main">Nenhum produto encontrado nesta visualização</p>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            Importe links da Shopee ou cadastre produtos manuais de qualquer site.
          </p>
          <div className="pt-2 flex justify-center gap-2">
            <button
              onClick={() => openManualModal()}
              className="px-3.5 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              Cadastrar Produto Manual
            </button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* MODE 1: TABELA */
        <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] border-b border-border text-text-muted uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <button onClick={handleSelectAllVisible} className="p-0.5 text-text-muted hover:text-text-main">
                      {selectedIds.length === products.length && products.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 w-12">Imagem</th>
                  <th className="py-3 px-4">Nome do Produto</th>
                  <th className="py-3 px-4">Preço</th>
                  <th className="py-3 px-4">Origem</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y border-border">
                {products.map((p) => {
                  const isSelected = selectedIds.includes(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[#FBFBFC] transition-colors ${
                        isSelected ? 'bg-primary-soft/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleToggleSelect(p.id)}
                          className="p-0.5 text-text-muted hover:text-text-main"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-primary" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-3">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="w-10 h-10 object-cover rounded-md border border-border"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center text-gray-400">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-text-main max-w-xs">
                        <div className="truncate font-semibold">{p.productName}</div>
                        {p.lastError ? (
                          <div className="text-[11px] text-danger truncate font-mono mt-0.5">
                            {p.lastError}
                          </div>
                        ) : (
                          <div className="text-[11px] text-text-muted truncate font-mono mt-0.5">
                            {p.affiliateLink || p.productLink}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium whitespace-nowrap">
                        <div className="text-text-main font-semibold">
                          {p.currentPrice && p.currentPrice > 0 ? formatPrice(p.currentPrice) : (p.priceMin > 0 ? formatPrice(p.priceMin) : '--')}
                        </div>
                        {(p.originalPrice || p.pricePrevious) && (p.originalPrice || p.pricePrevious) > (p.currentPrice || p.priceMin) && (
                          <div className="text-[10px] text-text-muted line-through">
                            De {formatPrice(p.originalPrice || p.pricePrevious)}
                          </div>
                        )}
                        {p.couponCode && (
                          <div className="text-[10px] text-primary font-semibold">
                            🎟️ {p.couponCode}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-text-muted whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-text-main w-fit font-medium">
                            {p.source === 'manual' ? 'Manual' : p.shopName || 'Shopee'}
                          </span>
                          <span className="text-[10px] text-text-muted">
                            {p.createdBy === 'import_shopee' ? 'Shopee API' : p.createdBy || 'Manual'}
                            {p.sourceBatchId ? ` • #${p.sourceBatchId.slice(-6)}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {p.status === 'available' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary-soft text-primary">
                            Disponível
                          </span>
                        )}
                        {p.status === 'waiting' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-[#3B82F6]">
                            Aguardando postagem
                          </span>
                        )}
                        {p.status === 'posted' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-primary">
                            Postado
                          </span>
                        )}
                        {p.status === 'error' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger-soft text-danger">
                            Com erro
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-text-muted whitespace-nowrap text-[11px]">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '--'}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopyLink(p.affiliateLink || p.productLink, p.id)}
                            title="Copiar link afiliado"
                            className="p-1.5 rounded-lg border border-border hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors"
                          >
                            {copiedId === p.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => handleOpenEdit(p)}
                            title="Editar produto"
                            className="p-1.5 rounded-lg border border-border hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {p.status === 'error' ? (
                            <>
                              <button
                                onClick={() => handleReconvert(p.id)}
                                title="Tentar converter novamente pela API Shopee"
                                className="p-1.5 rounded-lg border border-border hover:bg-gray-100 text-primary transition-colors"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleConvertToManual(p)}
                                title="Salvar como link manual"
                                className="px-2 py-1 rounded-lg border border-primary/30 bg-primary-soft text-primary font-semibold text-[10px] transition-colors"
                              >
                                Salvar Manual
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleReconvert(p.id)}
                              title="Atualizar link pela Shopee"
                              className="p-1.5 rounded-lg border border-border hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteSingle(p.id, p.productName)}
                            title="Excluir produto"
                            className="p-1.5 rounded-lg border border-border hover:bg-danger-soft text-text-muted hover:text-danger transition-colors"
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
        </div>
      ) : viewMode === 'grid' ? (
        /* MODE 2: GRADE (CARDS COM IMAGEM GRANDE) */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => {
            const isSelected = selectedIds.includes(p.id);

            return (
              <div
                key={p.id}
                className={`bg-white rounded-card border transition-all flex flex-col justify-between overflow-hidden shadow-card group ${
                  isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-gray-300'
                }`}
              >
                {/* Big Image Section */}
                <div className="relative aspect-square w-full bg-gray-50 overflow-hidden border-b border-border">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.productName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Package className="w-16 h-16 stroke-1" />
                    </div>
                  )}

                  {/* Select Checkbox Top Left */}
                  <div className="absolute top-2.5 left-2.5">
                    <button
                      onClick={() => handleToggleSelect(p.id)}
                      className="p-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-border hover:bg-white"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" />
                      )}
                    </button>
                  </div>

                  {/* Status Badge Top Right */}
                  <div className="absolute top-2.5 right-2.5">
                    {p.status === 'available' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 text-primary shadow-sm border border-primary/20">
                        Disponível
                      </span>
                    )}
                    {p.status === 'waiting' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 text-[#3B82F6] shadow-sm border border-blue-200">
                        Aguardando
                      </span>
                    )}
                    {p.status === 'posted' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 text-emerald-700 shadow-sm border border-emerald-200">
                        Postado
                      </span>
                    )}
                    {p.status === 'error' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 text-danger shadow-sm border border-red-200">
                        Com erro
                      </span>
                    )}
                  </div>
                </div>

                {/* Info Content */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-text-main line-clamp-2 leading-snug" title={p.productName}>
                      {p.productName}
                    </h4>
                    {p.lastError ? (
                      <p className="text-[10px] text-danger truncate font-mono">{p.lastError}</p>
                    ) : (
                      <p className="text-[10px] text-text-muted font-mono truncate">{p.source === 'manual' ? 'Manual' : p.shopName || 'Shopee'}</p>
                    )}
                  </div>

                  {/* Price & Actions */}
                  <div className="pt-2 border-t border-border flex items-end justify-between">
                    <div>
                      <div className="text-sm font-bold text-text-main font-mono">
                        {p.currentPrice && p.currentPrice > 0 ? formatPrice(p.currentPrice) : (p.priceMin > 0 ? formatPrice(p.priceMin) : '--')}
                      </div>
                      {(p.originalPrice || p.pricePrevious) && (p.originalPrice || p.pricePrevious) > (p.currentPrice || p.priceMin) && (
                        <div className="text-[10px] text-text-muted line-through font-mono">
                          De {formatPrice(p.originalPrice || p.pricePrevious)}
                        </div>
                      )}
                      {p.couponCode && (
                        <div className="text-[10px] text-primary font-semibold mt-0.5">
                          🎟️ {p.couponCode}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyLink(p.affiliateLink || p.productLink, p.id)}
                        className="p-1.5 rounded-lg border border-border hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors"
                        title="Copiar link"
                      >
                        {copiedId === p.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 rounded-lg border border-border hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors"
                        title="Editar produto"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODE 3: SÓ LINKS */
        <div className="bg-white rounded-card border border-border p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-bold text-text-main">Lista Rápida de Links Afiliados</h3>
              <p className="text-xs text-text-muted">Copie individualmente ou extraia todos os links em massa</p>
            </div>
            <button
              onClick={handleCopyAllLinks}
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar Todos ({products.length})</span>
            </button>
          </div>

          <div className="divide-y border-border">
            {products.map((p) => {
              const link = p.affiliateLink || p.productLink || '';
              return (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="truncate max-w-lg">
                    <span className="text-xs font-semibold text-text-main block truncate">{p.productName}</span>
                    <span className="text-[11px] font-mono text-text-muted truncate block">{link}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-text-main">{formatPrice(p.priceMin)}</span>
                    <button
                      onClick={() => handleCopyLink(link, p.id)}
                      className="px-2.5 py-1 rounded-md border border-border hover:bg-gray-50 text-xs text-text-main flex items-center gap-1 font-mono transition-colors"
                    >
                      {copiedId === p.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === p.id ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cadastrar Produto Manual Modal */}
      {manualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-card border border-border shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-modal overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-main">Cadastrar Produto / Link Manual</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Cadastre produtos de qualquer site ou afiliado (Amazon, Mercado Livre, Magalu, etc.)
                </p>
              </div>
              <button
                onClick={() => setManualModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualProduct} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  Link do Produto / Afiliado *
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    value={manualLink}
                    onChange={(e) => {
                      setManualLink(e.target.value);
                      if (!manualAffiliateLink) setManualAffiliateLink(e.target.value);
                    }}
                    placeholder="https://exemplo.com.br/produto"
                    className="flex-1 px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                  />
                  <button
                    type="button"
                    disabled={fetchingPreview}
                    onClick={() => handleFetchPreview()}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-text-main text-xs font-semibold rounded-xl transition-colors flex items-center gap-1 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>{fetchingPreview ? 'Buscando...' : 'Obter Prévia'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  Nome do Produto *
                </label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ex: Fone de Ouvido Bluetooth Sem Fio"
                  className="w-full px-3 py-2 text-xs bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-main mb-1">
                    Preço Atual (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-main mb-1">
                    Preço Anterior (R$) <span className="text-text-muted font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualPricePrevious}
                    onChange={(e) => setManualPricePrevious(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  Cupom de Desconto <span className="text-text-muted font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={manualCoupon}
                  onChange={(e) => setManualCoupon(e.target.value)}
                  placeholder="Ex: PROMO10, FRETEGRATIS"
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  URL da Imagem <span className="text-text-muted font-normal">(Opcional)</span>
                </label>
                <input
                  type="url"
                  value={manualImage}
                  onChange={(e) => setManualImage(e.target.value)}
                  placeholder="https://exemplo.com.br/foto.jpg"
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                />
                {manualImage && (
                  <div className="mt-2 flex items-center gap-3 p-2 border border-border rounded-lg bg-gray-50">
                    <img src={manualImage} alt="Prévia" className="w-12 h-12 object-cover rounded" />
                    <span className="text-[11px] text-text-muted">Prévia da imagem</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  Descrição <span className="text-text-muted font-normal">(Opcional)</span>
                </label>
                <textarea
                  rows={2}
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Detalhes ou destaques da oferta..."
                  className="w-full px-3 py-2 text-xs bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-xl text-xs font-semibold text-text-muted hover:text-text-main hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
                >
                  {savingManual ? 'Salvando...' : 'Cadastrar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Editar Produto Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-card border border-border shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-modal overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-main">Editar Produto</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Altere nome, link de afiliado, imagem ou valores
                </p>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  Nome do Produto *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  Link de Afiliado *
                </label>
                <input
                  type="url"
                  required
                  value={editLink}
                  onChange={(e) => setEditLink(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-main mb-1">
                    Preço (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-main mb-1">
                    Preço Anterior (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPricePrevious}
                    onChange={(e) => setEditPricePrevious(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  Cupom de Desconto <span className="text-text-muted font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={editCoupon}
                  onChange={(e) => setEditCoupon(e.target.value)}
                  placeholder="Ex: PROMO10, FRETEGRATIS"
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">
                  URL da Imagem
                </label>
                <input
                  type="url"
                  value={editImage}
                  onChange={(e) => setEditImage(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
                />
                {editImage && (
                  <div className="mt-2 flex items-center gap-3 p-2 border border-border rounded-lg bg-gray-50">
                    <img src={editImage} alt="Prévia" className="w-12 h-12 object-cover rounded" />
                    <span className="text-[11px] text-text-muted">Prévia da imagem</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-xl text-xs font-semibold text-text-muted hover:text-text-main hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
                >
                  {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
