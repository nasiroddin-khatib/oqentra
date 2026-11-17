# OQENTRA — Complete Website + Backend Project

This repository combines the OQENTRA public website and its PostgreSQL-backed Express API in one project. Deploy the `frontend/` and `backend/` directories together. The frontend uses same-origin requests at `/api`; Nginx serves the website and reverse-proxies API requests to the private Express process.

> **Important:** This is the complete source project assembled for the current scope. It is not a claim that AWS infrastructure has already been created or that production integration/security testing has been completed. Live database, DNS, HTTPS, email delivery, payment gateway, admin UI and customer account UI require the configuration or follow-up work described below.

## Project structure

```text
oqentra-complete-project/
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── config.js
│   │   ├── api.js
│   │   └── main.js
│   └── assets/favicon.svg
├── backend/
│   ├── src/
│   │   ├── config/          # Environment + AWS Secrets Manager
│   │   ├── db/              # PostgreSQL pool + SQL migrations
│   │   ├── middleware/      # Auth, request context, IP hashing
│   │   ├── routes/          # Public, customer auth, admin APIs
│   │   ├── services/        # Audit logging
│   │   ├── utils/           # Validation + Pino logger
│   │   └── server.js
│   ├── deploy/              # API-only Nginx/systemd examples
│   ├── scripts/             # JavaScript syntax checker
│   ├── .env.example
│   └── package.json
├── deploy/
│   ├── nginx-oqentra.conf   # Complete website + API Nginx config
│   └── oqentra-api.service  # systemd unit template
├── docs/
└── README.md
```

## Features included

### Public website
- Responsive OQENTRA brand website with Services, Our approach, What we can build, Pricing, About, FAQ, referral and contact sections.
- Image-led cards and carousels, responsive navigation, form validation and accessible status messages.
- Contact/project enquiry form sends data to `POST /api/enquiries`.
- Referral registration form requests a unique share link from `POST /api/referrals/link`.
- Referral URLs are tracked through `POST /api/referrals/track`; the browser carries the referral code into the enquiry form.
- Public frontend configuration contains no database password, AWS credential or JWT secret.

### Express + PostgreSQL API
- Express API with Helmet, CORS allow-list, request IDs, request-size limit and rate limits.
- PostgreSQL connection pool and versioned SQL migration.
- Enquiry persistence, referral registration, unique referral code/link, click tracking and referral attribution.
- Customer signup/login/profile APIs using bcrypt password hashes and JWT role checks.
- Admin login and protected APIs for dashboard summaries, enquiries, referrals, customers, conversions, rewards and audit logs.
- Referral reward ledger; rewards are created only after an administrator records a verified paid conversion.
- Pino structured logging with sensitive values redacted.
- Prometheus metrics endpoint and health/readiness endpoints.
- Optional AWS Secrets Manager loading using an EC2 instance role.

## Referral reward rules

The API stores money as integer paise to avoid floating-point errors.

| Eligible verified purchase | Referrer reward |
|---|---:|
| Basic web application | ₹500 |
| Advanced web application | ₹1,000 |
| 1-month management plan | ₹200 |
| 3-month management plan | ₹800 |
| 6-month management plan | ₹1,800 |
| 12-month management plan | ₹4,000 |

The referral validity window is 12 months. A click, signup or enquiry does not create a reward. An administrator must verify the actual customer payment, record the conversion, approve the pending reward and separately mark it paid with a payout reference. Refund/cancellation handling, payout timelines, minimum payout and anti-self-referral terms must be finalized before publishing the referral programme.

## Requirements

- Node.js 20+
- PostgreSQL 14+ (AWS RDS for PostgreSQL supported)
- Nginx for production static hosting and reverse proxy
- HTTPS certificate and a domain name for production

## Local development

### 1. Create a PostgreSQL database

Create a database and a dedicated application user. For local PostgreSQL, for example:

```sql
CREATE USER oqentra_app WITH PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
CREATE DATABASE oqentra OWNER oqentra_app;
GRANT ALL PRIVILEGES ON DATABASE oqentra TO oqentra_app;
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
NODE_ENV=development
PORT=4000
HOST=127.0.0.1
TRUST_PROXY=1
FRONTEND_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
PUBLIC_SITE_URL=http://127.0.0.1:5500
DATABASE_URL=postgresql://oqentra_app:URL_ENCODED_PASSWORD@127.0.0.1:5432/oqentra
DB_SSL=false
JWT_SECRET=PASTE_OUTPUT_FROM_OPENSSL_RAND_BASE64_48
ADMIN_NAME=OQENTRA Administrator
ADMIN_EMAIL=YOUR_ADMIN_EMAIL
ADMIN_PASSWORD=USE_A_UNIQUE_PASSWORD_AT_LEAST_16_CHARACTERS
AWS_REGION=ap-south-1
AWS_SECRET_ID=
METRICS_ENABLED=true
```

Generate a JWT secret:

```bash
openssl rand -base64 48
```

Use a URL-encoded database password in `DATABASE_URL` if it contains reserved URL characters. Protect `.env`:

```bash
chmod 600 .env
```

### 3. Install dependencies, migrate and start API

```bash
npm install
npm run test:syntax
npm run db:migrate
npm start
```

The API listens on `http://127.0.0.1:4000` by default. Check:

```bash
curl -i http://127.0.0.1:4000/api/health
curl -i http://127.0.0.1:4000/api/ready
```

### 4. Serve the frontend

Open a second terminal:

```bash
cd frontend
python -m http.server 5500
```

Open `http://127.0.0.1:5500`. For local development the API CORS allow-list must include this origin, as shown above. `frontend/js/config.js` defaults to `/api`, so for local development with separate ports set `API_BASE_URL` to `http://127.0.0.1:4000/api`.

## AWS RDS + EC2 deployment outline

1. Create RDS PostgreSQL in a private subnet. Set **Public access = No** wherever possible.
2. In the RDS security group, allow inbound TCP `5432` only from the backend EC2 security group. Do not open PostgreSQL to `0.0.0.0/0`.
3. Create a dedicated database/application user; do not use the RDS master user in the application.
4. Download the current AWS RDS CA bundle to the EC2 instance (example path `/etc/ssl/certs/global-bundle.pem`).
5. Deploy this project so the frontend is at `/opt/oqentra/frontend` and backend at `/opt/oqentra/backend`.
6. Configure `/opt/oqentra/backend/.env` using the RDS endpoint and `DB_SSL=true`, `DB_SSL_CA_PATH=/etc/ssl/certs/global-bundle.pem`. Keep `JWT_SECRET` strong and `PUBLIC_SITE_URL` set to the real HTTPS website origin.
7. Set `FRONTEND_ORIGINS` to the exact HTTPS site origins. Never use `*` in production.
8. Install backend dependencies, run syntax check and migration, then start the API with systemd.
9. Update `deploy/nginx-oqentra.conf`: replace `YOUR_DOMAIN`, TLS certificate paths and monitoring CIDR. Install it in Nginx sites-enabled, run `sudo nginx -t`, then reload Nginx.
10. Ensure `frontend/js/config.js` uses `API_BASE_URL: "/api"` for same-origin reverse proxy.
11. Test public enquiry submission and referral link generation; then verify the records in PostgreSQL using an authorized database session.
12. Configure and test RDS backups/restore, CloudWatch Agent, alarms and SNS notifications separately.

### Backend systemd service

Review `deploy/oqentra-api.service`, create the dedicated Linux service user and paths, then install the service file at `/etc/systemd/system/oqentra-api.service`:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oqentra-api
sudo systemctl status oqentra-api
sudo journalctl -u oqentra-api -f
```

The service template assumes Node is at `/usr/bin/node`, backend at `/opt/oqentra/backend`, and the service user/group are `oqentra`. Adjust these for the EC2 operating system.

## Main API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Process health |
| GET | `/api/ready` | PostgreSQL readiness |
| POST | `/api/enquiries` | Save a project/contact enquiry |
| POST | `/api/referrals/link` | Create a unique referral link |
| POST | `/api/referrals/track` | Record a referral visit |
| POST | `/api/auth/signup` | Create customer account |
| POST | `/api/auth/login` | Customer login |
| GET/PATCH | `/api/auth/me` | Read/update authenticated customer profile |
| POST | `/api/admin/auth/login` | Admin login |
| GET | `/api/admin/dashboard` | Admin summary |
| GET | `/api/admin/enquiries` | View enquiries |
| GET | `/api/admin/referrals` | View referrals |
| GET | `/api/admin/customers` | View customers |
| GET | `/api/admin/rewards` | View reward ledger |
| POST | `/api/admin/referrals/:id/conversions` | Record verified payment conversion |
| PATCH | `/api/admin/rewards/:id/status` | Approve/pay/cancel a reward |
| GET | `/metrics` | Prometheus metrics (restrict at Nginx/firewall) |

See `backend/README.md` for request payloads, all admin endpoints, reward conversion details and the security checklist.

## Current scope boundaries — read before launch

- The public frontend is included. Customer signup/login API endpoints exist, but customer login/signup pages are **not yet included**.
- Admin authentication and management APIs exist, but a browser-based admin dashboard is **not yet included**. Use a protected API client until an admin UI is built; never place admin tokens in public frontend JavaScript.
- Email verification and password reset/email delivery are **not integrated**. Do not broadly enable customer accounts for sensitive use until these flows and abuse protections are added.
- Payment gateway integration is **not included**. Admin must verify the payment independently before recording a conversion.
- AWS RDS, EC2, DNS, TLS certificates, IAM roles, Secrets Manager secrets, CloudWatch alarms, SNS topics, Prometheus/Grafana servers and backups are infrastructure resources that must be created/configured separately.
- The website's photography is referenced from external image URLs. A live visitor's browser needs internet access to load those image hosts; for fully self-hosted images, download licensed images into `frontend/assets/images/` and update the corresponding `src` paths.
- The current FAQ/pricing wording about infrastructure charges should be reconciled commercially before launch: do not promise that all infrastructure costs are included if the hosting arrangement charges them separately.
- Do not promise 24/7 human incident resolution unless staffing, support coverage and response-time commitments actually support it. Define monitoring coverage and response SLAs per plan.

## Validation status

The included backend syntax-check script checks JavaScript syntax without needing a live database. Database migration and API integration tests require a configured, reachable PostgreSQL database. No live AWS resources or production security audit are included in this archive.
