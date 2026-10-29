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

The designer treats **Sys ID** as a string field, so it does not offer **is (dynamic)**. Use a script value instead:

1. Add data source → table **User [sys_user]**.
2. In **Filters → Conditions**: Field **Sys ID** · Operator **is one of** (top of the operator list) ·
   Value `javascript:new DuplicateUserUtil().getEntraDuplicateIds()`
3. **Run**: the preview count should drop from all users (~14,000) to the duplicate set (a few hundred).
4. Optional: **Save as predefined condition** so other visualizations can reuse it.
5. **Add this source**, then pick a List visualization and the columns above.

If the count doesn't drop, confirm the Script Include is **Client callable / Sandbox enabled** and
**Accessible from: All application scopes**. If the designer still won't evaluate it, use the classic report (step 3),
which accepts the same `javascript:` value with **is one of**.

## Notes

- The filter is calculated when the report runs, so it updates as duplicates are fixed.
- Records are grouped by Name. Pairs that share an Employee ID or email but have different names
  (e.g. `Adam.Odza@` / `Abduraman.Odza@`) appear under separate Name groups; sort by Employee ID to see them together.
- For the suggested KEEP/RETIRE per record, use [`diagnostics/entra_duplicate_report.js`](../diagnostics/entra_duplicate_report.js).
