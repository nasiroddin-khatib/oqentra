# OQENTRA public website

A responsive public-facing website for OQENTRA, built with plain HTML, CSS and browser JavaScript modules.

## Folder structure

```text
oqentra-website/
├── index.html
├── README.md
├── package.json
├── css/
│   └── styles.css
├── js/
│   ├── config.js
│   ├── api.js
│   └── main.js
└── assets/
    └── favicon.svg
```

## Run locally

This is a static frontend. Serve the folder over HTTP; do not open `index.html` directly with `file://`, because `main.js` uses JavaScript modules.

Option A — Python:

```bash
cd oqentra-website
python -m http.server 5500
```

Then open `http://127.0.0.1:5500`.

Option B — VS Code Live Server:

Open this folder in VS Code, start Live Server, and use the URL it displays.

## Configure the API

Edit `js/config.js`:

```js
window.OQENTRA_CONFIG = Object.freeze({
  API_BASE_URL: "http://localhost:4000/api",
  WHATSAPP_NUMBER: "",
  PUBLIC_EMAIL: ""
});
```

- `API_BASE_URL`: use the backend API base URL, without a trailing slash.
- `WHATSAPP_NUMBER`: optional country code + phone number, digits only. Keep empty until the official business number is ready.
- `PUBLIC_EMAIL`: optional public email. Keep empty until the mailbox exists.

These are public frontend settings. Never place database passwords, JWT secrets, AWS credentials, API private keys or other secrets in this file.

## Backend API contract used by this frontend

The frontend submits these requests:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/enquiries` | Project/contact enquiry |
| POST | `/api/referrals` | Referral introduction |

The current uploaded Express API implementation already contains these public routes. The enquiry route accepts `name`, `phone`, optional `email`, optional `service`, and `message`. The referral route accepts `referrer_name`, `referrer_phone`, `referred_name`, `referred_phone`, optional `service`, and optional `message`.

The frontend combines the optional business/brand name into the enquiry `message`, because the currently supplied backend schema does not have a separate `business_name` field.

### Local CORS note

The existing backend configuration defaults to `http://127.0.0.1:5500`. If your local frontend runs at another origin, add that exact origin to the backend's `FRONTEND_ORIGIN` configuration. For example:

```env
FRONTEND_ORIGIN=http://127.0.0.1:5500,http://localhost:5500
```

## Important backend compatibility note

This folder is the **public frontend only**. The backend files previously supplied for review currently use SQLite (`better-sqlite3`) rather than PostgreSQL. They also reference a Secrets Manager module that was not included in the supplied files. We have not silently changed or represented that backend as PostgreSQL-ready.

Before production, we must rebuild/migrate the backend to PostgreSQL and verify its routes, validation, rate limiting, logging, TLS, health checks, migrations, backups and monitoring. The frontend forms are wired to the public endpoint contract above, but they cannot successfully submit until the backend is running and reachable at `API_BASE_URL`.

## Before public launch

- Replace the local API URL with the production HTTPS API URL.
- Configure the official WhatsApp number and public email, if used.
- Connect the correct domain and enable HTTPS.
- Add and publish a privacy notice and terms appropriate to the business and data collected.
- Review the enquiry/referral consent wording and retention process.
- Replace concept demonstrations with real work only when there are genuine, approved examples. Current showcase cards are explicitly labelled as illustrative concepts.
- Confirm the final service scope, support hours, trial conditions, taxes and commercial terms before treating the displayed pricing as a binding offer.
- Test both forms against the production backend and verify that records are actually saved.

## Notes on design and accessibility

- No third-party stock-image dependency is used. The hero product visual and showcase mockups are CSS-built concepts.
- Navigation supports keyboard use and mobile layouts.
- Form status messages use accessible live regions.
- The work carousel pauses on hover, focus, touch, hidden tabs and reduced-motion preference.
- No admin login or customer signup is exposed on the public website in this first phase.
