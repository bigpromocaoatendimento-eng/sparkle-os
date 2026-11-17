import { useMemo, useRef } from "react";
import axios from "axios";
import { useAuth } from "@clerk/react";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export function useApi() {
  const { getToken } = useAuth();
  const ref = useRef(getToken);
  ref.current = getToken;
  return useMemo(() => {
    const call = async (method, url, data, cfg = {}) => {
      const token = await ref.current();
      const res = await axios({ method, url: `${API}${url}`, data, ...cfg, headers: { Authorization: `Bearer ${token}`, ...(cfg.headers || {}) } });
      return res.data;
    };
    return {
      get: (u, c) => call("get", u, undefined, c),
      post: (u, d, c) => call("post", u, d, c),
      patch: (u, d) => call("patch", u, d),
      del: (u) => call("delete", u),
    };
  }, []);
}

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (Array.isArray(d)) return "Verifique os campos obrigatórios.";
  return d || "Algo deu errado. Tente novamente.";
};
