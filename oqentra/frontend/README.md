# OQENTRA Frontend

This folder contains the public OQENTRA website. The full project setup, PostgreSQL backend, API endpoints, local development and AWS deployment instructions are in the repository root `README.md`.

## Run locally

```bash
python -m http.server 5500
```

Open `http://127.0.0.1:5500`. Do not open `index.html` with `file://` because the site uses JavaScript modules.

For local API development, edit `js/config.js` and set `API_BASE_URL` to `http://127.0.0.1:4000/api`. In production, keep it as `/api` and use the included Nginx reverse proxy configuration.

Never place database credentials, JWT secrets, AWS credentials or private API keys in this frontend folder.
