/**
 * onBefore transform script — Peoplesoft Employee import
 * Prevents creating users that have neither an EMPLID nor an email,
 * which would otherwise become blank-User-ID duplicates.
 */
(function runTransformScript(source, map, log, target) {
    if (action == 'insert' && gs.nil(source.u_emplid) && gs.nil(source.u_emailid)) {
        ignore = true;
        status_message = 'Skipped: no EMPLID or email';
    }
})(source, map, log, target);
