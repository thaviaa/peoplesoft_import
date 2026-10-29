/**
 * Background script (read-only) — run in GLOBAL scope
 * Same-person duplicates where every record has a User ID (Entra-side).
 * Output is CSV for the identity team, one row per user record.
 *
 * Groups:
 *   EMPLID  - 2+ users with a User ID share u_employee_id
 *   EMAIL   - 2+ users with a User ID share email (and not already grouped by EMPLID)
 *
 * Suggested action per record (identity team confirms):
 *   KEEP    - active first, then most recent last login, then most recently created
 *   RETIRE  - every other record in the group
 *
 * Copy everything after the "CSV" line into a spreadsheet.
 */
var rows = [];
var seen = {};          // sys_id -> true, so a user appears in one group only
var groupCount = { EMPLID: 0, EMAIL: 0 };

function csv(v) {
    v = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function collectGroup(type, key, field) {
    var users = [];
    var u = new GlideRecord('sys_user');
    u.addQuery(field, key);
    u.addNotNullQuery('user_name');
    u.query();
    while (u.next()) {
        if (seen[u.getUniqueValue()]) continue;
        users.push({
            id: u.getUniqueValue(),
            name: u.getValue('name'),
            user_name: u.getValue('user_name'),
            email: u.getValue('email'),
            active: u.getValue('active') == '1',
            emplid: u.getValue('u_employee_id'),
            last_login: u.getValue('last_login_time') || '',
            created: u.getValue('sys_created_on'),
            created_by: u.getValue('sys_created_by'),
            source: u.getValue('source') || ''
        });
    }
    if (users.length < 2) return;

    users.sort(function (a, b) {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.last_login !== b.last_login) return a.last_login > b.last_login ? -1 : 1;
        return a.created > b.created ? -1 : 1;
    });

    groupCount[type]++;
    var groupId = type + ':' + key;
    users.forEach(function (x, i) {
        seen[x.id] = true;
        rows.push([groupId, x.name, x.user_name, x.email, x.active, x.emplid, x.last_login,
            x.created, x.created_by, x.source, x.id, i === 0 ? 'KEEP' : 'RETIRE'].map(csv).join(','));
    });
}

// 1. Shared employee ID
var ga = new GlideAggregate('sys_user');
ga.addNotNullQuery('u_employee_id');
ga.addNotNullQuery('user_name');
ga.addAggregate('COUNT', 'u_employee_id');
ga.groupBy('u_employee_id');
ga.addHaving('COUNT', '>', '1');
ga.query();
while (ga.next()) collectGroup('EMPLID', ga.getValue('u_employee_id'), 'u_employee_id');

// 2. Shared email (not already grouped)
var ge = new GlideAggregate('sys_user');
ge.addNotNullQuery('email');
ge.addNotNullQuery('user_name');
ge.addAggregate('COUNT', 'email');
ge.groupBy('email');
ge.addHaving('COUNT', '>', '1');
ge.query();
while (ge.next()) collectGroup('EMAIL', ge.getValue('email'), 'email');

gs.info('Entra-side duplicate groups: EMPLID=' + groupCount.EMPLID + ', EMAIL=' + groupCount.EMAIL +
    ', user records=' + rows.length +
    '\nCSV\ngroup,name,user_name,email,active,employee_id,last_login,created,created_by,source,sys_id,suggested\n' +
    rows.join('\n'));
