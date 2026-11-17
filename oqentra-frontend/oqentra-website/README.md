# OQENTRA public website

A responsive, image-led public website for OQENTRA, built with HTML, CSS and browser JavaScript modules.

## Folder structure

```text
oqentra-website/
├── index.html
├── README.md
├── package.json
├── css/styles.css
├── js/
│   ├── config.js
│   ├── api.js
│   └── main.js
└── assets/favicon.svg
```

## Run locally

Serve the folder over HTTP; do not open `index.html` directly with `file://`, because `main.js` uses JavaScript modules.

```bash
cd oqentra-website
python -m http.server 5500
```

Open `http://127.0.0.1:5500`.

## Public configuration

Edit `js/config.js`:

- `API_BASE_URL` defaults to `/api`, so browser requests stay on the website's domain. In production, Nginx must proxy `/api/` to the Express backend. If the API is hosted separately, use its HTTPS base URL.
- `WHATSAPP_NUMBER` is optional; use the official country code and number, digits only.
- `PUBLIC_EMAIL` is optional; configure it only after the official mailbox exists.

Never put database credentials, JWT secrets, AWS credentials or private API keys in browser code.

## API contract expected by the revised frontend

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/enquiries` | Save a project enquiry, including `referral_code` attribution when present |
| POST | `/api/referrals/link` | Register a referrer and return a unique `referral_code` or `referral_url` |

The referral-link endpoint is a new backend requirement. The earlier supplied API only supported manually submitting a referrer and a referred person's details; it did not issue shareable links or attribute purchases. The backend must also record referred visits, customer conversion, plan/project type, payment confirmation and reward status before referral payouts can be trusted.

## Important backend status

This folder is the public frontend only. The previously supplied Express backend uses SQLite (`better-sqlite3`), not PostgreSQL. Its existing enquiry route does not yet store all the revised fields, its referral route does not support unique-link attribution or the reward ledger, and the supplied source references other route/module files that were not included in the upload.

Therefore, **do not treat database persistence, referral tracking, referral payouts, or customer login/signup as production-ready yet**. These require the PostgreSQL backend and authentication/authorization work. The current referral form expects `POST /api/referrals/link`, which must be implemented before the form can create real links.

Before launch, build and test:

- PostgreSQL schema and migrations for enquiries, referral accounts, referral clicks/attribution, conversions, reward ledger and customer accounts.
- Server-side validation, rate limiting, audit logging and privacy-conscious retention.
- Secure customer login/signup, password hashing, session/token handling and protected customer routes.
- Nginx `/api/` reverse proxy, HTTPS, CORS policy and health checks.
- Backups, restore tests, monitoring and alerting.
- Real end-to-end tests proving that every submitted form is stored and can be retrieved by authorized staff.

## Commercial details to confirm before launch

- The maintenance examples are based on a ₹5,000 monthly base: 1 month ₹5,000; 3 months ₹13,500; 6 months ₹25,500; 12 months ₹48,000.
- Development is quoted separately from ongoing management.
- Referral reward examples are ₹500 for an eligible basic web application, ₹1,000 for an eligible advanced web application, and ₹200 / ₹800 / ₹1,800 / ₹4,000 for eligible 1 / 3 / 6 / 12-month management plans. Backend rules must define eligibility, attribution, payment confirmation, duplicate referrals, cancellations and the 12-month reward window.
- The revised FAQ answer says no separate infrastructure or monitoring charges are required, while the pricing section describes hosting arrangements and infrastructure charges. These statements need one consistent written commercial policy before public launch.
- Do not promise 24/7 issue resolution unless the actual support team, coverage and response commitments can deliver it. State the exact monitoring and response coverage in each plan.

## Design and accessibility

- Brand mark and wordmark are separate, with no technical tagline under the brand name.
- Navigation uses plain section names without numeric prefixes.
- Business examples and capability sections use image-led cards and swipe/arrow carousels.
- The approach section explains discovery, suitability, creation, launch, care and improvement in customer language.
- Pricing has independent, working tabs for development and ongoing management.
- Referral link creation is wired to the required backend contract but will not work until that route exists.
- Carousels pause during hover/focus/touch and respect reduced-motion preferences.
- Contact and referral forms include validation and accessible status messages.
- Customer login/signup is intentionally not faked in the frontend; it should be added alongside the secure PostgreSQL authentication backend.
