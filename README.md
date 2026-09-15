# Evolution WhatsApp Manager

A lightweight control center for managing multiple WhatsApp sessions through Evolution API v2, with a text campaign workflow.

## Current features

### Session management

- Create Evolution API instances
- Connect sessions and display QR codes
- Poll and display connection states
- Restart sessions
- Disconnect/logout sessions
- Permanently delete sessions
- Search and manage multiple instances from one workspace

### Send Message — Phase 2

- Select a connected WhatsApp instance
- Import XLSX, XLS or CSV recipient files
- Required `phone`/`number`/`mobile`/`whatsapp`-style column detection
- Optional `name`, `company`, `custom1`, and `custom2` fields
- Phone validation and duplicate detection
- Recipient preview with valid/invalid counts
- Downloadable XLSX recipient template
- Text message composer with character count
- `{{name}}`, `{{company}}`, `{{custom1}}`, and `{{custom2}}` personalization
- Live WhatsApp-style personalized preview
- Sequential text campaign sending through the Express backend
- Per-recipient success/failure results
- Conservative server-side pacing with a 1.2 second minimum between recipients
- Phase 2 limit of 250 spreadsheet rows per campaign

Media, buttons, lists, persistent queues, campaign history, and reporting are not enabled yet.

## Architecture

`React + Vite` → `Express API` → `Evolution API v2` → WhatsApp

The browser parses the recipient spreadsheet locally and sends only validated recipient data to the Express API. All Evolution API access stays behind the Express server. The global Evolution API key is never sent to the browser.

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

### Health and sessions

- `GET /api/health`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:instance/connect`
- `GET /api/sessions/:instance/qr`
- `POST /api/sessions/:instance/restart`
- `POST /api/sessions/:instance/disconnect`
- `DELETE /api/sessions/:instance`

### Campaigns

- `POST /api/campaigns/text`

The campaign endpoint accepts a connected instance, message template, validated recipients, and an optional delay. It sends recipients sequentially through Evolution API's `message/sendText` endpoint and returns per-recipient results.

Messaging outside the campaign workflow, contacts, chat history, and realtime webhook endpoints are not part of the current application scope.

## Production

Build the client with `npm run build`, then serve `client/dist` with a CDN/reverse proxy and run the Express server privately. Do not expose `EVOLUTION_API_KEY` to client-side code.

For larger campaigns, move sending into a persistent queue/worker before increasing the recipient limit or throughput.

## Notes

Only send messages to recipients who have appropriately opted in, and respect WhatsApp/Meta policies and applicable laws. This project manages sessions and campaign delivery through an Evolution API deployment; it does not replace Evolution API itself.
