# Locker snapshot sharing

The public companion Sites deployment hosts the anonymous snapshot API; GitHub Pages remains the primary tracker. The Sites access policy is public by the owner's authorization.

- Only pressing **Create short link** uploads the selected season's snapshot and required nickname. Progress updates are never uploaded automatically.
- Short links are `/s/<96-bit-random-id>`. Anyone who receives the link can read that snapshot. There is no browse/list endpoint or public modification endpoint.
- The redirect opens `https://eabaylor.github.io/fortnite-sprite-locker/?s=<id>`. The tracker reads the snapshot from the companion API without credentials. Additional tracking query parameters are ignored. A browser cannot access another browser's local checklist; the UI explains this for Messenger visitors.
- Links expire after 90 days. Expired snapshots are removed when subsequent sharing requests perform cleanup. New-season rollovers must not delete or rotate the snapshot tables or immutable dictionaries.
- The anonymous creation flow requires a trusted Origin and a 120-second, single-use random capability. Issuance is limited to 30 tickets per edge IP per hour and 5,000 tickets globally per day. Daily-scoped hashes are stored instead of raw IPs; quota rows expire. This is abuse mitigation, not a guarantee against distributed abuse.
- Payloads are streamed with a 16 KB limit, decoded, validated, and canonicalized. Prepared statements are used throughout. No Fortnite credentials, email addresses, or browser progress keys are stored in the snapshot database.
- **Portable link** remains the offline/no-upload fallback and has no service expiry. Existing portable snapshots remain compatible.
- Local tests use SQLite with the exact generated migration and a temporary browser profile. Production checks use a clearly named test snapshot rather than a real user's checklist.

Schema changes are migration-owned: edit `db/schema.ts`, generate and commit Drizzle migrations, then deploy through Sites. Never create tables in request handling. Keep `DB` enabled in `.openai/hosting.json`. The Worker intercepts `/api/lockers*` and `/s/*`; the service worker must not cache those endpoints.
