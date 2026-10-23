# Guia Completo de Implantação em Produção — Afiliado Auto

Este guia detalha o processo passo a passo para transformar o **Afiliado Auto** em uma arquitetura de produção escalável e de baixíssimo custo (praticamente gratuita nos tiers generosos da Cloudflare e Vercel), mantendo o funcionamento em ambiente de desenvolvimento local.

---

## Arquitetura do Sistema

```
                      +---------------------------------------+
                      |               USUÁRIO                 |
                      +-------------------+-------------------+
                                          |
                        HTTPS (Browser)   |
                                          v
                      +---------------------------------------+
                      |         VERCEL (Frontend Only)        |
                      |          Next.js 14 App Router        |
                      +-------------------+-------------------+
                                          |
                     NEXT_PUBLIC_API_URL  | (ex: https://api.seudominio.com)
                                          v
    +-------------------------------------------------------------------------+
    |                    CLOUDFLARE WORKERS (Backend API)                     |
    |                                                                         |
    |  • Hono Framework (TypeScript)                                          |
    |  • Endpoints /api/* (Auth, Shopee, Produtos, Grupos, Disparos)          |
    |  • Cloudflare Cron Trigger (Disparador minuto a minuto)                 |
    |  • Cloudflare Queues (Processamento assíncrono de lotes de 100+ links)  |
    +--------+----------------------------+-----------------------------+-----+
             |                            |                             |
             v                            v                             v
+--------------------------+ +--------------------------+ +--------------------------+
|      CLOUDFLARE D1       | |   SHOPEE AFFILIATE API   | |    CLOUDFLARE TUNNEL     |
| (Banco SQLite Serverless)| |  GraphQL c/ HMAC SHA-256 | |      (cloudflared)       |
+--------------------------+ +--------------------------+ +-------------+------------+
                                                                        |
                                                HTTPS / Criptografado   |
                                                                        v
                                                        +----------------------------+
                                                        |      OPENWA SERVICE        |
                                                        |  (PC Local, Mini PC, VPS)  |
                                                        |  Porta 8080 - WhatsApp Web |
                                                        +----------------------------+
```

---

## 1. Preparação do Repositório no GitHub

### 1.1 Verificação de Segurança (Zero Leaks)
O arquivo `.gitignore` já está configurado para bloquear qualquer arquivo `.env`, credenciais, banco local e sessões do WhatsApp.
Antes de subir, execute no terminal para confirmar que nenhum arquivo de segredo está sendo rastreado:

```bash
git status
```

Certifique-se de que nenhum arquivo `.env`, `.env.local` ou pasta `.open-wa`/`.wa-session` apareça na lista.

### 1.2 Inicializar e Enviar para o GitHub
1. Crie um repositório **Privado** no GitHub (exemplo: `afiliado-auto`).
2. No terminal da sua máquina, execute na raiz do projeto:

```bash
git init
git add .
git commit -m "feat: arquitetura de producao Cloudflare Workers + D1 + Vercel"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/afiliado-auto.git
git push -u origin main
```

---

## 2. Configuração do Backend na Cloudflare

### 2.1 Instalar o Wrangler e Fazer Login
Se ainda não possuir o Cloudflare Wrangler autenticado:

```bash
cd worker
npx wrangler login
```

### 2.2 Criar o Banco de Dados Cloudflare D1
Execute o comando abaixo para criar seu banco de dados serverless:

```bash
npx wrangler d1 create afiliado-auto-db
```

O comando exibirá uma saída similar a esta:
```toml
[[d1_databases]]
binding = "DB"
database_name = "afiliado-auto-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copie o `database_id` gerado e cole no arquivo `worker/wrangler.toml` no campo `database_id`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "afiliado-auto-db"
database_id = "SEU_DATABASE_ID_GERADO"
migrations_dir = "migrations"
```

### 2.3 Executar as Migrations no D1
Para criar as 15 tabelas relacionais em produção:

```bash
npx wrangler d1 migrations apply afiliado-auto-db --remote
```

*(Opcional) Para rodar as migrations no banco local de desenvolvimento:*
```bash
npx wrangler d1 migrations apply afiliado-auto-db --local
```

### 2.4 Criar a Fila Cloudflare Queues (Importação em Lote)
Execute:
```bash
npx wrangler queues create afiliado-auto-import-queue
```

### 2.5 Configurar Secrets Seguros no Worker
Defina as chaves e senhas confidenciais no Worker através do Wrangler (nunca no código):

```bash
# Chave JWT do Administrador
npx wrangler secret put JWT_SECRET
# Digite uma chave longa e aleatória (ex: super_secret_jwt_key_afiliado_auto_2026)

# Credenciais da Shopee Affiliate Open API
npx wrangler secret put SHOPEE_APP_ID
npx wrangler secret put SHOPEE_APP_SECRET

# Configuração da URL do OpenWA (será a URL gerada pelo Cloudflare Tunnel)
npx wrangler secret put OPENWA_BASE_URL
# Exemplo: https://wa.seudominio.com (ou a URL trycloudflare caso use túnel rápido)

npx wrangler secret put OPENWA_API_KEY
# Exemplo: OpeNwA (ou a chave configurada no seu OpenWA)

npx wrangler secret put OPENWA_SESSION_ID
# Exemplo: afiliado-auto
```

### 2.6 Fazer Deploy do Cloudflare Worker
Execute dentro da pasta `worker/`:

```bash
npm run deploy
```

O Wrangler exibirá a URL pública da sua API, por exemplo:
`https://afiliado-auto-api.<seu-subdominio>.workers.dev`

*(Se possuir domínio próprio na Cloudflare, pode adicionar uma rota como `api.seudominio.com` nas configurações do Worker).*

---

## 3. Configuração do Cloudflare Tunnel para o OpenWA

O OpenWA precisa rodar em uma máquina que mantenha a sessão do WhatsApp Web conectada (seu computador pessoal, um mini-PC ligado ou uma VPS). Para permitir que o Cloudflare Worker acesse o OpenWA com segurança e sem abrir portas no seu roteador, usamos o **Cloudflare Tunnel gratuito**.

### 3.1 Instalar o `cloudflared`
- **Windows**: Baixe o executável `cloudflared.exe` pelo site da Cloudflare ou via Chocolatey / Winget:
  ```powershell
  winget install --id Cloudflare.cloudflared
  ```
- **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt-get install cloudflared
  ```

### 3.2 Opção A: Túnel com Domínio Próprio (Recomendado para Produção)
1. Faça login no Cloudflare Tunnel:
   ```bash
   cloudflared tunnel login
   ```
2. Crie o túnel nomeado:
   ```bash
   cloudflared tunnel create wa-tunnel
   ```
3. Aponte um subdomínio para o túnel:
   ```bash
   cloudflared tunnel route dns wa-tunnel wa.seudominio.com
   ```
4. Edite o arquivo de configuração `tunnel/config.yml.example`, renomeie para `config.yml` e aponte para `http://127.0.0.1:8080`.
5. Inicie o túnel:
   ```bash
   cloudflared tunnel run wa-tunnel
   ```

### 3.3 Opção B: Quick Tunnel (Para Testes e Validação Imediata)
Se não quiser configurar DNS agora, pode criar um túnel instantâneo:
```bash
cloudflared tunnel --url http://127.0.0.1:8080
```
O Cloudflare gerará uma URL segura pública (ex: `https://palavras-aleatorias.trycloudflare.com`).
Basta atualizar a variável `OPENWA_BASE_URL` no seu Worker:
```bash
npx wrangler secret put OPENWA_BASE_URL
# Cole a URL gerada pelo cloudflared
```

---

## 4. Configuração do Frontend na Vercel

### 4.1 Importar o Projeto na Vercel
1. Acesse o painel da [Vercel](https://vercel.com) e clique em **Add New... -> Project**.
2. Conecte sua conta do GitHub e selecione o repositório `afiliado-auto`.
3. Configure o **Root Directory**:
   - Defina o Root Directory como: `web`
4. O Framework Preset será detectado automaticamente como **Next.js**.

### 4.2 Configurar Variáveis de Ambiente na Vercel
Na seção **Environment Variables**, adicione:

| Chave | Valor | Descrição |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://afiliado-auto-api.<seu-subdominio>.workers.dev` | URL pública da API do Worker |

> **Nota:** O frontend Next.js possui a regra de rewrite configurada em `web/next.config.js`. Dessa forma, requisições de cliente e servidor navegam de forma transparente diretamente para o Cloudflare Worker sem expor credenciais.

### 4.3 Fazer Deploy
Clique no botão **Deploy**.
Em cerca de 1 a 2 minutos, sua aplicação estará no ar em `https://afiliado-auto.vercel.app` (ou em seu domínio personalizado).

---

## 5. Resiliência e Comportamento Offline (PC Desligado)

Uma preocupação comum é: *O que acontece se meu computador for desligado ou a internet oscilar enquanto as automações estiverem rodando?*

O sistema foi desenhado com **Resiliência Total a Falhas**:
1. O agendamento é disparado pelo **Cloudflare Cron Trigger** (`* * * * *`) nos servidores da Cloudflare, sem depender do seu navegador ou computador estarem abertos.
2. Quando chega o momento de enviar uma oferta, o Worker tenta contactar o OpenWA através do Cloudflare Tunnel.
3. Se o OpenWA estiver inacessível (ex: erro 502/504 Bad Gateway no túnel ou conexão recusada):
   - O disparo **NÃO é descartado**;
   - O produto **NÃO é marcado como postado**;
   - O status é registrado como `offline_retry`;
   - O Worker reagenda a automação para checar novamente em 2 minutos;
   - Assim que você ligar o computador e iniciar o OpenWA, o envio continuará exatamente de onde parou.
4. **Idempotência**: Cada envio gera uma chave única `automation_id:cycle_id:product_id:group_jid`. É impossível que a mesma oferta seja enviada duplicada para o mesmo grupo no mesmo ciclo.

---

## 6. Fluxo de Desenvolvimento Local (Híbrido)

Para desenvolver e testar novas funcionalidades na sua máquina sem afetar a produção:

1. **Iniciar OpenWA:**
   ```bash
   cd tunnel
   start-openwa.bat
   # ou: npx @open-wa/wa-automate@latest --session-id afiliado-auto --host 127.0.0.1 --port 8080 --api-key OpeNwA
   ```

2. **Iniciar Frontend Next.js Local:**
   ```bash
   cd web
   npm run dev
   ```
   Acesse `http://localhost:3000`.

3. **(Opcional) Executar Worker Localmente:**
   ```bash
   cd worker
   npm run dev
   ```

---

## 7. Checklist Final de Validação em Produção

- [ ] **Login:** Acessar o site na Vercel e logar com `admin` / `admin123`.
- [ ] **Alterar Senha:** Ir em *Configurações* e definir uma nova senha forte para o administrador.
- [ ] **Shopee:** Em *Configurações*, validar se o App ID e App Secret estão salvos e testar uma conversão em *Conversor Shopee*.
- [ ] **WhatsApp:** Em *WhatsApp*, clicar em **Testar Conexão**. Deve retornar status `CONNECTED` com o número e foto sincronizados.
- [ ] **Sincronizar Grupos:** Clicar em **Sincronizar Grupos** para carregar os grupos reais da sua conta para o banco D1.
- [ ] **Grupo de Configuração:** Em *Grupos*, criar um grupo de configuração agrupando 1 ou mais grupos de ofertas.
- [ ] **Disparo Manual de Teste:** Na aba WhatsApp, realizar um disparo de teste manual com prévia de link.
- [ ] **Criar Automação:** Em *Automações*, selecionar produtos, escolher o intervalo (ex: a cada 15 minutos) e ativar.
- [ ] **Acompanhar Histórico:** Verificar em *Histórico* e *Dashboard* as postagens automáticas sendo registradas com sucesso.
