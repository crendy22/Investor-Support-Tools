from __future__ import annotations
from datetime import datetime
from pathlib import Path
from typing import Dict, List
import pandas as pd
from sqlalchemy.orm import Session
from app.core.excel_utils import parse_customer_tiers, parse_adjustors, parse_base_grid, write_tier_grid_to_workbook
from app.models import (
    ChannelEnum,
    Investor,
    JobRun,
    JobStatus,
    JobType,
    UploadedFile,
    FileType,
    Tier,
    ProductType,
    RateSheet,
)
from app.config import settings


DEFAULT_TIER_CODES = [f"NA{i}" for i in range(1, 13)]
PRODUCT_GROUPS = {
    "FULLDOC": "PHH - FullDoc",
    "ALTDOC": "PHH - AltDoc",
    "DSCR": "PHH - DSCR",
}


class PricingEngine:
    def __init__(self, db: Session):
        self.db = db

    def _fetch_uploaded_path(self, job_run: JobRun, file_type: FileType) -> str:
        record = (
            self.db.query(UploadedFile)
            .filter(UploadedFile.investor_id == job_run.investor_id, UploadedFile.file_type == file_type)
            .order_by(UploadedFile.uploaded_at.desc())
            .first()
        )
        if not record:
            raise ValueError(f"Missing uploaded file for {file_type}")
        return record.stored_path

    def _ensure_tiers(self, investor_id: int, adjustor_mapping: Dict[str, Dict]):
        tier_codes = set()
        for channel_data in adjustor_mapping.values():
            for product_data in channel_data.values():
                tier_codes.update(product_data.get("tiers", {}).keys())
        for code in tier_codes:
            numeric = int(code.replace("NA", "")) if code and code.startswith("NA") else None
            tier = self.db.query(Tier).filter(Tier.investor_id == investor_id, Tier.code == code).first()
            if not tier:
                tier = Tier(investor_id=investor_id, code=code, numeric_index=numeric)
                self.db.add(tier)
        self.db.commit()

    def generate(self, job_run_id: int) -> Dict:
        job_run = self.db.query(JobRun).filter(JobRun.id == job_run_id).first()
        if not job_run:
            raise ValueError("JobRun not found")
        job_run.status = JobStatus.RUNNING
        self.db.commit()

        customer_csv = self._fetch_uploaded_path(job_run, FileType.CUSTOMER_TIERS)
        adjustor_path = self._fetch_uploaded_path(job_run, FileType.ADJUSTORS)
        del_base_path = self._fetch_uploaded_path(job_run, FileType.DEL_BASE)
        nondel_base_path = self._fetch_uploaded_path(job_run, FileType.NONDEL_BASE)

        parse_customer_tiers(customer_csv)
        adjustors = parse_adjustors(adjustor_path)
        self._ensure_tiers(job_run.investor_id, adjustors.mapping)

        output_records: List[RateSheet] = []
        for channel in [ChannelEnum.DEL, ChannelEnum.NONDEL]:
            base_path = del_base_path if channel == ChannelEnum.DEL else nondel_base_path
            channel_adjustors = adjustors.mapping.get(channel.value, {})
            for product_code, sheet_name in PRODUCT_GROUPS.items():
                if product_code not in channel_adjustors:
                    continue
                grid_df, meta = parse_base_grid(base_path, sheet_name)
                product_type = (
                    self.db.query(ProductType)
                    .filter(ProductType.investor_id == job_run.investor_id, ProductType.code == product_code)
                    .first()
                )
                if not product_type:
                    product_type = ProductType(
                        investor_id=job_run.investor_id,
                        code=product_code,
                        display_name=product_code.title(),
                        sheet_name=sheet_name,
                    )
                    self.db.add(product_type)
                    self.db.commit()
                adjustments = channel_adjustors[product_code].get("tiers", {})
                tier_codes = list(adjustments.keys()) or DEFAULT_TIER_CODES
                for tier_code in tier_codes:
                    adjustment_value = adjustments.get(tier_code, 0)
                    adjusted_df = grid_df.copy()
                    price_cols = meta.price_columns
                    for col in price_cols:
                        adjusted_df[col] = adjusted_df[col].astype(float) + adjustment_value
                    output_dir = Path(settings.storage_root) / "PHH" / job_run.effective_date.strftime("%Y%m%d") / channel.value / product_code
                    output_dir.mkdir(parents=True, exist_ok=True)
                    filename = f"PHH_{channel.value}_{product_code}_{tier_code}_{job_run.effective_date.strftime('%Y%m%d')}.xlsx"
                    output_path = output_dir / filename
                    write_tier_grid_to_workbook(
                        base_path,
                        sheet_name,
                        meta,
                        adjusted_df.rename(columns={"note_rate": meta.note_rate_col}),
                        output_path=str(output_path),
                        annotation=f"Channel: {channel.value} Tier: {tier_code}",
                    )
                    tier = self.db.query(Tier).filter(Tier.investor_id == job_run.investor_id, Tier.code == tier_code).first()
                    rate_sheet = RateSheet(
                        investor_id=job_run.investor_id,
                        job_run_id=job_run.id,
                        channel=channel,
                        product_type_id=product_type.id,
                        tier_id=tier.id if tier else None,
                        effective_date=job_run.effective_date,
                        generated_filename=filename,
                        generated_path=str(output_path),
                        adjustment_applied=adjustment_value,
                        metadata={"product_code": product_code},
                    )
                    self.db.add(rate_sheet)
                    output_records.append(rate_sheet)
        job_run.status = JobStatus.COMPLETED
        job_run.finished_at = datetime.utcnow()
        job_run.payload = {"generated": len(output_records)}
        self.db.commit()
        return {"count": len(output_records)}
