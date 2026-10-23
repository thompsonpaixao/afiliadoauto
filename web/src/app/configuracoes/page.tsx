'use client';

import React, { useEffect, useState } from 'react';
import {
  Settings,
  Lock,
  User,
  Clock,
  Save,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function ConfiguracoesPage() {
  const { toast } = useToast();

  const [username, setUsername] = useState('admin');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);

  const [timezone, setTimezone] = useState('America/Bahia');
  const [savingGeneral, setSavingGeneral] = useState(false);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setUsername(data.admin?.username || 'admin');
        setTimezone(data.settings?.timezone || 'America/Bahia');
      }
    } catch {}
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast('A confirmação da nova senha não confere.', 'error');
      return;
    }

    setSavingAdmin(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'admin',
          payload: {
            username,
            newPassword: newPassword || undefined,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast('Credenciais do administrador atualizadas com sucesso!', 'success');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast(data.error || 'Erro ao atualizar dados', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleUpdateGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'general',
          payload: { timezone },
        }),
      });

      if (res.ok) {
        toast('Preferências do sistema salvas com sucesso!', 'success');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSavingGeneral(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-main">Configurações Gerais</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Gerenciamento de segurança, credenciais de acesso e preferências do sistema
        </p>
      </div>

      {/* Admin Security Card */}
      <div className="bg-white rounded-card border border-border shadow-card p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-main">Acesso do Administrador</h2>
            <p className="text-xs text-text-muted">
              Plataforma de uso privado. As senhas são armazenadas com hash criptográfico (bcrypt).
            </p>
          </div>
        </div>

        <form onSubmit={handleUpdateAdmin} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-text-main mb-1.5">
              Nome de Usuário
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block font-semibold text-text-main mb-1.5">
                Nova Senha (deixe em branco para manter a atual)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-text-main mb-1.5">
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingAdmin}
              className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Alterações de Acesso</span>
            </button>
          </div>
        </form>
      </div>

      {/* Regional Preferences Card */}
      <div className="bg-white rounded-card border border-border shadow-card p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-gray-100 text-text-main flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-main">Fuso Horário do Agendador</h2>
            <p className="text-xs text-text-muted">
              Define o relógio de referência para os intervalos e janelas de disparo das automações
            </p>
          </div>
        </div>

        <form onSubmit={handleUpdateGeneral} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-text-main mb-1.5">
              Fuso Horário Padrão
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl text-text-main focus:outline-none focus:border-primary focus:bg-white font-mono"
            >
              <option value="America/Bahia">America/Bahia (UTC-3)</option>
              <option value="America/Sao_Paulo">America/Sao_Paulo (UTC-3)</option>
              <option value="America/Fortaleza">America/Fortaleza (UTC-3)</option>
              <option value="America/Manaus">America/Manaus (UTC-4)</option>
              <option value="America/Belem">America/Belem (UTC-3)</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingGeneral}
              className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Preferências</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
