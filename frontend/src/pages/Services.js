import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { brl, LABELS, opts } from "@/lib/format";
import { PageHeader, Panel, Empty } from "@/components/sparkle/PageHeader";
import { Star } from "@/components/sparkle/Logo";
import { FormDialog } from "@/components/sparkle/FormDialog";
import { Button } from "@/components/ui/button";
import { useMe, isManager } from "@/context/MeContext";

const FIELDS = [
  { name: "name", label: "Nome do serviço / pacote", required: true, full: true },
  { name: "category", label: "Categoria" },
  { name: "billing", label: "Cobrança", type: "select", options: opts(["mensal", "unico"]) },
  { name: "price", label: "Preço (R$)", type: "number" },
  { name: "active", label: "Ativo no site", type: "checkbox" },
  { name: "deliverables", label: "Entregáveis", type: "tags", full: true },
  { name: "description", label: "Descrição", type: "textarea" },
];

export default function Services() {
  const api = useApi();
  const { me } = useMe();
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => api.get("/services").then(setItems), [api]);
  useEffect(() => { load(); }, [load]);
  const save = async (v) => {
    try { if (edit.id) await api.patch(`/services/${edit.id}`, v); else await api.post("/services", v); toast.success("Serviço salvo"); load(); }
    catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const remove = async (s) => { if (window.confirm(`Excluir ${s.name}?`)) { await api.del(`/services/${s.id}`); load(); } };
  const mgr = isManager(me);
  return (
    <div>
      <PageHeader eyebrow="Catálogo" title="Serviços & Pacotes" description="O que a Sparkle vende, com preço e entregáveis. Serviços ativos aparecem no site.">
        {mgr && <Button onClick={() => setEdit({ billing: "mensal", active: true, deliverables: [] })} data-testid="services-add-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Plus className="h-4 w-4 mr-1" /> Novo serviço</Button>}
      </PageHeader>
      {items.length === 0 && <Empty text="Nenhum serviço cadastrado." testid="services-empty" />}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((s, i) => (
          <Panel key={s.id} className="group flex flex-col p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#EB7300]/50 rise" style={{ animationDelay: `${i * 50}ms` }} data-testid={`service-card-${s.id}`}>
            <div className="flex items-start justify-between">
              <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#94BAC4]"><Star className="w-2 h-2" />{s.category || "Serviço"}</p>
              {!s.active && <span className="text-xs text-slate-500">Inativo</span>}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-white">{s.name}</h3>
            <p className="mt-2 flex-1 text-sm text-slate-400">{s.description}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">{s.deliverables?.map((d) => <span key={d} className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">{d}</span>)}</div>
            <div className="mt-5 flex items-end justify-between border-t border-[#003459] pt-4">
              <div><p className="text-2xl font-bold text-[#FFB703]" data-testid={`service-price-${s.id}`}>{brl(s.price)}</p><p className="text-xs text-slate-500">{LABELS[s.billing]}</p></div>
              {mgr && <div className="opacity-70 group-hover:opacity-100">
                <button onClick={() => setEdit(s)} className="p-2 text-slate-400 hover:text-white" data-testid={`service-edit-${s.id}`}><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(s)} className="p-2 text-slate-400 hover:text-red-400" data-testid={`service-delete-${s.id}`}><Trash2 className="h-4 w-4" /></button>
              </div>}
            </div>
          </Panel>
        ))}
      </div>
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Editar serviço" : "Novo serviço"} fields={FIELDS} initial={edit} onSubmit={save} prefix="service-form" />
    </div>
  );
}
