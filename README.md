# Investor Support Tools

This monorepo provides a PHH Non-Agency rate sheet generation workflow with FastAPI backend and React/MUI frontend.

## Backend
- FastAPI with SQLAlchemy models for investors, tiers, uploads, and job runs.
- Parsing utilities for customer tiers CSV, adjustor templates, and base pricing grids.
- Pricing engine that creates adjusted rate sheets for DEL and NONDEL channels and persists metadata.
- SendGrid integration to email generated sheets.

### Running locally
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Frontend
- React + TypeScript (Vite) dashboard for ingesting files, monitoring job runs, and triggering email distribution.

```bash
cd frontend
npm install
npm run dev
```

## Docker Compose
`docker-compose up` runs PostgreSQL, Redis, backend, and frontend containers for development.
