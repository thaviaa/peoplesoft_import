# Setup: "Entra duplicate users" report in ServiceNow

Native reports can't filter on COUNT > 1, so the report uses a Script Include
exposed as a Dynamic Filter Option. Build in **dev, Global scope**, in an update set.

## 1. Script Include

System Definition → Script Includes → New

| Field | Value |
|---|---|
| Name | `DuplicateUserUtil` |
| Accessible from | All application scopes |
| Client callable (label may read **Sandbox enabled** on newer releases) | ✅ |
| Script | [`servicenow/DuplicateUserUtil.js`](../servicenow/DuplicateUserUtil.js) |

Quick check, open this list; it should show the duplicate users:
`sys_user_list.do?sysparm_query=sys_idINjavascript:new DuplicateUserUtil().getEntraDuplicateIds()^ORDERBYname`

## 2. Dynamic Filter Option

System Definition → Dynamic Filter Options → New

| Field | Value |
|---|---|
| Label | `Entra duplicate users` |
| Script | `new DuplicateUserUtil().getEntraDuplicateIds()` |
| Field type | Reference |
| Reference table | User [sys_user] |
| Available for filter | ✅ |
| Available for default | ☐ |
| Active | ✅ |

## 3. Report

Reports → Create new

| Setting | Value |
|---|---|
| Name | Entra duplicate users |
| Source type / Table | Table → User [sys_user] |
| Type | List |
| Condition | **Sys ID** · **is (dynamic)** · **Entra duplicate users** (or **is one of** · `javascript:new DuplicateUserUtil().getEntraDuplicateIds()`) |
| Group by | Name |
| Sort | Name, then Active (descending) |
| Columns | Name, User ID, Email, Employee ID, Active, Last login time, Created, Created by, Source |

Save, then **Share** with the Identity team group (Sharing → Groups and users).
Optional: Schedule → weekly email to the Identity team.

Optional count tile for a dashboard: same condition, Type = **Single Score**, name "Entra duplicate users (count)".

## 3b. Alternative: Platform Analytics Workspace (Visualization designer)

The designer treats **Sys ID** as a plain string field, so it offers neither **is (dynamic)** nor **is one of**.
Use a **predefined condition** (Report Source) that stores the script filter instead:

1. Run [`servicenow/create_report_source.js`](../servicenow/create_report_source.js) once in Scripts - Background
   (Global scope, update set selected). It creates Report Source **Entra duplicate users** on sys_user with filter
   `sys_idINjavascript:new DuplicateUserUtil().getEntraDuplicateIds()`.
2. Add data source → table **User [sys_user]**. Under **Predefined conditions**, select **Entra duplicate users**.
3. **Run**: the preview count should drop from all users (~14,000) to the duplicate set (a few hundred).
4. **Add this source** (or **Apply** when editing), pick a List visualization and the columns above
   (leave out Password, MFA, Web service access, Schedule), then **Save**. The visualization showed
   "No data available" until it was saved. Verified in dev 2026-10-29: 353 records.
5. Sort by **Employee Id**, then **Name**, so each person's records sit together.

If the conditions show **Sys ID in NULL** or the count is 0, the script returned nothing in the filter context:

1. Confirm the Script Include exists with the exact name `DuplicateUserUtil`, **Active**, Global scope,
   **Accessible from: All application scopes**, and **Sandbox enabled** checked (on some releases also
   **Client callable**). Filters only run Script Includes that are sandbox enabled.
2. Test in Scripts - Background: `gs.info(new DuplicateUserUtil().getEntraDuplicateIds().split(',').length);`
   It should print a few hundred.
3. Re-select the predefined condition and **Run**.

## Notes

- The filter is calculated when the report runs, so it updates as duplicates are fixed.
- Records are grouped by Name. Pairs that share an Employee ID or email but have different names
  (e.g. `Adam.Odza@` / `Abduraman.Odza@`) appear under separate Name groups; sort by Employee ID to see them together.
- For the suggested KEEP/RETIRE per record, use [`diagnostics/entra_duplicate_report.js`](../diagnostics/entra_duplicate_report.js).
