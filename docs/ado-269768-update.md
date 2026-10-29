# ADO 269768 update (2026-10-29)

## Root cause (confirmed)
Transform map **Peoplesoft Employee import** coalesced on `u_emplid` AND `u_emailid`. Rows with a blank or changed
email, and Entra-created users without an Employee ID, failed to match and were inserted as new sys_user records
(3,134 with a blank User ID). The onBefore "fallback" script ran after coalesce, so it had no effect.

## Fix (dev, update set "MECK - AT - 269768 - Duplicate sys_user records created by PeopleSoft user import")
- Replaced the AND coalesce with a scripted sys_id coalesce: match on Employee ID, then email (User ID or Email).
- Import is now update-only (onBefore order 90 skips inserts). Entra creates users; PeopleSoft enriches them.
- Removed the `u_emailid → user_name` map. Entra owns User ID and Email.
- Name is built from preferred first name + last name (NAME_DISPLAY included the quoted nickname).
- Deactivated the old onBefore (order 100) and deleted a stray duplicate script.

## Cleanup (dev, completed 10/29)
- Removed 3,090 PeopleSoft-created users with a blank User ID:
  - 88 merged into their Entra user: 606 references moved (tickets, requests, assets, software installs) and Employee ID copied
  - 3,002 empty records deleted (no login, no email, nothing referencing them)
- Kept 19 by design: a different person from the same-name user, or no Entra account, with ticket history.
- XML backup exported before deleting.

## Validation (dev)
| Metric | Before | After |
|---|---|---|
| Users with Employee ID but blank User ID | 3,134 | 19 |
| Employee IDs on 2+ users | 224 | 137 |
| Import rows inserted / errors | | 0 / 0 |

No User ID or email changes made by the import. Spot check EMPLID 108673 (Scott Newell): one record, preferred name and location correct.

## Next steps
1. Reprocess the import set (or run a fresh load) after cleanup; confirm 0 inserts and blank User ID stays at 19.
2. Promote to prod: the 269768 transform update set and "269768 - Duplicate Report" (Script Include DuplicateUserUtil, Report Source, report).
3. Prod cleanup: XML backup, run in report mode, review, rebuild MANUAL_MAP with prod sys_ids, test batch, then full run.
4. Identity team dependencies:
   - Resolve the remaining 137 Entra-side duplicate Employee IDs (353 records) using the "Entra duplicate users" report. Track as a separate item.
   - Optional: send employeeId to `u_employee_id` (about 3,000 PeopleSoft rows have no email, so they can't be matched today).

Docs and scripts: https://github.com/thaviaa/peoplesoft_import (docs/status.md, docs/build-guide.md)
