/**
 * onBefore transform script — Peoplesoft Employee import
 * Order: 90   |  Active: true
 *
 * Entra ID creates and owns user identities (User ID, Email).
 * PeopleSoft only enriches existing users (location, employee ID, etc.),
 * so never insert. Rows with no matching user are skipped.
 */
(function runTransformScript(source, map, log, target) {
    if (action == 'insert') {
        ignore = true;
        status_message = 'Skipped: no matching ServiceNow user for EMPLID ' +
            source.getValue('u_emplid') + ' / ' + source.getValue('u_emailid');
    }
})(source, map, log, target);
