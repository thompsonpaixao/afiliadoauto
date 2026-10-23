'use client';

import React, { useEffect, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  XCircle,
  Key,
  Globe,
  Save,
  RotateCw,
  ExternalLink,
  Lock,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';

export default function IntegracoesPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [savingShopee, setSavingShopee] = useState(false);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);

  // Shopee state
  const [shopeeAppId, setShopeeAppId] = useState('');
  const [shopeeAppSecret, setShopeeAppSecret] = useState('');
  const [shopeeEndpoint, setShopeeEndpoint] = useState('https://open-api.affiliate.shopee.com.br/graphql');
  const [shopeeStatus, setShopeeStatus] = useState<string>('disconnected');

  // WhatsApp state
  const [waEndpoint, setWaEndpoint] = useState('http://127.0.0.1:8080');
  const [waApiKey, setWaApiKey] = useState('OpeNwA');
  const [waSessionId, setWaSessionId] = useState('afiliado-auto');
  const [waStatus, setWaStatus] = useState<string>('disconnected');

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setShopeeAppId(data.shopee?.appId || '');
        setShopeeAppSecret(data.shopee?.appSecret || '');
        setShopeeEndpoint(data.shopee?.endpoint || 'https://open-api.affiliate.shopee.com.br/graphql');
        setShopeeStatus(data.shopee?.status || 'disconnected');

        setWaEndpoint(data.whatsapp?.endpoint || 'http://127.0.0.1:8080');
        setWaApiKey(data.whatsapp?.apiKey || 'OpeNwA');
        setWaSessionId(data.whatsapp?.sessionId || 'afiliado-auto');
        setWaStatus(data.whatsapp?.status || 'disconnected');
      }
    } catch (e: any) {
      toast('Erro ao carregar configurações: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveShopee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingShopee(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'shopee',
          payload: {
            appId: shopeeAppId,
            appSecret: shopeeAppSecret,
            endpoint: shopeeEndpoint,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast('Credenciais da Shopee salvas com sucesso!', 'success');
        loadSettings();
      } else {
        toast(data.error || 'Erro ao salvar', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSavingShopee(false);
    }
  };

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWhatsApp(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'whatsapp',
          payload: {
            endpoint: waEndpoint,
            apiKey: waApiKey,
            sessionId: waSessionId,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast('Configurações do WhatsApp salvas com sucesso!', 'success');
        loadSettings();
      } else {
        toast(data.error || 'Erro ao salvar', 'error');
      }
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSavingWhatsApp(false);
    }
  };

  const handleTestWhatsApp = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      if (data.connected) {
        toast('WhatsApp conectado e respondendo perfeitamente!', 'success');
      } else {
        toast(data.error || 'Servidor WhatsApp não respondeu.', 'error');
      }
    } catch (e: any) {
      toast('Erro de teste: ' + e.message, 'error');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-main">Integrações</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Conecte sua conta de afiliado Shopee e seu serviço de envio do WhatsApp
        </p>
      </div>

      {/* Shopee Integration Card */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFF3ED] text-[#EE4D2D] flex items-center justify-center font-bold text-lg">
              S
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">Shopee Affiliate Open API</h2>
              <p className="text-xs text-text-muted">
                Integração oficial via GraphQL para geração de links curtos e consulta de ofertas
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              shopeeStatus === 'connected'
                ? 'bg-primary-soft text-primary'
                : 'bg-gray-100 text-text-muted'
            }`}
          >
            {shopeeStatus === 'connected' ? 'Configurada' : 'Desconectada'}
          </span>
        </div>

        <form onSubmit={handleSaveShopee} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-text-main mb-1.5">
                App ID (Shopee Affiliate Open API) *
              </label>
              <input
                type="text"
                required
                value={shopeeAppId}
                onChange={(e) => setShopeeAppId(e.target.value)}
                placeholder="Ex: 1234567890"
                className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-text-main mb-1.5">
                App Secret *
              </label>
              <input
                type="password"
                required
                value={shopeeAppSecret}
                onChange={(e) => setShopeeAppSecret(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-text-main mb-1.5">
              GraphQL Endpoint
            </label>
            <input
              type="url"
              value={shopeeEndpoint}
              onChange={(e) => setShopeeEndpoint(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary focus:bg-white"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingShopee}
              className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Credenciais Shopee</span>
            </button>
          </div>
        </form>
      </div>

      {/* WhatsApp Worker Integration Card */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center font-bold text-lg">
              W
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">WhatsApp Persistent Worker (OpenWA)</h2>
              <p className="text-xs text-text-muted">
                Comunicação segura via HTTP REST com seu processo persistente do OpenWA
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              waStatus === 'connected'
                ? 'bg-primary-soft text-primary'
                : 'bg-danger-soft text-danger'
            }`}
          >
            {waStatus === 'connected' ? 'Conectado' : 'Desconectado'}
          </span>
        </div>

        <form onSubmit={handleSaveWhatsApp} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-text-main mb-1.5">
                Worker Endpoint (URL e Porta)
              </label>
              <input
                type="text"
                required
                value={waEndpoint}
                onChange={(e) => setWaEndpoint(e.target.value)}
                placeholder="http://127.0.0.1:8080"
                className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-text-main mb-1.5">
                Worker API Key
              </label>
              <input
                type="text"
                required
                value={waApiKey}
                onChange={(e) => setWaApiKey(e.target.value)}
                placeholder="OpeNwA"
                className="w-full px-3.5 py-2.5 bg-[#F9FAFB] border border-border rounded-xl font-mono text-text-main focus:outline-none focus:border-primary focus:bg-white"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handleTestWhatsApp}
              className="px-4 py-2 border border-border hover:bg-gray-50 text-text-main font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Testar Conexão</span>
            </button>

            <button
              type="submit"
              disabled={savingWhatsApp}
              className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Configurações WhatsApp</span>
            </button>
          </div>
        </form>
      </div>

      {/* Future Integrations (Prepared Architecture) */}
      <div className="bg-white rounded-card border border-border p-6 shadow-card space-y-4">
        <div>
          <h3 className="text-sm font-bold text-text-main">Próximas Plataformas (Arquitetura Pronta)</h3>
          <p className="text-xs text-text-muted mt-0.5">
            A estrutura interna do Afiliado Auto já está preparada para plugar novos provedores de afiliados
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['Mercado Livre', 'Amazon', 'Magazine Luiza', 'SHEIN'].map((prov) => (
            <div
              key={prov}
              className="p-3.5 rounded-xl border border-dashed border-border bg-[#FBFBFC] text-center space-y-1 opacity-70"
            >
              <span className="text-xs font-semibold text-text-main block">{prov}</span>
              <span className="text-[10px] text-text-muted font-mono block">Em breve</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
