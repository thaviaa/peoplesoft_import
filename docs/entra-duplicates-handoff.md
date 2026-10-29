# Handoff: Entra-side duplicate users (for the Identity team)

**Owner:** Identity team (Entra ID). ServiceNow team supports the ServiceNow-side cleanup.
**Related:** ADO 269768 (PeopleSoft import duplicates, fixed). This is a separate follow-up.

## What this is

After the PeopleSoft cleanup, the remaining same-person duplicates in ServiceNow are pairs (or more) of
user records that **both have a User ID**, i.e. both came from Entra provisioning. In dev on 2026-10-29:

- 97 names share an Employee ID across 2+ records
- 30 names share an email across 2+ records

Typical causes: UPN change (e.g. `Adam.Odza@` and `Abduraman.Odza@`), rehire, or a second account
(`Nicole.Johnson@` / `Nicole.Johnson2@`).

The PeopleSoft import no longer creates duplicates and, when several users share an Employee ID,
updates the active one. These records are not harmful to the import but confuse reporting,
assignment and lookups.

## The list

Run [`diagnostics/entra_duplicate_report.js`](../diagnostics/entra_duplicate_report.js) (read-only, Global scope).
Copy everything after the `CSV` line into a spreadsheet. Columns:

`group, name, user_name, email, active, employee_id, last_login, created, created_by, source, sys_id, suggested`

`suggested` is a starting point only: **KEEP** = active, then most recent login, then newest; others **RETIRE**.

For an always-current list in ServiceNow, see [entra-duplicate-report-setup.md](entra-duplicate-report-setup.md).

## Decisions needed from the Identity team, per group

1. Which Entra object is current for the person (the one ServiceNow should keep).
2. Whether the other Entra object still exists / is still in the provisioning scope.
   - If it is still provisioned, fix it in Entra first, otherwise provisioning will keep updating or recreating it.
3. Whether the retiring ServiceNow record should be deprovisioned by Entra (preferred) or deactivated by the ServiceNow team.

## Other asks for the Identity team

1. **Optional: send Employee ID.** About 3,000 PeopleSoft rows have no email, so the import can't match those
   people to their Entra user. If Entra provisioning writes `employeeId` to ServiceNow `u_employee_id`, the
   import matches on it directly.

## ServiceNow side (after Identity confirms)

- Re-point tickets, assets, groups and approvals from RETIRE to KEEP (same approach as
  [`cleanup/remove_ps_blank_userid_users.js`](../cleanup/remove_ps_blank_userid_users.js)).
- **Deactivate, do not delete**, the RETIRE record, since Entra may still reference it.
- Clear `u_employee_id` on the RETIRE record so the PeopleSoft import only ever matches KEEP.
