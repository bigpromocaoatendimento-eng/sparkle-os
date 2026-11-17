import { useState } from "react";
import { LABELS } from "@/lib/format";

export function Kanban({ stages, items, onMove, renderCard, prefix, accent = {} }) {
  const [over, setOver] = useState(null);
  const drop = (e, stage) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const item = items.find((i) => i.id === id);
    if (item && item.stage !== stage) onMove(item, stage);
  };
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scroll-thin" data-testid={`${prefix}-board`}>
      {stages.map((s) => {
        const col = items.filter((i) => i.stage === s);
        return (
          <div
            key={s}
            data-testid={`${prefix}-column-${s}`}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e, s)}
            className={`min-w-[270px] w-[270px] shrink-0 rounded-2xl border p-3 transition-colors duration-200 ${over === s ? "border-[#EB7300] bg-[#EB7300]/5" : "border-[#003459] bg-[#002138]/60"}`}
          >
            <div className="flex items-center justify-between px-1 pb-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span className="h-2 w-2 rounded-full" style={{ background: accent[s] || "#94BAC4" }} />
                {LABELS[s]}
              </span>
              <span className="text-xs text-slate-500" data-testid={`${prefix}-count-${s}`}>{col.length}</span>
            </div>
            <div className="space-y-3 min-h-[80px]">
              {col.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  {renderCard(item)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
