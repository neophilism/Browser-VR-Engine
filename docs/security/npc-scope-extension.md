# Generated-object and NPC scope — design review

This review covers the owner's requested plan and architecture extension. It is not a review or acceptance of an implemented provider, payment or NPC runtime.

The separate read-only review checked the complete dependency graph, retained baseline criteria, engine/application boundaries, provider trust, private memory, quoted spending, administrator exemption, slots, subscriber subsidies and freeze/resume. Three findings were resolved before publication: application cards use the established `app` repository key; final qualification settles actual approved usage within the quoted maximum and releases unused reservations; and exempt administrator use has explicit platform-funded reservations/leases while the customer debit remains zero.

All 145 baseline cards are retained, with only the intended R12/G16 and C24/C41 dependency additions. The 31 new cards remain planned. The 176-card graph contains 135 engine and 41 application units; every added unit reaches its corresponding release gate, and no engine unit depends on the application. C01 still follows R12.

The design requires trusted authority for spending, administrator identity and access to private memory. A persona, prompt or generated asset cannot grant those permissions. Stored assets and conversations survive a funded-to-dormant transition without silently authorizing more inference. Funding reservations bound concurrent work; subscribers' own consumption is included in the operating model. Provider credits and platform credits remain distinct accounting units.

No blocking design contradiction remains in this reviewed scope. Real-provider, payment, concurrency, isolation, device and operational reviews are explicit implementation gates in G01–G16 and C27–C41. No paid call, provider secret read or application code change was performed by this extension.
