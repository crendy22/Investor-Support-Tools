# LoanNex Bulk Locker Web App

A web-based automation tool for bulk loan locking in LoanNex. Upload a CSV with loan pricing data and lock multiple loans automatically.

## Features

- 🔐 Secure credential handling (never stored)
- 📄 CSV upload with loan preview
- 🎯 Smart price matching (6 criteria)
- ⚡ Real-time progress updates via WebSocket
- 🖥️ Runs headless Chromium automation

## Local Development

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Start the server
npm start

# Open http://localhost:3000
```

## Deployment Options

### Option 1: Railway (Recommended)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repo
5. Railway auto-detects the Dockerfile and deploys

The `railway.toml` is pre-configured for you.

### Option 2: Render

1. Push code to GitHub  
2. Go to [render.com](https://render.com)
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Select "Docker" as environment
6. Deploy

The `render.yaml` is pre-configured for you.

### Option 3: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (from project directory)
fly launch

# Deploy
fly deploy
```

### Option 4: Docker (Self-hosted)

```bash
# Build the image
docker build -t loannex-locker .

# Run the container
docker run -p 3000:3000 loannex-locker
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |

## CSV Format

Your CSV must include these columns for locking:

**Required for price matching:**
- `LoanNumber` - Unique identifier
- `Rate` - Target rate (e.g., 7.125)
- `Price` - Target price (e.g., 102.005)
- `InvestorName` - Investor name
- `ProductDescription` - Product name
- `LockDays` - Lock period
- `ProgramName` - Program name
- `Lock?` - Mark with "X" to lock

**Required for lock form:**
- `Borrower First Name`
- `Borrower Last Name`
- `Subject Property Address`
- `City`
- `Zip`

**Plus all standard loan fields** (LoanType, Occupancy, PropertyType, etc.)

## Security Notes

- Credentials are only used for the current session
- No data is stored server-side after processing
- WebSocket connections are session-based
- Recommend using HTTPS in production

## License

Private - Exchange Mortgage
