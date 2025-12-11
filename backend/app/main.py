from fastapi import FastAPI
from app.api import auth, phh
from app.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Investor Support Tools")
app.include_router(auth.router)
app.include_router(phh.router)


@app.get("/")
def root():
    return {"status": "ok"}
