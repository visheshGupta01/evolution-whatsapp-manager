# Evolution WhatsApp Manager

A lightweight dashboard for managing multiple WhatsApp sessions simultaneously through Evolution API v2.

## Features

- Create unlimited Evolution API instances from one dashboard
- Connect sessions and display QR codes
- Poll and display live connection states
- Restart, disconnect/logout, and permanently delete sessions
- Send a test text message from any connected session
- Global API key stays on the server; it is never sent to the browser
- Responsive dashboard with search, filters, summary cards, and per-session actions
- Dockerfile for the dashboard server
- GitHub Actions CI

## Architecture

`React + Vite` → `Express API` → `Evolution API v2` → WhatsApp

The manager is built against Evolution API v2's instance controller and instance-scoped message endpoints.

## Requirements

- Node.js 20+
- A running Evolution API v2 server
- Your Evolution API global API key

## Local setup

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
# edit server/.env with your Evolution API URL and key
npm install
npm run dev
```

Open `http://localhost:5173`.

## Evolution API configuration

Set:

```env
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-global-api-key
```

The app creates each instance with its own generated token, so instance operations remain isolated.

## API routes exposed by this project

- `GET /api/health`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:instance/connect`
- `GET /api/sessions/:instance/qr`
- `POST /api/sessions/:instance/restart`
- `POST /api/sessions/:instance/disconnect`
- `DELETE /api/sessions/:instance`
- `POST /api/sessions/:instance/send-text`

The text-message payload follows Evolution API's instance-scoped send-text route.

## Production

Build the client with `npm run build`, then serve `client/dist` with a CDN/reverse proxy and run the Express server privately. Do not expose `EVOLUTION_API_KEY` to client-side code.

## Notes

This project manages sessions that belong to an Evolution API deployment; it does not replace Evolution API itself. WhatsApp usage is subject to Meta/WhatsApp terms and the limits of the selected connection method.
