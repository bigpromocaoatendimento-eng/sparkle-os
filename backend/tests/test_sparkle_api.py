# Sparkle OS backend regression tests (roles, CRUD, finance, CRM, tasks/portal, files, users, public site)
# Requires fresh tokens: `cd /app && python scripts/clerk_test_users.py` -> /tmp/clerk_tokens.json
import json
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOK = json.load(open("/tmp/clerk_tokens.json"))


def s(role):
    x = requests.Session()
    x.headers.update({"Authorization": f"Bearer {TOK[role]['token']}"})
    return x


@pytest.fixture(scope="module")
def admin():
    return s("admin")


@pytest.fixture(scope="module")
def criativo():
    return s("criativo")


@pytest.fixture(scope="module")
def cliente():
    return s("cliente")


@pytest.fixture(scope="module")
def aurora(admin):
    return next(c for c in admin.get(f"{API}/clients").json() if "Aurora" in c["name"])


@pytest.fixture(scope="module")
def other_client(admin):
    return next(c for c in admin.get(f"{API}/clients").json() if "Vitalis" in c["name"])


# --- Auth / roles ---
class TestRoles:
    def test_no_token_401(self):
        for p in ["/me", "/clients", "/dashboard", "/portal", "/users"]:
            assert requests.get(API + p).status_code == 401, p

    def test_me_roles(self, admin, criativo, cliente):
        assert admin.get(f"{API}/me").json()["role"] == "admin"
        assert criativo.get(f"{API}/me").json()["role"] == "criativo"
        me = cliente.get(f"{API}/me").json()
        assert me["role"] == "cliente" and me["client_id"]

    def test_cliente_forbidden(self, cliente):
        for p in ["/clients", "/tasks", "/leads", "/dashboard", "/files", "/transactions"]:
            assert cliente.get(API + p).status_code == 403, p

    def test_criativo_forbidden(self, criativo):
        for p in ["/transactions", "/contracts", "/users"]:
            assert criativo.get(API + p).status_code == 403, p
        assert criativo.post(f"{API}/transactions", json={"description": "x"}).status_code == 403

    def test_criativo_dashboard_hides_finance(self, criativo):
        d = criativo.get(f"{API}/dashboard").json()
        assert d["finance_visible"] is False and d["kpis"]["receivable"] == 0

    def test_non_admin_cannot_set_role(self, criativo, cliente):
        for sess, role in [(criativo, "criativo"), (cliente, "cliente")]:
            uid = TOK[role]["user_id"]
            r = sess.patch(f"{API}/users/{uid}/role", json={"role": "admin"})
            assert r.status_code == 403
            # role in generic body is ignored
            assert sess.get(f"{API}/me").json()["role"] == role

    def test_criativo_portal_invoice_leak(self, criativo, other_client):
        # criativo cannot read /transactions, but portal preview exposes invoices
        d = criativo.get(f"{API}/portal", params={"client_id": other_client["id"]}).json()
        assert len(d.get("invoices", [])) == 0, "criativo sees invoices via /portal (finance leak)"


# --- Dashboard ---
class TestDashboard:
    def test_kpis(self, admin):
        d = admin.get(f"{API}/dashboard").json()
        for k in ["active_clients", "mrr", "open_leads", "pipeline_value", "pending_tasks", "awaiting_approval",
                  "revenue_month", "receivable", "payable", "overdue"]:
            assert k in d["kpis"]
        assert d["finance_visible"] is True and len(d["cash_flow"]) >= 5


# --- Generic CRUD ---
class TestCrud:
    @pytest.mark.parametrize("res,payload,upd", [
        ("clients", {"name": "TEST_Cli", "monthly_fee": 100}, {"monthly_fee": 250}),
        ("services", {"name": "TEST_Svc", "price": 10, "deliverables": ["a"]}, {"price": 20}),
        ("transactions", {"description": "TEST_Tx", "amount": 99, "type": "pagar"}, {"status": "pago", "paid_date": "2026-01-10"}),
        ("leads", {"name": "TEST_Lead", "value": 500}, {"stage": "proposta"}),
        ("tasks", {"title": "TEST_Task"}, {"stage": "revisao"}),
    ])
    def test_crud(self, admin, res, payload, upd):
        r = admin.post(f"{API}/{res}", json=payload)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert "_id" not in doc and doc["id"]
        try:
            assert any(x["id"] == doc["id"] for x in admin.get(f"{API}/{res}").json())
            u = admin.patch(f"{API}/{res}/{doc['id']}", json=upd).json()
            for k, v in upd.items():
                assert u[k] == v
            got = next(x for x in admin.get(f"{API}/{res}").json() if x["id"] == doc["id"])
            for k, v in upd.items():
                assert got[k] == v
        finally:
            assert admin.delete(f"{API}/{res}/{doc['id']}").status_code == 200
        assert admin.delete(f"{API}/{res}/{doc['id']}").status_code == 404

    def test_contract_crud(self, admin, aurora):
        r = admin.post(f"{API}/contracts", json={"client_id": aurora["id"], "title": "TEST_Contract", "value": 1000})
        assert r.status_code == 200
        cid = r.json()["id"]
        assert admin.patch(f"{API}/contracts/{cid}", json={"status": "ativo"}).json()["status"] == "ativo"
        assert admin.delete(f"{API}/contracts/{cid}").status_code == 200

    def test_validation(self, admin):
        assert admin.post(f"{API}/clients", json={"name": ""}).status_code == 422
        assert admin.post(f"{API}/contracts", json={"title": "x"}).status_code == 422
        assert admin.patch(f"{API}/clients/nope", json={"name": "x"}).status_code == 404

    def test_criativo_cannot_delete_client(self, criativo, aurora):
        assert criativo.delete(f"{API}/clients/{aurora['id']}").status_code == 403


# --- Public site ---
class TestPublic:
    def test_public_services(self):
        r = requests.get(f"{API}/public/services")
        assert r.status_code == 200 and len(r.json()) >= 1
        assert "price" not in r.json()[0]

    def test_contact_creates_lead(self, admin):
        email = f"test_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{API}/public/contact", json={"name": "TEST_Site Lead", "email": email, "service": "Branding", "message": "Oi"})
        assert r.status_code == 200
        lead = next(l for l in admin.get(f"{API}/leads").json() if l["email"] == email)
        assert lead["source"] == "site" and lead["stage"] == "novo" and "Branding" in lead["notes"]
        admin.delete(f"{API}/leads/{lead['id']}")

    def test_contact_invalid_email(self):
        assert requests.post(f"{API}/public/contact", json={"name": "TEST", "email": "bad"}).status_code == 422


# --- Tasks + portal approval ---
class TestPortalFlow:
    def _task(self, admin, cid):
        t = admin.post(f"{API}/tasks", json={"title": f"TEST_Approve {uuid.uuid4().hex[:4]}", "client_id": cid}).json()
        admin.patch(f"{API}/tasks/{t['id']}", json={"stage": "aprovacao"})
        return t["id"]

    def test_approve(self, admin, cliente, aurora):
        tid = self._task(admin, aurora["id"])
        try:
            p = cliente.get(f"{API}/portal").json()
            assert p["client"]["id"] == aurora["id"] and p["staff"] is False
            assert any(t["id"] == tid for t in p["tasks"])
            assert all(f["client_id"] == aurora["id"] for f in p["files"])
            assert all(i["client_id"] == aurora["id"] for i in p["invoices"])
            r = cliente.post(f"{API}/portal/tasks/{tid}/approve", json={"comment": "ok"})
            assert r.status_code == 200 and r.json()["stage"] == "concluido"
            t = next(x for x in admin.get(f"{API}/tasks").json() if x["id"] == tid)
            assert t["stage"] == "concluido" and t["feedback"][-1]["type"] == "aprovado"
            assert cliente.post(f"{API}/portal/tasks/{tid}/approve", json={}).status_code == 409
        finally:
            admin.delete(f"{API}/tasks/{tid}")

    def test_request_changes(self, admin, cliente, aurora):
        tid = self._task(admin, aurora["id"])
        try:
            assert cliente.post(f"{API}/portal/tasks/{tid}/request-changes", json={"comment": "  "}).status_code == 422
            r = cliente.post(f"{API}/portal/tasks/{tid}/request-changes", json={"comment": "Trocar cor"})
            assert r.status_code == 200 and r.json()["stage"] == "criacao"
            t = next(x for x in admin.get(f"{API}/tasks").json() if x["id"] == tid)
            assert t["stage"] == "criacao" and t["feedback"][-1]["comment"] == "Trocar cor"
        finally:
            admin.delete(f"{API}/tasks/{tid}")

    def test_cliente_cannot_touch_other_client_task(self, admin, cliente, other_client):
        tid = self._task(admin, other_client["id"])
        try:
            assert cliente.post(f"{API}/portal/tasks/{tid}/approve", json={}).status_code == 404
            # cliente cannot preview other client portal via query param
            p = cliente.get(f"{API}/portal", params={"client_id": other_client["id"]}).json()
            assert p["client"]["id"] != other_client["id"]
        finally:
            admin.delete(f"{API}/tasks/{tid}")

    def test_staff_portal_preview(self, admin, aurora):
        assert admin.get(f"{API}/portal").json() == {"client": None, "staff": True}
        assert admin.get(f"{API}/portal", params={"client_id": aurora["id"]}).json()["client"]["id"] == aurora["id"]


# --- Files (object storage) ---
class TestFiles:
    def test_upload_download_isolation(self, admin, cliente, aurora, other_client):
        ids = []
        try:
            for cid in (aurora["id"], other_client["id"]):
                r = admin.post(f"{API}/files", files={"file": ("TEST_doc.txt", b"hello sparkle", "text/plain")},
                               data={"client_id": cid})
                assert r.status_code == 200, r.text
                ids.append(r.json()["id"])
            assert any(f["id"] == ids[0] for f in admin.get(f"{API}/files", params={"client_id": aurora["id"]}).json())
            d = admin.get(f"{API}/files/{ids[0]}/download")
            assert d.status_code == 200 and d.content == b"hello sparkle"
            assert cliente.get(f"{API}/files/{ids[0]}/download").content == b"hello sparkle"
            assert cliente.get(f"{API}/files/{ids[1]}/download").status_code == 404
            assert cliente.post(f"{API}/files", files={"file": ("x.txt", b"x")}).status_code == 403
        finally:
            for i in ids:
                admin.delete(f"{API}/files/{i}")
        assert admin.get(f"{API}/files/{ids[0]}/download").status_code == 404

    def test_unicode_filename_download(self, admin, aurora):
        r = admin.post(f"{API}/files", files={"file": ("TEST_relatório—final.txt", b"abc", "text/plain")},
                       data={"client_id": aurora["id"]})
        assert r.status_code == 200
        fid = r.json()["id"]
        try:
            assert admin.get(f"{API}/files/{fid}/download").status_code == 200
        finally:
            admin.delete(f"{API}/files/{fid}")


# --- Users ---
class TestUsers:
    def test_list_and_link(self, admin, aurora):
        d = admin.get(f"{API}/users").json()
        assert set(d["roles"]) == {"admin", "gerente", "criativo", "cliente"}
        uid = TOK["cliente"]["user_id"]
        assert any(u["user_id"] == uid for u in d["users"])
        r = admin.patch(f"{API}/users/{uid}/client", json={"client_id": aurora["id"]})
        assert r.status_code == 200
        assert admin.patch(f"{API}/users/{uid}/client", json={"client_id": "nope"}).status_code == 404

    def test_role_change_roundtrip(self, admin):
        uid = TOK["criativo"]["user_id"]
        assert admin.patch(f"{API}/users/{uid}/role", json={"role": "gerente"}).status_code == 200
        assert admin.patch(f"{API}/users/{uid}/role", json={"role": "criativo"}).status_code == 200
        assert admin.patch(f"{API}/users/{uid}/role", json={"role": "superuser"}).status_code == 403

    def test_last_admin_409(self, admin):
        admins = [u for u in admin.get(f"{API}/users").json()["users"] if u["role"] == "admin"]
        if len(admins) > 1:
            pytest.skip(f"{len(admins)} admins exist; cannot safely test last-admin guard")
        r = admin.patch(f"{API}/users/{TOK['admin']['user_id']}/role", json={"role": "cliente"})
        assert r.status_code == 409
