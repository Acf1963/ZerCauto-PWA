# ZercAuto Gest — PWA de Gestão Oficinal (Offline-First)

Aplicação Web Progressiva (**PWA**) *offline-first* para gestão completa de oficinas automóveis, desenhada com base no sistema visual **ZercAuto Gest** e preparada para desenvolvimento contínuo no **VS Code / VSCodroid (Android)**, versionamento no **GitHub** e alojamento na **Vercel**.

---

## 1. Arquitetura e Stack Tecnológica

* **Frontend:** React + TypeScript + Vite + Tailwind CSS (fiel ao `zercauto_gest_design_system.md` e aos layouts `code.html` do Stitch).
* **Base de Dados Local (Offline-First):** **IndexedDB** via **Dexie.js** — garante leitura e escrita instantâneas sem ligação à internet.
* **Base de Dados Cloud & Autenticação:** **Supabase** (PostgreSQL + Supabase Auth + Row Level Security).
* **Sincronização Bidirecional:** Motor automático *two-way sync* com fila de alterações pendentes (*sync queue*), estado de ligação em tempo real (`Online (Sincronizado)`, `Offline`, `A Sincronizar...`) e botão manual **Sincronizar Agora**.
* **PWA & Service Worker:** `vite-plugin-pwa` com caching de ativos estáticos, manifest configurado, suporte a instalação em Android/Desktop e fallback offline completo.
* **Localização & Moeda:** Interface em **Português (PT)**, moeda padrão em **Kwanza Angolano — AOA (`Kz`)**, com formatação numérica local (`3.842.500 Kz`).

---

## 2. Módulos Principais do Sistema

1. **Folhas de Obra (`FO-AAAA-XXXX`):**
   * Criação, edição e acompanhamento de estados (*Aberta*, *Em Diagnóstico*, *Aguarda Peças*, *Em Execução*, *Concluída*, *Faturada*).
   * Separação clara entre **Peças** e **Mão de Obra (M.O.)**, cálculo automático de totais, CMV e margem bruta.
2. **Clientes & Viaturas:**
   * Registo de clientes particulares e empresariais (NIF, contactos, histórico).
   * Associação de múltiplas viaturas por cliente (matrícula, marca, modelo, ano, VIN/chassis, quilometragem).
3. **Stock & Fornecedores:**
   * Controlo de inventário de peças e consumíveis, preço de custo (CMV) vs. preço de venda, alertas visuais de stock mínimo e gestão de fornecedores.
4. **Pagamentos & Relatórios Mensais:**
   * Indicadores mensais (*Total Faturado*, *Total Recebido*, *Em Dívida*, CMV e margem bruta).
   * Detalhe financeiro por Folha de Obra com estados de pagamento (*Liquidado*, *Pendente*, *Link Online*, *Parcial*).
   * Exportação de relatórios mensais (CSV/PDF/Impressão).
5. **Utilizadores & Acesso:**
   * Gestão de perfis e permissões (*Administrador*, *Chefe de Oficina*, *Rececionista*, *Mecânico*, *Contabilidade*).
6. **Definições:**
   * Dados da oficina, logótipo (`lgtp_zc_01_36e3ef.jpg`), prefixos de numeração, configuração de taxas/impostos, parâmetros de sincronização e backup/restauro local.

---

## 3. Estrutura de Pastas Recomendada

```text
Zercauto/
├── public/
│   ├── icons/                  # Ícones PWA (192x192, 512x512)
│   └── logo-zercauto.jpg       # Logótipo oficial da oficina
├── src/
│   ├── components/
│   │   ├── layout/             # Sidebar desktop, BottomNav mobile, Topbar de Sync
│   │   └── ui/                 # Botões, badges de estado, modais, tabelas responsivas
│   ├── db/
│   │   ├── dexie.ts            # Esquema IndexedDB (tabelas + sync_queue)
│   │   └── seed.ts             # Dados iniciais de demonstração
│   ├── lib/
│   │   ├── supabase.ts         # Cliente Supabase configurado via variáveis .env
│   │   └── syncEngine.ts       # Sincronização bidirecional Dexie <-> Supabase
│   ├── pages/
│   │   ├── FolhasObra.tsx
│   │   ├── ClientesViaturas.tsx
│   │   ├── StockFornecedores.tsx
│   │   ├── PagamentosRelatorios.tsx
│   │   ├── UtilizadoresAcesso.tsx
│   │   └── Definicoes.tsx
│   ├── types/
│   │   └── database.ts         # Interfaces TypeScript partilhadas
│   ├── utils/
│   │   └── formatters.ts       # Formatação de moeda (Kz), datas e códigos FO
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   └── schema.sql              # Script SQL completo para criar tabelas e RLS no Supabase
├── .env.example                # Modelo de variáveis de ambiente
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

---

## 4. Instalação e Execução no VSCodroid (Android)

> **Importante:** No Android, trabalha sempre no armazenamento interno do VSCodroid (`~/Zercauto`) e não em `/storage/emulated/0/...` para evitar erros de permissão (`EPERM`) e falhas de *symlinks* no `npm`.

### Passo 1: Preparar a pasta do projeto
```bash
cd ~/Zercauto
ls -la package.json
```
*(Se os ficheiros vieram do armazenamento partilhado, copia-os primeiro com `cp -r /storage/emulated/0/VScode/Prjts/Zercauto/. ~/Zercauto/`.)*

### Passo 2: Instalar dependências sem symlinks
```bash
npm install --no-bin-links
```

### Passo 3: Configurar variáveis de ambiente
```bash
cp .env.example .env
```
Edita o ficheiro `.env` e preenche as credenciais do teu projeto Supabase:
```env
VITE_SUPABASE_URL=https://TEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=TUA_CHAVE_ANON_PUBLICA
```

### Passo 4: Iniciar servidor de desenvolvimento
```bash
npm run dev -- --host
```
Abre o endereço local apresentado no terminal (ex.: `http://localhost:5173`) no navegador do dispositivo.

---

## 5. Configuração do Supabase (Cloud)

1. Cria um projeto gratuito em [supabase.com](https://supabase.com).
2. Abre o **SQL Editor** no painel do Supabase e executa o ficheiro `supabase/schema.sql` gerado no projeto.
3. Em **Authentication > Providers**, ativa o login por **Email/Password**.
4. Copia a **Project URL** e a **anon public key** para o ficheiro `.env` local (e para as *Environment Variables* na Vercel).

---

## 6. Fluxo de Sincronização (VSCodroid ↔ GitHub ↔ Vercel)

1. **Guardar alterações no Git:**
   ```bash
   cd ~/Zercauto
   git add .
   git commit -m "feat: estrutura inicial ZercAuto Gest PWA"
   git push origin main
   ```
2. **Deploy na Vercel:**
   * Importa o repositório do GitHub na [vercel.com](https://vercel.com).
   * Adiciona `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente do projeto.
   * Cada `git push` para `main` fará deploy automático da PWA em produção com HTTPS ativo.