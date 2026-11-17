import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/react";
import { Toaster } from "@/components/ui/sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import Protected from "@/components/sparkle/Protected";
import AppShell from "@/components/sparkle/AppShell";
import AuthLayout from "@/pages/AuthLayout";
import Site from "@/pages/Site";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Services from "@/pages/Services";
import Contracts from "@/pages/Contracts";
import Finance from "@/pages/Finance";
import Crm from "@/pages/Crm";
import Tasks from "@/pages/Tasks";
import Users from "@/pages/Users";
import Portal from "@/pages/Portal";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <ClerkAuthProvider>
          <Routes>
            <Route path="/" element={<Site />} />
            <Route path="/sign-in/*" element={<AuthLayout><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp fallbackRedirectUrl="/app" /></AuthLayout>} />
            <Route path="/sign-up/*" element={<AuthLayout><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/app" /></AuthLayout>} />
            <Route path="/app" element={<Protected><AppShell /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="clientes" element={<Clients />} />
              <Route path="clientes/:id" element={<ClientDetail />} />
              <Route path="servicos" element={<Services />} />
              <Route path="contratos" element={<Contracts />} />
              <Route path="financeiro" element={<Finance />} />
              <Route path="crm" element={<Crm />} />
              <Route path="tarefas" element={<Tasks />} />
              <Route path="usuarios" element={<Users />} />
            </Route>
            <Route path="/portal" element={<Protected><Portal /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ClerkAuthProvider>
      </BrowserRouter>
      <Toaster theme="dark" position="top-right" richColors />
    </div>
  );
}

export default App;
