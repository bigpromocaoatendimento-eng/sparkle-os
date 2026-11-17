import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useApi } from "@/lib/api";

const MeContext = createContext(null);

export function MeProvider({ children }) {
  const api = useApi();
  const [me, setMe] = useState(null);
  const [error, setError] = useState(false);
  const reload = useCallback(() => api.get("/me").then(setMe).catch(() => setError(true)), [api]);
  useEffect(() => { reload(); }, [reload]);
  return <MeContext.Provider value={{ me, reload, error }}>{children}</MeContext.Provider>;
}

export const useMe = () => useContext(MeContext);

export const isManager = (me) => ["admin", "gerente"].includes(me?.role);
export const isStaff = (me) => ["admin", "gerente", "criativo"].includes(me?.role);
