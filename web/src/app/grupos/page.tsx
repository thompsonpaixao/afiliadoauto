'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users2,
  Plus,
  Trash2,
  Edit2,
  Search,
  CheckSquare,
  Square,
  X,
  MessageSquare,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function GruposPage() {
  const { toast } = useToast();

  const [configGroups, setConfigGroups] = useState<any[]>([]);
  const [whatsappGroups, setWhatsappGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedJids, setSelectedJids] = useState<string[]>([]);
  const [waSearch, setWaSearch] = useState('');

  const loadGroups = async () => {
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setConfigGroups(data.configurationGroups || []);
        setWhatsappGroups(data.whatsappGroups || []);
      }
    } catch (e: any) {
      toast('Erro ao carregar grupos: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setGroupName('');
    setGroupDescription('');
    setSelectedJids([]);
    setWaSearch('');
    setModalOpen(true);
  };

  const openEditModal = (group: any) => {
    setEditingId(group.id);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setSelectedJids(group.groupJids || []);
    setWaSearch('');
    setModalOpen(true);
  };

  const handleToggleJid = (jid: string) => {
    setSelectedJids((prev) =>
      prev.includes(jid) ? prev.filter((j) => j !== jid) : [...prev, jid]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleJids = filteredWaGroups.map((g) => g.groupJid);
    const allSelected = visibleJids.every((j) => selectedJids.includes(j));

    if (allSelected) {
      setSelectedJids((prev) => prev.filter((j) => !visibleJids.includes(j)));
    } else {
      setSelectedJids((prev) => Array.from(new Set([...prev, ...visibleJids])));
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast('O nome do grupo de configuração é obrigatório.', 'error');
      return;
    }

    if (selectedJids.length === 0) {
      toast('Selecione pelo menos um grupo real do WhatsApp.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          name: groupName,
          description: groupDescription,
          groupJids: selectedJids,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast(`Grupo de Configuração "${groupName}" salvo com sucesso!`, 'success');
        setModalOpen(false);
        loadGroups();
      } else {
        toast(data.error || 'Erro ao salvar grupo', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!confirm(`Deseja excluir o Grupo de Configuração "${name}"?`)) return;

    try {
      const res = await fetch('/api/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        toast('Grupo de Configuração excluído.', 'success');
        loadGroups();
      }
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const filteredWaGroups = whatsappGroups.filter((g) =>
    g.name.toLowerCase().includes(waSearch.toLowerCase()) ||
    g.groupJid.toLowerCase().includes(waSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main">Grupos de Configuração</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Organize múltiplos grupos reais do WhatsApp sob uma mesma estrutura de disparo
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Grupo de Configuração</span>
        </button>
      </div>

      {/* WhatsApp Groups Sync Notice if none */}
      {whatsappGroups.length === 0 && (
        <div className="p-4 rounded-xl border border-warning/30 bg-warning-soft flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 text-warning-800">
            <MessageSquare className="w-4 h-4 text-warning shrink-0" />
            <span>
              Nenhum grupo real do WhatsApp foi sincronizado ainda. Conecte sua conta para carregar seus grupos.
            </span>
          </div>
          <Link
            href="/whatsapp"
            className="font-semibold text-text-main hover:underline whitespace-nowrap flex items-center gap-1"
          >
            <span>Ir para WhatsApp</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Grid of Configuration Groups */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 bg-white rounded-card border border-border animate-pulse" />
          ))}
        </div>
      ) : configGroups.length === 0 ? (
        <div className="bg-white rounded-card border border-border p-12 text-center shadow-card max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary flex items-center justify-center mx-auto shadow-sm">
            <Users2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-main">Nenhum Grupo de Configuração</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              Crie um grupo de configuração para agrupar vários grupos do WhatsApp e direcionar suas automações de ofertas.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Criar primeiro grupo</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {configGroups.map((cg) => (
            <div
              key={cg.id}
              className="bg-white rounded-card border border-border p-5 shadow-card hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-text-main">{cg.name}</h3>
                    {cg.description && (
                      <p className="text-xs text-text-muted line-clamp-2">{cg.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(cg)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100 transition-colors"
                      title="Editar grupo"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(cg.id, cg.name)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger-soft/40 transition-colors"
                      title="Excluir grupo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Groups count badge */}
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-text-muted">Grupos WhatsApp:</span>
                  <span className="font-semibold text-text-main font-mono bg-primary-soft text-primary px-2 py-0.5 rounded-md">
                    {cg.groupJids?.length || 0} grupo(s)
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-text-muted">
                <span>Criado em {new Date(cg.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-card border border-border shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col animate-modal overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-text-main">
                  {editingId ? 'Editar Grupo de Configuração' : 'Novo Grupo de Configuração'}
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Associe grupos reais do WhatsApp a este grupo de configuração
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-text-main mb-1">
                    Nome do Grupo de Configuração *
                  </label>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Ex: Ofertas VIP - Eletrônicos"
                    className="w-full px-3.5 py-2 bg-[#F9FAFB] border border-border rounded-xl text-xs text-text-main focus:outline-none focus:border-primary focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-main mb-1">
                    Descrição (opcional)
                  </label>
                  <input
                    type="text"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Descrição para identificação interna"
                    className="w-full px-3.5 py-2 bg-[#F9FAFB] border border-border rounded-xl text-xs text-text-main focus:outline-none focus:border-primary focus:bg-white"
                  />
                </div>

                {/* WhatsApp Groups Selection */}
                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text-main">
                      Selecione os grupos do WhatsApp ({selectedJids.length} selecionados)
                    </label>
                    {filteredWaGroups.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectAllVisible}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        {filteredWaGroups.every((g) => selectedJids.includes(g.groupJid))
                          ? 'Desmarcar todos'
                          : 'Selecionar todos'}
                      </button>
                    )}
                  </div>

                  {/* Search within groups */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={waSearch}
                      onChange={(e) => setWaSearch(e.target.value)}
                      placeholder="Pesquisar grupos..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#F9FAFB] border border-border rounded-lg text-xs text-text-main focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Groups list */}
                  <div className="max-h-56 overflow-y-auto border border-border rounded-xl divide-y border-border">
                    {whatsappGroups.length === 0 ? (
                      <div className="p-4 text-center text-xs text-text-muted">
                        Nenhum grupo do WhatsApp sincronizado.{' '}
                        <Link href="/whatsapp" className="text-primary underline">
                          Conecte o WhatsApp
                        </Link>
                      </div>
                    ) : filteredWaGroups.length === 0 ? (
                      <div className="p-4 text-center text-xs text-text-muted">
                        Nenhum grupo encontrado com este termo.
                      </div>
                    ) : (
                      filteredWaGroups.map((grp) => {
                        const isSelected = selectedJids.includes(grp.groupJid);

                        return (
                          <div
                            key={grp.groupJid}
                            onClick={() => handleToggleJid(grp.groupJid)}
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
                              <div>
                                <span className="text-xs font-semibold text-text-main block">
                                  {grp.name}
                                </span>
                                <span className="text-[10px] text-text-muted font-mono block">
                                  {grp.participantsCount} participantes
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="p-4 border-t border-border bg-[#FBFBFC] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-xl text-xs font-semibold text-text-muted hover:text-text-main hover:bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                >
                  Salvar Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
