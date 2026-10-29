# QA Test Plan – ADO 269768 PeopleSoft Duplicate Users

Oct 29, 2026 · Apichai Thavichith · Environment: **Test**

## Overview

QA confirms in Test that the PeopleSoft employee import no longer creates duplicate users, that existing PeopleSoft duplicates can be cleaned up safely, and that the Entra duplicate report works.

**What changed (ADO 269768)**

- The Peoplesoft Employee import used to coalesce on Employee ID AND email. Rows that didn't match both were inserted as new users, many with a blank User ID.
- It now matches on Employee ID first, then email (User ID or Email), and never inserts. Entra creates users; PeopleSoft only updates them.
- PeopleSoft no longer writes User ID. Name is built from preferred first name + last name.
- A one-time cleanup script merges or deletes the PeopleSoft-created users with a blank User ID.
- A new report lists people with more than one Entra-provisioned account.

**Out of scope:** fixing the Entra-side duplicates themselves (owned by the Identity team, tracked separately). QA only confirms the report shows them.

## Prerequisites

QA has the admin role. Run every script in **Scripts - Background** with scope set to **Global** (scripts using `addActiveQuery` or `sys_audit` fail in the PeopleSoft Integration scope).

**Update sets to commit in Test, in this order**

1. `MECK - AT - 269768 - Duplicate sys_user records created by PeopleSoft user import` (PeopleSoft Integration scope): transform map changes.
2. `MECK - AT - 269768 - Duplicate Report` (Global): Script Include `DuplicateUserUtil`, Report Source, Entra duplicate users report.

**Before testing**

- [ ] Data source **Peoplesoft import** connects in Test: run **Test Load 20 Records**. (Data source settings are not in the update sets. An ORA-12505 error means the SID / Connection URL needs fixing first.)
- [ ] Scheduled PeopleSoft import is paused during testing, so runs happen only when QA starts them.
- [ ] XML backup taken of `sys_user_list.do?sysparm_query=user_nameISEMPTY^u_employee_idISNOTEMPTY` (list menu → Export → XML).

**Scripts** (open the file, then **Raw**, and copy):

| Script | Used in |
| --- | --- |
| [`diagnostics/confirm_root_cause.js`](../diagnostics/confirm_root_cause.js) | Baseline, TC-14, TC-15 |
| [`diagnostics/validate_import_run.js`](../diagnostics/validate_import_run.js) | TC-05 to TC-09, TC-15 |
| [`cleanup/remove_ps_blank_userid_users.js`](../cleanup/remove_ps_blank_userid_users.js) | TC-10 to TC-14 |
| [`diagnostics/bucket_duplicates.js`](../diagnostics/bucket_duplicates.js) | Baseline (optional) |

## Baseline (before committing the update sets)

Record these counts in Test first; later test cases compare against them. Dev numbers are shown for reference only, Test will differ.

Run `confirm_root_cause.js` and fill in:

| Metric | Dev (before fix) | Test baseline | Test after cleanup |
| --- | --- | --- | --- |
| Employee IDs on 2+ users | 224 | | |
| Users with Employee ID but blank User ID | 3,134 | | |
| Active users with User ID but no Employee ID | 848 | | |

Also note 3–5 Employee IDs from `sys_user` that have two records (one with a blank User ID). Use them as spot-check users in TC-13.

## Configuration checks

### TC-01 Update sets commit cleanly

1. Retrieve both update sets, then **Preview** each one.
2. Commit them in the order listed under Prerequisites.

Expected: no preview errors or collisions; both show **Committed**.

- [ ] Pass

### TC-02 Employee transform field maps

1. Open System Import Sets → Transform Maps → **Peoplesoft Employee import** (target `sys_user`).
2. Review the **Field Maps** related list.

Expected:

- Exactly **one** field map has Coalesce checked: `[Script] → sys_id`, with Use source script checked.
- `u_emplid → u_employee_id` exists with Coalesce **unchecked**.
- There is **no** field map from `u_emailid` (no `u_emailid → user_name`, no `u_emailid → email`).
- `[Script] → name` uses a source script (preferred first name + last name). `[Script] → first_name` still prefers `u_pref_first_name`.

- [ ] Pass

### TC-03 Employee transform scripts

1. On the same map, review the **Transform Scripts** related list.

Expected:

| Order | When | Active | Purpose |
| --- | --- | --- | --- |
| 90 | onBefore | true | Update-only: skips any row that would insert |
| 100 | onBefore | **false** | Old Employee ID / email lookup (sys_id `4e2c5070c3b01a1057c46625990131af`) |
| 110 | onBefore | true | Location |
| 120 | onBefore | true | Department from agency |

No other onBefore at order 100 exists (a stray copy, sys_id `e3ef5094c3185f1457c466259901318b`, was deleted).

- [ ] Pass

## Import behaviour

### TC-04 Load and pick test users

1. Data source **Peoplesoft import** → **Load All Records**. Do **not** run the transform yet.
2. Run this in Scripts - Background (Global) to list up to 5 Entra users that should match by email (no user has their Employee ID yet, but a user has their PeopleSoft email):

```javascript
var t = 'x_meug_peoplesof_0_peoplesoft_import';
var set = new GlideRecord('sys_import_set');
set.addQuery('table_name', t); set.orderByDesc('sys_created_on'); set.setLimit(1); set.query(); set.next();
var row = new GlideRecord(t);
row.addQuery('sys_import_set', set.getUniqueValue());
row.addNotNullQuery('u_emailid');
row.query();
var n = 0;
while (n < 5 && row.next()) {
    var e = new GlideRecord('sys_user'); e.addQuery('u_employee_id', row.getValue('u_emplid')); e.setLimit(1); e.query();
    if (e.hasNext()) continue;
    var u = new GlideRecord('sys_user');
    u.addQuery('user_name', row.getValue('u_emailid')).addOrCondition('email', row.getValue('u_emailid'));
    u.addNotNullQuery('user_name'); u.setLimit(1); u.query();
    if (u.next()) { gs.info(row.getValue('u_emplid') + ' -> ' + u.getValue('user_name') + ' (' + u.getUniqueValue() + ')'); n++; }
}
gs.info('Import set ' + set.getValue('number') + ', email-match candidates: ' + n);
```

3. Record the import set number and the candidates (EMPLID → User ID). Zero candidates is acceptable; TC-08 is then N/A.
4. Run the transform (all three Peoplesoft maps).

- [ ] Done

### TC-05 No users inserted, no errors

1. Run `validate_import_run.js` (Global).
2. Open the import set → **Transform Histories** → the Peoplesoft Employee import run.

Expected: section 1 shows **inserted = 0** and **error = 0**; Transform History shows **Inserts = 0, Errors = 0**; section 3 lists no users created by the import.

- [ ] Pass

### TC-06 User ID and Email not changed by the import

Expected: `validate_import_run.js` section 4 shows **none** (no `user_name` or `email` changes since the import started).

- [ ] Pass

### TC-07 Preferred name

1. Find a row in the import set where **PREF_FIRST_NAME** differs from **FIRST_NAME** (example from dev: EMPLID 108673, Michael "Scott" Newell).
2. Open the matching user (`sys_user`, Employee ID = that EMPLID).

Expected: First name = PREF_FIRST_NAME; Name = preferred first + last (`Scott Newell`, not `Michael "Scott" Newell`); Location = DESCR.

- [ ] Pass

### TC-08 Email fallback match

1. Open each TC-04 candidate user.

Expected: Employee ID now equals the EMPLID; Location / Department / Business unit populated from PeopleSoft; User ID and Email unchanged; still only one user with that Employee ID.

- [ ] Pass
- [ ] N/A (no candidates)

### TC-09 Unmatched rows are skipped, not inserted

1. In the import set rows, filter **Comment** starts with `Skipped: no matching`.
2. Pick 3 rows and search `sys_user` for their EMPLID.

Expected: the rows are in state **ignored**; no user was created for those EMPLIDs by this run.

- [ ] Pass

## Cleanup of PeopleSoft blank-User-ID users

The cleanup script only touches users with a **blank User ID and an Employee ID**. Matched copies are merged into the Entra user (references moved, Employee ID copied, copy deleted). Unmatched copies with nothing referencing them are deleted. Unmatched copies with references are kept and listed for review.

### TC-10 Report mode

1. Copy `cleanup/remove_ps_blank_userid_users.js` into Scripts - Background (Global).
2. Set `MODE = 'report'` and **empty `MANUAL_MAP`** to `{}`. The entries in the repo are dev pairs, so don't reuse them.
3. Run. It can take several minutes.

Expected: `MODE = report (no changes made)`; matched + conflict + unmatched (no refs) + unmatched (has refs) = total PS copies, and total = the baseline "blank User ID" count.

| Bucket | Test count |
| --- | --- |
| PS copies (total) | |
| Matched to Entra user | |
| Conflict | |
| Unmatched, no references (delete) | |
| Unmatched, has references (keep) | |

- [ ] Pass

### TC-11 Review list

1. Read the **Review list** at the end of the TC-10 output.
2. Send any entry with exactly one candidate and **no** "different EMPLID" flag to the ServiceNow team to confirm as the same person.
3. Add confirmed pairs to `MANUAL_MAP` (`'PS copy sys_id': 'Entra user sys_id'`) and rerun report mode.

Expected: confirmed pairs move to **Matched**; the rest stay in "has references" and are kept.

- [ ] Pass

### TC-12 Test batch

1. Confirm the XML backup from Prerequisites exists.
2. Set `MODE = 'execute'` and `MAX_USERS = 25`. Run.

Expected: an `Executed:` line shows refs re-pointed, owned records deleted, and **users deleted** ≤ 25; no script errors.

- [ ] Pass

### TC-13 Spot-check a merge

1. Take a user from **Sample matched** in the TC-12 output (or a baseline spot-check user).
2. Open `sys_user.do?sys_id=<PS copy sys_id>`.
3. Open the Entra user (the sys_id after the arrow).

Expected: the PS copy shows **Record not found**; the Entra user has the Employee ID; tickets, requests or assets that pointed at the copy now point at the Entra user; searching the Employee ID in `sys_user` returns one user.

- [ ] Pass

### TC-14 Full run

1. Set `MAX_USERS = 0`, keep `MODE = 'execute'`.
2. Run as a **Fix Script** → Run Fix Script → **Proceed in Background** (about 1–2 hours for ~3,000 users).
3. Read the summary in System Logs → Script Log Statements (Message contains `PS copies`).
4. Run `confirm_root_cause.js` and fill the "Test after cleanup" column of the Baseline table.

Expected: users deleted = matched + unmatched (no refs) from TC-10, less the TC-12 batch; "blank User ID" now equals the TC-10 "has references" count; "Employee IDs on 2+ users" is lower than the baseline.

- [ ] Pass

## Re-import and regression

### TC-15 Deleted users are not recreated

1. Run a fresh import: **Load All Records**, then transform (or **Reprocess** the TC-04 import set).
2. Run `validate_import_run.js`, then `confirm_root_cause.js`.

Expected:

- Inserted = 0, error = 0; no users created; no User ID / Email changes.
- "Skipped by update-only guard" is much higher than in TC-05, because rows that used to update a deleted copy are now skipped.
- "Blank User ID" is unchanged from TC-14.
- The TC-13 merged user still has the same Employee ID and is the only user with it.

- [ ] Pass

### TC-16 Location, Business Unit and Department still update

1. On the import set, open **Transform Histories** for the **Peoplesoft Location Import** and **Peoplesoft Business Unit** runs.
2. Pick 3 matched users from TC-05 / TC-07 and compare against their import set row.

Expected: both maps completed with **Errors = 0**; for each user, Location = DESCR, Business unit = DEPTID and Department matches AGENCY (`cmn_department.id`).

- [ ] Pass

## Entra duplicate users report

### TC-17 Report shows the same set as the Script Include

1. Open Script Include **DuplicateUserUtil**: Active, Global, Accessible from **All application scopes**, **Sandbox enabled** (or Client callable) checked.
2. In Scripts - Background (Global), run: `gs.info(new DuplicateUserUtil().getEntraDuplicateIds().split(',').length);` and note the number.
3. Open `sys_user_list.do?sysparm_query=sys_idINjavascript:new DuplicateUserUtil().getEntraDuplicateIds()`.
4. Open the **Entra duplicate users** visualization in Platform Analytics (or add data source User → Predefined conditions → **Entra duplicate users** → Run).

Expected: steps 2, 3 and 4 show the **same count**; every row has a User ID; rows are people with 2+ accounts sharing an Employee ID or email. If the visualization didn't migrate with the update set, the Report Source and list still pass; rebuild the visualization from [`docs/entra-duplicate-report-setup.md`](entra-duplicate-report-setup.md).

- [ ] Pass

## Exit criteria, rollback and sign-off

**Ready for prod** when TC-01 to TC-17 pass (TC-08 may be N/A), with no import inserts or errors in TC-05 and TC-15 and no identity changes in TC-06.

**Fail any of these → stop and contact the ServiceNow team:**

- Any user inserted by the import (TC-05, TC-15)
- Any User ID or Email changed by the import (TC-06)
- A merged user losing tickets, assets or group memberships (TC-13)
- "Blank User ID" count rising after TC-14

**Rollback**

- Configuration: back out the two update sets (Employee transform returns to its previous behaviour, including the defect).
- Deleted users: restore from **System Definition → Deleted Records**, or import the XML backup from Prerequisites.

**Sign-off**

| Role | Name | Date | Result |
| --- | --- | --- | --- |
| QA | | | |
| ServiceNow developer | Apichai Thavichith | | |
