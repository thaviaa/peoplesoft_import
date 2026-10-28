# Build Guide — Fix duplicate users from PeopleSoft Employee import

Step-by-step changes to the **Peoplesoft Employee import** transform map in **meckncdev**.
Background and root cause: [root-cause-analysis.md](root-cause-analysis.md).

## 0. Prerequisites

1. Switch **Application scope** to **PeopleSoft Integration** (the map lives in `x_meug_peoplesof_0`).
2. Create and select an update set in that scope, e.g. `PeopleSoft - Fix user coalesce (DEF/ADO #)`.
3. Run [`diagnostics/confirm_root_cause.js`](../diagnostics/confirm_root_cause.js) in **Scripts - Background** and record the three counts as the baseline.
4. Export the current map as XML (header + field maps + scripts) as a rollback copy.

## 1. Open the transform map

`System Import Sets > Administration > Transform Maps` → **Peoplesoft Employee import**
(direct: `sys_transform_map.do?sys_id=b54eb56bc3105e9057c46625990131db`)

## 2. Remove the existing coalesce flags

In the **Field Maps** related list:

| Field map | Change |
|---|---|
| `u_emplid → u_employee_id` | Coalesce = **false** |
| `u_emailid → user_name` | Coalesce = **false** (see step 5 for target) |

Keep both field maps; they still copy values.

## 3. Add the scripted sys_id coalesce

Field Maps → **New**:

| Field | Value |
|---|---|
| Source table | `x_meug_peoplesof_0_peoplesoft_import` |
| Target field | **Sys ID** (`sys_id`) |
| Coalesce | **true** |
| Use source script | **true** |
| Source script | contents of [`transform/sys_id_coalesce.js`](../transform/sys_id_coalesce.js) |

Save. This should now be the **only** field map with Coalesce checked.

## 4. Transform scripts

In the **Transform Scripts** related list:

1. **onBefore, order 100** (emplid/email lookup, sys_id `4e2c5070c3b01a1057c46625990131af`) → **Active = false**. It runs after matching and has no effect.
   Direct: `sys_transform_script.do?sys_id=4e2c5070c3b01a1057c46625990131af`
2. **New** transform script:
   - When: **onBefore**
   - Order: **90**
   - Active: true
   - Script: [`transform/onBefore_update_only.js`](../transform/onBefore_update_only.js)
   - Effect: rows that match no existing user are **skipped**, never inserted. PeopleSoft only updates users Entra created.
3. Leave **order 110** (location) and **order 120** (department) as-is.

## 5. Remove the email field map

**Entra ID is the source of truth for User ID and Email.** PeopleSoft must not write either field.

After this fix, PeopleSoft will start **updating** users that Entra created. The existing map `u_emailid → user_name` would overwrite their User ID, the value Entra uses for SSO. Example: Entra created Jane as `jane.doe@mecknc.gov`; PeopleSoft has `jdoe@mecknc.gov`. The import would change her User ID to `jdoe@…`, SSO would stop matching, and Entra may create another record.

**Change:** delete (or, if you want a rollback path, note the sys_id then delete) the field map `u_emailid → user_name`. Do **not** add a `u_emailid → email` map either.

PeopleSoft's email is still used, but only as a **matching key**: [`sys_id_coalesce.js`](../transform/sys_id_coalesce.js) reads `source.u_emailid` to find the Entra user by `user_name` or `email`. It never writes it.

Because the import is update-only (step 4), PeopleSoft no longer creates users with a blank User ID. Someone in PeopleSoft without an Entra account is skipped until Entra provisions them; the next import run then matches them by email and sets their location and employee ID.

## 6. Test in dev

1. Pick 3–5 known duplicate people (from [`bucket_duplicates.js`](../diagnostics/bucket_duplicates.js) `sameEmpId` / `psEntraSplit`) and note their sys_ids.
2. Data Source **Peoplesoft import** → **Test Load 20 Records**, then run the transform.
3. Check the import set rows (`x_meug_peoplesof_0_peoplesoft_import_list`): `sys_import_state` should be **updated** for existing people, not **inserted**.
4. Run **Load All Records** and transform.
5. Re-run `confirm_root_cause.js`. Counts must not increase vs. the baseline.
6. Verify no new users: `sys_user_list.do?sysparm_query=sys_created_onONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()^sys_created_by=<import user>`
7. Spot-check that the test users' location, department, business unit, and name updated correctly on the **surviving** record.

## 7. Clean up existing duplicates

Do **after** the fix is verified, so the next import doesn't recreate them. See the cleanup steps in [root-cause-analysis.md](root-cause-analysis.md#cleanup-after-fix-is-in-place). Deactivate, don't delete.

## 8. Promote

1. Mark the update set **Complete**; move to test/prod per normal change process.
2. In prod, run `confirm_root_cause.js` before and after the first scheduled import.
3. Attach before/after counts to the ADO defect.

## Rollback

Re-import the XML exported in step 0.4, or back out the update set. Re-enabling the original two coalesce fields restores prior behavior (including the defect).
