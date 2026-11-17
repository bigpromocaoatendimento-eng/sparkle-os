import { Star } from "./Logo";

export const PageHeader = ({ eyebrow, title, description, children }) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8 rise">
    <div>
      {eyebrow && (
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#94BAC4] mb-2">
          <Star className="w-2.5 h-2.5" /> {eyebrow}
        </p>
      )}
      <h1 className="font-display text-3xl sm:text-4xl text-white" data-testid="page-title">{title}</h1>
      {description && <p className="text-sm text-slate-400 mt-2 max-w-xl">{description}</p>}
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);

const TONES = {
  ativo: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  pago: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  ganho: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  concluido: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  pendente: "bg-[#FFB703]/15 text-[#FFB703] border-[#FFB703]/30",
  aprovacao: "bg-[#FFB703]/15 text-[#FFB703] border-[#FFB703]/30",
  prospeccao: "bg-[#94BAC4]/15 text-[#94BAC4] border-[#94BAC4]/30",
  rascunho: "bg-[#94BAC4]/15 text-[#94BAC4] border-[#94BAC4]/30",
  atrasado: "bg-red-500/15 text-red-300 border-red-500/30",
  perdido: "bg-red-500/15 text-red-300 border-red-500/30",
  cancelado: "bg-red-500/15 text-red-300 border-red-500/30",
  alta: "bg-[#EB7300]/15 text-[#EB7300] border-[#EB7300]/30",
};

export const StatusBadge = ({ value, label, testid }) => (
  <span data-testid={testid} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[value] || "bg-white/5 text-slate-300 border-white/10"}`}>
    {label || value}
  </span>
);

export const Panel = ({ className = "", children, ...rest }) => (
  <div className={`rounded-2xl border border-[#003459] bg-[#002138]/80 ${className}`} {...rest}>{children}</div>
);

export const Empty = ({ text, testid }) => (
  <div data-testid={testid} className="py-14 text-center text-sm text-slate-400">{text}</div>
);
