import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { toast } from "sonner";
import { Check, PenLine, FileText, Download, ArrowLeft } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { brl, fmtDate, LABELS, TASK_STAGES } from "@/lib/format";
import { Panel, StatusBadge, Empty } from "@/components/sparkle/PageHeader";
import { Logo, Star } from "@/components/sparkle/Logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/context/MeContext";
import { downloadFile } from "./ClientDetail";
import { MonthCalendar, MonthNav } from "@/components/sparkle/MonthCalendar";

function ApprovalCard({ t, onDone, api }) {
  const [comment, setComment] = useState("");
  const [mode, setMode] = useState(null);
  const send = async (kind) => {
    try { await api.post(`/portal/tasks/${t.id}/${kind}`, { comment }); toast.success(kind === "approve" ? "Aprovado! Obrigado." : "Pedido de alteração enviado."); onDone(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="rounded-2xl border border-[#FFB703]/30 bg-[#FFB703]/5 p-5" data-testid={`portal-approval-${t.id}`}>
      <p className="font-semibold text-white">{t.title}</p>
      {t.description && <p className="mt-1 text-sm text-slate-300">{t.description}</p>}
      <p className="mt-1 text-xs text-slate-500">Prazo: {fmtDate(t.due_date)}</p>
      {mode === "changes" && <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Descreva as alterações desejadas" className="mt-3 bg-[#001524] border-[#003459]" data-testid={`portal-changes-input-${t.id}`} />}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => send("approve")} data-testid={`portal-approve-${t.id}`} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"><Check className="h-4 w-4 mr-1" /> Aprovar</Button>
        {mode === "changes"
          ? <Button size="sm" onClick={() => send("request-changes")} data-testid={`portal-send-changes-${t.id}`} className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white">Enviar pedido</Button>
          : <Button size="sm" variant="outline" onClick={() => setMode("changes")} data-testid={`portal-request-changes-${t.id}`} className="rounded-full border-[#FFB703]/40 bg-transparent text-[#FFB703]"><PenLine className="h-4 w-4 mr-1" /> Solicitar alteração</Button>}
      </div>
    </div>
  );
}

function PortalCalendar({ tasks }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const posts = tasks.filter((t) => t.publish_date);
  if (!posts.length) return null;
  return (
    <section className="mt-10" data-testid="portal-calendar">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-white">Calendário de conteúdo</h2>
        <MonthNav month={month} setMonth={setMonth} prefix="portal-calendar" />
      </div>
      <MonthCalendar month={month} items={posts} prefix="portal-calendar" />
    </section>
  );
}

function Header({ me, staff }) {
  return (
    <header className="border-b border-[#003459] bg-[#001524]/90 backdrop-blur-md sticky top-0 z-30">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <div className="flex items-center gap-4"><Logo className="h-10" testid="portal-logo" /><span className="hidden text-xs uppercase tracking-[0.3em] text-[#94BAC4] sm:inline">Portal do Cliente</span></div>
        <div className="flex items-center gap-3">
          {staff && <Link to="/app" className="flex items-center gap-1 text-sm text-slate-400 hover:text-white" data-testid="portal-back-to-os"><ArrowLeft className="h-4 w-4" /> Sparkle OS</Link>}
          <span className="hidden text-sm text-slate-300 sm:inline">{me?.name}</span><UserButton />
        </div>
      </div>
    </header>
  );
}

export default function Portal() {
  const api = useApi();
  const { me } = useMe();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [clients, setClients] = useState([]);
  const cid = params.get("client") || "";
  const load = useCallback(() => api.get(`/portal${cid ? `?client_id=${cid}` : ""}`).then(setD), [api, cid]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (d?.staff) api.get("/clients").then(setClients); }, [d?.staff, api]);
  if (!d) return <div className="min-h-screen grid place-items-center bg-[#001524] text-slate-400">Carregando portal...</div>;

  const picker = d.staff && (
    <select value={cid} onChange={(e) => setParams(e.target.value ? { client: e.target.value } : {})} data-testid="portal-client-picker" className="h-10 rounded-full border border-[#003459] bg-[#002138] px-4 text-sm">
      <option value="">Visualizar como cliente...</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );

  if (!d.client) return (
    <div className="min-h-screen bg-[#001524] text-slate-100">
      <Header me={me} staff={d.staff} />
      <div className="mx-auto max-w-xl px-5 py-24 text-center" data-testid="portal-no-client">
        <Star className="h-6 w-6" />
        <h1 className="font-display mt-6 text-3xl text-white">{d.staff ? "Pré-visualize o portal" : "Seu portal está quase pronto"}</h1>
        <p className="mt-4 text-slate-400">{d.staff ? "Escolha um cliente para ver o portal exatamente como ele vê." : "Ainda não encontramos uma conta de cliente vinculada ao seu e-mail. Fale com seu gerente de conta na Sparkle."}</p>
        {picker && <div className="mt-8">{picker}</div>}
      </div>
    </div>
  );

  const pending = d.tasks.filter((t) => t.stage === "aprovacao");
  const done = d.tasks.filter((t) => t.stage === "concluido").length;
  return (
    <div className="min-h-screen bg-[#001524] text-slate-100" data-testid="portal-page">
      <Header me={me} staff={d.staff} />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between rise">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#94BAC4]"><Star className="w-2.5 h-2.5" /> Bem-vindo(a)</p>
            <h1 className="font-display mt-3 text-4xl text-white sm:text-5xl" data-testid="portal-client-name">{d.client.name}</h1>
            <p className="font-serif-accent mt-2 italic text-slate-400">Acompanhe projetos, aprove entregas e acesse seus arquivos.</p>
          </div>
          {picker}
        </div>

        <div className="mt-10 grid grid-cols-3 gap-4">
          {[["Aguardando você", pending.length, "text-[#FFB703]"], ["Em produção", d.tasks.length - done - pending.length, "text-[#94BAC4]"], ["Entregues", done, "text-emerald-300"]].map(([l, v, c]) => (
            <Panel key={l} className="p-5"><p className="text-xs uppercase text-slate-400">{l}</p><p className={`mt-2 text-3xl font-bold ${c}`}>{v}</p></Panel>
          ))}
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-white">Aprovações pendentes</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {pending.length === 0 ? <Empty text="Nada aguardando sua aprovação." testid="portal-no-approvals" /> : pending.map((t) => <ApprovalCard key={t.id} t={t} api={api} onDone={load} />)}
          </div>
        </section>

        <PortalCalendar tasks={d.tasks} />

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Panel className="p-6" data-testid="portal-timeline">
            <h2 className="font-semibold text-white">Projetos & entregas</h2>
            <div className="mt-4 space-y-4">
              {d.tasks.length === 0 && <Empty text="Nenhum projeto ainda." />}
              {d.tasks.map((t) => (
                <div key={t.id} className="border-l-2 border-[#003459] pl-4">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-200">{t.title}</p><StatusBadge value={t.stage} label={LABELS[t.stage]} /></div>
                  <div className="mt-2 h-1.5 rounded-full bg-[#001524]"><div className="h-1.5 rounded-full bg-[#EB7300]" style={{ width: `${((TASK_STAGES.indexOf(t.stage) + 1) / TASK_STAGES.length) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </Panel>
          <div className="space-y-6">
            <Panel className="p-6" data-testid="portal-invoices">
              <h2 className="font-semibold text-white">Faturas</h2>
              <div className="mt-3 divide-y divide-[#003459]">
                {d.invoices.length === 0 && <Empty text="Nenhuma fatura." />}
                {d.invoices.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                    <span className="text-slate-300">{i.description}<span className="block text-xs text-slate-500">Venc. {fmtDate(i.due_date)}</span></span>
                    <span className="flex items-center gap-3"><span className="font-medium">{brl(i.amount)}</span><StatusBadge value={i.status} label={LABELS[i.status]} /></span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel className="p-6" data-testid="portal-files">
              <h2 className="font-semibold text-white">Arquivos</h2>
              <div className="mt-3 divide-y divide-[#003459]">
                {d.files.length === 0 && <Empty text="Nenhum arquivo compartilhado." />}
                {d.files.map((f) => (
                  <button key={f.id} onClick={() => downloadFile(api, f)} className="flex w-full items-center gap-3 py-3 text-left text-sm hover:text-[#FFB703]" data-testid={`portal-file-${f.id}`}>
                    <FileText className="h-4 w-4 text-[#94BAC4]" /><span className="flex-1 truncate">{f.original_filename}</span><Download className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </Panel>
            {d.contracts.length > 0 && (
              <Panel className="p-6" data-testid="portal-contracts">
                <h2 className="font-semibold text-white">Contratos</h2>
                {d.contracts.map((c) => <div key={c.id} className="mt-3 flex justify-between text-sm"><span>{c.title}</span><StatusBadge value={c.status} label={LABELS[c.status]} /></div>)}
              </Panel>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
