# Defect: Duplicate sys_user records from PeopleSoft import

**Status:** Root cause identified — fix proposed, not yet applied
**Instance:** meckncdev
**Reported:** 2026-10-28 (end-user report: account under investigation has 2 user records)

## Symptoms

- Several hundred names in `sys_user` have 2+ records (GlideAggregate on `name`, `HAVING COUNT > 1`).
- A set of users imported from PeopleSoft have an **empty User ID** (`user_name`).
- Some same-name pairs have different, populated User IDs.
- Some same-name pairs are genuinely different people (not a defect).

## Root cause

The **Peoplesoft Employee import** transform map (→ `sys_user`, order 300) has two coalesce fields:

```
[COALESCE] u_emplid  -> u_employee_id
[COALESCE] u_emailid -> user_name
```

Multiple coalesce fields are **ANDed** — a row updates an existing user only if **both** match. Otherwise it inserts.

| Scenario | Coalesce query | Result |
|---|---|---|
| PeopleSoft email blank | `u_employee_id = X AND user_name = ''` | No match → new user with **blank User ID** |
| Email later populated | `u_employee_id = X AND user_name = 'jdoe@…'` | Old record has blank user_name → **second user** |
| User already created by Entra ID | Entra user has user_name but no `u_employee_id` | No match → PeopleSoft **inserts its own copy** |

The onBefore script (order 100) appears intended as an "employee ID, else email" fallback, but onBefore runs **after** coalesce has decided insert vs. update, so it cannot change the match. It only sets `location`, which the field map already does.

Header settings: `create_new_record_on_empty_coalesce_fields = false`, `run_business_rules = true`, `run_script = false`. Last modified 2024-09-13.

## Baseline (meckncdev, 2026-10-28)

From [`diagnostics/confirm_root_cause.js`](../diagnostics/confirm_root_cause.js):

| Metric | Count | Meaning |
|---|---|---|
| Employee IDs on 2+ users | **224** | Same EMPLID re-inserted when email didn't match (AND-coalesce) |
| Users with Employee ID but blank User ID | **3,134** | PeopleSoft-created records; many likely duplicate an Entra user |
| Active users with User ID but no Employee ID | **848** | Entra-created users PeopleSoft never matched (includes service/contractor accounts) |

**Important:** the new coalesce matches on employee ID first, so existing pairs will keep updating the PeopleSoft copy (blank User ID), not the Entra user. The fix stops *new* duplicates; existing pairs must be merged in cleanup by moving `u_employee_id` onto the Entra user and deactivating the PeopleSoft copy. Size this with [`diagnostics/pair_ps_entra_records.js`](../diagnostics/pair_ps_entra_records.js).

## Fix

1. Remove **Coalesce** from `u_emplid → u_employee_id` and `u_emailid → user_name` (keep them as normal field maps).
2. Add a scripted field map → `sys_id`, **Coalesce = true**, using [`transform/sys_id_coalesce.js`](../transform/sys_id_coalesce.js). Matches on employee ID, falls back to email (`user_name` or `email`), else inserts.
3. Deactivate the onBefore at order 100 (no effect).
4. Add [`transform/onBefore_update_only.js`](../transform/onBefore_update_only.js) (onBefore, order 90): the import is **update-only**. PeopleSoft is the source of truth for employee location, not identity; Entra creates users. Unmatched rows are skipped, which removes the duplicate path entirely.
5. **Delete the `u_emailid → user_name` field map.** Entra ID is the source of truth for User ID and Email, so PeopleSoft must not write either. PeopleSoft's email is still used as a *matching key* in the coalesce script (read from the source row, never written). Otherwise, once PeopleSoft starts updating Entra-created users, it would overwrite the Entra login (e.g. `jane.doe@` → `jdoe@`) and break SSO matching.

## Validation

- Run [`diagnostics/confirm_root_cause.js`](../diagnostics/confirm_root_cause.js) before the fix to quantify affected users.
- In dev, apply the fix, run **Test Load 20 Records** then **Load All Records**, and confirm no new `sys_user` inserts for existing people (check the import set row `sys_import_state` = updated vs. inserted).
- Re-run `confirm_root_cause.js`; counts should not grow.

## Cleanup (after fix is in place)

1. Bucket duplicates with [`diagnostics/bucket_duplicates.js`](../diagnostics/bucket_duplicates.js).
2. For each confirmed duplicate, pick the surviving record (active, Entra-linked, has User ID).
3. Re-point references on the retiring record: tasks (`assigned_to`, `opened_by`, `caller_id`), assets (`alm_asset.assigned_to`), group memberships (`sys_user_grmember`), roles (`sys_user_has_role`), approvals.
4. Copy `u_employee_id` to the surviving record, then **deactivate** (don't delete) the retiring one.
5. Sign-off before running cleanup in production.

## Acceptance criteria

- [ ] Coalesce logic updated and verified in dev — re-running the import creates no duplicates
- [ ] Duplicates bucketed and reviewed
- [ ] Cleanup plan approved and executed
- [ ] Promoted to production
