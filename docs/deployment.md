# Deployment

F01 supplies a local SDK build only. No production deployment is claimed.

## Local development

Install Node 24 and npm, clone the repository, then run:

```sh
npm ci
npm run check
npm run example:sdk
```

## Planned hosted services

F08 establishes generic control/data interfaces. N08/N09 implement world routing/recovery. M07 qualifies media and TURN networking. R01 packages the service stack; R02-R08 qualify configuration, recovery and supported deployment profiles. XLR8 deployment is C25 after the engine is complete.

Deploy immutable tested artifacts. Keep service credentials out of browser bundles and Git. Use migrations with a restore or forward-repair path. Record actual domain, region, service versions and rollback evidence at deployment rather than describing an unprovisioned environment as live.
