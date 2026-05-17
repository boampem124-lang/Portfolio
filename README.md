# Affiliate Tasks Prototype

This repository contains a minimal prototype of an affiliate-marketing style "tasks" platform where users can deposit funds (via Stripe test mode), complete daily tasks, and earn credits. This is a prototype only — not production ready. It intentionally omits KYC, fraud detection, and legal compliance which you must implement before accepting real money.

IMPORTANT: Do not use this prototype with real funds. Consult legal and compliance experts before operating a platform that accepts deposits or pays out earnings.

Contents:

- `server/` — Express backend (SQLite, Stripe test handling)
- `web/` — Minimal static frontend to interact with the API

Quick start (development):

1. Backend

Install and run the server:

```bash
cd server
npm install
# copy .env.example to .env and set STRIPE keys
node index.js
```

2. Frontend

```bash
cd web
npm install
npm start
# open http://localhost:3000
```

Deployment notes:
- Use Stripe in test mode until you have legal and AML processes in place. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the server environment.
- Deploy the backend to a server or platform that supports webhooks (e.g., Railway, Heroku) and set the webhook URL in Stripe dashboard.
- Deploy the frontend to Vercel, Netlify, or static hosting.
- If using GitHub, the frontend is configured to deploy automatically via GitHub Pages from the `web/` directory when changes are pushed to `main`.
- The frontend is now configured for the custom domain `affiliate-tasks-prototype.com` via `web/CNAME`.
- A container-ready backend is available in `server/Dockerfile` and a simple local runtime is provided via `docker-compose.yml`.
- The backend is also configured to build and publish a container image to GitHub Container Registry via `.github/workflows/backend-image.yml` on every push to `main`.
- The backend can be deployed automatically to Fly.io using `.github/workflows/backend-fly-deploy.yml`; set `FLY_API_TOKEN` in GitHub Secrets and update `server/fly.toml` with your Fly app name.
- For the backend, set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JWT_SECRET`, and optionally SMTP variables in the environment.
- Add proper authentication, rate-limiting, validation, KYC, AML, and legal disclaimers before taking real money.

If you want, I can: scaffold authentication, add tests, or wire up a simple CI/CD pipeline for deployment. What would you like next?
