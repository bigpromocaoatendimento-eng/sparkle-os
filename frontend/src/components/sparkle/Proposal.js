import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileText, Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errMsg } from "@/lib/api";
import { brl, fmtDate, LABELS } from "@/lib/format";

const cls = "bg-[#001524] border-[#003459] text-slate-100";

export const openPdf = async (api, p) => {
  try {
    const blob = await api.get(`/proposals/${p.id}/pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Proposta-Sparkle-${p.id.slice(0, 6).toUpperCase()}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch { toast.error("Não foi possível gerar o PDF"); }
};

export function ProposalList({ api, lead, refreshKey, onNew }) {
  const [items, setItems] = useState([]);
  useEffect(() => { if (lead?.id) api.get(`/proposals?lead_id=${lead.id}`).then(setItems); }, [api, lead?.id, refreshKey]);
  return (
    <div className="space-y-2" data-testid="lead-proposals">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-slate-400">Propostas</p>
        <Button type="button" size="sm" onClick={onNew} data-testid="lead-new-proposal-button" className="rounded-full bg-[#FFB703] hover:bg-[#e5a400] text-[#001524]"><FileText className="h-4 w-4 mr-1" /> Gerar proposta</Button>
      </div>
      {items.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-lg border border-[#003459] px-3 py-2 text-sm" data-testid={`proposal-row-${p.id}`}>
          <span className="text-slate-200">Nº {p.id.slice(0, 6).toUpperCase()} · {fmtDate(p.created_at)} · {p.items.length} itens</span>
          <button type="button" onClick={() => openPdf(api, p)} className="flex items-center gap-1 text-[#FFB703] hover:underline" data-testid={`proposal-pdf-${p.id}`}><FileDown className="h-4 w-4" /> PDF</button>
        </div>
      ))}
    </div>
  );
}

export function ProposalDialog({ open, onOpenChange, api, lead, onCreated }) {
  const [services, setServices] = useState([]);
  const [qty, setQty] = useState({});
  const [f, setF] = useState({ title: "", intro: "", discount: 0, validity_days: 15, notes: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get("/services").then((s) => setServices(s.filter((x) => x.active)));
    setQty({});
    setF({ title: `Proposta de serviços · ${lead?.company || lead?.name || ""}`, intro: "Apresentamos a seguir a solução da Agência Sparkle pensada para os objetivos da sua marca.", discount: 0, validity_days: 15, notes: "Pagamento mensal via boleto ou PIX, com vencimento no dia 10. Contrato mínimo de 3 meses para serviços recorrentes." });
  }, [open, api, lead]);
  const chosen = services.filter((s) => qty[s.id] > 0);
  const totals = useMemo(() => chosen.reduce((t, s) => ({ ...t, [s.billing]: (t[s.billing] || 0) + s.price * qty[s.id] }), {}), [chosen, qty]);
  const disc = Number(f.discount) || 0;
  const setQ = (id, n) => setQty((q) => ({ ...q, [id]: Math.max(0, n) }));

  const submit = async () => {
    if (!chosen.length) return toast.error("Escolha ao menos um serviço");
    setSaving(true);
    try {
      const p = await api.post("/proposals", {
        lead_id: lead.id, title: f.title, intro: f.intro, notes: f.notes, discount: disc, validity_days: Number(f.validity_days) || 15,
        items: chosen.map((s) => ({ service_id: s.id, name: s.name, price: s.price, billing: s.billing, qty: qty[s.id] })),
      });
      toast.success("Proposta criada! Baixando PDF...");
      await openPdf(api, p);
      onCreated && onCreated(p);
      onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="proposal-dialog" className="bg-[#002138] border-[#003459] text-slate-100 max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl text-white">Nova proposta · {lead?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={cls} data-testid="proposal-title-input" placeholder="Título" />
          <Textarea rows={2} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} className={cls} data-testid="proposal-intro-input" placeholder="Introdução" />
          <p className="text-xs uppercase tracking-wider text-slate-400">Serviços do catálogo</p>
          <div className="space-y-2">
            {services.map((s) => (
              <div key={s.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${qty[s.id] > 0 ? "border-[#EB7300]/60 bg-[#EB7300]/5" : "border-[#003459]"}`} data-testid={`proposal-service-${s.id}`}>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{s.name}</p><p className="text-xs text-slate-400">{brl(s.price)} · {LABELS[s.billing]}</p></div>
                <button type="button" onClick={() => setQ(s.id, (qty[s.id] || 0) - 1)} className="rounded-full border border-[#003459] p-1" data-testid={`proposal-qty-minus-${s.id}`}><Minus className="h-3 w-3" /></button>
                <span className="w-5 text-center text-sm" data-testid={`proposal-qty-${s.id}`}>{qty[s.id] || 0}</span>
                <button type="button" onClick={() => setQ(s.id, (qty[s.id] || 0) + 1)} className="rounded-full border border-[#003459] p-1" data-testid={`proposal-qty-plus-${s.id}`}><Plus className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-slate-400">Desconto (%)<Input type="number" min="0" max="100" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} className={`mt-1 ${cls}`} data-testid="proposal-discount-input" /></label>
            <label className="text-xs text-slate-400">Validade (dias)<Input type="number" min="1" value={f.validity_days} onChange={(e) => setF({ ...f, validity_days: e.target.value })} className={`mt-1 ${cls}`} data-testid="proposal-validity-input" /></label>
          </div>
          <Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={cls} data-testid="proposal-notes-input" placeholder="Condições e observações" />
          <div className="rounded-xl border border-[#003459] bg-[#001524] p-4 text-sm" data-testid="proposal-totals">
            {["mensal", "unico"].map((b) => totals[b] ? (
              <div key={b} className="flex justify-between"><span className="text-slate-400">{b === "mensal" ? "Investimento mensal" : "Investimento único"}</span><span className="font-semibold text-[#FFB703]">{brl(totals[b] * (1 - disc / 100))}</span></div>
            ) : null)}
            {!chosen.length && <p className="text-slate-500">Adicione serviços para ver o total.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="proposal-cancel-button">Cancelar</Button>
          <Button disabled={saving} onClick={submit} data-testid="proposal-submit-button" className="rounded-full bg-[#EB7300] hover:bg-[#D16600] text-white">{saving ? "Gerando..." : "Gerar PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
