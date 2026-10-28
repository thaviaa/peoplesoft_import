/**
 * Field map script — Peoplesoft Employee import
 * Target field: name   |  Use source script: true   |  Coalesce: false
 *
 * Replaces u_name_display -> name. PeopleSoft's NAME_DISPLAY embeds the
 * nickname in quotes (e.g. Michael "Scott" Newell), so build Name from the
 * same preferred-first-name logic used for first_name: "Scott Newell".
 */
answer = (function transformEntry(source) {
    var first = String(source.getValue('u_pref_first_name') || '').trim();
    if (!first) first = String(source.getValue('u_first_name') || '').trim();
    var last = String(source.getValue('u_last_name') || '').trim();
    return (first + ' ' + last).trim();
})(source);
