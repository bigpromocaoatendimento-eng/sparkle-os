from datetime import date, timedelta
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether

ASSETS = Path(__file__).parent / "assets"
pdfmetrics.registerFont(TTFont("Marcellus", str(ASSETS / "MarcellusSC.ttf")))

NAVY = colors.HexColor("#001524")
ORANGE = colors.HexColor("#EB7300")
YELLOW = colors.HexColor("#FFB703")
BLUE = colors.HexColor("#94BAC4")
SLATE = colors.HexColor("#475569")
LIGHT = colors.HexColor("#F1F5F9")

S = {
    "h": ParagraphStyle("h", fontName="Marcellus", fontSize=20, leading=26, textColor=NAVY),
    "h2": ParagraphStyle("h2", fontName="Marcellus", fontSize=13, leading=18, textColor=NAVY, spaceBefore=6),
    "b": ParagraphStyle("b", fontName="Helvetica", fontSize=9.5, leading=14, textColor=SLATE),
    "bw": ParagraphStyle("bw", fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=NAVY),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=11, textColor=SLATE),
    "r": ParagraphStyle("r", fontName="Helvetica", fontSize=9.5, leading=13, textColor=NAVY, alignment=TA_RIGHT),
    "rb": ParagraphStyle("rb", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=NAVY, alignment=TA_RIGHT),
}


def brl(v: float) -> str:
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def _esc(t: str) -> str:
    return (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def fmt_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def build_proposal_pdf(p: dict, lead: dict, deliverables: dict) -> bytes:
    created = date.fromisoformat(p["created_at"][:10])
    number = p["id"][:6].upper()
    buf = BytesIO()

    def header_footer(c, doc):
        w, h = A4
        c.saveState()
        c.setFillColor(NAVY)
        c.rect(0, h - 42 * mm, w, 42 * mm, fill=1, stroke=0)
        c.drawImage(str(ASSETS / "logo.png"), 16 * mm, h - 34 * mm, width=62 * mm, height=25.5 * mm, mask="auto", preserveAspectRatio=True)
        c.setFillColor(colors.white)
        c.setFont("Marcellus", 16)
        c.drawRightString(w - 16 * mm, h - 19 * mm, "Proposta Comercial")
        c.setFillColor(BLUE)
        c.setFont("Helvetica", 9)
        c.drawRightString(w - 16 * mm, h - 26 * mm, f"Nº {number}  ·  {fmt_date(created)}")
        c.setFillColor(ORANGE)
        c.rect(0, h - 43.5 * mm, w, 1.5 * mm, fill=1, stroke=0)
        c.setFillColor(SLATE)
        c.setFont("Helvetica", 7.5)
        c.drawString(16 * mm, 10 * mm, "Agência Sparkle · Inovação que conecta · sparkleag.marketing@gmail.com")
        c.drawRightString(w - 16 * mm, 10 * mm, f"Página {doc.page}")
        c.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=52 * mm, bottomMargin=20 * mm,
                            title=f"Proposta {number} - {lead.get('company') or lead.get('name')}", author="Agência Sparkle")
    story = []
    to_lines = [f"<b>{_esc(lead.get('name'))}</b>"] + [_esc(x) for x in (lead.get("company"), lead.get("email"), lead.get("phone")) if x]
    story.append(Table([[Paragraph("PREPARADA PARA", S["small"]), Paragraph("VALIDADE", S["small"])],
                        [Paragraph("<br/>".join(to_lines), S["b"]),
                         Paragraph(f"Até <b>{fmt_date(created + timedelta(days=int(p.get('validity_days') or 15)))}</b>", S["b"])]],
                       colWidths=[120 * mm, 58 * mm], style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [Spacer(1, 8 * mm), Paragraph(_esc(p.get("title") or "Proposta de serviços"), S["h"]), Spacer(1, 2 * mm)]
    if p.get("intro"):
        story.append(Paragraph(_esc(p["intro"]).replace("\n", "<br/>"), S["b"]))
    story.append(Spacer(1, 6 * mm))

    rows = [[Paragraph(x, S["bw"]) for x in ("Serviço", "Cobrança", "Qtd", "Valor unit.", "Subtotal")]]
    totals = {"mensal": 0.0, "unico": 0.0}
    for it in p.get("items", []):
        sub = float(it.get("price", 0)) * int(it.get("qty", 1))
        totals["mensal" if it.get("billing") == "mensal" else "unico"] += sub
        dl = deliverables.get(it.get("service_id"), [])
        name = f"<b>{_esc(it.get('name'))}</b>" + (f"<br/><font size=7.5 color='#64748b'>{' · '.join(_esc(d) for d in dl)}</font>" if dl else "")
        rows.append([Paragraph(name, S["b"]), Paragraph("Mensal" if it.get("billing") == "mensal" else "Projeto único", S["b"]),
                     Paragraph(str(it.get("qty", 1)), S["r"]), Paragraph(brl(float(it.get("price", 0))), S["r"]), Paragraph(brl(sub), S["r"])])
    t = Table(rows, colWidths=[78 * mm, 28 * mm, 12 * mm, 30 * mm, 30 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT), ("LINEBELOW", (0, 0), (-1, 0), 1, ORANGE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story += [t, Spacer(1, 6 * mm)]

    disc = max(0.0, min(100.0, float(p.get("discount") or 0)))
    trows = []
    for key, label in (("mensal", "Investimento mensal"), ("unico", "Investimento único")):
        if totals[key]:
            if disc:
                trows.append([Paragraph(f"{label} (bruto)", S["r"]), Paragraph(brl(totals[key]), S["r"])])
                trows.append([Paragraph(f"Desconto {disc:g}%", S["r"]), Paragraph(f"- {brl(totals[key] * disc / 100)}", S["r"])])
            trows.append([Paragraph(f"<b>{label}</b>", S["rb"]), Paragraph(f"<font color='#EB7300'>{brl(totals[key] * (1 - disc / 100))}</font>", S["rb"])])
    if trows:
        story.append(Table(trows, colWidths=[140 * mm, 38 * mm], style=[("LINEABOVE", (0, 0), (-1, 0), 0.8, NAVY), ("TOPPADDING", (0, 0), (-1, -1), 4)]))

    if p.get("notes"):
        story += [Spacer(1, 8 * mm), KeepTogether([Paragraph("Condições e observações", S["h2"]), Paragraph(_esc(p["notes"]).replace("\n", "<br/>"), S["b"])])]
    story += [Spacer(1, 12 * mm), KeepTogether([
        Paragraph("Próximos passos", S["h2"]),
        Paragraph("1. Aprovação desta proposta  ·  2. Assinatura do contrato  ·  3. Reunião de kickoff e briefing  ·  4. Início da produção", S["b"]),
        Spacer(1, 14 * mm),
        Table([["", ""], [Paragraph("Agência Sparkle", S["small"]), Paragraph(_esc(lead.get("company") or lead.get("name")), S["small"])]],
              colWidths=[80 * mm, 80 * mm], style=[("LINEABOVE", (0, 1), (0, 1), 0.6, NAVY), ("LINEABOVE", (1, 1), (1, 1), 0.6, NAVY),
                                                   ("RIGHTPADDING", (0, 0), (0, -1), 18)]),
    ])]
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return buf.getvalue()
