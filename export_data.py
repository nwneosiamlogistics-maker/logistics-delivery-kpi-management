import csv
import os
from pathlib import Path

import requests

BASE_URL = os.getenv("FIREBASE_EMULATOR_URL")


def resolve_base_url():
    if not BASE_URL:
        raise RuntimeError("ต้องตั้งค่า FIREBASE_EMULATOR_URL ให้ชี้ฐานข้อมูลจริง (ห้ามใช้ข้อมูลจำลอง)")
    lowered = BASE_URL.lower()
    if "ns=demo" in lowered or "localhost" in lowered:
        raise RuntimeError("ปฏิเสธการใช้ demo/localhost — โปรดระบุ URL ของ Realtime DB จริง")
    return BASE_URL


# ฟังก์ชันสำหรับบันทึกไฟล์ (ต้องสร้างขึ้นมาเอง)
def save_csv(rows, file_path):
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    print(f"บันทึกไฟล์สำเร็จ: {file_path}")


def fetch_data():
    resp = requests.get(resolve_base_url())
    resp.raise_for_status()
    return resp.json() or {}


def main():
    data = fetch_data()
    samples = Path("samples")

    # --- ส่วนของ POD ---
    rows_pod = [["เลขที่ใบสินค้า", "เลขที่อ้างอิง", "ผู้ส่ง", "ผู้รับสินค้า", "นัดส่ง", "ชิ้น", "วันที่เพิ่ม"]]
    for v in (data.get("pod") or {}).values():
        rows_pod.append([
            v.get("เลขที่ใบสินค้า"), v.get("เลขที่อ้างอิง"), v.get("ผู้ส่ง"),
            v.get("ผู้รับสินค้า"), v.get("นัดส่ง"), v.get("ชิ้น"), v.get("วันที่เพิ่ม")
        ])
    save_csv(rows_pod, samples / "POD_clean.csv")

    # --- ส่วนของ SLA ---
    rows_sla = [["customer", "delivery_sla_days", "pod_sla_days"]]
    for k, v in (data.get("customer_sla") or {}).items():
        rows_sla.append([k, v.get("delivery_sla_days"), v.get("pod_sla_days")])
    save_csv(rows_sla, samples / "customer_sla.csv")

    # --- ส่วนของ Reference Map ---
    rows_ref = [["orderNo", "reference"]]
    for v in (data.get("order_reference_map") or {}).values():
        rows_ref.append([v.get("orderNo"), v.get("reference")])
    save_csv(rows_ref, samples / "order_reference_map.csv")

    print("--- ดำเนินการเสร็จสิ้นทั้งหมด ---")


if __name__ == "__main__":
    main()
