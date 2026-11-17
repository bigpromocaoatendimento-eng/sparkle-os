import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useApi, errMsg } from "@/lib/api";
import { LABELS, fmtDate } from "@/lib/format";
import { PageHeader, Panel, Empty } from "@/components/sparkle/PageHeader";
import { useMe } from "@/context/MeContext";

const selCls = "h-9 rounded-md border border-[#003459] bg-[#001524] px-2 text-sm";

export default function Users() {
  const api = useApi();
  const { me, reload } = useMe();
  const [data, setData] = useState(null);
  const [clients, setClients] = useState([]);
  const load = useCallback(() => { api.get("/users").then(setData).catch(() => setData(false)); api.get("/clients").then(setClients); }, [api]);
  useEffect(() => { load(); }, [load]);
  if (data === false) return <Empty text="Apenas administradores podem acessar esta página." testid="users-forbidden" />;
  if (!data) return <p className="text-slate-400">Carregando...</p>;
  const setRole = async (u, role) => {
    try { await api.patch(`/users/${u.user_id}/role`, { role }); toast.success("Papel atualizado"); load(); if (u.user_id === me.user_id) reload(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const setClient = async (u, client_id) => {
    try { await api.patch(`/users/${u.user_id}/client`, { client_id }); toast.success("Vínculo atualizado"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div>
      <PageHeader eyebrow="Acesso" title="Usuários & permissões" description="Novos cadastros entram como Cliente. Promova sua equipe e vincule clientes ao portal." />
      <Panel className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="users-table">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400"><tr className="border-b border-[#003459]">
            <th className="p-4">Usuário</th><th className="p-4">Papel</th><th className="p-4">Cliente vinculado (portal)</th><th className="p-4 hidden md:table-cell">Desde</th></tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.user_id} className="border-b border-[#003459]/60" data-testid={`user-row-${u.user_id}`}>
                <td className="p-4"><p className="text-white">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                <td className="p-4">
                  <select value={u.role} onChange={(e) => setRole(u, e.target.value)} className={selCls} data-testid={`user-role-select-${u.user_id}`}>
                    {data.roles.map((r) => <option key={r} value={r}>{LABELS[r]}</option>)}
                  </select>
                </td>
                <td className="p-4">
                  {u.role === "cliente" ? (
                    <select value={u.client_id || ""} onChange={(e) => setClient(u, e.target.value)} className={selCls} data-testid={`user-client-select-${u.user_id}`}>
                      <option value="">Automático (pelo e-mail)</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : <span className="text-xs text-slate-500">Equipe interna</span>}
                </td>
                <td className="p-4 hidden md:table-cell text-slate-400">{fmtDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
