# Extracto

Extracto is a local-first invoice and receipt parser. It accepts text-based PDF and TXT files, extracts fields for review, and exports reviewed records to CSV or Google Sheets. Demo parsing uses simple rules and must be checked by a person. Scanned PDFs and image uploads need an OCR provider and are not supported yet.

## Run locally

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and create an account. Account passwords are stored as scrypt hashes. Development records and users are stored in `data/records.json` and `data/users.json`.

## Environment

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Secret used to sign sessions. Set a random value of at least 32 characters outside local development. |
| `OCR_PROVIDER` | Extraction provider: `gemini` (default), `openai`, or `demo`. |
| `GEMINI_API_KEY` | Gemini API key when `OCR_PROVIDER=gemini`. Uploaded document text is sent to Google's Gemini API for extraction. |
| `GEMINI_MODEL` | Optional Gemini model override; defaults to `gemini-3.5-flash-lite`. |
| `OPENAI_API_KEY` | OpenAI API key when `OCR_PROVIDER=openai`. |
| `OPENAI_MODEL` | Optional model override; defaults to `gpt-4o-mini`. |
| `NEXT_PUBLIC_URL` | Public app URL used by the Google OAuth callback. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Sheets export. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Random encryption secret of at least 32 bytes for stored Google tokens. |

Google Sheets export requires an OAuth client with the callback URL `${NEXT_PUBLIC_URL}/api/google/callback` and the Sheets API enabled for its Google Cloud project.

## Checks

```sh
npm run lint
npm run build
```

The JSON-file storage is intended for a single local app instance. Use a shared database and managed file storage before deploying multiple instances or handling production documents.
