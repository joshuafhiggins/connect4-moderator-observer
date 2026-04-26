# Connect4 Moderator Observer UI

A website interface for connecting to the [Connect4 WebSocket server](https://github.com/joshuafhiggins/connect4-moderator-server) as an observer or player, watching live matches, and managing tournaments.

## Prerequisites

- Linux/macOS terminal or Windows PowerShell
- Git
- Docker (optional, for containerized runs)

## Run Locally (Node.js + npm)

### 1) Install Node.js (includes npm)

#### Option A: Install with `nvm` (recommended, including Windows support)

On Linux/macOS:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.zshrc
nvm install --lts
nvm use --lts
node -v
npm -v
```

On Windows (PowerShell), use `nvm-windows`:

```powershell
winget install CoreyButler.NVMforWindows
nvm install lts
nvm use lts
node -v
npm -v
```

### 2) Install dependencies

From the project root:

```bash
npm i
```

### 3) Start the UI in development mode

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run with Docker

This repository includes:

- `Dockerfile` (multi-stage production build)
- `docker-compose.yml`
- `docker_build.sh`

### Build image directly from `Dockerfile`

```bash
docker build . -t joshuafhiggins/connect4-ui
```

or use the provided script:

```bash
./docker_build.sh
```

### Run container directly

```bash
docker run --rm -p 3000:3000 --name connect4-ui joshuafhiggins/connect4-ui
```

### Run with Docker Compose

```bash
docker compose up --build
```

Run detached:

```bash
docker compose up -d --build
```

Stop:

```bash
docker compose down
```

## Useful npm Scripts

- `npm run dev` - start Next.js dev server
- `npm run build` - build for production
- `npm run start` - run production build
- `npm run lint` - lint the project
