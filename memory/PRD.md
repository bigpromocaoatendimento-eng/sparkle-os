# Sparkle OS — PRD

## Original problem
Plataforma empresarial "Sparkle OS" para a Agência Sparkle (ERP + CRM + Financeiro + Produção Criativa + Portal do Cliente + Site institucional), 32 módulos no briefing. Identidade: logotipo em fundo azul-escuro, paleta #001524 / #EB7300 / #FFB703 / #94BAC4, tipografia Marcellus SC + Baskerville.

## User choices
- MVP: Núcleo completo (Auth, Dashboard, Clientes, Serviços/Pacotes, Contratos, Financeiro básico, CRM funil, Tarefas/Kanban, Portal do Cliente, Site institucional)
- Auth: Emergent-managed Clerk (email/senha + Google). Admin inicial: sparkleag.marketing@gmail.com (ADMIN_EMAIL)
- Integração: Emergent Object Storage (arquivos de clientes)

## Architecture
- Backend FastAPI (`/app/backend/server.py`, `clerk_auth.py`), MongoDB, generic CRUD factory `register_crud` for clients/services/contracts/transactions/leads/tasks; files via object storage; portal & public endpoints; seed data marked "(exemplo)".
- Roles (code): admin, gerente, criativo, cliente (default). Finance/contracts = admin+gerente; users = admin.
- Frontend React: public site `/`, `/sign-in`, `/sign-up`, staff app `/app/*`, client portal `/portal`.

## Implemented (2026-06)
- Site institucional (hero, serviços dinâmicos, sobre, processo, contato → lead no CRM)
- Dashboard KPIs + fluxo de caixa 6 meses + funil + próximas entregas
- Clientes CRUD + detalhe (tarefas, financeiro, arquivos upload/download)
- Serviços/Pacotes, Contratos, Financeiro (receber/pagar/fluxo, marcar pago, atrasado automático)
- CRM kanban drag&drop + converter lead em cliente
- Produção kanban (briefing → criação → revisão → aprovação cliente → concluído)
- Portal do cliente: aprovar / solicitar alteração, faturas, arquivos, contratos; pré-visualização pela equipe
- Usuários: papéis + vínculo cliente↔usuário
- Tested: iteration_1 (backend 26/28 → fixes applied: criativo money leak in portal, unicode filename download, regex email, feedback write-protect, client delete guard, route guards)

## Backlog
- P1: Clerk UI in pt-BR, NF-e, Stripe/boletos, Google Calendar, calendário editorial, propostas PDF, relatórios
- P1: Notificações por e-mail (aprovações, vencimentos), upload de arquivos pelo cliente no portal
- P2: Demais módulos do briefing (RH, estoque, metas, BI avançado, automações), menu mobile no site
