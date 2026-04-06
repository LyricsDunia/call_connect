# Internet Calling App

Browser-based peer-to-peer calling — no phone number required. Users pick a username, see who's online, and make video or voice-only calls via WebRTC with Socket.io signaling.

## Features

- Video calls and voice-only calls
- See who's online in real time
- Invite links — share a URL to call someone directly
- Echo cancellation, noise suppression, and auto gain control
- Falls back gracefully (no camera → audio-only call)
- Session persists on refresh (username saved in localStorage)

## Project Structure

```
├── client/   Vite + React + Tailwind CSS frontend
└── server/   Express + Socket.io signaling server
```

## Quick Start (Development)

**Requirements:** Node.js 18+

```bash
# 1. Install all dependencies
npm run install:all

# 2. Start both servers concurrently
npm run dev
```

- Client: http://localhost:3000
- Server: http://localhost:8080

In development the Vite dev server proxies `/api` requests to the backend automatically.

## Production Build

```bash
# Build client + server
npm run build

# Start the production server (serves built client files too)
PORT=8080 NODE_ENV=production node server/dist/index.js
```

The server serves the built frontend from `client/dist/` when `NODE_ENV=production`.

## Deploying

### Railway / Render / Fly.io (recommended)

1. Push this repository to GitHub.
2. Create a new service pointing to the repo root.
3. Set the build command: `npm run build`
4. Set the start command: `node server/dist/index.js`
5. Set environment variables:
   - `NODE_ENV=production`
   - `PORT=8080` (or whatever the platform assigns)

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Port the server listens on |
| `NODE_ENV` | `development` | Set to `production` for prod |
| `ALLOWED_ORIGINS` | (all) | Comma-separated list of allowed CORS origins in production (e.g. `https://yourdomain.com`) |

### Separate Frontend/Backend Hosting

You can also host the client on Vercel/Netlify and the server on Railway/Render:

1. Set `VITE_SERVER_URL` in the client's environment (or update `client/src/lib/socket.ts` to point to your server URL).
2. Update `ALLOWED_ORIGINS` on the server to include your frontend domain.

## TURN Servers

The app uses [OpenRelay](https://www.metered.ca/tools/openrelay/) as a free TURN server for NAT traversal. For production use with many users, replace the credentials in `client/src/contexts/CallContext.tsx` with your own TURN server.

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, framer-motion, wouter
- **Backend:** Express 4, Socket.io 4
- **WebRTC:** Native browser APIs with Google STUN + OpenRelay TURN
