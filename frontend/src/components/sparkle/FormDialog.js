import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const fieldCls = "bg-[#001524] border-[#003459] text-slate-100 focus-visible:ring-[#EB7300]";

function Field({ f, value, onChange, prefix }) {
  const id = `${prefix}-${f.name}`;
  const common = { id, "data-testid": `${prefix}-${f.name}-input` };
  if (f.type === "select")
    return (
      <select {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`h-10 w-full rounded-md border px-3 text-sm ${fieldCls}`}>
        {f.placeholder !== undefined && <option value="">{f.placeholder}</option>}
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  if (f.type === "textarea") return <Textarea {...common} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={fieldCls} />;
  if (f.type === "checkbox")
    return <input {...common} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[#EB7300]" />;
  if (f.type === "tags")
    return <Input {...common} placeholder="Separe por vírgulas" value={(value || []).join(", ")} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trimStart()).filter((s, i, a) => s || i === a.length - 1))} className={fieldCls} />;
  return <Input {...common} type={f.type || "text"} step={f.type === "number" ? "0.01" : undefined} value={value ?? ""} onChange={(e) => onChange(f.type === "number" ? e.target.value : e.target.value)} className={fieldCls} />;
}

export function FormDialog({ open, onOpenChange, title, fields, initial, onSubmit, prefix = "form", extra }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setValues(initial || {}); }, [open, initial]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const out = { ...values };
    fields.forEach((f) => {
      if (f.type === "number") out[f.name] = Number(out[f.name]) || 0;
      if (f.type === "tags") out[f.name] = (out[f.name] || []).map((s) => s.trim()).filter(Boolean);
    });
    try { await onSubmit(out); onOpenChange(false); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`${prefix}-dialog`} className="bg-[#002138] border-[#003459] text-slate-100 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl text-white">{title}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.name} className={f.full || f.type === "textarea" ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
              <Label htmlFor={`${prefix}-${f.name}`} className="text-xs uppercase tracking-wider text-slate-400">{f.label}{f.required && " *"}</Label>
              <Field f={f} prefix={prefix} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
            </div>
          ))}
          {extra && <div className="sm:col-span-2">{extra}</div>}
          <DialogFooter className="sm:col-span-2 mt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid={`${prefix}-cancel-button`}>Cancelar</Button>
            <Button type="submit" disabled={saving} data-testid={`${prefix}-submit-button`} className="bg-[#EB7300] hover:bg-[#D16600] text-white rounded-full px-6">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
