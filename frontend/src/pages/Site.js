import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowRight, Sparkles, Megaphone, PenTool, Video, LineChart, Layers, Mail, Phone, Instagram } from "lucide-react";
import { Logo, Star } from "@/components/sparkle/Logo";
import { API, errMsg } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const IMG = {
  hero: "https://images.unsplash.com/photo-1765371515218-0a4c992ba8e2?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600",
  team: "https://images.unsplash.com/photo-1622675363311-3e1904dc1885?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
  work: "https://images.pexels.com/photos/8117415/pexels-photo-8117415.jpeg?auto=compress&cs=tinysrgb&w=1200",
};
const ICONS = { "Social Media": Megaphone, Performance: LineChart, Branding: PenTool, Audiovisual: Video, Pacote: Layers };

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#003459]/60 bg-[#001524]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
        <a href="#top" data-testid="site-logo-link"><Logo className="h-11" testid="site-logo" /></a>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          {[["servicos", "Serviços"], ["sobre", "Sobre"], ["processo", "Processo"], ["contato", "Contato"]].map(([id, l]) => (
            <a key={id} href={`#${id}`} data-testid={`site-nav-${id}`} className="transition-colors hover:text-[#FFB703]">{l}</a>
          ))}
        </nav>
        <Link to="/app" data-testid="site-access-os-button" className="rounded-full bg-[#EB7300] px-5 py-2 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#D16600]">
          Acessar Sparkle OS
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden grain">
      <div className="absolute -right-40 top-10 h-[520px] w-[520px] rounded-full bg-[#EB7300]/20 blur-[120px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-32">
        <div className="relative">
          <p className="rise flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-[#94BAC4]"><Star /> Agência de marketing</p>
          <h1 className="rise font-display mt-6 text-4xl leading-[1.08] text-white sm:text-5xl lg:text-6xl" style={{ animationDelay: "80ms" }}>
            Marcas que brilham.<br />Estratégias que <span className="text-[#EB7300]">conectam</span>.
          </h1>
          <p className="rise font-serif-accent mt-8 max-w-xl text-lg italic leading-relaxed text-slate-300" style={{ animationDelay: "160ms" }}>
            Social media, tráfego pago, branding e produção audiovisual com método, dados e criatividade — para negócios que querem crescer de verdade.
          </p>
          <div className="rise mt-10 flex flex-wrap gap-4" style={{ animationDelay: "240ms" }}>
            <a href="#contato" data-testid="hero-cta-contact" className="group inline-flex items-center gap-2 rounded-full bg-[#EB7300] px-7 py-3.5 font-semibold text-white transition-colors hover:bg-[#D16600]">
              Quero um diagnóstico <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a href="#servicos" data-testid="hero-cta-services" className="rounded-full border border-[#94BAC4]/40 px-7 py-3.5 text-[#94BAC4] transition-colors hover:border-[#FFB703] hover:text-[#FFB703]">Ver serviços</a>
          </div>
        </div>
        <div className="rise relative" style={{ animationDelay: "200ms" }}>
          <img src={IMG.hero} alt="Equipe criativa" className="aspect-[4/5] w-full rounded-[2rem] object-cover" />
          <div className="absolute -bottom-6 -left-6 rounded-2xl border border-[#003459] bg-[#002138]/90 p-5 backdrop-blur-md">
            <p className="font-display text-3xl text-[#FFB703]">+120</p>
            <p className="text-xs text-slate-300">campanhas entregues</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Services() {
  const [items, setItems] = useState([]);
  useEffect(() => { axios.get(`${API}/public/services`).then((r) => setItems(r.data)).catch(() => {}); }, []);
  return (
    <section id="servicos" className="border-t border-[#003459]/60 bg-[#00101c] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#94BAC4]"><Star /> Serviços</p>
        <h2 className="font-display mt-4 max-w-2xl text-3xl text-white sm:text-4xl">Tudo o que sua marca precisa para crescer.</h2>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((s, i) => {
            const Icon = ICONS[s.category] || Sparkles;
            return (
              <div key={s.id} data-testid={`site-service-card-${i}`} className={`group rounded-3xl border border-[#003459] bg-[#002138]/70 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[#EB7300]/60 ${i === 0 ? "lg:row-span-2" : ""}`}>
                <Icon className="h-7 w-7 text-[#EB7300]" />
                <p className="mt-6 text-xs uppercase tracking-widest text-[#94BAC4]">{s.category}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{s.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{s.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {(s.deliverables || []).map((d) => <span key={d} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{d}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="sobre" className="py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
        <img src={IMG.team} alt="Time Sparkle" className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#94BAC4]"><Star /> Sobre a Sparkle</p>
          <h2 className="font-display mt-4 text-3xl text-white sm:text-4xl">Inovação que conecta pessoas, marcas e resultados.</h2>
          <p className="mt-6 leading-relaxed text-slate-300">Somos uma agência que une estratégia, criatividade e tecnologia. Cada cliente tem um time dedicado, processos claros e acompanhamento em tempo real pelo nosso portal exclusivo.</p>
          <div className="mt-10 grid grid-cols-3 gap-6">
            {[["98%", "clientes satisfeitos"], ["3x", "média de alcance"], ["24h", "tempo de resposta"]].map(([n, l]) => (
              <div key={l}><p className="font-display text-3xl text-[#FFB703]">{n}</p><p className="mt-1 text-xs text-slate-400">{l}</p></div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Process() {
  const steps = [["Diagnóstico", "Entendemos seu negócio, público e concorrência."], ["Estratégia", "Plano de ação com metas e canais claros."], ["Criação", "Conteúdo e campanhas com a cara da sua marca."], ["Resultados", "Relatórios, ajustes e crescimento contínuo."]];
  return (
    <section id="processo" className="border-y border-[#003459]/60 bg-[#00101c] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 className="font-display text-3xl text-white sm:text-4xl">Nosso processo</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-4">
          {steps.map(([t, d], i) => (
            <div key={t} className="relative border-t border-[#EB7300]/40 pt-6">
              <span className="font-display text-5xl text-[#003459]">0{i + 1}</span>
              <h3 className="mt-2 text-lg font-semibold text-white">{t}</h3>
              <p className="mt-2 text-sm text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const empty = { name: "", email: "", phone: "", company: "", service: "", message: "" };
  const [f, setF] = useState(empty);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try { await axios.post(`${API}/public/contact`, f); setSent(true); setF(empty); toast.success("Mensagem enviada! Retornaremos em breve."); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setSending(false); }
  };
  const cls = "bg-[#001524] border-[#003459] text-slate-100 h-12";
  return (
    <section id="contato" className="py-24">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#94BAC4]"><Star /> Contato</p>
          <h2 className="font-display mt-4 text-3xl text-white sm:text-4xl">Vamos fazer sua marca brilhar?</h2>
          <p className="font-serif-accent mt-6 italic text-slate-300">Conte um pouco sobre seu negócio. Nosso time responde em até 24h úteis.</p>
          <div className="mt-10 space-y-4 text-sm text-slate-300">
            <p className="flex items-center gap-3"><Mail className="h-4 w-4 text-[#EB7300]" /> sparkleag.marketing@gmail.com</p>
            <p className="flex items-center gap-3"><Phone className="h-4 w-4 text-[#EB7300]" /> (00) 00000-0000</p>
            <p className="flex items-center gap-3"><Instagram className="h-4 w-4 text-[#EB7300]" /> @agenciasparkle</p>
          </div>
          <img src={IMG.work} alt="Reunião de estratégia" className="mt-10 hidden aspect-video w-full rounded-3xl object-cover lg:block" />
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-[#003459] bg-[#002138]/70 p-6 sm:p-10" data-testid="contact-form">
          {sent && <p data-testid="contact-success" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">Recebemos sua mensagem! Em breve entraremos em contato.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input required placeholder="Seu nome *" value={f.name} onChange={set("name")} className={cls} data-testid="contact-name-input" />
            <Input required type="email" placeholder="E-mail *" value={f.email} onChange={set("email")} className={cls} data-testid="contact-email-input" />
            <Input placeholder="WhatsApp" value={f.phone} onChange={set("phone")} className={cls} data-testid="contact-phone-input" />
            <Input placeholder="Empresa" value={f.company} onChange={set("company")} className={cls} data-testid="contact-company-input" />
          </div>
          <select value={f.service} onChange={set("service")} data-testid="contact-service-select" className={`w-full rounded-md border px-3 text-sm ${cls}`}>
            <option value="">Serviço de interesse</option>
            {["Social Media", "Tráfego Pago", "Branding", "Audiovisual", "Full Service"].map((s) => <option key={s}>{s}</option>)}
          </select>
          <Textarea rows={5} placeholder="Conte sobre seu projeto" value={f.message} onChange={set("message")} className="bg-[#001524] border-[#003459] text-slate-100" data-testid="contact-message-input" />
          <button disabled={sending} data-testid="contact-submit-button" className="w-full rounded-full bg-[#EB7300] py-3.5 font-semibold text-white transition-colors hover:bg-[#D16600] disabled:opacity-60">
            {sending ? "Enviando..." : "Enviar mensagem"}
          </button>
        </form>
      </div>
    </section>
  );
}

export default function Site() {
  return (
    <div className="min-h-screen bg-[#001524] text-slate-100" data-testid="public-site">
      <Nav />
      <Hero />
      <Services />
      <About />
      <Process />
      <Contact />
      <footer className="border-t border-[#003459] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 sm:flex-row sm:px-8">
          <Logo className="h-10" testid="footer-logo" />
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Agência Sparkle · Inovação que conecta</p>
        </div>
      </footer>
    </div>
  );
}
