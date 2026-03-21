# SmartCRM Backend API

Express.js REST API with JWT authentication for SmartCRM.

## Prerequisites

- Node.js 18+
- Supabase project (PostgreSQL)

## Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in .env with your Supabase URL, service key, and JWT secret
```

## Development

```bash
npm run dev
```

## Production

```bash
npm start
```

## API Endpoints

### Auth
- `POST /api/auth/login` — email + password → JWT
- `POST /api/auth/refresh` — refresh JWT (requires Bearer token)
- `POST /api/auth/logout` — invalidate session

### CRM Modules (all require Bearer JWT)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/leads` | List / create leads |
| GET/PUT/DELETE | `/api/leads/:id` | Get / update / delete lead |
| GET/POST | `/api/accounts` | Accounts |
| GET/POST | `/api/contacts` | Contacts |
| GET/POST | `/api/opportunities` | Pipeline opportunities |
| GET/POST | `/api/activities` | Activities |
| GET/POST | `/api/tickets` | Support tickets |
| GET/POST | `/api/contracts` | Contracts |
| GET/POST | `/api/collections` | Collections / AR |
| GET/POST | `/api/call-reports` | Call reports |
| GET/POST | `/api/quotations` | Quotations |
| GET/POST | `/api/targets` | Targets |
| GET/POST | `/api/calendar` | Calendar events |
| GET/POST | `/api/communications` | Comm logs |
| GET/POST | `/api/notes` | Notes |
| GET | `/api/files` | Files (list only) |
| GET/POST | `/api/masters` | Masters / catalog |
| GET/POST | `/api/org` | Org hierarchy |
| GET/PUT | `/api/team` | Team users |
| POST | `/api/bulk-upload` | Bulk import records |

### Reports (read-only)
- `GET /api/reports/pipeline-summary`
- `GET /api/reports/revenue-by-product`
- `GET /api/reports/lead-conversion`
- `GET /api/reports/ticket-sla`
- `GET /api/reports/collections-aging`
- `GET /api/reports/activity-heatmap`

### Health
- `GET /api/health`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key (server-side only) |
| `JWT_SECRET` | 32+ char random secret for signing JWTs |
| `JWT_EXPIRES_IN` | Token expiry (default: `8h`) |
| `PORT` | Server port (default: `3001`) |
| `FRONTEND_URL` | CORS allowed origin (default: `http://localhost:5173`) |
| `NODE_ENV` | `development` or `production` |
