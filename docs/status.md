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

Post-cleanup confirm_root_cause.js (dev, 11:52 ET): Employee IDs on 2+ users 137 (was 224); blank User ID 19 (was 3,134); active users with no Employee ID 845 (was 848).
Remaining 137 duplicate employee IDs are between users that both have a User ID (Entra-side duplicates, e.g. Nicole.Johnson@ / Nicole.Johnson2@ both EMPLID 128160). Separate cleanup; the coalesce already prefers the active record.

validate_import_run.js on ISET0056262 (import run 09:24 ET, before cleanup): inserted 0, error 0, updated 98, ignored 2,083 (unchanged rows), 72 skipped by update-only guard, no new users, no User ID/Email changes. Spot check EMPLID 108673 = Scott Newell, one record, preferred name and location correct. Import still to be re-run after cleanup.

bucket_duplicates.js after cleanup (dev, 12:15 ET), duplicate names: sameEmpId 97, sameEmail 30, psEntraSplit 7, likelyDifferent 267.
- sameEmpId + sameEmail (127 names): same person with two records that both have a User ID (Entra-side duplicates: UPN change, rehire). Out of scope for 269768; owned by the Identity team. Handoff: [entra-duplicates-handoff.md](entra-duplicates-handoff.md), list from `diagnostics/entra_duplicate_report.js`.
- psEntraSplit: Diana Carter, Donald Smith, Emily Cook, Leslie Johnson are among the 19 kept (different people). Kathy Pond, Marvin Stroud, Tommy Simmons have a blank-User-ID record with no Employee ID, from another source; check sys_created_by.
- likelyDifferent (267): no shared identifiers; leave.

QA test plan for the Test environment (17 test cases): https://claude.ai/artifact/AHqZxcj6HDbwredC2jDBWg

## Open items
1. ~~Delete stray transform script `e3ef5094…`~~ — **done** (DELETE captured in update set, reviewed 2026-10-28).
2. **Data source connection failing in dev** (blocks testing):
   `ORA-12505, TNS:listener does not currently know of SID given in connect descriptor`.
   Data source has Oracle SID `psprd`, but the Connection URL uses `SERVICE_NAME=PSDB`; the MID Server appears to be connecting by SID. Check that the custom Connection URL is used / clear SID, and confirm with DBA whether `psprd` is registered on `pspr-scan`/`psdr-scan`. Unrelated to the transform changes.
3. Cleanup decided: **delete** PS-created blank-User-ID users using [`cleanup/remove_ps_blank_userid_users.js`](../cleanup/remove_ps_blank_userid_users.js) (report mode first). Optionally size first with [`diagnostics/pair_ps_entra_records.js`](../diagnostics/pair_ps_entra_records.js).
4. Remove `first_name` / `last_name` / `name` from Entra → ServiceNow provisioning mappings (outside this update set; needs Entra app owner).
5. Dev testing per [build-guide.md](build-guide.md) step 6, then cleanup (step 7) and promotion (step 8).
