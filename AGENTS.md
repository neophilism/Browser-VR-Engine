# Development instructions

Read `README.md`, `DEVELOPMENT_PLAN.md`, `HANDOFF.md`, `ACCEPTANCE.md`, and `docs/progress.json` before changing implementation status.

- Work on the approved plan in dependency order. Complete Browser-VR-Engine before starting XLR8, as directed by the owner on 2026-10-17.
- Keep reusable behavior here. This repository must not import the XLR8 application or encode conference role policy.
- Reuse qualified upstream components. F04/F05 gather evidence; F06 selects one foundation. Do not mark an evaluation or capability verified using unperformed hardware/provider tests.
- Implement functional plan units, run meaningful changed-path checks, then perform and record a separate self security review. Resolve blocking findings before merge.
- Required checks must pass on the current PR commit. Confirm GitHub mergeability, merge safely, verify applicable main-branch checks, update the record, and continue ready work without routine approval requests.
- Preserve actual repository-required additional reviews. Do not mislabel self review as independent review.
- Keep implementation, verification, merge, deployment, and production qualification separate. Missing credentials, native tools, source assets, or devices must have explicit blocked evidence and next actions.
- Preserve full import, conversion, editing, and export goals. Suppliers follow the capability requirements.
- Apply security to actual trust boundaries: authorize state changes, isolate untrusted parsing/execution, scope keys, and identify plaintext processing endpoints. Never claim encryption for server-readable state.
- Update API/architecture/deployment guidance, acceptance evidence, and handoff in the same change when affected. Do not put secrets or privately obtained source assets into Git.
- Continue independent ready work when a particular integration is blocked. Do not claim unattended work is running when no session is active.

Commands: `npm ci`, `npm run check`, and `npm run example:sdk`. CI and release gates evolve through F02 and later accepted plan units.
