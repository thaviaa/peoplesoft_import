/**
 * Background script (read-only) — run in GLOBAL scope
 * Validates the most recent PeopleSoft import run after the coalesce fix.
 *
 * Expected results:
 *   1. Row outcomes: inserted = 0, error = 0
 *   2. "Skipped: no matching user" count = PeopleSoft rows with no Entra user
 *   3. No new sys_user records created by the import
 *   4. No User ID / Email changes made by the import (Entra owns them)
 *   5. Spot-check users show preferred name, correct location, one record per EMPLID
 *
 * Note: three transform maps run on each row (Location 100, Business Unit 200,
 * Employee 300). Row state reflects the last map (Employee). For per-map counts,
 * also check Transform History on the import set.
 */
var importTable = 'x_meug_peoplesof_0_peoplesoft_import';
var SPOT_EMPLIDS = ['108673']; // add EMPLIDs from bucket_duplicates.js / known dupes
var out = [];

var set = new GlideRecord('sys_import_set');
set.addQuery('table_name', importTable);
set.orderByDesc('sys_created_on');
set.setLimit(1);
set.query();

if (!set.next()) {
    gs.info('No import set found for ' + importTable);
} else {
    var setId = set.getUniqueValue();
    var started = set.getValue('sys_created_on');
    out.push('Import set ' + set.getValue('number') + ' | state=' + set.getValue('state') + ' | created=' + started);

    // 1. Row outcomes
    out.push('\n--- 1. Row outcomes (expect inserted = 0, error = 0) ---');
    var ga = new GlideAggregate(importTable);
    ga.addQuery('sys_import_set', setId);
    ga.addAggregate('COUNT');
    ga.groupBy('sys_import_state');
    ga.query();
    while (ga.next()) {
        out.push('  ' + (ga.getValue('sys_import_state') || '(blank)') + ': ' + ga.getAggregate('COUNT'));
    }

    // 2. Rows skipped by the update-only guard
    var sk = new GlideAggregate(importTable);
    sk.addQuery('sys_import_set', setId);
    sk.addQuery('sys_import_state_comment', 'STARTSWITH', 'Skipped: no matching');
    sk.addAggregate('COUNT');
    sk.query();
    sk.next();
    out.push('\n--- 2. Skipped by update-only guard (no matching user) ---\n  ' + sk.getAggregate('COUNT'));

    // Sample errors
    var er = new GlideRecord(importTable);
    er.addQuery('sys_import_set', setId);
    er.addQuery('sys_import_state', 'error');
    er.setLimit(10);
    er.query();
    if (er.hasNext()) out.push('  Sample errors:');
    while (er.next()) {
        out.push('  EMPLID ' + er.getValue('u_emplid') + ': ' + er.getValue('sys_import_state_comment'));
    }

    // 3. Users created since the import started
    out.push('\n--- 3. sys_user records created since import started (expect none from the import user) ---');
    var nu = new GlideAggregate('sys_user');
    nu.addQuery('sys_created_on', '>=', started);
    nu.addAggregate('COUNT');
    nu.groupBy('sys_created_by');
    nu.query();
    var anyNew = false;
    while (nu.next()) {
        anyNew = true;
        out.push('  created_by ' + nu.getValue('sys_created_by') + ': ' + nu.getAggregate('COUNT'));
    }
    if (!anyNew) out.push('  none');

    // 4. User ID / Email changes since the import started
    out.push('\n--- 4. User ID / Email changes since import started (expect none from the import user) ---');
    var au = new GlideAggregate('sys_audit');
    au.addQuery('tablename', 'sys_user');
    au.addQuery('fieldname', 'IN', 'user_name,email');
    au.addQuery('sys_created_on', '>=', started);
    au.addAggregate('COUNT');
    au.groupBy('user');
    au.groupBy('fieldname');
    au.query();
    var anyAudit = false;
    while (au.next()) {
        anyAudit = true;
        out.push('  ' + au.getValue('user') + ' changed ' + au.getValue('fieldname') + ': ' + au.getAggregate('COUNT'));
    }
    if (!anyAudit) out.push('  none');

    // 5. Spot checks
    out.push('\n--- 5. Spot checks ---');
    SPOT_EMPLIDS.forEach(function (id) {
        var u = new GlideRecord('sys_user');
        u.addQuery('u_employee_id', id);
        u.query();
        out.push('  EMPLID ' + id + ': ' + u.getRowCount() + ' record(s)' + (u.getRowCount() > 1 ? '  <-- still duplicated (expected until cleanup)' : ''));
        while (u.next()) {
            out.push('    name=' + u.getValue('name') +
                ' | first=' + u.getValue('first_name') +
                ' | last=' + u.getValue('last_name') +
                ' | user_name=' + u.getValue('user_name') +
                ' | email=' + u.getValue('email') +
                ' | location=' + u.getDisplayValue('location') +
                ' | dept=' + u.getDisplayValue('department') +
                ' | active=' + u.getValue('active') +
                ' | updated=' + u.getValue('sys_updated_on'));
        }
    });

    gs.info(out.join('\n'));
}
