# @daana-health/inventory-react

Generic React UI layer for the inventory platform. Provides schema-driven primitives — forms, tables, cart, search — that render any item type described by an `AttributeSchema` from `@daana-health/inventory-core`. Peer-depends on React 18 or 19 so host apps control their React version. This package contains no domain-specific copy, validation, or styling beyond what the schema describes; domain packs supply the schemas and any custom field renderers. Filled in by feature agents.
