# Security architecture and reporting

Review security separately after implementing each change. Record the changed trust boundaries, checks performed, findings, remediation and remaining qualification requirements under `docs/security/`.

The engine will treat uploads, archives, converted scenes, creator behavior, remote URLs and client commands as untrusted. Access control, physical authority and acoustic attenuation have different purposes. Media E2EE and encrypted documents/files require explicit endpoint identities and key scopes; server-readable simulation state must be described honestly.

Do not post credentials or exploit-sensitive private data in public issues. Report non-sensitive bugs through the repository and coordinate a private channel with the repository owner for sensitive disclosures.

There is no production service or production security qualification at F01. Required release checks and blocking findings may not be bypassed.
