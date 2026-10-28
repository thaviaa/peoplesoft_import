/**
 * Field map script — Peoplesoft Employee import
 * Target field: sys_id   |  Coalesce: true   |  Use source script: true
 *
 * Replaces the AND-coalesce on u_emplid + u_emailid.
 * Match order: employee ID -> email (user_name or email field) -> insert.
 */
answer = (function transformEntry(source) {
    var emplid = source.getValue('u_emplid');
    var email  = source.getValue('u_emailid');
    var gr;

    // 1. Employee ID is the most reliable match
    if (emplid) {
        gr = new GlideRecord('sys_user');
        gr.addQuery('u_employee_id', emplid);
        gr.orderByDesc('active');          // prefer the active record if dupes already exist
        gr.setLimit(1);
        gr.query();
        if (gr.next()) return gr.getUniqueValue();
    }

    // 2. Fall back to email, matching User ID or Email (catches Entra-created users)
    if (email) {
        gr = new GlideRecord('sys_user');
        gr.addQuery('user_name', email).addOrCondition('email', email);
        gr.orderByDesc('active');
        gr.setLimit(1);
        gr.query();
        if (gr.next()) return gr.getUniqueValue();
    }

    return '-1'; // no match -> insert
})(source);
