# Backend

This service exposes the FastAPI workflow for PHH Non-Agency rate sheet generation and distribution.

## Setup
1. Create and activate a virtual environment:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the API locally:
   ```bash
   uvicorn app.main:app --reload
   ```

## Database
The app expects a PostgreSQL database configured via the `DATABASE_URL` environment variable. Alembic migrations can be applied with:
```bash
alembic upgrade head
```

## Testing
Unit tests live under `backend/tests`. After installing dependencies, run:
```bash
pytest
```

If any optional services (e.g., Redis) are unavailable, you can still run the FastAPI app with stubs, but integration tests may require the full Docker Compose stack.
