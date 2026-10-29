# PeopleSoft → ServiceNow User Import

Scoped app **PeopleSoft Integration** (`x_meug_peoplesof_0`) on Mecklenburg County ServiceNow (`meckncdev` → prod).

Pulls employee, location and business unit data from PeopleSoft into ServiceNow.

**Design intent:** PeopleSoft is the source of truth for **employee location**. Entra ID is the source of truth for **user identity** (User ID, Email) and creates all users. The employee import is **update-only**: it matches existing users and enriches them; it never creates users.

### Field ownership (one writer per field)

| Field | Owner |
|---|---|
| User ID (`user_name`), Email | Entra ID |
| First name (preferred), Last name, Name | PeopleSoft |
| Employee ID, Location, Building, Department, Business unit | PeopleSoft |

PeopleSoft owns names because it carries the preferred first name (`u_pref_first_name`); Entra has no preferred-name attribute. The PeopleSoft import sets First name, Last name and Name.

## Data source

| Setting | Value |
|---|---|
| Name | Peoplesoft import |
| Type | JDBC (Oracle) |
| Source view | `PS_MKSERVICENOW_VW` |
| Import set table | `x_meug_peoplesof_0_peoplesoft_import` |
| Batch import | Yes (1,000) |
| Use last run datetime | No — full load each run |

## Transform maps

| Order | Map | Target | Coalesce |
|---|---|---|---|
| 100 | Peoplesoft Location Import | `cmn_location` | `u_descr → full_name` AND `u_address1 → street` |
| 200 | Peoplesoft Business Unit | `business_unit` | `u_deptid → name` |
| 300 | Peoplesoft Employee import | `sys_user` | **see [docs/root-cause-analysis.md](docs/root-cause-analysis.md)** |

## Repo layout

```
docs/
  status.md                  Current status, open items, handoff
  ado-269768-update.md       Progress update posted to ADO 269768
  qa-test-plan.md            QA test plan for the Test environment (TC-01 to TC-17)
  build-guide.md             Step-by-step fix for the Employee transform map
  root-cause-analysis.md     Duplicate sys_user defect — cause, fix, cleanup plan
  current-config.md          Employee transform map as configured today
  entra-duplicates-handoff.md  Follow-up for the Identity team: Entra-side duplicate users
  entra-duplicate-report-setup.md  How to build the "Entra duplicate users" ServiceNow report
transform/
  sys_id_coalesce.js         Proposed scripted coalesce (emplid → email fallback)
  onBefore_update_only.js    Proposed onBefore: never insert users (Entra owns identities)
  name_source_script.js      Proposed Name map: preferred first + last
servicenow/
  DuplicateUserUtil.js       Script Include behind the Entra duplicate report filter
  create_report_source.js    Creates the "Entra duplicate users" predefined condition (Report Source)
cleanup/
  remove_ps_blank_userid_users.js  Re-point refs to Entra user, then delete PS blank-User-ID copies
diagnostics/                 Background scripts (read-only)
  find_duplicate_names.js
  bucket_duplicates.js
  confirm_root_cause.js
  pair_ps_entra_records.js
  validate_import_run.js
  entra_duplicate_report.js  CSV of same-person Entra duplicates for the Identity team
  dump_transform_maps.js
```

## Import set columns

`u_emplid, u_emailid, u_name, u_name_display, u_first_name, u_pref_first_name, u_middle_name, u_last_name, u_deptid, u_agency, u_descr, u_mk_descr, u_location, u_building, u_floor, u_address1, u_address2, u_city, u_state, u_postal`
