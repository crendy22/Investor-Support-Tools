from datetime import date
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import JobRun, Investor, JobStatus, JobType, UploadedFile, FileType, RateSheet, EmailDistribution, EmailDistributionRecipientList
from app.schemas.phh import JobRunSummary, JobRunDetail, RateSheetResponse, UploadedFileInfo, EmailSendRequest
from app.core.pricing_engine import PricingEngine
from app.email import send_rate_sheet_email

router = APIRouter(prefix="/api/phh", tags=["phh"])


@router.post("/ingest")
def ingest(
    effective_date: str,
    customer_tiers_csv: UploadFile = File(...),
    del_base_xlsx: UploadFile = File(...),
    nondel_base_xlsx: UploadFile = File(...),
    adjustors_xlsx: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    investor = db.query(Investor).filter(Investor.code == "PHH").first()
    if not investor:
        raise HTTPException(status_code=400, detail="PHH investor not seeded")
    eff_date = date.fromisoformat(effective_date)
    storage_root = Path(settings.storage_root) / "uploads"
    storage_root.mkdir(parents=True, exist_ok=True)
    files = [
        (customer_tiers_csv, FileType.CUSTOMER_TIERS),
        (del_base_xlsx, FileType.DEL_BASE),
        (nondel_base_xlsx, FileType.NONDEL_BASE),
        (adjustors_xlsx, FileType.ADJUSTORS),
    ]
    for upload, kind in files:
        target_path = storage_root / upload.filename
        with open(target_path, "wb") as f:
            f.write(upload.file.read())
        db.add(
            UploadedFile(
                investor_id=investor.id,
                file_type=kind,
                original_filename=upload.filename,
                stored_path=str(target_path),
            )
        )
    job = JobRun(
        investor_id=investor.id,
        status=JobStatus.PENDING,
        job_type=JobType.DAILY_PHH_NONAGENCY,
        effective_date=eff_date,
    )
    db.add(job)
    db.commit()
    PricingEngine(db).generate(job.id)
    return {"job_id": job.id}


@router.get("/jobs", response_model=List[JobRunSummary])
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(JobRun).order_by(JobRun.started_at.desc()).all()
    return jobs


@router.get("/jobs/{job_id}", response_model=JobRunDetail)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(JobRun).filter(JobRun.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    uploaded = db.query(UploadedFile).filter(UploadedFile.investor_id == job.investor_id).all()
    ratesheets = db.query(RateSheet).filter(RateSheet.job_run_id == job.id).all()
    return JobRunDetail(
        id=job.id,
        status=job.status,
        effective_date=job.effective_date,
        job_type=job.job_type,
        uploaded_files=[UploadedFileInfo.from_orm(u) for u in uploaded],
        ratesheets=[RateSheetResponse(id=r.id, channel=r.channel, product_type=str(r.product_type_id), tier=str(r.tier_id), adjustment_applied=r.adjustment_applied, generated_filename=r.generated_filename, generated_path=r.generated_path) for r in ratesheets],
        payload=job.payload,
    )


@router.get("/jobs/{job_id}/ratesheets", response_model=List[RateSheetResponse])
def list_ratesheets(job_id: int, db: Session = Depends(get_db)):
    ratesheets = db.query(RateSheet).filter(RateSheet.job_run_id == job_id).all()
    return [
        RateSheetResponse(
            id=r.id,
            channel=r.channel,
            product_type=str(r.product_type_id),
            tier=str(r.tier_id),
            adjustment_applied=r.adjustment_applied,
            generated_filename=r.generated_filename,
            generated_path=r.generated_path,
        )
        for r in ratesheets
    ]


@router.post("/jobs/{job_id}/send_emails")
def send_emails(job_id: int, payload: EmailSendRequest, db: Session = Depends(get_db)):
    job = db.query(JobRun).filter(JobRun.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in {JobStatus.COMPLETED, JobStatus.WAITING_FOR_QC, JobStatus.APPROVED_FOR_DISTRIBUTION}:
        raise HTTPException(status_code=400, detail="Job not ready for distribution")
    ratesheets = db.query(RateSheet).filter(RateSheet.job_run_id == job.id).all()
    attachments = [r.generated_path for r in ratesheets]
    recipients = payload.recipients or settings.default_admin_emails
    if not payload.recipients:
        default_list = (
            db.query(EmailDistributionRecipientList)
            .filter(
                EmailDistributionRecipientList.investor_id == job.investor_id,
                EmailDistributionRecipientList.is_default_for_phh_nonagency == True,
            )
            .first()
        )
        if default_list:
            recipients = default_list.emails
    response = send_rate_sheet_email(
        subject=f"PHH Non-Agency Tiered Rate Sheets – {job.effective_date}",
        recipients=recipients,
        body=f"Attached rate sheets for {job.effective_date} ({len(attachments)} files).",
        attachments=attachments,
    )
    record = EmailDistribution(
        investor_id=job.investor_id,
        job_run_id=job.id,
        subject=f"PHH Non-Agency Tiered Rate Sheets – {job.effective_date}",
        recipient_list=recipients,
        attachments=[{"path": a} for a in attachments],
        status="SENT" if response.get("status") in {200, 202, "skipped"} else "FAILED",
        response_payload=response,
    )
    db.add(record)
    db.commit()
    return response
