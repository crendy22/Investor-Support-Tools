from datetime import datetime, date
from typing import Optional
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Enum, JSON, Float
from sqlalchemy.orm import relationship
import enum
from app.database import Base


class RoleEnum(str, enum.Enum):
    admin = "admin"
    viewer = "viewer"


class ChannelEnum(str, enum.Enum):
    DEL = "DEL"
    NONDEL = "NONDEL"


class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"
    WAITING_FOR_QC = "WAITING_FOR_QC"
    APPROVED_FOR_DISTRIBUTION = "APPROVED_FOR_DISTRIBUTION"
    DISTRIBUTED = "DISTRIBUTED"


class JobType(str, enum.Enum):
    DAILY_PHH_NONAGENCY = "DAILY_PHH_NONAGENCY"


class FileType(str, enum.Enum):
    CUSTOMER_TIERS = "CUSTOMER_TIERS"
    DEL_BASE = "DEL_BASE"
    NONDEL_BASE = "NONDEL_BASE"
    ADJUSTORS = "ADJUSTORS"


class EmailStatus(str, enum.Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.admin)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Investor(Base):
    __tablename__ = "investors"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False, unique=True)
    is_active = Column(Boolean, default=True)

    tiers = relationship("Tier", back_populates="investor")


class Seller(Base):
    __tablename__ = "sellers"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    org_name = Column(String)
    org_id = Column(String, index=True)
    nmlsid = Column(String)
    primary_email = Column(String)
    secondary_emails = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)

    investor = relationship("Investor")


class SellerTierAssignment(Base):
    __tablename__ = "seller_tier_assignments"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    seller_id = Column(Integer, ForeignKey("sellers.id"))
    channel = Column(Enum(ChannelEnum))
    non_agency_tier_code = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    seller = relationship("Seller")
    investor = relationship("Investor")


class Tier(Base):
    __tablename__ = "tiers"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    code = Column(String, index=True)
    numeric_index = Column(Integer)
    description = Column(String)
    is_active = Column(Boolean, default=True)

    investor = relationship("Investor", back_populates="tiers")


class ProductType(Base):
    __tablename__ = "product_types"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    code = Column(String)
    display_name = Column(String)
    sheet_name = Column(String)

    investor = relationship("Investor")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    file_type = Column(Enum(FileType))
    original_filename = Column(String)
    stored_path = Column(String)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"))
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    investor = relationship("Investor")


class JobRun(Base):
    __tablename__ = "job_runs"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    status = Column(Enum(JobStatus), default=JobStatus.PENDING)
    job_type = Column(Enum(JobType))
    effective_date = Column(Date)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime)
    error_message = Column(String)
    payload = Column(JSON, default=dict)

    investor = relationship("Investor")


class RateSheet(Base):
    __tablename__ = "rate_sheets"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    job_run_id = Column(Integer, ForeignKey("job_runs.id"))
    channel = Column(Enum(ChannelEnum))
    product_type_id = Column(Integer, ForeignKey("product_types.id"))
    tier_id = Column(Integer, ForeignKey("tiers.id"))
    effective_date = Column(Date)
    generated_filename = Column(String)
    generated_path = Column(String)
    adjustment_applied = Column(Float)
    metadata = Column(JSON, default=dict)

    investor = relationship("Investor")


class EmailDistribution(Base):
    __tablename__ = "email_distributions"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    job_run_id = Column(Integer, ForeignKey("job_runs.id"))
    subject = Column(String)
    recipient_list = Column(JSON, default=list)
    attachments = Column(JSON, default=list)
    status = Column(Enum(EmailStatus), default=EmailStatus.PENDING)
    response_payload = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    investor = relationship("Investor")


class EmailDistributionRecipientList(Base):
    __tablename__ = "email_recipient_lists"

    id = Column(Integer, primary_key=True)
    investor_id = Column(Integer, ForeignKey("investors.id"))
    name = Column(String)
    emails = Column(JSON, default=list)
    is_default_for_phh_nonagency = Column(Boolean, default=False)

    investor = relationship("Investor")


class QCReview(Base):
    __tablename__ = "qc_reviews"

    id = Column(Integer, primary_key=True)
    job_run_id = Column(Integer, ForeignKey("job_runs.id"))
    reviewer_user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String)
    comments = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
