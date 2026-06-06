# @daana-health/inventory-core

Generic, domain-agnostic inventory engine. Exposes the foundational primitives every domain pack builds on: item types, attribute schemas, an item status state machine, a FEFO (First-Expiry-First-Out) sort comparator, a pluggable code generator contract, and a validator registry. This package contains **zero clinic-specific or product-specific logic** — it is the contract surface that all domain packs (MASS, future veterinary, lab-supplies, etc.) implement against. Owned and filled in by the foundation agent.
