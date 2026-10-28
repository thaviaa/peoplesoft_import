/**
 * Background script (read-only) — scope-safe
 * Pairs PeopleSoft-created users (Employee ID, blank User ID) with the
 * Entra-created user for the same person (User ID = PeopleSoft email, no Employee ID).
 *
 * Email for each EMPLID comes from the most recent import set row.
 *
 * Output buckets:
 *   paired        - PS copy + Entra user found -> merge candidates
 *   psHasEmail    - PS row has email but no matching Entra user
 *   psNoEmail     - PS row has no email in PeopleSoft (can't pair automatically)
 *   noImportRow   - no import set row for that EMPLID (left PeopleSoft?)
 *
 * Set SAMPLE to print example pairs.
 */
var SAMPLE = 25;
var importTable = 'x_meug_peoplesof_0_peoplesoft_import';
var counts = { paired: 0, psHasEmail: 0, psNoEmail: 0, noImportRow: 0 };
var samples = [];

var ps = new GlideRecord('sys_user');
ps.addNotNullQuery('u_employee_id');
ps.addNullQuery('user_name');
ps.query();

while (ps.next()) {
    var emplid = ps.getValue('u_employee_id');

    var row = new GlideRecord(importTable);
    row.addQuery('u_emplid', emplid);
    row.orderByDesc('sys_created_on');
    row.setLimit(1);
    row.query();
    if (!row.next()) { counts.noImportRow++; continue; }

    var email = (row.getValue('u_emailid') || '').trim();
    if (!email) { counts.psNoEmail++; continue; }

    var entra = new GlideRecord('sys_user');
    entra.addQuery('user_name', email).addOrCondition('email', email);
    entra.addNullQuery('u_employee_id');
    entra.setLimit(1);
    entra.query();
    if (entra.next()) {
        counts.paired++;
        if (samples.length < SAMPLE) {
            samples.push(emplid + ' | PS: ' + ps.getValue('name') + ' (' + ps.getUniqueValue() + ', active=' + ps.getValue('active') + ')' +
                ' -> Entra: ' + entra.getValue('user_name') + ' (' + entra.getUniqueValue() + ', active=' + entra.getValue('active') + ')');
        }
    } else {
        counts.psHasEmail++;
    }
}

gs.info('PS/Entra pairing:\n' + JSON.stringify(counts, null, 2));
gs.info('Sample pairs:\n' + samples.join('\n'));
