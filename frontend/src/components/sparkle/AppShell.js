import { useState } from "react";
import { NavLink, Navigate, Outlet, Link } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { LayoutDashboard, Users, Package, FileSignature, Wallet, Target, KanbanSquare, MonitorSmartphone, ShieldCheck, Menu, X, Globe, CalendarDays } from "lucide-react";
import { Logo } from "./Logo";
import { useMe, isStaff } from "@/context/MeContext";
import { LABELS } from "@/lib/format";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "gerente", "criativo"], end: true },
  { to: "/app/clientes", label: "Clientes", icon: Users, roles: ["admin", "gerente", "criativo"] },
  { to: "/app/crm", label: "CRM", icon: Target, roles: ["admin", "gerente", "criativo"] },
  { to: "/app/tarefas", label: "Produção", icon: KanbanSquare, roles: ["admin", "gerente", "criativo"] },
  { to: "/app/calendario", label: "Calendário", icon: CalendarDays, roles: ["admin", "gerente", "criativo"] },
  { to: "/app/servicos", label: "Serviços", icon: Package, roles: ["admin", "gerente", "criativo"] },
  { to: "/app/contratos", label: "Contratos", icon: FileSignature, roles: ["admin", "gerente"] },
  { to: "/app/financeiro", label: "Financeiro", icon: Wallet, roles: ["admin", "gerente"] },
  { to: "/portal", label: "Portal do Cliente", icon: MonitorSmartphone, roles: ["admin", "gerente", "criativo"] },
  { to: "/app/usuarios", label: "Usuários", icon: ShieldCheck, roles: ["admin"] },
];

function NavItems({ role, onNavigate }) {
  return NAV.filter((n) => n.roles.includes(role)).map((n) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={onNavigate}
      data-testid={`nav-${n.to.split("/").pop() || "dashboard"}`}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ${isActive ? "bg-[#EB7300]/15 text-white border border-[#EB7300]/30" : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"}`
      }
    >
      <n.icon className="h-4 w-4 shrink-0" />
      {n.label}
    </NavLink>
  ));
}

function Sidebar({ me, onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-6 p-5">
      <Link to="/app" onClick={onNavigate} className="px-1"><Logo className="h-14" /></Link>
      <nav className="flex flex-col gap-1">
        <NavItems role={me.role} onNavigate={onNavigate} />
      </nav>
      <div className="mt-auto space-y-3">
        <Link to="/" data-testid="nav-public-site" className="flex items-center gap-2 px-3 text-xs text-slate-500 hover:text-[#94BAC4]"><Globe className="h-3.5 w-3.5" /> Ver site institucional</Link>
        <div className="flex items-center gap-3 rounded-xl border border-[#003459] bg-[#002138] p-3" data-testid="sidebar-user-card">
          <UserButton />
          <div className="min-w-0">
            <p className="truncate text-sm text-white" data-testid="sidebar-user-name">{me.name}</p>
            <p className="text-xs text-[#94BAC4]" data-testid="sidebar-user-role">{LABELS[me.role]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { me, error } = useMe();
  const [open, setOpen] = useState(false);
  if (error) return <p className="p-10 text-slate-300">Não foi possível carregar sua conta. Atualize a página.</p>;
  if (!me) return <div className="min-h-screen grid place-items-center text-slate-400" data-testid="app-loading">Carregando Sparkle OS...</div>;
  if (!isStaff(me)) return <Navigate to="/portal" replace />;
  return (
    <div className="min-h-screen bg-[#001524] text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#003459] bg-[#001524] lg:block"><Sidebar me={me} /></aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#003459] bg-[#001524]/90 px-4 py-3 backdrop-blur-md lg:hidden">
        <Logo className="h-9" testid="mobile-logo" />
        <button onClick={() => setOpen(true)} data-testid="mobile-menu-button" className="rounded-lg border border-[#003459] p-2"><Menu className="h-5 w-5" /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-[#001524] border-r border-[#003459]">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 p-2" data-testid="mobile-menu-close"><X className="h-5 w-5" /></button>
            <Sidebar me={me} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12"><Outlet /></div>
      </main>
    </div>
  );
}
