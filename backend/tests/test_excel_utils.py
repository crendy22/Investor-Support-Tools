import pandas as pd
from app.core.excel_utils import parse_customer_tiers, parse_adjustors, parse_base_grid, write_tier_grid_to_workbook


def test_parse_customer_tiers(tmp_path):
    csv_path = tmp_path / "tiers.csv"
    df = pd.DataFrame([
        {
            "Org Name": "Org A",
            "Org ID": "123",
            "NMLSID": "456",
            "DEL NonAgency": "NA1",
            "ND NonAgency": "NA2",
            "Primary Email": "user@example.com",
        }
    ])
    df.to_csv(csv_path, index=False)
    result = parse_customer_tiers(csv_path)
    assert result[0].org_name == "Org A"
    assert result[0].del_tier == "NA1"
    assert result[0].nondel_tier == "NA2"


def _build_adjustor_sheet(tmp_path):
    data = {
        "Unnamed:0": ["GRID", "FULLDOC", None, None, None, "GRID", "ALTDOC", None],
        "Unnamed:1": [None, "P1", "P2", "P3", "P4", None, "P5", "P6"],
        "Unnamed:2": [None, "Prod1", "Prod2", "Prod3", "Prod4", None, "Prod5", "Prod6"],
        "Unnamed:3": ["BASE", 0, 0, 0, 0, "BASE", 0, 0],
    }
    for idx, col in enumerate(range(4, 15), start=1):
        data[f"Unnamed:{col}"] = [f"TIER {idx} - DEL TOTAL"] + [0.1 * idx] * 7
    numeric_row = [None] * 3 + list(range(1, 13))
    code_row = [None] * 3 + [f"NA{i}" for i in range(1, 13)]
    df = pd.DataFrame(data)
    df = pd.concat([df, pd.DataFrame([numeric_row, code_row], columns=df.columns)], ignore_index=True)
    xlsx_path = tmp_path / "adjustors.xlsx"
    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="NQM DEL INPUT", index=False)
        df.to_excel(writer, sheet_name="NQM NONDEL INPUT", index=False)
    return xlsx_path


def test_parse_adjustors(tmp_path):
    xlsx_path = _build_adjustor_sheet(tmp_path)
    result = parse_adjustors(xlsx_path)
    assert "DEL" in result.mapping
    full_doc = result.mapping["DEL"].get("FULLDOC")
    assert full_doc["tiers"]["NA1"] == 0.1


def test_parse_base_grid_and_write(tmp_path):
    df = pd.DataFrame(
        {
            "Unnamed:0": [None, None, None],
            "Unnamed:1": [None, None, None],
            "Unnamed:2": [None, None, None],
            "Unnamed:3": [None, "Note Rate", 3.0],
            "Unnamed:4": [None, "15 Yr", 99.0],
        }
    )
    xlsx_path = tmp_path / "base.xlsx"
    df.to_excel(xlsx_path, sheet_name="PHH - FullDoc", index=False)
    grid_df, meta = parse_base_grid(xlsx_path, "PHH - FullDoc")
    assert list(grid_df.columns) == ["note_rate", "Unnamed:4"]
    adjusted = grid_df.copy()
    adjusted["Unnamed:4"] = adjusted["Unnamed:4"] + 0.25
    output = tmp_path / "out.xlsx"
    write_tier_grid_to_workbook(xlsx_path, "PHH - FullDoc", meta, adjusted.rename(columns={"note_rate": meta.note_rate_col}), output)
    assert output.exists()
