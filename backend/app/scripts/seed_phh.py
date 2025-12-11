from app.database import SessionLocal, Base, engine
from app.models import Investor, ProductType, EmailDistributionRecipientList

Base.metadata.create_all(bind=engine)

def seed():
    db = SessionLocal()
    investor = db.query(Investor).filter(Investor.code == "PHH").first()
    if not investor:
        investor = Investor(name="PHH", code="PHH")
        db.add(investor)
        db.commit()
    for code, sheet in {
        "FULLDOC": "PHH - FullDoc",
        "ALTDOC": "PHH - AltDoc",
        "DSCR": "PHH - DSCR",
    }.items():
        pt = db.query(ProductType).filter(ProductType.investor_id == investor.id, ProductType.code == code).first()
        if not pt:
            db.add(ProductType(investor_id=investor.id, code=code, display_name=code.title(), sheet_name=sheet))
    existing = (
        db.query(EmailDistributionRecipientList)
        .filter(EmailDistributionRecipientList.investor_id == investor.id, EmailDistributionRecipientList.is_default_for_phh_nonagency == True)
        .first()
    )
    if not existing:
        db.add(
            EmailDistributionRecipientList(
                investor_id=investor.id,
                name="PHH Non-Agency Rate Sheets – Admin",
                emails=["ops@example.com"],
                is_default_for_phh_nonagency=True,
            )
        )
    db.commit()
    db.close()


if __name__ == "__main__":
    seed()
