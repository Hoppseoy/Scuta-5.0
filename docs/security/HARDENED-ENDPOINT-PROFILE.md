# Hardened Endpoint Profile

## Runtime constraints
- Require modern browser with WebCrypto support for ECDSA P-256.
- Run over HTTPS only in production.
- Disable untrusted extensions and run dedicated browser profile.
- Use full-disk encryption and OS screen-lock policy.

## App-level controls
- Strict response security headers and CSP.
- Inactivity lock and local purge controls.
- No insecure mixed content.

## Operational controls
- Device inventory and enrollment lifecycle management.
- Enforced updates and incident response playbook for suspected compromise.
- Separate low-risk and high-risk sectors with dedicated origin allowlists.

