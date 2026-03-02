import argparse
from pathlib import Path

import pandas as pd


def parse_thai_date(val: str):
    """Parse Thai Buddhist date like 27/2/2569 [hh:mm:ss optional] to pandas Timestamp."""
    if pd.isna(val):
        return pd.NaT
    s = str(val).strip()
    if not s:
        return pd.NaT
    # keep only date part (split by space)
    date_part = s.split()[0]
    if "/" in date_part:
        try:
            d, m, y = date_part.split("/")
            y_int = int(y)
            # convert BE to CE if it looks like BE (>=2400)
            if y_int >= 2400:
                y_int -= 543
            return pd.to_datetime(f"{y_int}-{m}-{d}", errors="coerce")
        except Exception:
            pass
    # fallback to pandas parser
    return pd.to_datetime(s, dayfirst=True, errors="coerce")


def parse_date_any(val: str):
    if pd.isna(val):
        return pd.NaT
    s = str(val).strip()
    if not s:
        return pd.NaT
    ts = pd.to_datetime(s, errors="coerce")
    if pd.isna(ts):
        ts = parse_thai_date(s)
    return ts


def safe_float(series: pd.Series):
    return pd.to_numeric(series, errors="coerce")


def normalize_inv(val: str):
    if pd.isna(val):
        return ""
    s = str(val).strip().upper()
    # remove spaces and hyphens to improve matching
    return s.replace(" ", "").replace("-", "")


def main(args):
    base = Path(args.base_dir)
    delivery_path = base / "samples" / "delivery_import_sample_en.csv"
    pod_path = base / "samples" / "POD_clean.csv"
    sla_path = base / "samples" / "customer_sla.csv"
    ref_map_path = base / "samples" / "order_reference_map.csv"
    reports_dir = base / "dist" / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    delivery = pd.read_csv(delivery_path, dtype=str)
    delivery["inv_no_raw"] = delivery["orderNo"].str.strip()
    delivery["inv_no"] = delivery["inv_no_raw"].apply(normalize_inv)
    # reference mapping (optional): orderNo -> external reference number
    if ref_map_path.exists():
        ref_map = pd.read_csv(ref_map_path, dtype=str)
        if {"orderNo", "reference"}.issubset(ref_map.columns):
            delivery = delivery.merge(ref_map, on="orderNo", how="left")
            # handle potential suffixes if delivery already had a reference column
            ref_candidates = [c for c in ["reference_y", "reference", "reference_x"] if c in delivery.columns]
            if ref_candidates:
                ref_col = ref_candidates[0]
                delivery["ref_raw"] = delivery[ref_col].fillna(delivery["orderNo"])
            else:
                delivery["ref_raw"] = delivery["orderNo"]
        else:
            delivery["ref_raw"] = delivery["orderNo"]
    else:
        if "reference" in delivery.columns:
            delivery["ref_raw"] = delivery["reference"].fillna(delivery["orderNo"])
        else:
            delivery["ref_raw"] = delivery["orderNo"]
    delivery["ref"] = delivery["ref_raw"].apply(normalize_inv)
    delivery["plan_date"] = pd.to_datetime(delivery["planDate"], errors="coerce")
    delivery["actual_date"] = pd.to_datetime(delivery["actualDate"], errors="coerce")
    delivery["qty"] = safe_float(delivery["qty"])

    pod = pd.read_csv(pod_path, dtype=str)
    pod["inv_no_raw"] = pod["เลขที่ใบสินค้า"].str.strip()
    pod["inv_no"] = pod["inv_no_raw"].apply(normalize_inv)
    pod["ref_raw"] = pod["เลขที่อ้างอิง"].astype(str).str.strip()
    pod["ref"] = pod["ref_raw"].apply(normalize_inv)
    pod["pod_plan_date"] = pod["นัดส่ง"].apply(parse_date_any)
    pod["pod_qty"] = safe_float(pod["ชิ้น"])
    pod_sender_col = "ผู้ส่ง"
    pod_receiver_col = "ผู้รับสินค้า"
    pod.rename(columns={pod_sender_col: "sender", pod_receiver_col: "receiver"}, inplace=True)

    sla = pd.read_csv(sla_path, dtype={"customer": str, "delivery_sla_days": float, "pod_sla_days": float})

    df = delivery.merge(
        pod[["ref", "pod_plan_date", "pod_qty", "sender", "receiver"]],
        left_on="ref",
        right_on="ref",
        how="left",
        suffixes=("", "_pod"),
    )

    df["effective_plan_date"] = df["plan_date"].fillna(df["pod_plan_date"])
    df["days_to_deliver"] = (df["actual_date"] - df["effective_plan_date"]).dt.days

    # Map SLA by sender (shipper) if available
    df = df.merge(
        sla,
        left_on="sender",
        right_on="customer",
        how="left",
    )

    def pct(num, den):
        # vectorized for Series, scalar fallback for summary
        if hasattr(num, "__len__"):
            return (100 * num / den).round(2).fillna(0)
        return round(100 * num / den, 2) if den else 0.0

    total_inv = len(df)
    total_qty = df["qty"].sum(skipna=True)

    ontime_1d = df["days_to_deliver"] <= 1
    ontime_2d = df["days_to_deliver"] <= 2
    delay_gt2 = df["days_to_deliver"] > 2

    summary = {
        "total_inv": total_inv,
        "total_qty": total_qty,
        "ontime_1d_%": pct(ontime_1d.sum(), total_inv),
        "ontime_2d_%": pct(ontime_2d.sum(), total_inv),
        "delay_gt2_%": pct(delay_gt2.sum(), total_inv),
        "delay_gt2_inv": int(delay_gt2.sum()),
        "pod_joined_inv": int(df["pod_qty"].notna().sum()),
    }

    print("=== KPI Summary ===")
    for k, v in summary.items():
        print(f"{k}: {v}")

    # Example: detail per customer sender (from POD)
    group = df.groupby("sender").agg(
        inv_count=("inv_no", "count"),
        qty_sum=("qty", "sum"),
        ontime_1d_sum=("days_to_deliver", lambda s: (s <= 1).sum()),
        ontime_2d_sum=("days_to_deliver", lambda s: (s <= 2).sum()),
        delay_gt2_sum=("days_to_deliver", lambda s: (s > 2).sum()),
    )
    group["ontime_1d_%"] = pct(group["ontime_1d_sum"], group["inv_count"])
    group["ontime_2d_%"] = pct(group["ontime_2d_sum"], group["inv_count"])
    group["delay_gt2_%"] = pct(group["delay_gt2_sum"], group["inv_count"])
    print("\n=== By Sender (ผู้ส่ง) ===")
    with pd.option_context("display.max_rows", None, "display.max_columns", None):
        print(group[["inv_count", "ontime_1d_%", "ontime_2d_%", "delay_gt2_%", "qty_sum"]])

    # Export CSVs
    df.to_csv(reports_dir / "kpi_detail.csv", index=False)
    group.reset_index().to_csv(reports_dir / "kpi_by_sender.csv", index=False)

    # Export Excel with pivots & chart
    excel_path = reports_dir / "kpi_report.xlsx"
    with pd.ExcelWriter(excel_path, engine="xlsxwriter") as writer:
        # Summary sheet
        summary_df = pd.DataFrame(summary.items(), columns=["metric", "value"])
        summary_df.to_excel(writer, sheet_name="summary", index=False)

        # Detail sheet
        df.to_excel(writer, sheet_name="detail", index=False)

        # Pivot by sender
        pivot_df = group[["inv_count", "ontime_1d_%", "ontime_2d_%", "delay_gt2_%", "qty_sum"]].reset_index()
        pivot_df.to_excel(writer, sheet_name="by_sender", index=False)

        # Also place by-sender table in summary sheet for quick view
        worksheet_summary = writer.sheets["summary"]
        start_row = len(summary_df) + 2
        worksheet_summary.write(start_row, 0, "sender")
        for col_idx, col_name in enumerate(["inv_count", "ontime_1d_%", "ontime_2d_%", "delay_gt2_%", "qty_sum"], start=1):
            worksheet_summary.write(start_row, col_idx, col_name)
        for r, (_, row) in enumerate(pivot_df.iterrows(), start=start_row + 1):
            worksheet_summary.write(r, 0, row["sender"])
            worksheet_summary.write(r, 1, row["inv_count"])
            worksheet_summary.write(r, 2, row["ontime_1d_%"])
            worksheet_summary.write(r, 3, row["ontime_2d_%"])
            worksheet_summary.write(r, 4, row["delay_gt2_%"])
            worksheet_summary.write(r, 5, row["qty_sum"])

        # Chart on summary sheet
        workbook = writer.book
        worksheet = writer.sheets["summary"]
        chart = workbook.add_chart({"type": "column"})
        # metrics rows 0..n-1
        chart.add_series({
            "name": "Ontime %",
            "categories": ["summary", 0, 0, len(summary_df) - 1, 0],
            "values": ["summary", 0, 1, len(summary_df) - 1, 1],
        })
        chart.set_title({"name": "KPI Summary"})
        chart.set_legend({"position": "bottom"})
        worksheet.insert_chart("D2", chart)

    print(f"\nWritten CSVs to: {reports_dir}")
    print(f"Written Excel to: {excel_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute delivery KPIs from sample data")
    parser.add_argument("--base-dir", default=".", help="Project base directory (default: current)")
    args = parser.parse_args()
    main(args)
