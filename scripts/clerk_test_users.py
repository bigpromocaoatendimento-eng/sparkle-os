import os, json, sys, urllib.request, urllib.error
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]


def bapi(path, body=None, method="POST"):
    req = urllib.request.Request("https://api.clerk.com/v1" + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "emergent-test"})
    return json.load(urllib.request.urlopen(req))


def get_user(email, first):
    found = bapi(f"/users?email_address={email}", method="GET")
    if found:
        return found[0]
    return bapi("/users", {"email_address": [email], "password": "Sparkle-test-2026!", "first_name": first, "skip_password_checks": True})


db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
out = {}
for key, email, first, role in [("admin", "admin+clerk_test@sparkle.com", "Admin Teste", "admin"),
                                ("criativo", "criativo+clerk_test@sparkle.com", "Criativo Teste", "criativo"),
                                ("cliente", "contato+clerk_test@cafeaurora.com.br", "Cliente Aurora", "cliente")]:
    u = get_user(email, first)
    db.users.update_one({"user_id": u["id"]}, {"$set": {"role": role, "env": "preview", "email": email, "name": first},
                                               "$setOnInsert": {"client_id": "", "created_at": "2026-01-01T00:00:00+00:00"}}, upsert=True)
    if key == "cliente":
        c = db.clients.find_one({"name": {"$regex": "Aurora"}})
        if c:
            db.users.update_one({"user_id": u["id"]}, {"$set": {"client_id": c["id"]}})
    s = bapi("/sessions", {"user_id": u["id"]})
    tok = bapi(f"/sessions/{s['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]
    ticket = bapi("/sign_in_tokens", {"user_id": u["id"], "expires_in_seconds": 3600})["token"]
    out[key] = {"user_id": u["id"], "email": email, "token": tok, "ticket": ticket}

json.dump(out, open("/tmp/clerk_tokens.json", "w"))
print({k: {"user_id": v["user_id"], "email": v["email"]} for k, v in out.items()})
