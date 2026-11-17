import { ChevronLeft, ChevronRight } from "lucide-react";
import { CHANNELS, CHANNEL_COLORS, LABELS } from "@/lib/format";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const monthTitle = (m) => m.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export function MonthNav({ month, setMonth, prefix }) {
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => shift(-1)} data-testid={`${prefix}-prev-month`} className="rounded-full border border-[#003459] p-2 hover:border-[#EB7300]"><ChevronLeft className="h-4 w-4" /></button>
      <span className="min-w-[160px] text-center font-display text-lg capitalize text-white" data-testid={`${prefix}-month-title`}>{monthTitle(month)}</span>
      <button onClick={() => shift(1)} data-testid={`${prefix}-next-month`} className="rounded-full border border-[#003459] p-2 hover:border-[#EB7300]"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

export function MonthCalendar({ month, items, onDayClick, onItemClick, prefix = "cal" }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const todayIso = iso(new Date());
  const byDay = items.reduce((m, t) => ((m[t.publish_date] = m[t.publish_date] || []).push(t), m), {});
  return (
    <div className="overflow-x-auto scroll-thin" data-testid={`${prefix}-grid`}>
      <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-2xl border border-[#003459]">
        {WEEK.map((w) => <div key={w} className="border-b border-[#003459] bg-[#002138] px-3 py-2 text-xs uppercase tracking-wider text-slate-400">{w}</div>)}
        {days.map((d) => {
          const k = iso(d);
          const out = d.getMonth() !== month.getMonth();
          return (
            <div
              key={k}
              data-testid={`${prefix}-day-${k}`}
              onClick={() => onDayClick && onDayClick(k)}
              className={`min-h-[112px] border-b border-r border-[#003459]/70 p-2 transition-colors ${out ? "bg-[#00101c] opacity-50" : "bg-[#001524]"} ${onDayClick ? "cursor-pointer hover:bg-[#002138]" : ""}`}
            >
              <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs ${k === todayIso ? "bg-[#EB7300] text-white" : "text-slate-400"}`}>{d.getDate()}</span>
              <div className="mt-1 space-y-1">
                {(byDay[k] || []).map((t) => (
                  <button
                    key={t.id}
                    data-testid={`${prefix}-item-${t.id}`}
                    onClick={(e) => { e.stopPropagation(); onItemClick && onItemClick(t); }}
                    className="block w-full truncate rounded-md border-l-2 bg-white/5 px-1.5 py-1 text-left text-[11px] text-slate-200 hover:bg-white/10"
                    style={{ borderColor: CHANNEL_COLORS[t.channel] || "#94BAC4" }}
                    title={`${t.title} · ${CHANNELS[t.channel] || ""} · ${LABELS[t.stage]}`}
                  >
                    {t.stage === "concluido" && "✓ "}{t.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
