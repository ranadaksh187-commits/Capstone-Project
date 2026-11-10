# Peerly — Peer Learning & Doubt Resolution Network

Peerly is a full-stack learning community built with React, Vite, Node.js, Express, and MongoDB. Students and mentors can ask questions, share explanations, build a reputation, and find people with matching skills.

## Features

- Register and sign in as a student or mentor; passwords are stored as bcrypt hashes and protected API routes use JWT.
- Create named or anonymous doubts, browse by subject, and search question and answer content.
- Post, edit, and remove your own answers; accept an answer to resolve a doubt.
- Mark another member's answer helpful; each member can vote once per answer and the author earns 10 reputation points.
- Build a profile with subjects, skills, interests, a bio, and availability.
- Discover peers and mentors ranked by relevant subjects, skills, answer acceptance, availability, and reputation.
- Receive persistent notifications for matches, answers, and reputation updates.
- Report a question or answer; administrators can dismiss reports, remove content, or suspend its author.
- Responsive dashboard with separate student, mentor, and administrator capabilities.

## Run locally

Requirements: Node.js 22.x through 24.x, npm, and MongoDB 7+ running on `127.0.0.1:27017`.

1. Copy the Node API environment template and set a private JWT secret (at least 32 characters):

   ```powershell
   Copy-Item backend-node/.env.example backend-node/.env
   ```

   Generate a secret with:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Put the generated value in `backend-node/.env` as `JWT_SECRET=...`. Keep `.env` private and out of source control.

2. Install dependencies and start the application:

   ```powershell
   npm install
   npm install --prefix backend-node
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173). The API health check is [http://localhost:8081/api/health](http://localhost:8081/api/health).

`npm run dev` starts the Express API and Vite frontend together. MongoDB must be running first. For a MongoDB Windows service, start it from Windows Services. To run MongoDB manually, create a data directory and start `mongod --dbpath C:\data\db`.

## Run with Docker Compose

Docker Desktop runs the React frontend, Express API, and MongoDB together:

```powershell
$env:JWT_SECRET = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose up --build
```

Open [http://localhost:8088](http://localhost:8088). MongoDB data persists in the `peerly-mongo-data` volume. Stop the services with `Ctrl+C`, then run `docker compose down`. Add `-v` only when you intentionally want to delete the local MongoDB data.

## Administrator account

Public registration only allows student and mentor roles. Create an administrator from a private local environment after configuring `MONGODB_URI`:

```powershell
$env:ADMIN_NAME = "Peerly Admin"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "use-a-private-password-at-least-12-characters"
npm --prefix backend-node run seed:admin
```

Do not commit or share the administrator password. For Docker/hosted deployments, run the seed command in an environment connected to the same MongoDB database.

## Tests and build

MongoDB must be running for the API integration tests:

```powershell
npm --prefix backend-node test
npm run build
```

## API overview

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Register a student or mentor |
| `POST` | `/api/auth/login` | Sign in and issue a JWT |
| `GET`, `PATCH` | `/api/auth/me` | Read or update the signed-in profile |
| `GET`, `POST` | `/api/doubts` | Search/browse doubts or create a doubt |
| `POST` | `/api/doubts/:id/answers` | Answer a doubt |
| `PUT` | `/api/doubts/answers/:id/helpful` | Mark an answer helpful and award reputation |
| `PUT` | `/api/doubts/answers/:id/accept` | Accept an answer and resolve a doubt |
| `GET` | `/api/doubts/:id/recommendations` | Find matching helpers |
| `GET` | `/api/peers` | Search profiles and discover peers |
| `GET`, `PUT` | `/api/notifications` | Read and mark notifications read |
| `POST` | `/api/reports` | Report a doubt or answer |
| `GET`, `PATCH` | `/api/admin/reports` | Review reports (administrator only) |

## Project layout

```text
frontend/      React + Vite application
backend-node/  Express API, MongoDB models, authentication, and API tests
backend/       Previous Spring Boot implementation retained as inactive source
Dockerfile     Single-service Node build with the React app served by Express
docker-compose.yml
render.yaml
```

The active development and Docker Compose commands use the MERN-style React + Express + MongoDB application. The older `backend/` Java source is not part of the default run path.
