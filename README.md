# Dragoncrypt

Zero-knowledge encrypted secret sharing. Encrypt in your browser, share a link, secrets self-destruct.

Built by **Sekiro Dragons**.

## Architecture

```
┌─────────────┐     REST API      ┌─────────────────┐
│   Frontend   │ ◄──────────────► │  Rust Backend    │
│  React + TS  │   /api/secrets   │  Axum + SQLite   │
│  Vite + TW   │                  │  dragoncrypt-db  │
└─────────────┘                   └─────────────────┘
       │                                  │
       │  AES-256-GCM                     │  stores only
       │  (client-side)                   │  ciphertext
       ▼                                  ▼
  Key in URL fragment            Encrypted blobs
  (never sent to server)         (unreadable)
```

**CLI** (`dc`) — same REST API, terminal access.

## Features

- **Client-side encryption** — AES-256-GCM, your content is encrypted before it leaves your browser
- **Zero-knowledge** — the server never sees plaintext or the decryption key
- **Burn after reading** — secrets self-destruct after first view
- **Auto-expiry** — 5 minutes, 1 hour, 1 day, 1 week, or never
- **Password protection** — PBKDF2 (310k iterations) + XOR key combining
- **File uploads** — encrypt and share files up to 5 MB
- **QR codes** — generated client-side, no external API
- **CLI tool** — seal, unseal, sever from your terminal

## Tech Stack

| Layer | Tech |
|-------|------|
| Crypto | AES-256-GCM + PBKDF2 (Web Crypto API in browser, `aes-gcm` crate in Rust) |
| Backend | Rust + Axum + SQLite (sqlx) |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| CLI | Rust + Clap + Reqwest |

## Project Structure

```
dragoncrypt/
├── crypto/          # Shared encryption crate (AES-256-GCM + PBKDF2)
├── backend/         # Axum REST server (SQLite)
├── cli/             # CLI tool: dc seal / unseal / sever / status
├── frontend/        # React SPA (Vite + Tailwind)
└── .github/         # CI workflow
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (for backend + CLI)
- [Node.js](https://nodejs.org/) 18+ (for frontend)

### Backend

```bash
# From the project root
cd backend
cargo run
# Server starts on http://localhost:3001
```

Or use the workspace:

```bash
cargo run -p dragoncrypt-backend
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

The frontend proxies `/api` requests to the backend at `localhost:3001`.

### CLI

```bash
cargo run -p dragoncrypt-cli -- seal --expires 1h <<< "my secret"
cargo run -p dragoncrypt-cli -- unseal "http://localhost:5173/#/view/abc#k=xyz"
cargo run -p dragoncrypt-cli -- status
```

Or after building:

```bash
cargo build --release
./target/release/dc seal --expires 1d -f myfile.txt
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/secrets` | Store an encrypted secret |
| GET | `/api/secrets/:id` | Fetch + decrypt metadata (handles burn/expiry) |
| DELETE | `/api/secrets/:id` | Delete a secret |
| GET | `/api/health` | Server health check |

## License

MIT — see [LICENSE](LICENSE).
