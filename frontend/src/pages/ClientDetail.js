import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, Download, Trash2, Pencil, MonitorSmartphone } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { brl, fmtDate, LABELS, txStatus } from "@/lib/format";
import { PageHeader, Panel, StatusBadge, Empty } from "@/components/sparkle/PageHeader";
import { FormDialog } from "@/components/sparkle/FormDialog";
import { Button } from "@/components/ui/button";
import { CLIENT_FIELDS } from "./Clients";
import { useMe, isManager } from "@/context/MeContext";

export const downloadFile = async (api, f) => {
  try {
    const blob = await api.get(`/files/${f.id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = f.original_filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast.error("Não foi possível baixar o arquivo"); }
};

function FilesPanel({ clientId }) {
  const api = useApi();
  const { me } = useMe();
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const load = useCallback(() => api.get(`/files?client_id=${clientId}`).then(setFiles), [api, clientId]);
  useEffect(() => { load(); }, [load]);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file); fd.append("client_id", clientId);
    setBusy(true);
    try { await api.post("/files", fd); toast.success("Arquivo enviado"); load(); } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); e.target.value = ""; }
  };
  const remove = async (f) => { await api.del(`/files/${f.id}`); load(); };
  return (
    <Panel className="p-6" data-testid="client-files-panel">
      <div className="flex items-center justify-between"><h2 className="font-semibold text-white">Arquivos</h2>
        <input ref={input} type="file" className="hidden" onChange={upload} data-testid="client-file-input" />
        <Button size="sm" disabled={busy} onClick={() => input.current.click()} data-testid="client-upload-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Upload className="h-4 w-4 mr-1" />{busy ? "Enviando..." : "Enviar"}</Button>
      </div>
      <div className="mt-4 divide-y divide-[#003459]">
        {files.length === 0 && <Empty text="Nenhum arquivo enviado." testid="client-files-empty" />}
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 py-3" data-testid={`client-file-${f.id}`}>
            <FileText className="h-4 w-4 text-[#94BAC4]" />
            <span className="flex-1 truncate text-sm text-slate-200">{f.original_filename}</span>
            <span className="text-xs text-slate-500">{(f.size / 1024).toFixed(0)} KB</span>
            <button onClick={() => downloadFile(api, f)} className="p-1.5 text-slate-400 hover:text-white" data-testid={`client-file-download-${f.id}`}><Download className="h-4 w-4" /></button>
            {isManager(me) && <button onClick={() => remove(f)} className="p-1.5 text-slate-400 hover:text-red-400" data-testid={`client-file-delete-${f.id}`}><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

const List = ({ title, items, render, testid }) => (
  <Panel className="p-6" data-testid={testid}>
    <h2 className="font-semibold text-white">{title}</h2>
    <div className="mt-3 divide-y divide-[#003459]">{items.length ? items.map(render) : <Empty text="Nada por aqui ainda." />}</div>
  </Panel>
);

export default function ClientDetail() {
  const { id } = useParams();
  const api = useApi();
  const { me } = useMe();
  const [c, setC] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [txs, setTxs] = useState([]);
  const [edit, setEdit] = useState(false);
  const load = useCallback(async () => {
    const all = await api.get("/clients");
    setC(all.find((x) => x.id === id) || false);
    api.get(`/tasks?client_id=${id}`).then(setTasks);
    if (isManager(me)) api.get(`/transactions?client_id=${id}`).then(setTxs);
  }, [api, id, me]);
  useEffect(() => { load(); }, [load]);
  if (c === null) return <p className="text-slate-400">Carregando...</p>;
  if (c === false) return <Empty text="Cliente não encontrado." />;
  const save = async (v) => { try { await api.patch(`/clients/${id}`, v); toast.success("Cliente atualizado"); load(); } catch (e) { toast.error(errMsg(e)); throw e; } };
  return (
    <div>
      <Link to="/app/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white" data-testid="client-back-link"><ArrowLeft className="h-4 w-4" /> Clientes</Link>
      <PageHeader eyebrow={c.segment || "Cliente"} title={c.name} description={c.company}>
        <Link to={`/portal?client=${id}`} data-testid="client-view-portal"><Button variant="outline" className="rounded-full border-[#003459] bg-transparent"><MonitorSmartphone className="h-4 w-4 mr-1" /> Ver portal</Button></Link>
        <Button onClick={() => setEdit(true)} data-testid="client-detail-edit-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white"><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="p-6 space-y-3 text-sm" data-testid="client-info-panel">
          <StatusBadge value={c.status} label={LABELS[c.status]} />
          {[["E-mail", c.email], ["Telefone", c.phone], ["Documento", c.document], ["Responsável", c.account_manager], ["Mensalidade", brl(c.monthly_fee)]].map(([l, v]) => (
            <div key={l}><p className="text-xs uppercase tracking-wider text-slate-500">{l}</p><p className="text-slate-200">{v || "—"}</p></div>
          ))}
          {c.notes && <p className="whitespace-pre-line border-t border-[#003459] pt-3 text-slate-400">{c.notes}</p>}
        </Panel>
        <div className="space-y-6 lg:col-span-2">
          <List title="Tarefas" items={tasks} testid="client-tasks-panel" render={(t) => (
            <div key={t.id} className="flex items-center justify-between py-3"><span className="text-sm text-slate-200">{t.title}</span><StatusBadge value={t.stage} label={LABELS[t.stage]} /></div>)} />
          {isManager(me) && <List title="Financeiro" items={txs} testid="client-finance-panel" render={(t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-3"><span className="text-sm text-slate-200">{t.description}</span>
              <div className="flex items-center gap-3"><span className="text-sm">{brl(t.amount)}</span><span className="text-xs text-slate-500">{fmtDate(t.due_date)}</span><StatusBadge value={txStatus(t)} label={LABELS[txStatus(t)]} /></div></div>)} />}
          <FilesPanel clientId={id} />
        </div>
      </div>
      <FormDialog open={edit} onOpenChange={setEdit} title="Editar cliente" fields={CLIENT_FIELDS} initial={c} onSubmit={save} prefix="client-detail-form" />
    </div>
  );
}
