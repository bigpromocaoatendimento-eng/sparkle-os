import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { useApi, errMsg } from "@/lib/api";
import { brl, fmtDate, LABELS, opts, txStatus, today } from "@/lib/format";
import { PageHeader, Panel, StatusBadge, Empty } from "@/components/sparkle/PageHeader";
import { FormDialog } from "@/components/sparkle/FormDialog";
import { Button } from "@/components/ui/button";

const TABS = [["receber", "Contas a receber"], ["pagar", "Contas a pagar"], ["fluxo", "Fluxo de caixa"]];

function CashFlow({ items }) {
  const data = useMemo(() => {
    const m = {};
    items.forEach((t) => {
      const k = (t.due_date || "").slice(0, 7);
      if (!k) return;
      m[k] = m[k] || { month: k, entradas: 0, saidas: 0 };
      m[k][t.type === "receber" ? "entradas" : "saidas"] += t.amount;
    });
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month)).map((x) => ({ ...x, saldo: x.entradas - x.saidas }));
  }, [items]);
  return (
    <Panel className="p-6" data-testid="finance-cashflow">
      <div className="h-80"><ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid stroke="#003459" strokeDasharray="3 3" />
          <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
          <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
          <Tooltip contentStyle={{ background: "#002138", border: "1px solid #003459", borderRadius: 12 }} formatter={(v) => brl(v)} />
          <Legend />
          <Bar dataKey="entradas" name="Entradas" fill="#EB7300" radius={[6, 6, 0, 0]} />
          <Bar dataKey="saidas" name="Saídas" fill="#94BAC4" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer></div>
      <div className="mt-4 divide-y divide-[#003459] text-sm">
        {data.map((d) => <div key={d.month} className="flex justify-between py-2"><span className="text-slate-400">{d.month}</span><span className={d.saldo >= 0 ? "text-emerald-300" : "text-red-300"}>{brl(d.saldo)}</span></div>)}
      </div>
    </Panel>
  );
}

export default function Finance() {
  const api = useApi();
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [tab, setTab] = useState("receber");
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => { api.get("/transactions").then(setItems); api.get("/clients").then(setClients); }, [api]);
  useEffect(() => { load(); }, [load]);
  const cname = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const rows = items.filter((t) => t.type === tab).sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  const sum = (type, st) => items.filter((t) => t.type === type && (st ? txStatus(t) === st : t.status !== "pago")).reduce((a, t) => a + t.amount, 0);
  const fields = [
    { name: "description", label: "Descrição", required: true, full: true },
    { name: "type", label: "Tipo", type: "select", options: opts(["receber", "pagar"]) },
    { name: "category", label: "Categoria" },
    { name: "amount", label: "Valor (R$)", type: "number" },
    { name: "due_date", label: "Vencimento", type: "date" },
    { name: "status", label: "Status", type: "select", options: opts(["pendente", "pago"]) },
    { name: "paid_date", label: "Data do pagamento", type: "date" },
    { name: "client_id", label: "Cliente (opcional)", type: "select", placeholder: "Nenhum", options: clients.map((c) => ({ value: c.id, label: c.name })), full: true },
  ];
  const save = async (v) => {
    try { if (edit.id) await api.patch(`/transactions/${edit.id}`, v); else await api.post("/transactions", v); toast.success("Lançamento salvo"); load(); }
    catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const pay = async (t) => { await api.patch(`/transactions/${t.id}`, { status: "pago", paid_date: today() }); toast.success("Marcado como pago"); load(); };
  const remove = async (t) => { if (window.confirm("Excluir lançamento?")) { await api.del(`/transactions/${t.id}`); load(); } };
  return (
    <div>
      <PageHeader eyebrow="Gestão financeira" title="Financeiro" description="Contas a receber, contas a pagar e fluxo de caixa da agência.">
        <Button onClick={() => setEdit({ type: tab === "pagar" ? "pagar" : "receber", status: "pendente", due_date: today() })} data-testid="finance-add-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Plus className="h-4 w-4 mr-1" /> Novo lançamento</Button>
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["A receber", sum("receber"), "text-emerald-300", "fin-kpi-receivable"], ["A pagar", sum("pagar"), "text-red-300", "fin-kpi-payable"], ["Recebido", sum("receber", "pago"), "text-[#FFB703]", "fin-kpi-received"], ["Em atraso", sum("receber", "atrasado") + sum("pagar", "atrasado"), "text-red-400", "fin-kpi-overdue"]].map(([l, v, c, id]) => (
          <Panel key={l} className="p-5"><p className="text-xs uppercase text-slate-400">{l}</p><p className={`mt-2 text-xl font-bold ${c}`} data-testid={id}>{brl(v)}</p></Panel>
        ))}
      </div>
      <div className="mb-4 inline-flex rounded-full border border-[#003459] bg-[#002138] p-1">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} data-testid={`finance-tab-${k}`} className={`rounded-full px-4 py-1.5 text-sm transition-colors ${tab === k ? "bg-[#EB7300] text-white" : "text-slate-400 hover:text-white"}`}>{l}</button>)}
      </div>
      {tab === "fluxo" ? <CashFlow items={items} /> : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="finance-table">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-400"><tr className="border-b border-[#003459]">
              <th className="p-4">Descrição</th><th className="p-4 hidden md:table-cell">Cliente</th><th className="p-4">Vencimento</th><th className="p-4">Valor</th><th className="p-4">Status</th><th className="p-4" /></tr></thead>
            <tbody>{rows.map((t) => { const st = txStatus(t); return (
              <tr key={t.id} className="border-b border-[#003459]/60 hover:bg-white/[0.03]" data-testid={`tx-row-${t.id}`}>
                <td className="p-4"><p className="text-white">{t.description}</p><p className="text-xs text-slate-500">{t.category}</p></td>
                <td className="p-4 hidden md:table-cell text-slate-300">{cname[t.client_id] || "—"}</td>
                <td className="p-4 text-slate-300">{fmtDate(t.due_date)}</td>
                <td className="p-4 font-medium">{brl(t.amount)}</td>
                <td className="p-4"><StatusBadge value={st} label={LABELS[st]} testid={`tx-status-${t.id}`} /></td>
                <td className="p-4 text-right whitespace-nowrap">
                  {t.status !== "pago" && <button onClick={() => pay(t)} title="Marcar como pago" className="p-2 text-slate-400 hover:text-emerald-300" data-testid={`tx-pay-${t.id}`}><CheckCircle2 className="h-4 w-4" /></button>}
                  <button onClick={() => setEdit(t)} className="p-2 text-slate-400 hover:text-white" data-testid={`tx-edit-${t.id}`}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(t)} className="p-2 text-slate-400 hover:text-red-400" data-testid={`tx-delete-${t.id}`}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>); })}</tbody>
          </table>
          {rows.length === 0 && <Empty text="Nenhum lançamento." testid="finance-empty" />}
        </Panel>
      )}
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Editar lançamento" : "Novo lançamento"} fields={fields} initial={edit} onSubmit={save} prefix="tx-form" />
    </div>
  );
}
