# Chor Police — Firestore rules to publish (akxh-games)

**Paste the FULL `firestore.rules` document** (not only `chorpolice_*` blocks). Console Rules replace the entire ruleset; a partial paste would wipe Spycy / Whozzit / Ishaare / Shaanpatti.

| Item | Value |
|------|--------|
| Firebase project | `akxh-games` |
| Source of truth | `c:\Development\ak-games\chorpolice\firestore.rules` |
| New collections | `chorpolice_lobbies`, `chorpolice_users` |
| Also kept in file | `shaanpatti_*`, `whozzit_*`, `spycy_*` (Auth-gated), `ishaare_*` + legacy deny |
| Auth | **None** — local UUID + display name only |
| Console | **Yes** — replace entire Rules editor → Publish |

## Console steps

1. [Firebase Console](https://console.firebase.google.com/) → project **`akxh-games`**
2. **Build → Firestore Database → Rules**
3. Replace the **entire** document with `firestore.rules` from this repo
4. **Publish**
5. Hard-refresh Chor Police → Online lobby
