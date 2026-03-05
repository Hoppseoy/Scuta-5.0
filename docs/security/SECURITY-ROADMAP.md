# Security Roadmap Kickoff

This document tracks delivery for 8 critical workstreams to move Scuta toward high-risk operational viability.

## Status Legend
- ✅ Completed in this phase
- 🟡 In progress

## 1) Cryptographic identity and authenticated enrollment — ✅
- Added per-device ECDSA identity generation and persistence on clients.
- Added signed join proof (`room|user|device|timestamp|nonce`) and server verification.
- Added replay window + nonce consumption and room enrollment binding.

## 2) Migrate from shared passphrase-only model to modern group protocol — 🟡
- Added migration controls and threat model groundwork.
- Legacy passphrase transport remains for message-layer compatibility while migration proceeds.

## 3) Server-authoritative authorization for all socket events — ✅
- Privileged actions bound to server actor state (`socket.id`), not client sender/username claims.
- Denied actions logged with obfuscated identifiers.

## 4) Production-grade transport and network policy controls — ✅
- HTTPS enforcement in production (`req.secure` / `x-forwarded-proto`).
- Strict security headers + CSP.
- Configurable origin allowlist (`SCUTA_ALLOWED_ORIGINS`).
- Socket event rate limiting.

## 5) Metadata minimization and protection — 🟡
- Obfuscated identifiers in audit logs.
- Reduced unnecessary cleartext exposure in security telemetry.

## 6) Cryptographic erasure semantics for expiry/panic — ✅
- Added envelope encryption for stored ciphertext.
- Room storage keys destroyed on panic/rekey/burn to render persisted blobs undecryptable.

## 7) Hardened endpoint profile and secure-runtime constraints — ✅
- Added hardened endpoint profile doc and operational runtime requirements.
- Added strict browser-facing security headers and policy baseline.

## 8) Security assurance program — ✅
- Added assurance program with audit/testing/release governance gates.
- Added formal threat model document.

