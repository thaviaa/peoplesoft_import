# Status / Handoff — ADO 269768

_Last updated: 2026-10-28_

## Done
- Root cause confirmed: AND-coalesce on `u_emplid` + `u_emailid` ([root-cause-analysis.md](root-cause-analysis.md)).
- Dev baseline: 224 dup employee IDs, 3,134 PS users with blank User ID, 848 active users with no employee ID.
- Design agreed: Entra owns User ID + Email and creates users; PeopleSoft is update-only and owns names (preferred first), employee ID, location, building, department, business unit.
- Update set **MECK - AT - 269768 - Duplicate sys_user records created by PeopleSoft user import** (meckncdev, scope `x_meug_peoplesof_0`) contains:
  - sys_id scripted coalesce field map `f34f5810c3185f1457c46625990131bb`
  - `u_emplid → u_employee_id` coalesce off (`b26fbdab…`)
  - `u_emailid → user_name` field map deleted (`cd920dbe…`)
  - Name source script (`07e24dfe…`)
  - onBefore 90 update-only (`4103ecd8…`)
  - Old onBefore 100 deactivated (`4e2c5070…`)

## Open items
1. **Delete stray transform script** `e3ef5094c3185f1457c466259901318b` (onBefore 100, active) — contains the coalesce code pasted as a transform script by mistake.
2. **Data source connection failing in dev** (blocks testing):
   `ORA-12505, TNS:listener does not currently know of SID given in connect descriptor`.
   Data source has Oracle SID `psprd`, but the Connection URL uses `SERVICE_NAME=PSDB`; the MID Server appears to be connecting by SID. Check that the custom Connection URL is used / clear SID, and confirm with DBA whether `psprd` is registered on `pspr-scan`/`psdr-scan`. Unrelated to the transform changes.
3. Run [`diagnostics/pair_ps_entra_records.js`](../diagnostics/pair_ps_entra_records.js) to size the merge of existing PS/Entra duplicate pairs; then write the merge script for the `paired` bucket.
4. Remove `first_name` / `last_name` / `name` from Entra → ServiceNow provisioning mappings (outside this update set; needs Entra app owner).
5. Dev testing per [build-guide.md](build-guide.md) step 6, then cleanup (step 7) and promotion (step 8).
