import asyncio
import logging
import os
import re
import uuid
from urllib.parse import quote
from contextlib import suppress
from datetime import datetime, timezone, date, timedelta
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv
import hmac
from zoneinfo import ZoneInfo
from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Body, Response, Request, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel, ReturnDocument
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

try:  # launched as `backend.server` (the default)
    from backend.clerk_auth import clerk_router, require_user
except ModuleNotFoundError:  # launched from inside backend/ as `server`
    from clerk_auth import clerk_router, require_user
try:
    from backend.emails import send_email, approval_email, invoice_email, EmailError
    from backend.proposals_pdf import build_proposal_pdf, brl as pdf_brl
except ModuleNotFoundError:
    from emails import send_email, approval_email, invoice_email, EmailError
    from proposals_pdf import build_proposal_pdf, brl as pdf_brl

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

INDEXES: dict[str, list[IndexModel]] = {
    name: [IndexModel([("id", ASCENDING)], name="id", unique=True),
           IndexModel([("created_at", DESCENDING)], name="created_desc"),
           IndexModel([("client_id", ASCENDING)], name="client_id")]
    for name in ["clients", "services", "contracts", "transactions", "leads", "tasks", "files", "proposals", "email_log"]
}
INDEXES["proposals"].append(IndexModel([("lead_id", ASCENDING)], name="lead_id"))
INDEXES["tasks"].append(IndexModel([("publish_date", ASCENDING)], name="publish_date"))
INDEXES["cron_runs"] = [IndexModel([("run_id", ASCENDING)], name="run_id", unique=True)]
INDEXES["users"] = [IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
                    IndexModel([("email", ASCENDING)], name="email")]


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI(title="Sparkle OS")
api_router = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- Roles ----------------
ROLES = ["admin", "gerente", "criativo", "cliente"]
DEFAULT_ROLE = "cliente"
RETIRED_ROLES: dict = {}
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}
STAFF = ("admin", "gerente", "criativo")
MANAGERS = ("admin", "gerente")

ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


def _clerk_profile(user_id: str) -> tuple[bool, str, str]:
    """One Clerk lookup on first sign-in: (is_admin, primary_email, name)."""
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    r = requests.get(f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
                     headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "emergent-app"})
    r.raise_for_status()
    u = r.json()
    emails = u.get("email_addresses", [])
    is_admin = any(e["email_address"].lower() in admins and (e.get("verification") or {}).get("status") == "verified"
                   for e in emails)
    primary = next((e["email_address"] for e in emails if e["id"] == u.get("primary_email_address_id")),
                   emails[0]["email_address"] if emails else "")
    name = " ".join(filter(None, [u.get("first_name"), u.get("last_name")])) or primary
    return is_admin, primary.lower(), name


async def current_member(user: dict = Depends(require_user)) -> dict:
    uid = user["user_id"]
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role") or not member.get("email"):
        is_admin, email, name = await run_in_threadpool(_clerk_profile, uid)
        role = "admin" if is_admin else DEFAULT_ROLE
        await db.users.update_one({"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role}})
        member = await db.users.find_one_and_update(
            {"user_id": uid},
            {"$setOnInsert": {"user_id": uid, "role": role, "client_id": "", "created_at": now_iso()},
             "$set": {"email": email, "name": name}},
            upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if member.get("env") != ENV:
        await db.users.update_one({"user_id": uid}, {"$set": {"env": ENV}})
    return {**member, "env": ENV, "role": effective_role(member["role"])}


def require_role(*roles: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Acesso não permitido")
        return member
    return check


# ---------------- Models ----------------
class ClientIn(BaseModel):
    name: str = Field(min_length=1)
    company: str = ""
    email: str = ""
    phone: str = ""
    document: str = ""
    segment: str = ""
    status: str = "ativo"
    monthly_fee: float = 0
    account_manager: str = ""
    notes: str = ""


class ServiceIn(BaseModel):
    name: str = Field(min_length=1)
    category: str = ""
    description: str = ""
    price: float = 0
    billing: str = "mensal"
    deliverables: List[str] = []
    active: bool = True


class ContractIn(BaseModel):
    client_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    service_ids: List[str] = []
    value: float = 0
    start_date: str = ""
    end_date: str = ""
    status: str = "rascunho"
    renewal_auto: bool = False
    notes: str = ""


class TransactionIn(BaseModel):
    type: str = "receber"
    description: str = Field(min_length=1)
    category: str = ""
    amount: float = 0
    due_date: str = ""
    status: str = "pendente"
    paid_date: str = ""
    client_id: str = ""


class LeadIn(BaseModel):
    name: str = Field(min_length=1)
    company: str = ""
    email: str = ""
    phone: str = ""
    source: str = "manual"
    stage: str = "novo"
    value: float = 0
    notes: str = ""


class TaskIn(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""
    client_id: str = ""
    stage: str = "briefing"
    priority: str = "media"
    assignee: str = ""
    due_date: str = ""
    publish_date: str = ""
    channel: str = ""
    content_type: str = ""


class ProposalItem(BaseModel):
    service_id: str = ""
    name: str = Field(min_length=1)
    price: float = 0
    billing: str = "mensal"
    qty: int = Field(1, ge=1)


class ProposalIn(BaseModel):
    lead_id: str = Field(min_length=1)
    title: str = "Proposta de serviços"
    intro: str = ""
    items: List[ProposalItem] = Field(min_length=1)
    discount: float = Field(0, ge=0, le=100)
    validity_days: int = Field(15, ge=1, le=365)
    notes: str = ""
    status: str = "rascunho"


AFTER_SAVE: dict = {}


def register_crud(name: str, model, read_roles, write_roles, delete_roles):
    @api_router.get(f"/{name}", name=f"list_{name}")
    async def list_items(client_id: Optional[str] = None, lead_id: Optional[str] = None,
                         member: dict = Depends(require_role(*read_roles))):
        query = {k: v for k, v in (("client_id", client_id), ("lead_id", lead_id)) if v}
        return await db[name].find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)

    @api_router.post(f"/{name}", name=f"create_{name}")
    async def create_item(body: model, request: Request, bg: BackgroundTasks, member: dict = Depends(require_role(*write_roles))):
        doc = {**body.model_dump(), "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": member["user_id"]}
        if name == "tasks":
            doc["feedback"] = []
        await db[name].insert_one(doc)
        doc.pop("_id", None)
        if name in AFTER_SAVE:
            await AFTER_SAVE[name](None, doc, public_base(request), bg)
        return doc

    @api_router.patch(f"/{name}/{{item_id}}", name=f"update_{name}")
    async def update_item(item_id: str, request: Request, bg: BackgroundTasks, body: dict = Body(...),
                          member: dict = Depends(require_role(*write_roles))):
        existing = await db[name].find_one({"id": item_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Não encontrado")
        fields = model.model_fields.keys()
        merged = {k: existing.get(k) for k in fields if k in existing}
        merged.update({k: v for k, v in body.items() if k in fields})
        clean = model.model_validate(merged).model_dump()
        doc = await db[name].find_one_and_update({"id": item_id}, {"$set": {**clean, "updated_at": now_iso()}},
                                                 projection={"_id": 0}, return_document=ReturnDocument.AFTER)
        if name in AFTER_SAVE:
            await AFTER_SAVE[name](existing, doc, public_base(request), bg)
        return doc

    @api_router.delete(f"/{name}/{{item_id}}", name=f"delete_{name}")
    async def delete_item(item_id: str, member: dict = Depends(require_role(*delete_roles))):
        if name == "clients":
            for coll in ("contracts", "transactions", "tasks"):
                if await db[coll].count_documents({"client_id": item_id}, limit=1):
                    raise HTTPException(status_code=409, detail="Cliente possui contratos, lançamentos ou tarefas vinculados. Marque-o como inativo.")
        if (await db[name].delete_one({"id": item_id})).deleted_count == 0:
            raise HTTPException(status_code=404, detail="Não encontrado")
        return {"ok": True}


register_crud("clients", ClientIn, STAFF, STAFF, MANAGERS)
register_crud("services", ServiceIn, STAFF, MANAGERS, MANAGERS)
register_crud("contracts", ContractIn, MANAGERS, MANAGERS, MANAGERS)
register_crud("transactions", TransactionIn, MANAGERS, MANAGERS, MANAGERS)
register_crud("leads", LeadIn, STAFF, STAFF, MANAGERS)
register_crud("tasks", TaskIn, STAFF, STAFF, MANAGERS)
register_crud("proposals", ProposalIn, STAFF, STAFF, MANAGERS)


# ---------------- Email notifications ----------------
SP_TZ = ZoneInfo("America/Sao_Paulo")


def public_base(request: Request) -> str:
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host", "")).split(",")[0].strip()
    return f"https://{host}"


def fmt_br(d: str) -> str:
    return f"{d[8:10]}/{d[5:7]}/{d[0:4]}" if len(d) >= 10 else d


async def deliver(kind: str, to: str, subject: str, html: str, ref_id: str, client_id: str = "") -> bool:
    log = {"id": str(uuid.uuid4()), "kind": kind, "to": to, "subject": subject, "ref_id": ref_id,
           "client_id": client_id, "created_at": now_iso()}
    try:
        log["email_id"] = await send_email(to=to, subject=subject, html=html)
        log["status"] = "enviado"
    except (EmailError, ValueError) as e:
        log["status"], log["error"] = "falhou", str(e)
    await db.email_log.insert_one(log)
    return log["status"] == "enviado"


async def notify_approval(task: dict, base: str):
    client_doc = await db.clients.find_one({"id": task.get("client_id")}, {"_id": 0})
    if not client_doc or not client_doc.get("email"):
        return
    subject, html = approval_email(client_doc["name"], task["title"], task.get("description", ""), f"{base}/portal")
    await deliver("aprovacao", client_doc["email"], subject, html, task["id"], client_doc["id"])


async def task_after_save(old: Optional[dict], new: dict, base: str, bg: BackgroundTasks):
    if new.get("stage") == "aprovacao" and (old or {}).get("stage") != "aprovacao" and new.get("client_id"):
        bg.add_task(notify_approval, new, base)


async def proposal_after_save(old: Optional[dict], new: dict, base: str, bg: BackgroundTasks):
    if old is None:
        await db.leads.update_one({"id": new["lead_id"], "stage": {"$in": ["novo", "qualificacao"]}}, {"$set": {"stage": "proposta"}})


AFTER_SAVE.update({"tasks": task_after_save, "proposals": proposal_after_save})


async def run_invoice_reminders(base: str) -> dict:
    today = datetime.now(SP_TZ).date()
    targets = {today.isoformat(): "d0", (today + timedelta(days=3)).isoformat(): "d3"}
    txs = await db.transactions.find({"type": "receber", "status": "pendente", "due_date": {"$in": list(targets)}},
                                     {"_id": 0}).to_list(2000)
    sent = skipped = 0
    for t in txs:
        key = f"{targets[t['due_date']]}:{t['due_date']}"
        if key in t.get("reminders_sent", []) or not t.get("client_id"):
            skipped += 1
            continue
        c = await db.clients.find_one({"id": t["client_id"]}, {"_id": 0})
        if not c or not c.get("email"):
            skipped += 1
            continue
        subject, html = invoice_email(c["name"], t["description"], pdf_brl(t["amount"]), fmt_br(t["due_date"]),
                                      targets[t["due_date"]] == "d0", f"{base}/portal")
        if await deliver("fatura", c["email"], subject, html, t["id"], c["id"]):
            await db.transactions.update_one({"id": t["id"]}, {"$addToSet": {"reminders_sent": key}})
            sent += 1
    logger.info("invoice reminders: sent=%s skipped=%s", sent, skipped)
    return {"sent": sent, "skipped": skipped}


@api_router.post("/cron/invoice-reminders")
async def cron_invoice_reminders(request: Request, bg: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not secret or not token or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        envelope = await request.json()
    except Exception:
        envelope = None
    if envelope is not None and not isinstance(envelope, dict):
        raise HTTPException(status_code=400, detail="Invalid body")
    run_id = request.headers.get("x-webhook-id") or (envelope or {}).get("run_id") or str(uuid.uuid4())
    try:
        await db.cron_runs.insert_one({"run_id": run_id, "job": "invoice-reminders", "created_at": now_iso()})
    except Exception:
        return {"ok": True, "duplicate": True}
    bg.add_task(run_invoice_reminders, public_base(request))
    return {"ok": True, "accepted": run_id}


@api_router.post("/notifications/invoice-reminders/run")
async def run_reminders_now(request: Request, member: dict = Depends(require_role(*MANAGERS))):
    return await run_invoice_reminders(public_base(request))


@api_router.post("/tasks/{task_id}/notify")
async def resend_approval(task_id: str, request: Request, member: dict = Depends(require_role(*STAFF))):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    if task.get("stage") != "aprovacao":
        raise HTTPException(status_code=409, detail="A tarefa não está em aprovação")
    c = await db.clients.find_one({"id": task.get("client_id")}, {"_id": 0})
    if not c or not c.get("email"):
        raise HTTPException(status_code=422, detail="Cliente sem e-mail cadastrado")
    subject, html = approval_email(c["name"], task["title"], task.get("description", ""), f"{public_base(request)}/portal")
    if not await deliver("aprovacao", c["email"], subject, html, task["id"], c["id"]):
        raise HTTPException(status_code=502, detail="Não foi possível enviar o e-mail")
    return {"ok": True}


@api_router.get("/notifications")
async def list_notifications(member: dict = Depends(require_role(*MANAGERS))):
    return await db.email_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------------- Proposal PDF ----------------
@api_router.get("/proposals/{proposal_id}/pdf")
async def proposal_pdf(proposal_id: str, member: dict = Depends(require_role(*STAFF))):
    p = await db.proposals.find_one({"id": proposal_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    lead = await db.leads.find_one({"id": p["lead_id"]}, {"_id": 0}) or {"name": "Cliente"}
    ids = [i.get("service_id") for i in p.get("items", []) if i.get("service_id")]
    svcs = await db.services.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "deliverables": 1}).to_list(100)
    pdf = await run_in_threadpool(build_proposal_pdf, p, lead, {s["id"]: s.get("deliverables", []) for s in svcs})
    fname = f"Proposta-Sparkle-{p['id'][:6].upper()}.pdf"
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{fname}"'})


# ---------------- Me & Users ----------------
@api_router.get("/me")
async def me(member: dict = Depends(current_member)):
    return member


@api_router.get("/users")
async def list_users(admin: dict = Depends(require_role("admin"))):
    people = await db.users.find(IN_ENV, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"roles": [r for r in ROLES if RANK[r] <= RANK[admin["role"]]],
            "users": [{**p, "role": effective_role(p.get("role"))} for p in people]}


class RoleIn(BaseModel):
    role: str


@api_router.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin: dict = Depends(require_role("admin"))):
    if body.role not in ROLES or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(status_code=403, detail="Acesso não permitido")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(status_code=404, detail="Não encontrado")
    if (effective_role(target.get("role")) == "admin" and body.role != "admin"
            and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1):
        raise HTTPException(status_code=409, detail="É necessário manter pelo menos um administrador")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"user_id": user_id, "role": body.role}


class ClientLinkIn(BaseModel):
    client_id: str = ""


@api_router.patch("/users/{user_id}/client")
async def link_client(user_id: str, body: ClientLinkIn, admin: dict = Depends(require_role("admin"))):
    if body.client_id and not await db.clients.find_one({"id": body.client_id}):
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    res = await db.users.update_one({"user_id": user_id, **IN_ENV}, {"$set": {"client_id": body.client_id}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Não encontrado")
    return {"user_id": user_id, "client_id": body.client_id}


# ---------------- Dashboard ----------------
def _effective_status(t: dict) -> str:
    if t.get("status") == "pendente" and t.get("due_date") and t["due_date"] < date.today().isoformat():
        return "atrasado"
    return t.get("status", "pendente")


@api_router.get("/dashboard")
async def dashboard(member: dict = Depends(require_role(*STAFF))):
    clients = await db.clients.find({}, {"_id": 0, "status": 1, "monthly_fee": 1}).to_list(5000)
    leads = await db.leads.find({}, {"_id": 0, "stage": 1, "value": 1}).to_list(5000)
    tasks = await db.tasks.find({}, {"_id": 0, "stage": 1, "due_date": 1, "title": 1, "id": 1, "priority": 1}).to_list(5000)
    txs = await db.transactions.find({}, {"_id": 0}).to_list(10000) if member["role"] in MANAGERS else []
    month = date.today().isoformat()[:7]
    open_leads = [l for l in leads if l.get("stage") not in ("ganho", "perdido")]
    kpis = {
        "active_clients": sum(1 for c in clients if c.get("status") == "ativo"),
        "mrr": sum(c.get("monthly_fee", 0) for c in clients if c.get("status") == "ativo"),
        "open_leads": len(open_leads),
        "pipeline_value": sum(l.get("value", 0) for l in open_leads),
        "pending_tasks": sum(1 for t in tasks if t.get("stage") != "concluido"),
        "awaiting_approval": sum(1 for t in tasks if t.get("stage") == "aprovacao"),
        "revenue_month": sum(t["amount"] for t in txs if t["type"] == "receber" and t.get("status") == "pago"
                             and (t.get("paid_date") or t.get("due_date", ""))[:7] == month),
        "receivable": sum(t["amount"] for t in txs if t["type"] == "receber" and t.get("status") != "pago"),
        "payable": sum(t["amount"] for t in txs if t["type"] == "pagar" and t.get("status") != "pago"),
        "overdue": sum(1 for t in txs if _effective_status(t) == "atrasado"),
    }
    today = date.today().replace(day=1)
    months = []
    for i in range(5, -1, -1):
        m = (today - timedelta(days=i * 28)).replace(day=1).isoformat()[:7]
        if m not in months:
            months.append(m)
    flow = [{"month": m,
             "entradas": sum(t["amount"] for t in txs if t["type"] == "receber" and t.get("due_date", "")[:7] == m),
             "saidas": sum(t["amount"] for t in txs if t["type"] == "pagar" and t.get("due_date", "")[:7] == m)}
            for m in months]
    funnel = {s: sum(1 for l in leads if l.get("stage") == s)
              for s in ["novo", "qualificacao", "proposta", "negociacao", "ganho", "perdido"]}
    upcoming = sorted([t for t in tasks if t.get("stage") != "concluido" and t.get("due_date")],
                      key=lambda t: t["due_date"])[:6]
    return {"kpis": kpis, "cash_flow": flow, "funnel": funnel, "upcoming_tasks": upcoming,
            "finance_visible": member["role"] in MANAGERS}


# ---------------- Files (Object Storage) ----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = os.environ.get("APP_NAME", "sparkle-os")
storage_key = None
MAX_UPLOAD = 50 * 1024 * 1024


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": init_storage(), "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 404:
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": init_storage(force=True), "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": init_storage()}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


@api_router.post("/files")
async def upload_file(file: UploadFile = File(...), client_id: str = Form(""), category: str = Form("geral"),
                      member: dict = Depends(require_role(*STAFF))):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="Arquivo maior que 50MB")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{client_id or 'geral'}/{uuid.uuid4()}.{ext}"
    result = await run_in_threadpool(put_object, path, data, file.content_type or "application/octet-stream")
    doc = {"id": str(uuid.uuid4()), "storage_path": result["path"], "original_filename": file.filename,
           "content_type": file.content_type or "application/octet-stream", "size": result.get("size", len(data)),
           "client_id": client_id, "category": category, "uploaded_by": member.get("name", ""),
           "is_deleted": False, "created_at": now_iso()}
    await db.files.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/files")
async def list_files(client_id: Optional[str] = None, member: dict = Depends(require_role(*STAFF))):
    query = {"is_deleted": False, **({"client_id": client_id} if client_id else {})}
    return await db.files.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)


async def _portal_client_id(member: dict) -> str:
    if member.get("client_id"):
        return member["client_id"]
    if member.get("email"):
        c = await db.clients.find_one({"email": {"$regex": f"^{re.escape(member['email'])}$", "$options": "i"}}, {"id": 1})
        if c:
            return c["id"]
    return ""


@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, member: dict = Depends(current_member)):
    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    if member["role"] not in STAFF:
        cid = await _portal_client_id(member)
        if not cid or record.get("client_id") != cid:
            raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    data, ctype = await run_in_threadpool(get_object, record["storage_path"])
    return Response(content=data, media_type=record.get("content_type") or ctype,
                    headers={"Content-Disposition": "inline; filename=\"{}\"; filename*=UTF-8''{}".format(
                        record["original_filename"].encode("ascii", "replace").decode().replace('"', "'"),
                        quote(record["original_filename"]))})


@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str, member: dict = Depends(require_role(*MANAGERS))):
    res = await db.files.update_one({"id": file_id}, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return {"ok": True}


# ---------------- Client Portal ----------------
@api_router.get("/portal")
async def portal(client_id: Optional[str] = None, member: dict = Depends(current_member)):
    cid = client_id if (member["role"] in STAFF and client_id) else await _portal_client_id(member)
    if member["role"] in STAFF and not cid:
        return {"client": None, "staff": True}
    if not cid:
        return {"client": None, "staff": False}
    c = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not c:
        return {"client": None, "staff": member["role"] in STAFF}
    tasks = await db.tasks.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    see_money = member["role"] in MANAGERS or member["role"] not in STAFF
    contracts = await db.contracts.find({"client_id": cid}, {"_id": 0, "notes": 0}).to_list(200) if see_money else []
    invoices = await db.transactions.find({"client_id": cid, "type": "receber"}, {"_id": 0}).sort("due_date", -1).to_list(500) if see_money else []
    for inv in invoices:
        inv["status"] = _effective_status(inv)
    files = await db.files.find({"client_id": cid, "is_deleted": False}, {"_id": 0, "storage_path": 0}).to_list(500)
    return {"client": {k: c.get(k) for k in ("id", "name", "company", "email", "status", "segment")},
            "tasks": tasks, "contracts": contracts, "invoices": invoices, "files": files,
            "staff": member["role"] in STAFF}


class FeedbackIn(BaseModel):
    comment: str = ""


async def _portal_task(task_id: str, member: dict) -> dict:
    cid = await _portal_client_id(member)
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task or (member["role"] not in STAFF and task.get("client_id") != cid):
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    if task.get("stage") != "aprovacao":
        raise HTTPException(status_code=409, detail="Esta tarefa não está aguardando aprovação")
    return task


@api_router.post("/portal/tasks/{task_id}/approve")
async def portal_approve(task_id: str, body: FeedbackIn, member: dict = Depends(current_member)):
    await _portal_task(task_id, member)
    entry = {"type": "aprovado", "comment": body.comment, "by": member.get("name", ""), "at": now_iso()}
    await db.tasks.update_one({"id": task_id}, {"$set": {"stage": "concluido"}, "$push": {"feedback": entry}})
    return {"ok": True, "stage": "concluido"}


@api_router.post("/portal/tasks/{task_id}/request-changes")
async def portal_changes(task_id: str, body: FeedbackIn, member: dict = Depends(current_member)):
    if not body.comment.strip():
        raise HTTPException(status_code=422, detail="Descreva as alterações desejadas")
    await _portal_task(task_id, member)
    entry = {"type": "alteracao", "comment": body.comment, "by": member.get("name", ""), "at": now_iso()}
    await db.tasks.update_one({"id": task_id}, {"$set": {"stage": "criacao"}, "$push": {"feedback": entry}})
    return {"ok": True, "stage": "criacao"}


# ---------------- Public site ----------------
class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field("", max_length=40)
    company: str = Field("", max_length=120)
    service: str = Field("", max_length=120)
    message: str = Field("", max_length=3000)


@api_router.get("/public/services")
async def public_services():
    return await db.services.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "category": 1, "description": 1,
                                                     "deliverables": 1}).to_list(100)


@api_router.post("/public/contact")
async def public_contact(body: ContactIn):
    notes = "\n".join(filter(None, [f"Interesse: {body.service}" if body.service else "", body.message]))
    doc = {**LeadIn(name=body.name, company=body.company, email=body.email, phone=body.phone,
                    source="site", stage="novo", notes=notes).model_dump(),
           "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": "site"}
    await db.leads.insert_one(doc)
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"message": "Sparkle OS API"}


# ---------------- Seed (editable sample data) ----------------
async def seed():
    if await db.services.count_documents({}) == 0:
        svcs = [
            ("Social Media Essencial", "Social Media", 2500, "mensal", "Gestão de 2 redes, calendário editorial e 12 posts/mês.", ["12 posts/mês", "Calendário editorial", "Relatório mensal"]),
            ("Tráfego Pago Performance", "Performance", 3200, "mensal", "Campanhas Meta Ads e Google Ads com otimização contínua.", ["Gestão Meta + Google", "Dashboards", "Otimização semanal"]),
            ("Branding & Identidade Visual", "Branding", 8900, "unico", "Criação de marca, manual de identidade e aplicações.", ["Logotipo", "Paleta e tipografia", "Manual da marca"]),
            ("Produção Audiovisual", "Audiovisual", 4500, "unico", "Roteiro, captação e edição de vídeos para campanhas.", ["Roteiro", "Captação", "Edição e motion"]),
            ("Sparkle Full Service", "Pacote", 9800, "mensal", "Social media, tráfego, conteúdo e estratégia em um só pacote.", ["Estratégia mensal", "Social + Tráfego", "Gerente dedicado"]),
        ]
        await db.services.insert_many([{**ServiceIn(name=n, category=c, price=p, billing=b, description=d, deliverables=dl).model_dump(),
                                        "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": "seed"} for n, c, p, b, d, dl in svcs])
    if await db.clients.count_documents({}) == 0:
        today = date.today()
        clients = [
            ClientIn(name="Café Aurora (exemplo)", company="Aurora Cafés Especiais", email="delivered@resend.dev", phone="(11) 98888-1001", segment="Alimentação", status="ativo", monthly_fee=4500, account_manager="Equipe Sparkle", notes="Dados de exemplo — edite ou exclua."),
            ClientIn(name="Clínica Vitalis (exemplo)", company="Vitalis Saúde Integrada", email="delivered@resend.dev", phone="(11) 97777-2002", segment="Saúde", status="ativo", monthly_fee=6200, account_manager="Equipe Sparkle", notes="Dados de exemplo — edite ou exclua."),
            ClientIn(name="Studio Norte (exemplo)", company="Studio Norte Arquitetura", email="delivered@resend.dev", phone="(21) 96666-3003", segment="Arquitetura", status="prospeccao", monthly_fee=0, notes="Dados de exemplo — edite ou exclua."),
        ]
        docs = [{**c.model_dump(), "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": "seed"} for c in clients]
        await db.clients.insert_many([dict(d) for d in docs])
        a, v = docs[0]["id"], docs[1]["id"]
        d = lambda days: (today + timedelta(days=days)).isoformat()
        txs = [
            TransactionIn(type="receber", description="Mensalidade Social + Tráfego", category="Mensalidade", amount=4500, due_date=d(-35), status="pago", paid_date=d(-34), client_id=a),
            TransactionIn(type="receber", description="Mensalidade Social + Tráfego", category="Mensalidade", amount=4500, due_date=d(-5), status="pendente", client_id=a),
            TransactionIn(type="receber", description="Mensalidade Full Service", category="Mensalidade", amount=6200, due_date=d(-2), status="pago", paid_date=d(-1), client_id=v),
            TransactionIn(type="receber", description="Mensalidade Full Service", category="Mensalidade", amount=6200, due_date=d(28), status="pendente", client_id=v),
            TransactionIn(type="pagar", description="Ferramentas (Adobe, Canva, mLabs)", category="Software", amount=890, due_date=d(-20), status="pago", paid_date=d(-20)),
            TransactionIn(type="pagar", description="Freelancer de vídeo", category="Terceiros", amount=1800, due_date=d(6), status="pendente"),
            TransactionIn(type="pagar", description="Aluguel do escritório", category="Infraestrutura", amount=3200, due_date=d(10), status="pendente"),
        ]
        await db.transactions.insert_many([{**t.model_dump(), "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": "seed"} for t in txs])
        tasks = [
            TaskIn(title="Calendário editorial de julho", client_id=a, stage="criacao", priority="alta", assignee="Criação", due_date=d(3)),
            TaskIn(title="Carrossel: lançamento do café gelado", client_id=a, stage="aprovacao", priority="media", assignee="Design", due_date=d(1), description="Arte final pronta para aprovação do cliente."),
            TaskIn(title="Vídeo institucional — roteiro", client_id=v, stage="briefing", priority="media", assignee="Audiovisual", due_date=d(9)),
            TaskIn(title="Campanha Google Ads — check-up", client_id=v, stage="revisao", priority="alta", assignee="Performance", due_date=d(2)),
            TaskIn(title="Relatório mensal de resultados", client_id=v, stage="concluido", priority="baixa", assignee="Atendimento", due_date=d(-3)),
        ]
        await db.tasks.insert_many([{**t.model_dump(), "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": "seed"} for t in tasks])
        leads = [
            LeadIn(name="Marina Costa", company="Bella Moda", email="marina@bellamoda.com", source="instagram", stage="novo", value=3500),
            LeadIn(name="Rafael Lima", company="Lima Advocacia", email="rafael@limaadv.com", source="indicacao", stage="qualificacao", value=2800),
            LeadIn(name="Juliana Prado", company="Prado Imóveis", email="ju@pradoimoveis.com", source="site", stage="proposta", value=7200),
            LeadIn(name="Carlos Mendes", company="Mendes Fitness", email="carlos@mendesfit.com", source="google", stage="negociacao", value=4100),
        ]
        await db.leads.insert_many([{**l.model_dump(), "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": "seed"} for l in leads])

    aurora = await db.clients.find_one({"name": {"$regex": "Aurora"}, "created_by": "seed"}, {"id": 1})
    if aurora and await db.tasks.count_documents({"publish_date": {"$nin": ["", None]}}) == 0:
        base = date.today()
        posts = [("Post: bastidores da torra", "instagram", "post", 2, "criacao"), ("Reels: receita de café gelado", "instagram", "reels", 5, "briefing"),
                 ("Carrossel: 5 métodos de preparo", "instagram", "carrossel", 9, "briefing"), ("Artigo: origem dos grãos", "blog", "artigo", 12, "briefing"),
                 ("Story: promoção de fim de semana", "instagram", "story", 15, "briefing"), ("Post LinkedIn: parceria com produtores", "linkedin", "post", 19, "briefing")]
        await db.tasks.insert_many([{**TaskIn(title=t, client_id=aurora["id"], stage=st, channel=ch, content_type=ct, priority="media",
                                              publish_date=(base + timedelta(days=dd)).isoformat(), due_date=(base + timedelta(days=dd - 1)).isoformat()).model_dump(),
                                     "feedback": [], "id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": "seed"} for t, ch, ct, dd, st in posts])


app.include_router(api_router)
app.include_router(clerk_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    for old, new in RETIRED_ROLES.items():
        await db.users.update_many({"role": old}, {"$set": {"role": new}})
    await seed()
    try:
        await run_in_threadpool(init_storage)
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
