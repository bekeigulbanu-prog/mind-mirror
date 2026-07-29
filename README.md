# 🪞 MindMirror

**MindMirror** is a psychological self-testing web application where users take a test, receive their results ("mirroring their inner self"), request a consultation, leave a review, and subscribe to Premium. It includes an administrative analytics dashboard featuring AI-powered review analysis and traffic statistics.
The source code is sold "as is" (see LICENSE.txt). Below is everything you need to deploy the project on your end.

---

## Project Structure

| File | Description |
|---|---|
| `mindmirror.html` | Client application (test, results, personal dashboard, subscription) |
| `feedback-analytics.html` | Admin dashboard: reviews, subscription & traffic analytics, AI analysis |
| `server.js` | Main API server: registration/login, tests, profile, reviews, consultations, subscriptions |
| `analyze-server.js` | Separate server: AI-powered review analysis (Google Gemini) |
| `stats-server.js` | Separate server: visit/login statistics |
| `MindMirror.sql` | Utility SQL queries for database management (viewing tables, cleanup) |
| `package.json` | Dependencies and startup script|
| `.env.example` | Environment variables template |

## Tech Stack

- **Backend:** Node.js, Express 5
- **Database:** Microsoft SQL Server (`mssql`)
- **AI:** Google Gemini 2.5 Flash (анализ отзывов и чат)
- **Email:** Resend API
- **Frontend:** статический HTML + Tailwind CSS (CDN) + Chart.js, без сборки

## Architecture

The project consists of three independent Node.js servers operating on separate ports and sharing the same database:

```
                ┌───────────────────┐
                │   MindMirrorDB     │  (MSSQL)
                └─────────▲──────────┘
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────┴───────┐ ┌───────┴────────┐ ┌───────┴────────┐
│  server.js     │ │ analyze-server │ │ stats-server.js │
│  Port 3000     │ │ Port 3001      │ │ Port 3002       │
│  Main API      │ │ AI Analysis    │ │ Statistics      │
└────────────────┘ └────────────────┘ └─────────────────┘
```

`mindmirror.html` interacts with the server on port 3000, while `feedback-analytics.html` accesses all three (3000/3001/3002). When deploying to production, replace `http://localhost:PORT` in the HTML files with your actual server addresses (or set up a reverse proxy / unified domain).

## Requirements

- Node.js 18+
- Microsoft SQL Server (local or cloud-hosted)
- Google Gemini API key (for AI features)
- Resend API key (for emails; optional if email support is not needed)

## Installation

1. Install dependencies:
   ```bash
   npm install

2. Create the MindMirrorDB database in MSSQL with the following tables (the structure can be derived from the SQL queries in MindMirror.sql; build them according to your business logic or request a pre-built DDL schema from the seller upon purchase):
   - `Users`
   - `UserLogins`
   - `TestResults`
   - `Feedback`
   - `Consultations`
   - `Subscriptions`

3. Copy .env.example to .env and fill in the values (database connection credentials, Gemini/Resend keys, ports):
   ```bash
   cp .env.example .env
   ```

4. Start the servers (in separate terminal windows or using a process manager like pm2):
   ```bash
   node server.js            # Main API — port 3000
   node analyze-server.js    # AI review analysis — port 3001
   node stats-server.js      # Traffic/visit statistics — port 3002
   ```

5. Open mindmirror.html in your browser (or serve it as static files via Nginx or Express static) — this is the main application.
Open feedback-analytics.html to access the admin dashboard.

The npm start script in package.json only runs the main server (server.js). For full functionality (AI analysis and traffic statistics), make sure to also run analyze-server.js and stats-server.js.

## Main API Endpoints (server.js, port 3000)

Method,Path,Description
POST,/api/register,User registration
POST,/api/login,User login
PUT,/api/profile,Update profile
POST,/api/save-result,Save test result
POST,/api/ai-chat,AI chat
POST,/api/contact,Contact form / email
GET/POST,/api/feedback,Fetch / Submit reviews
POST,/api/book-consultation,Book a consultation
GET,/api/consultations,List consultations
POST,/api/cancel-consultation,Cancel consultation
GET,/api/subscription/status,User subscription status
POST,/api/subscribe,Subscribe
POST,/api/subscription/cancel,Cancel subscription
GET,/api/subscriptions/stats,Summary subscription statistics
GET,/api/subscriptions/recent,Recent subscriptions

Additional endpoints:
POST /api/analyze-feedback (analyze-server.js, port 3001) — AI analysis of reviews for the past month.
GET /api/stats/visits (stats-server.js, port 3002) — Visit/login statistics by time period.

## Customization & Setup
Replace http://localhost:3000/3001/3002 addresses in mindmirror.html and feedback-analytics.html with your production URLs.
Replace GEMINI_API_KEY and RESEND_API_KEY with your own credentials.
If necessary, update the CORS policy (app.use(cors())) to an explicit domain whitelist before deploying to the public web.
User passwords and hashing logic — inspect server.js (/api/register, /api/login) and align them with your security standards before production use.

## Security Considerations (Important for Production Deployment)
This is a starter template / source code framework ready for further development. Before launching publicly, it is recommended to:
Ensure passwords are stored using strong hashing algorithms (e.g., bcrypt/argon2) rather than plaintext.
Restrict CORS origin policies to specific trusted domains.
Move real API keys out of the code/repository into environment variables (.env, do not commit).
Add rate-limiting to public endpoints (/api/login, /api/register).
Configure HTTPS before deploying to production.
