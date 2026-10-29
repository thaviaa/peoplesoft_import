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
  - Stray onBefore 100 with pasted coalesce code deleted (`e3ef5094…`)
- Update set reviewed: 7 records, all match the build guide.

## Cleanup report (dev, 2026-10-29)
3,134 PS copies (blank User ID): 41 matched to Entra user by email; 3,065 unmatched with no references (delete); 28 unmatched with references (review).
Unmatched reasons: 3,044 no email in PeopleSoft, 49 EMPLID not in import set.
Every copy had an auto-created `cmn_notif_device`; now treated as owned by the user and deleted with it.
Review of the 28: 6 share the EMPLID with an Entra user (now auto-matched); Demetrius Holmes, Chadwick Webster, Yolanda Brown confirmed and added to `MANUAL_MAP`; 19 are different people / no Entra account and are kept.
Follow-up: 3,044 PeopleSoft rows have no email, so the import can't match those people to Entra users. Needs PeopleSoft to send email or Entra to stamp employee ID.

Final report before execute (dev, 2026-10-29 10:29): 92 matched (merge), 3,023 unmatched no refs (delete), 19 unmatched with refs (keep), 0 conflicts.

Test batch executed (dev, 2026-10-29 10:34, MAX_USERS=25): 25 users deleted, 29 owned records deleted, references re-pointed (task.opened_by, asmt_assessment_instance.user). Includes merges for Tiffany Gates, Victoria Hafele, Kelsey Brooks, Stephanie Johnson.

Full cleanup executed (dev, 2026-10-29, finished 11:49 ET): 3,090 users deleted (88 merged into Entra users + 3,002 unreferenced), 606 references re-pointed, 3 employee IDs copied (manual pairs), 3,163 owned records deleted. 19 kept by design (different person / no Entra account).
Next in dev: confirm 19 remain, re-run confirm_root_cause.js, run the import again and validate_import_run.js.

## Open items
1. ~~Delete stray transform script `e3ef5094…`~~ — **done** (DELETE captured in update set, reviewed 2026-10-28).
2. **Data source connection failing in dev** (blocks testing):
   `ORA-12505, TNS:listener does not currently know of SID given in connect descriptor`.
   Data source has Oracle SID `psprd`, but the Connection URL uses `SERVICE_NAME=PSDB`; the MID Server appears to be connecting by SID. Check that the custom Connection URL is used / clear SID, and confirm with DBA whether `psprd` is registered on `pspr-scan`/`psdr-scan`. Unrelated to the transform changes.
3. Cleanup decided: **delete** PS-created blank-User-ID users using [`cleanup/remove_ps_blank_userid_users.js`](../cleanup/remove_ps_blank_userid_users.js) (report mode first). Optionally size first with [`diagnostics/pair_ps_entra_records.js`](../diagnostics/pair_ps_entra_records.js).
4. Remove `first_name` / `last_name` / `name` from Entra → ServiceNow provisioning mappings (outside this update set; needs Entra app owner).
5. Dev testing per [build-guide.md](build-guide.md) step 6, then cleanup (step 7) and promotion (step 8).
