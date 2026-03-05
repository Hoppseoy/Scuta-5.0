# Threat Model (High-Risk Deployment)

## Adversaries
- Network active attacker (MITM, replay, traffic manipulation).
- Malicious client attempting forged socket events and impersonation.
- Server/log observer with database read access.
- Compromised endpoint (malware/extension/screen capture).

## Security goals
1. Message confidentiality and integrity.
2. Authenticated membership and device continuity.
3. Authorization enforcement on server-controlled actions.
4. Minimized metadata leakage and hardened transport.
5. Cryptographic erasure on panic/rekey/room burn.

## Trust boundaries
- Browser client trust boundary: plaintext exists transiently in UI memory.
- Server trust boundary: should not access plaintext message content.
- Transport boundary: TLS termination and origin restrictions are mandatory.

## Implemented mitigations (current)
- Signed join proof with per-device ECDSA identity and nonce freshness checks.
- Room enrollment binding (callsign tied to device identity key).
- Server-authoritative actor binding for all privileged socket events.
- Event rate limiting and denied-action audit logs (obfuscated IDs).
- Storage envelope encryption with room storage keys (destroyed on panic/rekey/burn).

## Residual risks
- Shared passphrase model remains legacy and is not full MLS.
- Endpoint compromise can still exfiltrate plaintext.
- Metadata (timing/presence) is partially visible during active room sessions.

