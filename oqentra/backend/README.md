# OQENTRA Backend API

Production-oriented Node.js 20 + Express 4 + PostgreSQL API for the OQENTRA public website. It replaces the old SQLite prototype. It stores public enquiries and referral registrations, creates unique referral URLs, records referral visits, attributes enquiries, supports customer accounts, provides protected admin APIs, calculates referral rewards only after an administrator verifies a real payment, and exposes health/Prometheus metrics endpoints.

> This is a backend codebase, not a claim that AWS infrastructure has already been created or that production security has been independently audited. Configure RDS, TLS, HTTPS, backups, IAM, monitoring and email verification before enabling real customers.

## 1. Folder structure

```text
oqentra-backend/
├── src/
│   ├── config/          # Environment validation and optional Secrets Manager loader
│   ├── db/              # PostgreSQL pool and SQL migrations
│   ├── middleware/      # JWT role checks and request metadata
│   ├── routes/          # Public, customer auth, admin auth and admin APIs
│   ├── services/        # Audit logging
│   ├── utils/           # Pino logger and input validation
│   └── server.js
├── deploy/              # Nginx reverse-proxy and systemd examples
├── scripts/             # Syntax check
├── .env.example
└── package.json
```

## 2. Requirements

- Node.js 20 or later
- PostgreSQL 14 or later (AWS RDS for PostgreSQL is supported)
- Nginx in front of the API in production
- HTTPS certificate for the public website/API

## 3. Create the PostgreSQL database

For a local PostgreSQL instance, connect as a database administrator and run:

```sql
CREATE USER oqentra_app WITH PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
CREATE DATABASE oqentra OWNER oqentra_app;
GRANT ALL PRIVILEGES ON DATABASE oqentra TO oqentra_app;
```

For AWS RDS PostgreSQL:

1. Create an RDS PostgreSQL instance in the same VPC as the EC2 API server where possible.
2. Prefer private subnets; do not make the database publicly accessible.
3. In the RDS security group, allow inbound TCP 5432 only from the API EC2 security group.
4. Create a dedicated least-privilege database and application user. Do not use the RDS master account in the application.
5. Download the current AWS RDS CA bundle from AWS documentation and copy it to the API host, for example `/etc/ssl/certs/global-bundle.pem`.
6. Keep RDS automated backups enabled and test restoration before production launch.

The application uses TLS certificate verification when `DB_SSL=true`. Do not set `rejectUnauthorized=false` to bypass certificate validation.

## 4. Configure environment

```bash
cd /opt/oqentra/backend
cp .env.example .env
nano .env
```

At minimum configure:

```env
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
TRUST_PROXY=1
FRONTEND_ORIGINS=https://YOUR_PUBLIC_DOMAIN
PUBLIC_SITE_URL=https://YOUR_PUBLIC_DOMAIN
DATABASE_URL=postgresql://oqentra_app:URL_ENCODED_PASSWORD@YOUR_RDS_ENDPOINT:5432/oqentra
DB_SSL=true
DB_SSL_CA_PATH=/etc/ssl/certs/global-bundle.pem
JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=8h
ADMIN_NAME=OQENTRA Administrator
ADMIN_EMAIL=YOUR_ADMIN_EMAIL
ADMIN_PASSWORD=USE_A_UNIQUE_PASSWORD_AT_LEAST_16_CHARACTERS
AWS_REGION=ap-south-1
AWS_SECRET_ID=
METRICS_ENABLED=true
```

Generate a JWT secret on Linux:

```bash
openssl rand -base64 48
```

URL-encode special characters in the PostgreSQL password before placing it in `DATABASE_URL`. Never commit `.env`, database credentials, JWT secrets or AWS credentials to GitHub. Restrict `.env` permissions:

```bash
chmod 600 .env
```

### Optional AWS Secrets Manager

If `AWS_SECRET_ID` is configured, the app loads a JSON secret before reading the remaining config. Example secret structure:

```json
{
  "DATABASE_URL": "postgresql://...",
  "JWT_SECRET": "...",
  "ADMIN_EMAIL": "...",
  "ADMIN_PASSWORD": "..."
}
```

Attach a least-privilege EC2 instance role that can call `secretsmanager:GetSecretValue` for this one secret. Do not put long-lived AWS access keys in `.env`. Values already present in the process environment are not overwritten by the secret.

## 5. Install and migrate

```bash
npm install
npm run test:syntax
npm run db:migrate
```

The migration is versioned and safe to run again; already-applied migration files are skipped. Back up the database before future schema changes.

Start locally:

```bash
npm start
```

The API binds to `127.0.0.1:4000` by default. Test from the server:

```bash
curl -i http://127.0.0.1:4000/api/health
curl -i http://127.0.0.1:4000/api/ready
```

Expected health responses are JSON with `status: ok` and `status: ready` respectively.

## 6. Nginx reverse proxy

Copy the relevant locations from `deploy/nginx-oqentra-api.conf` into the website's HTTPS `server {}` block. Check the `allow` CIDR for `/metrics` and replace it with the private monitoring subnet. Do not expose `/metrics` publicly. Validate and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The frontend `js/config.js` should use `API_BASE_URL: "/api"` when the API is reverse-proxied on the same domain. The supplied OQENTRA frontend has been updated to use this same-origin API path.

## 7. API endpoints

All JSON endpoints are under `/api`.

### Public website

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Process health |
| GET | `/ready` | PostgreSQL readiness check |
| POST | `/enquiries` | Persist contact/project enquiry and referral attribution |
| POST | `/referrals/link` | Register referrer and create personal link |
| POST | `/referrals/track` | Record a referral link visit (no reward) |
| GET | `/public-info` | Public brand/programme metadata |

Enquiry JSON example:

```json
{
  "name": "Customer Name",
  "phone": "+91 9876543210",
  "email": "customer@example.com",
  "business_name": "Example Business",
  "service": "Website design & development",
  "message": "We need a website with a contact form.",
  "referral_code": "OQABC123456789",
  "consent": true,
  "website": ""
}
```

The browser form must send `consent: true` only after the visitor checks the consent checkbox. The backend stores the consent timestamp. The honeypot `website` field should remain empty; bot-filled submissions are not stored.

Referral link JSON example:

```json
{
  "referrer_name": "Referrer Name",
  "referrer_phone": "+91 9876543210",
  "referrer_email": "referrer@example.com",
  "website": ""
}
```

Response contains `referral_code`, `referral_url`, and `expires_at`. Share the returned `referral_url`; do not manually construct or edit referral codes. One normalized phone number can register one referral profile.

A visitor opens `https://YOUR_PUBLIC_DOMAIN/?ref=CODE#contact`. The frontend stores the code for that browser session and submits it with their enquiry. An enquiry is attributed only if the code exists, is active and has not expired. A visit or enquiry does not itself earn a reward.

### Customer accounts

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/signup` | Create customer account |
| POST | `/auth/login` | Sign in |
| GET | `/auth/me` | Read own account; Bearer token |
| PATCH | `/auth/me` | Update own name/phone; Bearer token |

Signup example:

```json
{
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "+91 9876543210",
  "password": "Use-a-unique-password-12+"
}
```

Customer signup/login APIs are implemented, but the current public frontend intentionally does not yet include login/signup screens. Add the UI only when the account experience, email verification and password-reset email delivery have been designed. Until email verification and reset flows are integrated, treat public account signup as a limited beta and do not use it for sensitive customer data.

### Admin authentication and management

Admin login: `POST /admin/auth/login` with `{ "email": "...", "password": "..." }`. The initial admin is created once from `ADMIN_EMAIL` and `ADMIN_PASSWORD` at startup. There is no public admin signup endpoint.

For protected endpoints send:

```http
Authorization: Bearer YOUR_ADMIN_JWT
```

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/auth/me` | Current admin |
| GET | `/admin/dashboard` | Summary counts |
| GET | `/admin/enquiries` | List enquiries (`limit`, `offset`, optional `status`) |
| PATCH | `/admin/enquiries/:id/status` | Update lead status |
| GET | `/admin/referrals` | List referral links, clicks, enquiries and rewards |
| PATCH | `/admin/referrals/:id/status` | Activate, pause or block a referral |
| GET | `/admin/customers` | List customer accounts (no password hashes) |
| GET | `/admin/rewards` | Reward ledger |
| POST | `/admin/referrals/:id/conversions` | Verify a paid conversion and create reward |
| PATCH | `/admin/rewards/:id/status` | Approve, pay or cancel reward |
| GET | `/admin/audit-logs` | Admin/public account action log |

### Reward rules encoded on the server

Amounts are stored as integer paise to avoid floating-point currency errors.

| Verified purchase | Reward |
|---|---:|
| Basic web application | ₹500 |
| Advanced web application | ₹1,000 |
| 1-month management plan | ₹200 |
| 3-month management plan | ₹800 |
| 6-month management plan | ₹1,800 |
| 12-month management plan | ₹4,000 |

Allowed `conversion_type` values:

- `basic_application`
- `advanced_application`
- `plan_1_month`
- `plan_3_months`
- `plan_6_months`
- `plan_12_months`

Only an admin may record a conversion. The referral must still be active and within its 12-month validity period. The payment reference is unique to prevent duplicate entries. The system creates a **pending** reward after payment verification. An admin must separately approve it and then mark it paid with a payout reference. No payment gateway is integrated; the admin must verify the actual bank/payment receipt before using this endpoint.

Conversion example:

```json
{
  "conversion_type": "basic_application",
  "payment_reference": "BANK-UTR-OR-INVOICE-REFERENCE",
  "paid_amount_rupees": 25000,
  "enquiry_id": null,
  "notes": "Payment verified against bank statement."
}
```

Mark a reward paid:

```json
{
  "status": "paid",
  "payout_reference": "UPI-OR-TRANSFER-REFERENCE"
}
```

## 8. Observability

- Pino emits structured JSON logs; authorization headers, passwords, tokens and database URLs are redacted.
- `GET /metrics` exposes Prometheus process and HTTP metrics when enabled.
- `GET /api/health` checks process response; `GET /api/ready` checks PostgreSQL connectivity.
- Nginx example restricts `/metrics` to localhost and a monitoring subnet. Keep it private.
- For EC2/system logs, configure the CloudWatch Agent separately. This backend does not automatically create CloudWatch alarms, SNS topics, dashboards or Prometheus/Grafana servers.

## 9. Run with systemd (EC2)

Create a dedicated Linux user and deploy the folder to `/opt/oqentra/backend`. Install dependencies and migrate as above. Copy `deploy/oqentra-api.service.example` to `/etc/systemd/system/oqentra-api.service`, review paths/user, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now oqentra-api
sudo systemctl status oqentra-api
sudo journalctl -u oqentra-api -f
```

## 10. Security and launch checklist

- [ ] Use HTTPS for the website and API; redirect HTTP to HTTPS in Nginx.
- [ ] Keep RDS private; inbound 5432 only from the API security group.
- [ ] Use verified PostgreSQL TLS (`DB_SSL=true` and current RDS CA bundle).
- [ ] Use IAM role for Secrets Manager; do not commit credentials.
- [ ] Restrict SSH and Nginx metrics endpoint to trusted sources.
- [ ] Change all example credentials and generate a strong JWT secret.
- [ ] Add email verification and password-reset flow before broadly enabling customer accounts.
- [ ] Add an admin UI or use a controlled API client; never expose admin JWTs in frontend source.
- [ ] Configure and test RDS backups and point-in-time recovery.
- [ ] Configure CloudWatch Agent, alarms and SNS notifications separately.
- [ ] Test referral attribution in a fresh browser session and test expiry/duplicate payment references.
- [ ] Publish final referral terms: eligible customer definition, cancellation/refund handling, taxes, payout timing, minimum payout, dispute process and anti-self-referral policy.
- [ ] Review privacy notice and retention/deletion process for enquiry/customer information.
- [ ] Load-test and security-review before production launch.

## 11. Test status and known boundaries

JavaScript syntax checks can run without a database. Actual API integration tests require a reachable PostgreSQL database and real environment configuration. No AWS RDS instance, DNS, TLS certificate, email sender, payment gateway, admin dashboard, customer-facing auth screens, CloudWatch alarm or Prometheus/Grafana stack is created by this source archive.
