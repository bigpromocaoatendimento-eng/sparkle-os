import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { brl, fmtDate, LABELS, opts } from "@/lib/format";
import { PageHeader, Panel, StatusBadge, Empty } from "@/components/sparkle/PageHeader";
import { FormDialog } from "@/components/sparkle/FormDialog";
import { Button } from "@/components/ui/button";
import { ManagerOnly } from "@/components/sparkle/ManagerOnly";

export default function ContractsGuarded() {
  return <ManagerOnly><Contracts /></ManagerOnly>;
}

function Contracts() {
  const api = useApi();
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => { api.get("/contracts").then(setItems).catch(() => {}); api.get("/clients").then(setClients).catch(() => {}); }, [api]);
  useEffect(() => { load(); }, [load]);
  const cname = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients]);
  const fields = [
    { name: "title", label: "Título do contrato", required: true, full: true },
    { name: "client_id", label: "Cliente", type: "select", placeholder: "Selecione...", options: clients.map((c) => ({ value: c.id, label: c.name })) },
    { name: "status", label: "Status", type: "select", options: opts(["rascunho", "ativo", "encerrado", "cancelado"]) },
    { name: "value", label: "Valor mensal / total (R$)", type: "number" },
    { name: "renewal_auto", label: "Renovação automática", type: "checkbox" },
    { name: "start_date", label: "Início", type: "date" },
    { name: "end_date", label: "Término", type: "date" },
    { name: "notes", label: "Cláusulas / observações", type: "textarea" },
  ];
  const save = async (v) => {
    try { if (edit.id) await api.patch(`/contracts/${edit.id}`, v); else await api.post("/contracts", v); toast.success("Contrato salvo"); load(); }
    catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const remove = async (c) => { if (window.confirm(`Excluir ${c.title}?`)) { await api.del(`/contracts/${c.id}`); load(); } };
  const active = items.filter((c) => c.status === "ativo");
  return (
    <div>
      <PageHeader eyebrow="Jurídico & comercial" title="Contratos" description="Vigências, valores e renovações de cada cliente.">
        <Button onClick={() => setEdit({ status: "rascunho" })} data-testid="contracts-add-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Plus className="h-4 w-4 mr-1" /> Novo contrato</Button>
      </PageHeader>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Panel className="p-5"><p className="text-xs uppercase text-slate-400">Contratos ativos</p><p className="mt-2 text-2xl font-bold" data-testid="contracts-active-count">{active.length}</p></Panel>
        <Panel className="p-5"><p className="text-xs uppercase text-slate-400">Valor em vigência</p><p className="mt-2 text-2xl font-bold text-[#FFB703]" data-testid="contracts-active-value">{brl(active.reduce((a, c) => a + c.value, 0))}</p></Panel>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="contracts-table">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400"><tr className="border-b border-[#003459]">
            <th className="p-4">Contrato</th><th className="p-4">Cliente</th><th className="p-4 hidden md:table-cell">Vigência</th><th className="p-4">Valor</th><th className="p-4">Status</th><th className="p-4" /></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-[#003459]/60 hover:bg-white/[0.03]" data-testid={`contract-row-${c.id}`}>
                <td className="p-4 text-white">{c.title} {c.renewal_auto && <RefreshCw className="inline h-3 w-3 text-[#94BAC4]" />}</td>
                <td className="p-4 text-slate-300">{cname[c.client_id] || "—"}</td>
                <td className="p-4 hidden md:table-cell text-slate-400">{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</td>
                <td className="p-4">{brl(c.value)}</td>
                <td className="p-4"><StatusBadge value={c.status} label={LABELS[c.status]} /></td>
                <td className="p-4 text-right whitespace-nowrap">
                  <button onClick={() => setEdit(c)} className="p-2 text-slate-400 hover:text-white" data-testid={`contract-edit-${c.id}`}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(c)} className="p-2 text-slate-400 hover:text-red-400" data-testid={`contract-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <Empty text="Nenhum contrato cadastrado." testid="contracts-empty" />}
      </Panel>
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Editar contrato" : "Novo contrato"} fields={fields} initial={edit} onSubmit={save} prefix="contract-form" />
    </div>
  );
}
