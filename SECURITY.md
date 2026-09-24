# Security

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue. Use GitHub's
**Report a vulnerability** button on the repository's Security tab, and include
steps to reproduce. We aim to reply within a week.

## What Rewind protects, and how

Rewind records real requests, so it holds sensitive data by design. It is built
to keep that data local and to store as little of it as possible.

| Risk | Protection |
| --- | --- |
| Secrets stored in captures | Auth headers, cookies, API keys, tokens, passwords, card numbers and URL credentials are redacted before storage. Settings can add more names but never remove the built-in ones. |
| Capsules leaking secrets | Capsules are scanned for secrets on export and import, and carry an integrity digest. |
| Replays causing side effects | Replays only target localhost. Dependencies answer from the recording unless an experiment explicitly chooses `live`. |
| Unauthorised access | Open by default for local use. Set `REWIND_ACCESS_TOKEN` before exposing Rewind on a network: every page and API then requires the token, and failed attempts are rate limited. |
| Oversized or malformed input | Request bodies are size-limited (413), invalid input returns 400, and error details stay in the server log. |
| Data leaving the machine | No third-party calls or analytics. Next.js telemetry is disabled in Docker. |

## Deployment checklist

- Set `REWIND_ACCESS_TOKEN` to a long random value (`openssl rand -hex 32`) on Rewind and on every app that captures to it.
- Serve Rewind over HTTPS if it is reachable beyond localhost, so the session cookie is marked `Secure`.
- Keep `data/` (or `REWIND_DB_PATH`) out of backups you share: it contains captured requests.
