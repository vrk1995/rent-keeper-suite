## Goal
Introduce a **Unit / Corp No.** identifier under each floor of a property. A floor can have many corp numbers, each with its own sqft. Tenants and expenses can be tagged to a corp number. Property detail shows vacant vs occupied per corp number.

## Data model
New table `public.floor_units` (separate from existing `units`, per your preference):
- `id`, `property_id`, `floor_id` (FK → `property_floors`), `corp_number` (text), `area_sqft` (numeric), `notes`, timestamps
- Unique on `(floor_id, corp_number)`
- Standard `GRANT` + team-based RLS (matches other shared tables)

Add nullable `floor_unit_id` to:
- `tenants` — which corp no. the tenant occupies
- `property_expenses` — optional tag for corp-tax / electricity etc.

Occupancy is derived: a corp no. is **Occupied** if any active tenant references it, else **Vacant**.

## UI changes

**Add/Edit Property (`AddPropertyDialog`)**
- Under each floor row, add a collapsible "Unit / Corp Nos." section: `+ Add Corp No.` → rows of `Corp Number` + `Area (sqft)`. Sum of corp-no. sqft may be ≤ floor sqft (validation warning if exceeded).
- On save: upsert corp nos. per floor.

**Add/Edit Tenant (`AddTenantDialog`)**
- After Floor select, add **Unit / Corp No.** searchable select (options: corp nos. on the selected floor, with `(Vacant)` / `(Occupied by X)` badge). Optional if floor has no corp nos.
- Capacity panel: when a corp no. is chosen, show its available sqft.

**Add Expense (`AddExpenseDialog`)**
- Optional **Unit / Corp No.** select (filtered by chosen property; grouped by floor).

**Property Detail (`PropertyDetailSheet`)**
- New "Corp Numbers" section listing each floor → corp nos. with sqft and status badge (Vacant / Tenant name). Sits alongside existing tenants/expenses tabs.

**Payments** — inherit corp no. via tenant; no separate selector (rent payments already tie to tenant). Adhoc payments unchanged unless you also want a tag — not in scope now.

## Files
- Migration: create `floor_units`, add `floor_unit_id` on `tenants` and `property_expenses`.
- New hook `src/hooks/useFloorUnits.ts` (list by property, bulk upsert per floor, CRUD).
- Edit `AddPropertyDialog.tsx`, `AddTenantDialog.tsx`, `AddExpenseDialog.tsx`, `PropertyDetailSheet.tsx`.
- Extend `useTenants.ts` and `useExpenses.ts` types with `floor_unit_id` + joined `floor_unit`.

## Out of scope (say so if you want them next)
- Reassigning corp nos. across floors, deletion cascade UI, per-corp-no. billing address, dashboard-level filters by corp no.
