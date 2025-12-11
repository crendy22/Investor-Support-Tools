from datetime import date
from typing import List, Optional
from pydantic import BaseModel
from app.models import ChannelEnum, JobStatus


class UploadedFileInfo(BaseModel):
    id: int
    file_type: str
    original_filename: str
    stored_path: str
    uploaded_at: str

    class Config:
        orm_mode = True


class RateSheetResponse(BaseModel):
    id: int
    channel: ChannelEnum
    product_type: str | None
    tier: str | None
    adjustment_applied: float
    generated_filename: str
    generated_path: str

    class Config:
        orm_mode = True


class JobRunSummary(BaseModel):
    id: int
    status: JobStatus
    effective_date: date
    job_type: str

    class Config:
        orm_mode = True


class JobRunDetail(JobRunSummary):
    uploaded_files: List[UploadedFileInfo] = []
    ratesheets: List[RateSheetResponse] = []
    payload: Optional[dict]


class EmailSendRequest(BaseModel):
    recipients: Optional[List[str]] = None
