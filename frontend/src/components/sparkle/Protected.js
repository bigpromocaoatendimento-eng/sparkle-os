import { Navigate } from "react-router-dom";
import { Show } from "@clerk/react";
import { MeProvider } from "@/context/MeContext";

export default function Protected({ children }) {
  return (
    <>
      <Show when="signed-in"><MeProvider>{children}</MeProvider></Show>
      <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
    </>
  );
}
