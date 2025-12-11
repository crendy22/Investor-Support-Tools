from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple
import pandas as pd
import numpy as np


@dataclass
class GridMeta:
    start_row: int
    end_row: int
    note_rate_col: str
    price_columns: List[str]


@dataclass
class ParsedCustomer:
    org_name: str
    org_id: str
    nmlsid: str | None
    primary_email: str | None
    del_tier: str | None
    nondel_tier: str | None


@dataclass
class ParsedAdjustors:
    mapping: Dict[str, Dict]


NA_TIER_COLUMNS = [f"Unnamed:{i}" for i in range(3, 15)]


def parse_customer_tiers(csv_path: str) -> List[ParsedCustomer]:
    df = pd.read_csv(csv_path)
    results: List[ParsedCustomer] = []
    for _, row in df.iterrows():
        results.append(
            ParsedCustomer(
                org_name=str(row.get("Org Name", "")),
                org_id=str(row.get("Org ID", "")),
                nmlsid=row.get("NMLSID") if not pd.isna(row.get("NMLSID")) else None,
                primary_email=row.get("Primary Email") if not pd.isna(row.get("Primary Email")) else None,
                del_tier=row.get("DEL NonAgency") if not pd.isna(row.get("DEL NonAgency")) else None,
                nondel_tier=row.get("ND NonAgency") if not pd.isna(row.get("ND NonAgency")) else None,
            )
        )
    return results


def _extract_tier_mapping(sheet_df: pd.DataFrame) -> Tuple[dict, dict]:
    filled_rows = [i for i, row in sheet_df.iterrows() if row[NA_TIER_COLUMNS].notna().all()]
    if len(filled_rows) < 2:
        raise ValueError("Unable to find mapping rows in adjustor sheet")
    numeric_row = filled_rows[-2]
    code_row = filled_rows[-1]
    numeric_values = sheet_df.loc[numeric_row, NA_TIER_COLUMNS].tolist()
    tier_codes = sheet_df.loc[code_row, NA_TIER_COLUMNS].tolist()
    num_to_code = {int(num): code for num, code in zip(numeric_values, tier_codes)}
    code_to_num = {v: k for k, v in num_to_code.items()}
    return num_to_code, code_to_num


def parse_adjustors(adjustors_path: str) -> ParsedAdjustors:
    workbook = pd.ExcelFile(adjustors_path)
    mapping: Dict[str, Dict] = {}
    for sheet in workbook.sheet_names:
        channel = "DEL" if "DEL" in sheet.upper() else "NONDEL"
        df = workbook.parse(sheet)
        num_to_code, _ = _extract_tier_mapping(df)
        channel_data: Dict[str, Dict] = {}
        current_group = None
        for idx, row in df.iterrows():
            label = row.get("Unnamed:0")
            if label == "GRID":
                current_group = None
                continue
            if isinstance(label, str) and label.strip():
                current_group = label.strip().upper()
                continue
            if current_group and row.get("Unnamed:1") and row.get("Unnamed:2"):
                adjustments = {}
                for col, num_index in zip(NA_TIER_COLUMNS, range(1, 13)):
                    tier_code = num_to_code.get(num_index)
                    adjustments[tier_code] = float(row.get(col) or 0)
                channel_data[current_group] = {
                    "BASE": float(row.get("Unnamed:3") or 0),
                    "tiers": adjustments,
                    "product_id": row.get("Unnamed:1"),
                    "product_name": row.get("Unnamed:2"),
                }
        mapping[channel] = channel_data
    return ParsedAdjustors(mapping=mapping)


def parse_base_grid(base_xlsx_path: str, sheet_name: str) -> Tuple[pd.DataFrame, GridMeta]:
    df = pd.read_excel(base_xlsx_path, sheet_name=sheet_name)
    note_rate_row = None
    note_rate_col = None
    for col in df.columns:
        note_locations = df.index[df[col] == "Note Rate"].tolist()
        if note_locations:
            note_rate_row = note_locations[0]
            note_rate_col = col
            break
    if note_rate_row is None:
        raise ValueError("Could not find 'Note Rate' header row")

    price_cols = []
    start_row = note_rate_row + 1
    for col in df.columns:
        if col == note_rate_col:
            continue
        sample_value = df.loc[start_row, col]
        if isinstance(sample_value, (int, float, np.number)) or pd.api.types.is_numeric_dtype(df[col]):
            price_cols.append(col)
    data_rows = []
    for idx in range(start_row, len(df)):
        row_values = df.loc[idx, [note_rate_col] + price_cols]
        if row_values[price_cols].isna().all():
            break
        data_rows.append(row_values)
    grid_df = pd.DataFrame(data_rows, columns=[note_rate_col] + price_cols)
    grid_df = grid_df.rename(columns={note_rate_col: "note_rate"})
    meta = GridMeta(start_row=start_row, end_row=start_row + len(grid_df) - 1, note_rate_col=note_rate_col, price_columns=price_cols)
    return grid_df, meta


def write_tier_grid_to_workbook(base_xlsx_path: str, sheet_name: str, grid_meta: GridMeta, adjusted_grid_df: pd.DataFrame, output_path: str, annotation: str | None = None) -> None:
    wb = pd.ExcelFile(base_xlsx_path)
    sheet_df = wb.parse(sheet_name)
    for i, (_, row) in enumerate(adjusted_grid_df.iterrows()):
        target_index = grid_meta.start_row + i
        sheet_df.loc[target_index, grid_meta.note_rate_col] = row["note_rate"]
        for col in grid_meta.price_columns:
            sheet_df.loc[target_index, col] = row[col]
    if annotation:
        sheet_df.loc[0, "Generated Info"] = annotation
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        for name in wb.sheet_names:
            if name == sheet_name:
                sheet_df.to_excel(writer, sheet_name=name, index=False)
            else:
                wb.parse(name).to_excel(writer, sheet_name=name, index=False)
