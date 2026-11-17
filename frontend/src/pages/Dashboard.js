import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, Users, Target, KanbanSquare, ArrowDownCircle, ArrowUpCircle, AlertTriangle, Clock } from "lucide-react";
import { useApi } from "@/lib/api";
import { brl, fmtDate, LABELS, LEAD_STAGES } from "@/lib/format";
import { PageHeader, Panel, StatusBadge } from "@/components/sparkle/PageHeader";
import { useMe } from "@/context/MeContext";

const Kpi = ({ icon: Icon, label, value, hint, testid, accent = "#EB7300", delay }) => (
  <Panel className="p-5 rise" style={{ animationDelay: `${delay}ms` }} data-testid={testid}>
    <div className="flex items-center justify-between">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <Icon className="h-4 w-4" style={{ color: accent }} />
    </div>
    <p className="mt-3 text-2xl font-bold text-white" data-testid={`${testid}-value`}>{value}</p>
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </Panel>
);

const monthLabel = (m) => new Date(`${m}-15`).toLocaleDateString("pt-BR", { month: "short" });

export default function Dashboard() {
  const api = useApi();
  const { me } = useMe();
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/dashboard").then(setD); }, [api]);
  if (!d) return <p className="text-slate-400">Carregando...</p>;
  const k = d.kpis;
  const maxFunnel = Math.max(1, ...Object.values(d.funnel));
  return (
    <div>
      <PageHeader eyebrow="Visão geral" title={`Olá, ${me.name?.split(" ")[0] || ""}`} description="O pulso da agência hoje: receita, clientes, pipeline e produção." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {d.finance_visible && <Kpi icon={TrendingUp} label="Receita do mês" value={brl(k.revenue_month)} testid="kpi-revenue" delay={0} />}
        <Kpi icon={Users} label="Clientes ativos" value={k.active_clients} hint={`MRR ${brl(k.mrr)}`} testid="kpi-clients" accent="#94BAC4" delay={60} />
        <Kpi icon={Target} label="Leads abertos" value={k.open_leads} hint={`Pipeline ${brl(k.pipeline_value)}`} testid="kpi-leads" accent="#FFB703" delay={120} />
        <Kpi icon={KanbanSquare} label="Tarefas pendentes" value={k.pending_tasks} hint={`${k.awaiting_approval} aguardando aprovação`} testid="kpi-tasks" accent="#94BAC4" delay={180} />
        {d.finance_visible && <>
          <Kpi icon={ArrowDownCircle} label="A receber" value={brl(k.receivable)} testid="kpi-receivable" accent="#34d399" delay={240} />
          <Kpi icon={ArrowUpCircle} label="A pagar" value={brl(k.payable)} testid="kpi-payable" accent="#f87171" delay={300} />
          <Kpi icon={AlertTriangle} label="Lançamentos atrasados" value={k.overdue} testid="kpi-overdue" accent="#f87171" delay={360} />
        </>}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {d.finance_visible && (
          <Panel className="p-6 lg:col-span-2" data-testid="cashflow-chart">
            <h2 className="text-base font-semibold text-white">Fluxo de caixa · 6 meses</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer>
                <AreaChart data={d.cash_flow.map((x) => ({ ...x, label: monthLabel(x.month) }))}>
                  <defs>
                    <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#EB7300" stopOpacity={0.5} /><stop offset="100%" stopColor="#EB7300" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#94BAC4" stopOpacity={0.4} /><stop offset="100%" stopColor="#94BAC4" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#003459" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip contentStyle={{ background: "#002138", border: "1px solid #003459", borderRadius: 12 }} formatter={(v) => brl(v)} />
                  <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#EB7300" fill="url(#gIn)" strokeWidth={2} />
                  <Area type="monotone" dataKey="saidas" name="Saídas" stroke="#94BAC4" fill="url(#gOut)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}
        <Panel className="p-6" data-testid="funnel-panel">
          <h2 className="text-base font-semibold text-white">Funil comercial</h2>
          <div className="mt-5 space-y-3">
            {LEAD_STAGES.map((s) => (
              <div key={s}>
                <div className="flex justify-between text-xs text-slate-400"><span>{LABELS[s]}</span><span>{d.funnel[s]}</span></div>
                <div className="mt-1 h-2 rounded-full bg-[#001524]"><div className="h-2 rounded-full bg-gradient-to-r from-[#EB7300] to-[#FFB703]" style={{ width: `${(d.funnel[s] / maxFunnel) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <Link to="/app/crm" className="mt-6 inline-block text-sm text-[#FFB703] hover:underline" data-testid="dashboard-go-crm">Abrir CRM →</Link>
        </Panel>
        <Panel className="p-6 lg:col-span-3" data-testid="upcoming-tasks-panel">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white"><Clock className="h-4 w-4 text-[#EB7300]" /> Próximas entregas</h2>
          <div className="mt-4 divide-y divide-[#003459]">
            {d.upcoming_tasks.length === 0 && <p className="py-6 text-sm text-slate-400">Nenhuma entrega agendada.</p>}
            {d.upcoming_tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm text-slate-200">{t.title}</span>
                <div className="flex items-center gap-3"><StatusBadge value={t.stage} label={LABELS[t.stage]} /><span className="text-xs text-slate-400">{fmtDate(t.due_date)}</span></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
