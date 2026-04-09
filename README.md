# Mixer

A social posting platform built with Elixir/Phoenix, Ash Framework, and React. Users can post, reply, like, follow each other, and upload media/avatars. Metrics are tracked in ClickHouse.

## Stack

- **Backend:** Elixir 1.15+, Phoenix, Ash Framework (resources, policies, state machine, authentication)
- **Frontend:** React + TypeScript, bundled via esbuild, styled with Tailwind CSS + DaisyUI
- **Databases:** PostgreSQL (primary data), ClickHouse (metrics/analytics)
- **Storage:** S3-compatible object storage (MinIO locally, any S3-compatible service in prod)
- **Email:** Swoosh (local mailbox in dev, Brevo in prod)
- **API layer:** AshTypescript RPC (type-safe TS client auto-generated from Ash resources)

## Dev environment setup

### Prerequisites

- Elixir 1.15+ and Erlang/OTP (via [asdf](https://asdf-vm.com) or system package manager)
- PostgreSQL running locally (default: `postgres`/`postgres` on `localhost:5432`)
- ClickHouse running locally (default: `default`/no password on `localhost:8123`, database `mixer_metrics`)
- MinIO running locally on `localhost:9000` with credentials `minioadmin`/`minioadmin`

### MinIO setup

Start MinIO and create the bucket before running the app:

```bash
# Start MinIO (adjust data dir as needed)
minio server /data --console-address ":9001"

# Create the bucket (using the MinIO CLI or the web console at http://localhost:9001)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/mixer-bucket
mc anonymous set public local/mixer-bucket
```

### First-time setup

```bash
# Install Elixir dependencies and set up both databases
mix setup
```

`mix setup` runs `mix deps.get`, creates and migrates both the PostgreSQL and ClickHouse databases, and seeds initial data.

### Running the server

```bash
mix phx.server
```

Visit [http://localhost:4000](http://localhost:4000). The frontend assets (esbuild + Tailwind) are compiled and watched automatically.

### Email in development

Magic-link sign-in emails are delivered to the local Swoosh mailbox. View them at [http://localhost:4000/dev/mailbox](http://localhost:4000/dev/mailbox).

### Regenerating the TypeScript RPC client

After changing Ash resource actions or attributes, regenerate the typed TS client:

```bash
mix ash_typescript.generate
```

The output goes to `assets/js/ash_rpc.ts`.

## Production environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection URL (`ecto://user:pass@host/db`) |
| `SECRET_KEY_BASE` | Phoenix secret key (generate with `mix phx.gen.secret`) |
| `TOKEN_SIGNING_SECRET` | Ash authentication token signing secret |
| `CLICKHOUSE_URL` | ClickHouse connection URL (or use individual vars below) |
| `CLICKHOUSE_HOST` | ClickHouse host |
| `CLICKHOUSE_PORT` | ClickHouse port (default `8123`) |
| `CLICKHOUSE_DATABASE` | ClickHouse database name (default `mixer_metrics`) |
| `CLICKHOUSE_USERNAME` | ClickHouse username (default `default`) |
| `CLICKHOUSE_PASSWORD` | ClickHouse password |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_HOST` | S3 host (e.g. `s3.amazonaws.com`) |
| `S3_BUCKET` | S3 bucket name |
| `S3_ASSET_HOST` | Public base URL for serving assets (e.g. `https://cdn.example.com`) |
| `S3_SCHEME` | S3 scheme (default `https://`) |
| `S3_PORT` | S3 port (default `80`) |
| `S3_VIRTUAL_HOST` | Use virtual-hosted S3 URLs (default `false`) |
| `BREVO_API_KEY` | Brevo (Sendinblue) API key for transactional email |
| `PHX_HOST` | Public hostname (default `mixer.jimweaver.com`) |
| `PORT` | HTTP port (default `4000`) |
| `PHX_SERVER` | Set to `true` to start the HTTP server in a release |
