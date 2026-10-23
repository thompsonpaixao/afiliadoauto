# Afiliado Auto 🚀

Plataforma completa e privada para conversão em lote de links de afiliado da **Shopee**, organização de ofertas, gestão de grupos e envio automático para **WhatsApp** com agendador persistente e anti-duplicação.

---

## 🎨 Identidade e Design System

- **Tipografia**: Geist Sans (principal) e Geist Mono (códigos, IDs, horários técnicos).
- **Paleta**:
  - Background: `#F7F8FA`
  - Cards: `#FFFFFF` (raio de 14px, sombras sutis)
  - Texto: `#181A1D` | Secundário: `#717680` | Bordas: `#E5E7EB`
  - Primária: `#16A36A` | Hover: `#128457` | Fundo suave: `#EAF8F2`
  - Erro: `#E5484D` | Warning: `#F5A524` | Info: `#3B82F6`
- **Ícones**: Lucide Icons.

---

## 🏗️ Estrutura do Projeto

```
afiliado-auto/
├── web/                       # Aplicação Next.js 14 (App Router) + Tailwind CSS
│   ├── src/
│   │   ├── app/               # Páginas e rotas da API
│   │   │   ├── (rotas)        # /, /login, /conversor, /produtos, /grupos, /automacoes, /whatsapp, /historico, /integracoes, /configuracoes
│   │   │   └── api/           # Rotas seguras da API (Shopee, WhatsApp, scheduler, auth, etc.)
│   │   ├── components/        # Layout, Sidebar fixa, Toasts, Skeletons, Modais
│   │   └── lib/               # Database, Shopee GraphQL Client, WhatsApp Client, Message Formatter, Scheduler
│   └── .data/                 # Banco de dados persistente (D1 / SQLite compatível)
└── whatsapp-worker/           # Serviço Node / Docker persistente para OpenWA
    ├── Dockerfile             # Pronto para containerização com Chromium headless
    ├── docker-compose.yml
    └── src/                   # Servidor Express com autenticação por API Key
```

---

## ⚡ Como Executar

### 1. Iniciar o Painel Web

Entre na pasta `web` e inicie o servidor:

```bash
cd web
npm install
npm run build
npm start
```

O painel estará disponível em: **`http://localhost:3000`**

- **Usuário padrão**: `admin`
- **Senha padrão**: `admin123` *(pode ser alterada a qualquer momento na aba Configurações)*

---

### 2. Iniciar o WhatsApp Worker (OpenWA)

Você pode rodar o OpenWA com o comando oficial:

```bash
npx @open-wa/wa-automate@latest --session-id afiliado-auto --host 127.0.0.1 --port 8080 --api-key "OpeNwA"
```

Ou usando o worker Docker incluído:

```bash
cd whatsapp-worker
docker-compose up -d
```

---

## 🔄 Fluxo de Ponta a Ponta

1. **Acessar o Painel**: Faça login com `admin` e sua senha.
2. **Configurar Shopee**: Em **Integrações**, insira suas credenciais da API de Afiliados da Shopee (App ID e App Secret). Se não tiver credenciais no momento, o sistema possui extrator inteligente que captura metadados reais da Shopee.
3. **Converter Links**: Na aba **Conversor Shopee**, adicione links colando uma lista (até 100+ links), enviando planilhas (.xlsx, .csv, .txt) ou inserindo manualmente. Opcionalmente ative Sub IDs (Sub 1 a 5).
4. **Biblioteca de Produtos**: Os produtos são salvos automaticamente com preços reais, fotos e links de afiliado prontos.
5. **Conectar WhatsApp**: Na aba **WhatsApp**, verifique a conexão e clique em **Atualizar grupos** para importar os grupos reais da sua conta.
6. **Criar Grupo de Configuração**: Na aba **Grupos**, agrupe seus grupos reais de ofertas em uma única entidade de disparo.
7. **Criar Automação**: Na aba **Automações**, use o Wizard de 5 passos para definir os grupos de destino, produtos da fila, template de mensagem com visualização em tempo real e agendamento com janela de horário.
8. **Disparos Automáticos**: O agendador no backend processará os envios respeitando anti-duplicação por ciclo (`automation_id:cycle_id:product_id:whatsapp_group_id`) e registrará o status individual de cada grupo no **Histórico**.
