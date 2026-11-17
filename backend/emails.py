import ipaddress
import logging
import os
import re
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger(__name__)

# Emergent managed email proxy (constant by design).
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")


class EmailError(Exception):
    pass


_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    """Server-side templates only (G4). Raises EmailError on failure."""
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        try:
            body = e.response.json()
        except ValueError:
            body = {}
        code = body.get("code", "")
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning(f"Email paused: {code} ({e.response.status_code}): {body.get('message', '')}")
            raise EmailError(f"E-mail pausado: {code}")
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise EmailError(f"Falha no envio ({e.response.status_code})")
    except EmailError:
        raise
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise EmailError("Falha no envio")


# ---------- Templates (fixed, server-side; all interpolation escaped) ----------
def _layout(title: str, inner: str, cta_url: str, cta_label: str) -> str:
    brand = escape(EMAIL_FROM_NAME)
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">'
        '<tr><td align="center">'
        '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">'
        f'<tr><td style="background:#001524;padding:28px 32px;color:#ffffff;font-family:Georgia,serif;font-size:22px;letter-spacing:1px">'
        f'<span style="color:#EB7300">&#10022;</span> {brand}'
        '<div style="font-size:11px;letter-spacing:3px;color:#94BAC4;margin-top:6px;font-family:Arial,sans-serif">INOVAÇÃO QUE CONECTA</div></td></tr>'
        f'<tr><td style="padding:32px;color:#0f172a;font-size:15px;line-height:1.6">'
        f'<h1 style="font-family:Georgia,serif;font-size:22px;color:#001524;margin:0 0 16px">{escape(title)}</h1>{inner}'
        f'<p style="margin:28px 0 8px"><a href="{escape(cta_url)}" style="background:#EB7300;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;display:inline-block">{escape(cta_label)}</a></p>'
        '</td></tr>'
        f'<tr><td style="padding:18px 32px;background:#f8fafc;color:#64748b;font-size:12px">Enviado por {brand} pelo Portal do Cliente. '
        'Nunca pedimos senhas ou dados de cartão por e-mail.</td></tr>'
        '</table></td></tr></table>'
    )


def approval_email(client_name: str, task_title: str, description: str, portal_url: str) -> tuple[str, str]:
    subject = f"Nova entrega para aprovação: {task_title}"
    inner = (f'<p>Olá, {escape(client_name)}!</p>'
             f'<p>Uma nova entrega está pronta e aguarda a sua aprovação:</p>'
             f'<p style="background:#fff7ed;border-left:4px solid #EB7300;padding:12px 16px;border-radius:8px"><strong>{escape(task_title)}</strong>'
             f'{"<br><span style=color:#475569>" + escape(description) + "</span>" if description else ""}</p>'
             '<p>Acesse o portal para aprovar ou solicitar alterações.</p>')
    return subject, _layout("Sua aprovação é necessária", inner, portal_url, "Abrir Portal do Cliente")


def invoice_email(client_name: str, description: str, amount: str, due: str, due_today: bool, portal_url: str) -> tuple[str, str]:
    when = "vence hoje" if due_today else "vence em 3 dias"
    subject = f"Lembrete: sua fatura {when} ({due})"
    inner = (f'<p>Olá, {escape(client_name)}!</p>'
             f'<p>Este é um lembrete amigável de que a fatura abaixo <strong>{when}</strong>:</p>'
             '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px">'
             f'<tr><td style="padding:12px 16px;color:#475569">Descrição</td><td style="padding:12px 16px;text-align:right"><strong>{escape(description)}</strong></td></tr>'
             f'<tr><td style="padding:12px 16px;color:#475569;border-top:1px solid #e2e8f0">Valor</td><td style="padding:12px 16px;text-align:right;border-top:1px solid #e2e8f0"><strong>{escape(amount)}</strong></td></tr>'
             f'<tr><td style="padding:12px 16px;color:#475569;border-top:1px solid #e2e8f0">Vencimento</td><td style="padding:12px 16px;text-align:right;border-top:1px solid #e2e8f0"><strong>{escape(due)}</strong></td></tr>'
             '</table>'
             '<p>Se o pagamento já foi feito, desconsidere esta mensagem. Dúvidas? Basta responder este e-mail.</p>')
    return subject, _layout("Lembrete de fatura", inner, portal_url, "Ver minhas faturas")
