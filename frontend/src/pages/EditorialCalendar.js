import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { CHANNELS, CHANNEL_COLORS, LABELS, TASK_STAGES } from "@/lib/format";
import { PageHeader, Panel } from "@/components/sparkle/PageHeader";
import { MonthCalendar, MonthNav } from "@/components/sparkle/MonthCalendar";
import { FormDialog } from "@/components/sparkle/FormDialog";
import { Button } from "@/components/ui/button";
import { taskFields, TaskExtra } from "./Tasks";
import { useMe, isManager } from "@/context/MeContext";

export default function EditorialCalendar() {
  const api = useApi();
  const { me } = useMe();
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [client, setClient] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => { api.get("/tasks").then(setItems); api.get("/clients").then(setClients); }, [api]);
  useEffect(() => { load(); }, [load]);
  const posts = useMemo(() => items.filter((t) => t.publish_date && (!client || t.client_id === client)), [items, client]);
  const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const monthPosts = posts.filter((t) => t.publish_date.startsWith(key));

  const save = async (v) => {
    try {
      if (edit.id) await api.patch(`/tasks/${edit.id}`, v); else await api.post("/tasks", v);
      toast.success(edit.id ? "Post atualizado" : "Post agendado e enviado ao kanban de produção"); load();
    } catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const remove = async (t) => { if (window.confirm(`Excluir ${t.title}?`)) { await api.del(`/tasks/${t.id}`); setEdit(null); load(); } };
  const newPost = (day) => setEdit({ stage: "briefing", priority: "media", channel: "instagram", content_type: "post", publish_date: day, client_id: client });

  return (
    <div>
      <PageHeader eyebrow="Conteúdo" title="Calendário editorial" description="Planeje os posts de cada cliente. Cada post vira uma tarefa no kanban de produção.">
        <select value={client} onChange={(e) => setClient(e.target.value)} data-testid="calendar-client-filter" className="h-10 rounded-full border border-[#003459] bg-[#002138] px-4 text-sm">
          <option value="">Todos os clientes</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button onClick={() => newPost(new Date().toISOString().slice(0, 10))} data-testid="calendar-add-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Plus className="h-4 w-4 mr-1" /> Novo post</Button>
      </PageHeader>
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <MonthNav month={month} setMonth={setMonth} prefix="calendar" />
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          {Object.entries(CHANNELS).map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: CHANNEL_COLORS[k] }} />{l}</span>)}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
        <MonthCalendar month={month} items={posts} onDayClick={newPost} onItemClick={setEdit} prefix="calendar" />
        <Panel className="h-fit p-5" data-testid="calendar-month-summary">
          <h2 className="text-sm font-semibold text-white">Neste mês</h2>
          <p className="mt-1 text-3xl font-bold text-[#FFB703]" data-testid="calendar-month-count">{monthPosts.length}</p>
          <p className="text-xs text-slate-500">posts planejados</p>
          <div className="mt-4 space-y-2">
            {TASK_STAGES.map((s) => (
              <div key={s} className="flex justify-between text-xs"><span className="text-slate-400">{LABELS[s]}</span><span className="text-slate-200">{monthPosts.filter((t) => t.stage === s).length}</span></div>
            ))}
          </div>
        </Panel>
      </div>
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Editar post" : "Novo post"} fields={taskFields(clients)} initial={edit} onSubmit={save} prefix="post-form"
        extra={<TaskExtra task={edit} api={api} onDelete={remove} canDelete={isManager(me)} />} />
    </div>
  );
}
