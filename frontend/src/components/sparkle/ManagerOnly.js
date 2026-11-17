import { Empty } from "./PageHeader";
import { useMe, isManager } from "@/context/MeContext";

export const ManagerOnly = ({ children }) => {
  const { me } = useMe();
  return isManager(me) ? children : <Empty text="Esta área é restrita a administradores e gerentes." testid="manager-only-forbidden" />;
};
