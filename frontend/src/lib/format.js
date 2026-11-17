export const brl = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDate = (s) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const today = () => new Date().toISOString().slice(0, 10);

export const txStatus = (t) => (t.status === "pendente" && t.due_date && t.due_date < today() ? "atrasado" : t.status);

export const LABELS = {
  ativo: "Ativo", inativo: "Inativo", prospeccao: "Em prospecção",
  rascunho: "Rascunho", encerrado: "Encerrado", cancelado: "Cancelado",
  pendente: "Pendente", pago: "Pago", atrasado: "Atrasado",
  novo: "Novo lead", qualificacao: "Qualificação", proposta: "Proposta", negociacao: "Negociação", ganho: "Ganho", perdido: "Perdido",
  briefing: "Briefing", criacao: "Em criação", revisao: "Revisão interna", aprovacao: "Aprovação cliente", concluido: "Concluído",
  baixa: "Baixa", media: "Média", alta: "Alta",
  admin: "Administrador", gerente: "Gerente de conta", criativo: "Criativo", cliente: "Cliente",
  mensal: "Mensal", unico: "Projeto único", receber: "A receber", pagar: "A pagar",
};

export const opts = (keys) => keys.map((k) => ({ value: k, label: LABELS[k] || k }));

export const LEAD_STAGES = ["novo", "qualificacao", "proposta", "negociacao", "ganho", "perdido"];
export const TASK_STAGES = ["briefing", "criacao", "revisao", "aprovacao", "concluido"];
