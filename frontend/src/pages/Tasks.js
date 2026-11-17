import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Calendar, MessageSquare } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { fmtDate, LABELS, opts, TASK_STAGES } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/sparkle/PageHeader";
import { Kanban } from "@/components/sparkle/Kanban";
import { FormDialog } from "@/components/sparkle/FormDialog";
import { Button } from "@/components/ui/button";
import { useMe, isManager } from "@/context/MeContext";

const ACCENT = { briefing: "#94BAC4", criacao: "#EB7300", revisao: "#FFB703", aprovacao: "#FFB703", concluido: "#34d399" };

export default function Tasks() {
  const api = useApi();
  const { me } = useMe();
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => { api.get("/tasks").then(setItems); api.get("/clients").then(setClients); }, [api]);
  useEffect(() => { load(); }, [load]);
  const cname = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients]);
  const fields = [
    { name: "title", label: "Título", required: true, full: true },
    { name: "client_id", label: "Cliente", type: "select", placeholder: "Interno (sem cliente)", options: clients.map((c) => ({ value: c.id, label: c.name })) },
    { name: "stage", label: "Etapa", type: "select", options: opts(TASK_STAGES) },
    { name: "priority", label: "Prioridade", type: "select", options: opts(["baixa", "media", "alta"]) },
    { name: "assignee", label: "Responsável" },
    { name: "due_date", label: "Prazo", type: "date" },
    { name: "description", label: "Briefing / descrição", type: "textarea" },
  ];
  const move = async (t, stage) => {
    setItems((s) => s.map((x) => (x.id === t.id ? { ...x, stage } : x)));
    try { await api.patch(`/tasks/${t.id}`, { stage }); toast.success(`Movida para ${LABELS[stage]}`); } catch (e) { toast.error(errMsg(e)); load(); }
  };
  const save = async (v) => {
    try { if (edit.id) await api.patch(`/tasks/${edit.id}`, v); else await api.post("/tasks", v); toast.success("Tarefa salva"); load(); }
    catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const remove = async (t) => { if (window.confirm(`Excluir ${t.title}?`)) { await api.del(`/tasks/${t.id}`); setEdit(null); load(); } };
  const shown = filter ? items.filter((t) => t.client_id === filter) : items;
  return (
    <div>
      <PageHeader eyebrow="Produção criativa" title="Kanban de produção" description="Do briefing à aprovação do cliente. Tarefas em “Aprovação cliente” aparecem no portal.">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="tasks-client-filter" className="h-10 rounded-full border border-[#003459] bg-[#002138] px-4 text-sm">
          <option value="">Todos os clientes</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button onClick={() => setEdit({ stage: "briefing", priority: "media" })} data-testid="tasks-add-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Plus className="h-4 w-4 mr-1" /> Nova tarefa</Button>
      </PageHeader>
      <Kanban prefix="tasks" stages={TASK_STAGES} items={shown} onMove={move} accent={ACCENT} renderCard={(t) => (
        <button onClick={() => setEdit(t)} data-testid={`task-card-${t.id}`} className="w-full rounded-xl border border-[#003459] bg-[#001524] p-4 text-left transition-colors hover:border-[#EB7300]/60">
          <div className="flex items-start justify-between gap-2"><p className="font-medium text-white">{t.title}</p><StatusBadge value={t.priority} label={LABELS[t.priority]} /></div>
          <p className="mt-1 text-xs text-[#94BAC4]">{cname[t.client_id] || "Interno"}</p>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
            {t.due_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(t.due_date)}</span>}
            {t.assignee && <span>{t.assignee}</span>}
            {t.feedback?.length > 0 && <span className="flex items-center gap-1 text-[#FFB703]"><MessageSquare className="h-3 w-3" />{t.feedback.length}</span>}
          </div>
        </button>
      )} />
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Editar tarefa" : "Nova tarefa"} fields={fields} initial={edit} onSubmit={save} prefix="task-form" extra={edit?.id && (edit.feedback?.length > 0 || isManager(me)) && (
        <div className="border-t border-[#003459] pt-4" data-testid="task-feedback-panel">
          {edit.feedback?.map((f, i) => (
            <p key={i} className="mb-2 text-xs text-slate-300"><span className={f.type === "aprovado" ? "text-emerald-300" : "text-[#FFB703]"}>{f.type === "aprovado" ? "Aprovado" : "Alteração solicitada"}</span> · {f.by}: {f.comment || "—"}</p>
          ))}
          {isManager(me) && <Button type="button" size="sm" variant="ghost" onClick={() => remove(edit)} data-testid="task-delete-button" className="text-red-300">Excluir tarefa</Button>}
        </div>
      )} />
    </div>
  );
}
