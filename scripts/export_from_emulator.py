import csv
import os
from pathlib import Path
import requests

BASE_URL = os.getenv("FIREBASE_EMULATOR_URL", "http://localhost:9000/.json?ns=demo")

samples = Path("samples")
samples.mkdir(exist_ok=True)


def save_csv(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    print(f"written {path}")


def main():
    resp = requests.get(BASE_URL)
    resp.raise_for_status()
    data = resp.json() or {}

    # delivery
    rows = [["orderNo", "district", "storeId", "planDate", "actualDate", "qty", "sender", "reference"]]
    for v in (data.get("delivery") or {}).values():
        rows.append([
            v.get("orderNo"),
            v.get("district"),
            v.get("storeId"),
            v.get("planDate"),
            v.get("actualDate"),
            v.get("qty"),
            v.get("sender"),
            v.get("reference"),
        ])
    save_csv(rows, samples / "delivery_import_sample_en.csv")

    # pod
    rows = [["เลขที่ใบสินค้า", "เลขที่อ้างอิง", "ผู้ส่ง", "ผู้รับสินค้า", "นัดส่ง", "ชิ้น", "วันที่เพิ่ม"]]
    for v in (data.get("pod") or {}).values():
        rows.append([
            v.get("เลขที่ใบสินค้า"),
            v.get("เลขที่อ้างอิง"),
            v.get("ผู้ส่ง"),
            v.get("ผู้รับสินค้า"),
            v.get("นัดส่ง"),
            v.get("ชิ้น"),
            v.get("วันที่เพิ่ม"),
        ])
    save_csv(rows, samples / "POD_clean.csv")

    # sla
    rows = [["customer", "delivery_sla_days", "pod_sla_days"]]
    for k, v in (data.get("customer_sla") or {}).items():
        rows.append([k, v.get("delivery_sla_days"), v.get("pod_sla_days")])
    save_csv(rows, samples / "customer_sla.csv")

    # reference map
    rows = [["orderNo", "reference"]]
    for v in (data.get("order_reference_map") or {}).values():
        rows.append([v.get("orderNo"), v.get("reference")])
    save_csv(rows, samples / "order_reference_map.csv")

    print("done")


if __name__ == "__main__":
    main()
