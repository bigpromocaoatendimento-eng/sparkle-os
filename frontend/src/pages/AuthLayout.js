import { Link } from "react-router-dom";
import { Logo, Star } from "@/components/sparkle/Logo";

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#001524] grid lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-[#003459] p-12 grain">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#EB7300]/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-[#94BAC4]/10 blur-3xl" />
        <Link to="/" className="relative"><Logo className="h-16" testid="auth-logo" /></Link>
        <div className="relative max-w-md">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#94BAC4]"><Star /> Sparkle OS</p>
          <h1 className="font-display mt-4 text-5xl leading-tight text-white">A central de comando da sua agência.</h1>
          <p className="font-serif-accent mt-6 text-lg italic text-slate-300">Clientes, contratos, finanças, CRM e produção criativa — conectados em um só lugar.</p>
        </div>
        <p className="relative text-xs text-slate-500">© Agência Sparkle · Inovação que conecta</p>
      </div>
      <div className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <Link to="/" className="lg:hidden"><Logo className="h-12" testid="auth-logo-mobile" /></Link>
        {children}
      </div>
    </div>
  );
}
