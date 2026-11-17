# Iteration 2: portal email matching bug fix, email notifications, invoice reminders/cron, editorial posts, proposals PDF
# Requires fresh tokens: `cd /app && python scripts/clerk_test_users.py` -> /tmp/clerk_tokens.json
import json
import os
import re
import time
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests
from dotenv import load_dotenv, dotenv_values

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOK = json.load(open("/tmp/clerk_tokens.json"))
CRON_SECRET = dotenv_values("/app/backend/.env").get("WEBHOOK_CRON_SECRET")
SAFE = "delivered@resend.dev"


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
    return next(c for c in admin.get(f"{API}/clients").json() if c["name"] == "Café Aurora (exemplo)")


# --- ClientIn email normalization ---
class TestClientEmailNorm:
    def test_create_and_patch_normalized(self, admin):
        r = admin.post(f"{API}/clients", json={"name": "TEST_norm", "email": "  A@X.com ;B@Y.COM  "})
        assert r.status_code == 200
        c = r.json()
        try:
            assert c["email"] == "a@x.com, b@y.com"
            p = admin.patch(f"{API}/clients/{c['id']}", json={"email": " Foo@Bar.COM "})
            assert p.json()["email"] == "foo@bar.com"
            assert next(x for x in admin.get(f"{API}/clients").json() if x["id"] == c["id"])["email"] == "foo@bar.com"
        finally:
            admin.delete(f"{API}/clients/{c['id']}")


# --- BUG FIX: portal by email match ---
class TestPortalEmailMatch:
    def test_unlinked_then_email_match(self, admin, cliente, aurora):
        uid = TOK["cliente"]["user_id"]
        new_id = None
        try:
            r = admin.patch(f"{API}/users/{uid}/client", json={"client_id": ""})
            assert r.status_code == 200
            # Temporarily ensure no client matches (aurora email is delivered@resend.dev)
            p = cliente.get(f"{API}/portal").json()
            assert p["client"] is None and p["staff"] is False
            assert p["email"] == "contato+clerk_test@cafeaurora.com.br"
            # create client with list-style email in mixed case
            c = admin.post(f"{API}/clients", json={"name": "TEST_emailmatch",
                                                    "email": " outro@x.com; CONTATO+clerk_test@CafeAurora.com.br "}).json()
            new_id = c["id"]
            assert c["email"] == "outro@x.com, contato+clerk_test@cafeaurora.com.br"
            # portal-access lists the user before linking (email match)
            pa = admin.get(f"{API}/clients/{new_id}/portal-access").json()
            assert any(u["user_id"] == uid for u in pa["users"])
            p = cliente.get(f"{API}/portal").json()
            assert p["client"] and p["client"]["id"] == new_id
            me = cliente.get(f"{API}/me").json()
            assert me["client_id"] == new_id  # auto-saved
        finally:
            admin.patch(f"{API}/users/{uid}/client", json={"client_id": aurora["id"]})
            if new_id:
                admin.delete(f"{API}/clients/{new_id}")
        assert cliente.get(f"{API}/portal").json()["client"]["id"] == aurora["id"]

    def test_partial_email_no_match(self, admin, cliente, aurora):
        uid = TOK["cliente"]["user_id"]
        new_id = None
        try:
            admin.patch(f"{API}/users/{uid}/client", json={"client_id": ""})
            c = admin.post(f"{API}/clients", json={"name": "TEST_partial",
                                                    "email": "xcontato+clerk_test@cafeaurora.com.br"}).json()
            new_id = c["id"]
            assert cliente.get(f"{API}/portal").json()["client"] is None
        finally:
            admin.patch(f"{API}/users/{uid}/client", json={"client_id": aurora["id"]})
            if new_id:
                admin.delete(f"{API}/clients/{new_id}")

    def test_portal_access_roles(self, admin, criativo, aurora):
        r = admin.get(f"{API}/clients/{aurora['id']}/portal-access")
        assert r.status_code == 200
        assert any(u["email"] == "contato+clerk_test@cafeaurora.com.br" for u in r.json()["users"])
        assert criativo.get(f"{API}/clients/{aurora['id']}/portal-access").status_code == 403
        assert admin.get(f"{API}/clients/nonexistent/portal-access").status_code == 404

    def test_portal_has_posts(self, cliente):
        p = cliente.get(f"{API}/portal").json()
        assert sum(1 for t in p["tasks"] if t.get("publish_date")) >= 6


# --- Tasks: publish fields + approval email ---
class TestTaskApprovalEmail:
    def test_aprovacao_email_and_notify(self, admin, criativo, aurora):
        t = admin.post(f"{API}/tasks", json={"title": "TEST_post_aprov", "client_id": aurora["id"],
                                              "publish_date": "2026-02-10", "channel": "instagram",
                                              "content_type": "reels"}).json()
        try:
            assert t["publish_date"] == "2026-02-10" and t["channel"] == "instagram" and t["content_type"] == "reels"
            assert admin.post(f"{API}/tasks/{t['id']}/notify").status_code == 409
            admin.patch(f"{API}/tasks/{t['id']}", json={"stage": "aprovacao"})
            log = []
            for _ in range(10):
                time.sleep(1.5)
                log = [e for e in admin.get(f"{API}/notifications").json() if e["ref_id"] == t["id"]]
                if log:
                    break
            assert len(log) == 1, log
            assert log[0]["kind"] == "aprovacao" and log[0]["status"] == "enviado" and log[0]["to"] == SAFE
            # patching again while in aprovacao should NOT send another
            admin.patch(f"{API}/tasks/{t['id']}", json={"title": "TEST_post_aprov2"})
            time.sleep(2)
            assert len([e for e in admin.get(f"{API}/notifications").json() if e["ref_id"] == t["id"]]) == 1
            r = criativo.post(f"{API}/tasks/{t['id']}/notify")
            assert r.status_code == 200 and r.json()["ok"]
            assert len([e for e in admin.get(f"{API}/notifications").json() if e["ref_id"] == t["id"]]) == 2
            assert criativo.get(f"{API}/notifications").status_code == 403
        finally:
            admin.delete(f"{API}/tasks/{t['id']}")


# --- Invoice reminders + cron ---
class TestInvoiceReminders:
    def test_run_now_idempotent(self, admin, criativo, aurora):
        due = (datetime.now(ZoneInfo("America/Sao_Paulo")).date() + timedelta(days=3)).isoformat()
        tx = admin.post(f"{API}/transactions", json={"type": "receber", "description": "TEST_lembrete",
                                                      "amount": 123.45, "due_date": due, "status": "pendente",
                                                      "client_id": aurora["id"]}).json()
        try:
            r1 = admin.post(f"{API}/notifications/invoice-reminders/run")
            assert r1.status_code == 200
            assert r1.json()["sent"] >= 1
            logs = [e for e in admin.get(f"{API}/notifications").json() if e["ref_id"] == tx["id"]]
            assert len(logs) == 1 and logs[0]["kind"] == "fatura" and logs[0]["status"] == "enviado"
            r2 = admin.post(f"{API}/notifications/invoice-reminders/run").json()
            assert len([e for e in admin.get(f"{API}/notifications").json() if e["ref_id"] == tx["id"]]) == 1
            assert r2["skipped"] >= 1
            assert criativo.post(f"{API}/notifications/invoice-reminders/run").status_code == 403
        finally:
            admin.delete(f"{API}/transactions/{tx['id']}")

    def test_cron_auth_and_dedupe(self):
        assert requests.post(f"{API}/cron/invoice-reminders").status_code == 401
        assert requests.post(f"{API}/cron/invoice-reminders", headers={"Authorization": "Bearer wrong"}).status_code == 401
        h = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": f"TEST_{uuid.uuid4()}"}
        r = requests.post(f"{API}/cron/invoice-reminders", headers=h, json={})
        assert r.status_code == 200 and r.json()["ok"] and r.json()["accepted"] == h["X-Webhook-Id"]
        r2 = requests.post(f"{API}/cron/invoice-reminders", headers=h, json={})
        assert r2.status_code == 200 and r2.json().get("duplicate") is True

    def test_cron_no_body(self):
        h = {"Authorization": f"Bearer {CRON_SECRET}"}
        r = requests.post(f"{API}/cron/invoice-reminders", headers=h)
        assert r.status_code == 200 and r.json()["ok"]


# --- Proposals ---
class TestProposals:
    def test_proposal_flow(self, admin, criativo):
        svc = admin.get(f"{API}/services").json()[0]
        lead = admin.post(f"{API}/leads", json={"name": "TEST_lead_prop", "stage": "qualificacao"}).json()
        pid = None
        try:
            r = admin.post(f"{API}/proposals", json={"lead_id": lead["id"], "items": []})
            assert r.status_code == 422
            r = admin.post(f"{API}/proposals", json={"lead_id": lead["id"], "discount": 10, "items": [
                {"service_id": svc["id"], "name": svc["name"], "price": svc["price"], "billing": svc["billing"], "qty": 2}]})
            assert r.status_code == 200, r.text
            pid = r.json()["id"]
            assert admin.post(f"{API}/proposals", json={"lead_id": lead["id"], "discount": 120,
                                                        "items": [{"name": "x"}]}).status_code == 422
            assert any(p["id"] == pid for p in admin.get(f"{API}/proposals", params={"lead_id": lead["id"]}).json())
            assert next(l for l in admin.get(f"{API}/leads").json() if l["id"] == lead["id"])["stage"] == "proposta"
            pdf = criativo.get(f"{API}/proposals/{pid}/pdf")
            assert pdf.status_code == 200 and pdf.headers["content-type"].startswith("application/pdf")
            assert pdf.content[:4] == b"%PDF"
            assert admin.get(f"{API}/proposals/nope/pdf").status_code == 404
        finally:
            if pid:
                admin.delete(f"{API}/proposals/{pid}")
            admin.delete(f"{API}/leads/{lead['id']}")

    def test_proposal_does_not_regress_stage(self, admin):
        lead = admin.post(f"{API}/leads", json={"name": "TEST_lead_neg", "stage": "negociacao"}).json()
        pid = None
        try:
            r = admin.post(f"{API}/proposals", json={"lead_id": lead["id"], "items": [{"name": "Item", "price": 10}]})
            pid = r.json()["id"]
            assert next(l for l in admin.get(f"{API}/leads").json() if l["id"] == lead["id"])["stage"] == "negociacao"
        finally:
            if pid:
                admin.delete(f"{API}/proposals/{pid}")
            admin.delete(f"{API}/leads/{lead['id']}")
