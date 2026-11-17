import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { brl, LABELS, opts } from "@/lib/format";
import { PageHeader, Panel, StatusBadge, Empty } from "@/components/sparkle/PageHeader";
import { FormDialog } from "@/components/sparkle/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe, isManager } from "@/context/MeContext";

export const CLIENT_FIELDS = [
  { name: "name", label: "Nome", required: true },
  { name: "company", label: "Empresa / Razão social" },
  { name: "email", label: "E-mail" },
  { name: "phone", label: "Telefone / WhatsApp" },
  { name: "document", label: "CNPJ / CPF" },
  { name: "segment", label: "Segmento" },
  { name: "status", label: "Status", type: "select", options: opts(["ativo", "prospeccao", "inativo"]) },
  { name: "monthly_fee", label: "Mensalidade (R$)", type: "number" },
  { name: "account_manager", label: "Responsável" },
  { name: "notes", label: "Observações", type: "textarea" },
];

export default function Clients() {
  const api = useApi();
  const { me } = useMe();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => api.get("/clients").then(setItems), [api]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter((c) =>
    (!status || c.status === status) && `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(q.toLowerCase())), [items, q, status]);

  const save = async (v) => {
    try {
      if (edit.id) await api.patch(`/clients/${edit.id}`, v); else await api.post("/clients", v);
      toast.success("Cliente salvo"); load();
    } catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const remove = async (c) => {
    if (!window.confirm(`Excluir ${c.name}?`)) return;
    try { await api.del(`/clients/${c.id}`); toast.success("Cliente excluído"); load(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div>
      <PageHeader eyebrow="Relacionamento" title="Clientes" description="Cadastro completo, status e mensalidades da carteira.">
        <Button onClick={() => setEdit({ status: "ativo" })} data-testid="clients-add-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Plus className="h-4 w-4 mr-1" /> Novo cliente</Button>
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, empresa ou e-mail" data-testid="clients-search-input" className="pl-9 h-10 bg-[#002138] border-[#003459]" /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="clients-status-filter" className="h-10 rounded-md border border-[#003459] bg-[#002138] px-3 text-sm">
          <option value="">Todos os status</option>{opts(["ativo", "prospeccao", "inativo"]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="clients-table">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400"><tr className="border-b border-[#003459]">
            <th className="p-4">Cliente</th><th className="p-4 hidden md:table-cell">Segmento</th><th className="p-4">Status</th><th className="p-4 hidden sm:table-cell">Mensalidade</th><th className="p-4 text-right">Ações</th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-[#003459]/60 transition-colors hover:bg-white/[0.03]" data-testid={`client-row-${c.id}`}>
                <td className="p-4"><Link to={`/app/clientes/${c.id}`} className="font-medium text-white hover:text-[#FFB703]" data-testid={`client-link-${c.id}`}>{c.name}</Link><p className="text-xs text-slate-500">{c.company || c.email}</p></td>
                <td className="p-4 hidden md:table-cell text-slate-300">{c.segment || "—"}</td>
                <td className="p-4"><StatusBadge value={c.status} label={LABELS[c.status]} /></td>
                <td className="p-4 hidden sm:table-cell text-slate-200">{brl(c.monthly_fee)}</td>
                <td className="p-4 text-right whitespace-nowrap">
                  <button onClick={() => setEdit(c)} className="p-2 text-slate-400 hover:text-white" data-testid={`client-edit-${c.id}`}><Pencil className="h-4 w-4" /></button>
                  {isManager(me) && <button onClick={() => remove(c)} className="p-2 text-slate-400 hover:text-red-400" data-testid={`client-delete-${c.id}`}><Trash2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <Empty text="Nenhum cliente encontrado." testid="clients-empty" />}
      </Panel>
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Editar cliente" : "Novo cliente"} fields={CLIENT_FIELDS} initial={edit} onSubmit={save} prefix="client-form" />
    </div>
  );
}
