import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Globe, UserPlus } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { brl, LABELS, opts, LEAD_STAGES } from "@/lib/format";
import { PageHeader } from "@/components/sparkle/PageHeader";
import { Kanban } from "@/components/sparkle/Kanban";
import { FormDialog } from "@/components/sparkle/FormDialog";
import { Button } from "@/components/ui/button";
import { useMe, isManager } from "@/context/MeContext";

const FIELDS = [
  { name: "name", label: "Nome do contato", required: true },
  { name: "company", label: "Empresa" },
  { name: "email", label: "E-mail" },
  { name: "phone", label: "Telefone" },
  { name: "source", label: "Origem", type: "select", options: ["manual", "site", "instagram", "indicacao", "google", "whatsapp"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
  { name: "stage", label: "Etapa", type: "select", options: opts(LEAD_STAGES) },
  { name: "value", label: "Valor estimado (R$/mês)", type: "number" },
  { name: "notes", label: "Anotações", type: "textarea" },
];
const ACCENT = { novo: "#94BAC4", qualificacao: "#94BAC4", proposta: "#FFB703", negociacao: "#EB7300", ganho: "#34d399", perdido: "#f87171" };

export default function Crm() {
  const api = useApi();
  const { me } = useMe();
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => api.get("/leads").then(setItems), [api]);
  useEffect(() => { load(); }, [load]);
  const move = async (lead, stage) => {
    setItems((s) => s.map((l) => (l.id === lead.id ? { ...l, stage } : l)));
    try { await api.patch(`/leads/${lead.id}`, { stage }); toast.success(`${lead.name} → ${LABELS[stage]}`); } catch (e) { toast.error(errMsg(e)); load(); }
  };
  const save = async (v) => {
    try { if (edit.id) await api.patch(`/leads/${edit.id}`, v); else await api.post("/leads", v); toast.success("Lead salvo"); load(); }
    catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const convert = async (l) => {
    try {
      await api.post("/clients", { name: l.name, company: l.company, email: l.email, phone: l.phone, status: "ativo", monthly_fee: l.value, notes: l.notes });
      await api.patch(`/leads/${l.id}`, { stage: "ganho" });
      toast.success("Lead convertido em cliente!"); setEdit(null); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (l) => { if (window.confirm(`Excluir ${l.name}?`)) { await api.del(`/leads/${l.id}`); setEdit(null); load(); } };
  const open = items.filter((l) => !["ganho", "perdido"].includes(l.stage));
  return (
    <div>
      <PageHeader eyebrow="Comercial" title="CRM · Funil de vendas" description={`${open.length} oportunidades abertas · ${brl(open.reduce((a, l) => a + l.value, 0))} em pipeline. Arraste os cards entre as etapas.`}>
        <Button onClick={() => setEdit({ stage: "novo", source: "manual" })} data-testid="crm-add-lead-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Plus className="h-4 w-4 mr-1" /> Novo lead</Button>
      </PageHeader>
      <Kanban prefix="crm" stages={LEAD_STAGES} items={items} onMove={move} accent={ACCENT} renderCard={(l) => (
        <button onClick={() => setEdit(l)} data-testid={`lead-card-${l.id}`} className="w-full rounded-xl border border-[#003459] bg-[#001524] p-4 text-left transition-colors hover:border-[#EB7300]/60">
          <div className="flex items-start justify-between gap-2"><p className="font-medium text-white">{l.name}</p>{l.source === "site" && <Globe className="h-3.5 w-3.5 shrink-0 text-[#FFB703]" title="Veio do site" />}</div>
          <p className="text-xs text-slate-400">{l.company || l.email}</p>
          <p className="mt-3 text-sm font-semibold text-[#FFB703]">{brl(l.value)}</p>
        </button>
      )} />
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Editar lead" : "Novo lead"} fields={FIELDS} initial={edit} onSubmit={save} prefix="lead-form" extra={edit?.id && (
        <div className="flex flex-wrap gap-2 border-t border-[#003459] pt-4">
          <Button type="button" size="sm" onClick={() => convert(edit)} data-testid="lead-convert-button" className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"><UserPlus className="h-4 w-4 mr-1" /> Converter em cliente</Button>
          {isManager(me) && <Button type="button" size="sm" variant="ghost" onClick={() => remove(edit)} data-testid="lead-delete-button" className="rounded-full text-red-300">Excluir</Button>}
        </div>
      )} />
    </div>
  );
}
