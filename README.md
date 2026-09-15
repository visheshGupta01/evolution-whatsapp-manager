# Evolution WhatsApp Manager

A lightweight control center for managing multiple WhatsApp sessions through Evolution API v2, with the foundation for campaign message composition.

## Current features

### Session management

- Create Evolution API instances
- Connect sessions and display QR codes
- Poll and display connection states
- Restart sessions
- Disconnect/logout sessions
- Permanently delete sessions
- Search and manage multiple instances from one workspace

### Send Message — Phase 1

- Select a connected WhatsApp instance
- Select the message format
- Text message composer with character count
- Live WhatsApp-style message preview
- UI foundation for media, buttons, lists, recipient import, and campaigns

Recipient XLSX import and actual campaign sending are intentionally not enabled yet; they will be added in the next phases.

## Architecture

`React + Vite` → `Express API` → `Evolution API v2` → WhatsApp

All Evolution API access stays behind the Express server. The global Evolution API key is never sent to the browser.

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

## API routes

- `GET /api/health`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:instance/connect`
- `GET /api/sessions/:instance/qr`
- `POST /api/sessions/:instance/restart`
- `POST /api/sessions/:instance/disconnect`
- `DELETE /api/sessions/:instance`

Messaging, contacts, chat history, and realtime webhook endpoints are not part of the current application scope.

## Production

Build the client with `npm run build`, then serve `client/dist` with a CDN/reverse proxy and run the Express server privately. Do not expose `EVOLUTION_API_KEY` to client-side code.

## Notes

This project manages sessions that belong to an Evolution API deployment; it does not replace Evolution API itself. WhatsApp usage is subject to Meta/WhatsApp terms and the limits of the selected connection method.
