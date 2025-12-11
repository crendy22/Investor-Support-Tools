from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List
import json


class Settings(BaseSettings):
    database_url: str = Field("postgresql+psycopg2://postgres:postgres@db:5432/investors", alias="DATABASE_URL")
    redis_url: str = Field("redis://redis:6379/0", alias="REDIS_URL")
    sendgrid_api_key: str = Field("", alias="SENDGRID_API_KEY")
    email_from_address: str = Field("noreply@example.com", alias="EMAIL_FROM_ADDRESS")
    default_admin_emails: List[str] = Field(default_factory=lambda: ["admin@example.com"], alias="DEFAULT_ADMIN_EMAILS")
    app_secret_key: str = Field("change-me", alias="APP_SECRET_KEY")
    storage_root: str = Field("/workspace/Investor-Support-Tools/data", alias="STORAGE_ROOT")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @classmethod
    def parse_default_admin_emails(cls, value: str | List[str]):
        if isinstance(value, list):
            return value
        try:
            return json.loads(value)
        except Exception:
            return [email.strip() for email in value.split(",") if email.strip()]


def get_settings() -> Settings:
    settings = Settings()
    if isinstance(settings.default_admin_emails, str):
        settings.default_admin_emails = Settings.parse_default_admin_emails(settings.default_admin_emails)
    return settings


settings = get_settings()
