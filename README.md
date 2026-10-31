# Chor Police

AkxH Games — classic Indian parlor game (Raja · Rani · Chor · Police). Exactly four players. Police finds the Chor. Classic points.

- **Pass & play** — one phone, pass between peeks
- **Online lobby** — name-only identity (no Firebase Auth)
- Shared Firebase project **`akxh-games`** with namespaced collections `chorpolice_*`

## Stack

Next.js 15 · React 19 · Node 24 · Firebase Firestore · Tailwind

## Local

```bash
cp .env.example .env.local   # or copy from whozzit/shaanpatti
npm install
npm run dev
```

Open in **Brave** or Cursor browser (not Edge).

## Firestore

Paste the full `firestore.rules` into the akxh-games console (see `docs/firebase-rules.md`). Collections: `chorpolice_lobbies`, `chorpolice_users`.

## Scoring (digital ruleset)

| Role   | Points                                      |
|--------|---------------------------------------------|
| Raja   | 1000 always                                 |
| Rani   | 800 always                                  |
| Police | 500 if Chor caught, else 0                  |
| Chor   | 0 if caught; takes Police’s 500 if escaped  |
