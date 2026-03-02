import os
from pathlib import Path
from typing import Any, Dict

import firebase_admin
from firebase_admin import credentials, db
import pandas as pd


# Environment variables expected:
# FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DB_URL
# Place your service account fields in env or .env.local (do NOT commit secrets).


def init_app():
    if firebase_admin._apps:
        return firebase_admin.get_app()
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    private_key = os.getenv("FIREBASE_PRIVATE_KEY")
    db_url = os.getenv("FIREBASE_DB_URL")
    if not all([project_id, client_email, private_key, db_url]):
        raise RuntimeError("Firebase env vars missing: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DB_URL")
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": project_id,
        "private_key_id": "dummy",
        "private_key": private_key.replace("\\n", "\n"),
        "client_email": client_email,
        "client_id": "dummy",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email}",
    })
    firebase_admin.initialize_app(cred, {"databaseURL": db_url})
    return firebase_admin.get_app()


def fetch_node(path: str) -> Dict[str, Any]:
    ref = db.reference(path)
    data = ref.get() or {}
    return data


def write_csv(data: Dict[str, Any], path: Path, columns: list[str]):
    df = pd.DataFrame.from_dict(data, orient="index")
    if columns:
        for c in columns:
            if c not in df.columns:
                df[c] = None
        df = df[columns]
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    return df


def export_to_samples(base_dir: Path):
    init_app()
    base = Path(base_dir)
    samples = base / "samples"

    delivery = fetch_node("/delivery")
    pod = fetch_node("/pod")
    sla = fetch_node("/customer_sla")
    ref_map = fetch_node("/order_reference_map")

    write_csv(delivery, samples / "delivery_import_sample_en.csv", columns=["orderNo", "district", "storeId", "planDate", "actualDate", "qty", "sender", "reference"])
    write_csv(pod, samples / "POD_clean.csv", columns=["เลขที่ใบสินค้า", "เลขที่อ้างอิง", "ผู้ส่ง", "ผู้รับสินค้า", "นัดส่ง", "ชิ้น", "วันที่เพิ่ม", "สถานะPOD", "วันที่คืนPOD"])
    write_csv(sla, samples / "customer_sla.csv", columns=["customer", "delivery_sla_days", "pod_sla_days"])
    write_csv(ref_map, samples / "order_reference_map.csv", columns=["orderNo", "reference"])


if __name__ == "__main__":
    export_to_samples(Path("."))
