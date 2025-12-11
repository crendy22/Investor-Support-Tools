from typing import List
import base64
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition
from app.config import settings


def send_rate_sheet_email(subject: str, recipients: List[str], body: str, attachments: List[str]) -> dict:
    message = Mail(
        from_email=settings.email_from_address,
        to_emails=recipients,
        subject=subject,
        plain_text_content=body,
    )
    for file_path in attachments:
        with open(file_path, "rb") as f:
            data = f.read()
        encoded = base64.b64encode(data).decode()
        attachment = Attachment(
            FileContent(encoded),
            FileName(file_path.split("/")[-1]),
            FileType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            Disposition("attachment"),
        )
        message.add_attachment(attachment)
    if not settings.sendgrid_api_key:
        return {"status": "skipped", "reason": "SENDGRID_API_KEY not configured"}
    sg = SendGridAPIClient(settings.sendgrid_api_key)
    response = sg.send(message)
    return {"status": response.status_code, "body": str(response.body)}
