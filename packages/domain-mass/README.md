# @daana-health/domain-mass

The DaanaRX **MASS Clinic** domain pack — the first concrete domain riding on the inventory platform. Wires `@daana-health/inventory-core` and `@daana-health/inventory-react` together for clinic medication inventory: medication attribute schema (NDC, strength, dosage form, controlled-substance schedule, expiry, lot), the DRX code template, classification rules, and the medication label renderer. New clinics or domains do **not** modify this package — they add a sibling `domain-<name>` package. Owned by the domain-mass agent.
