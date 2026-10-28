# Current configuration — Peoplesoft Employee import

Snapshot of `sys_transform_map` `b54eb56bc3105e9057c46625990131db` as of 2026-10-28 (before fix).

- Source: `x_meug_peoplesof_0_peoplesoft_import` → Target: `sys_user`
- Order 300, active, run business rules = true, run script = false
- Create new record on empty coalesce fields = false

## Field maps

| Coalesce | Source | Target | Notes |
|---|---|---|---|
| ✅ | `u_emplid` | `u_employee_id` | |
| ✅ | `u_emailid` | `user_name` | To be removed — Entra owns User ID/Email |
| | `u_deptid` | `u_business_unit` | |
| | `u_name_display` | `name` | To be replaced — value includes quoted nickname (e.g. `Michael "Scott" Newell`); use `transform/name_source_script.js` |
| | `u_last_name` | `last_name` | |
| | `u_descr` | `location` | |
| | [script] | `first_name` | `u_pref_first_name` if set, else `u_first_name` |
| | `u_building` | `building` | |

## Transform scripts (onBefore)

### Order 100 — intended emplid/email fallback (no effect on matching)

```javascript
(function runTransformScript(source, map, log, target) {
    var empRecord = new GlideRecord('sys_user');
    empRecord.addQuery('u_employee_id', source.u_emplid);
    empRecord.query();
    if (empRecord.next()) {
        target.location = source.u_descr;
    } else {
        var emailRecord = new GlideRecord('sys_user');
        emailRecord.addQuery('user_name', source.u_emailid);
        emailRecord.query();
        if (emailRecord.next()) {
            target.location = source.u_descr;
        }
    }
})(source, map, log, target);
```

### Order 110 — location update

```javascript
(function runTransformScript(source, map, log, target) {
    if (target.location && target.location.trim() !== '') {
        if (target.location !== source.u_descr) {
            target.location = source.u_descr;
        }
    }
})(source, map, log, target);
```

### Order 120 — department from agency

```javascript
(function runTransformScript(source, map, log, target) {
    if (!gs.nil(source.u_agency)) {
        var dept = new GlideRecord('cmn_department');
        dept.addQuery('id', source.u_agency);
        dept.query();
        if (dept.next()) {
            target.department = dept.sys_id;
        }
    }
})(source, map, log, target);
```
