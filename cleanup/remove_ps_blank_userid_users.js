/**
 * CLEANUP — remove PeopleSoft-created users with a blank User ID
 * Run in GLOBAL scope (Scripts - Background, or a Fix Script run in background).
 *
 * Targets: sys_user where user_name is empty AND u_employee_id is not empty
 *          (the copies the old AND-coalesce created).
 *
 * For each target ("PS copy"):
 *   1. Find the Entra user for the same person: PeopleSoft email (latest import row)
 *      = Entra user's User ID or Email.
 *   2. MATCHED  -> re-point every reference (tasks, assets, approvals, groups, ...)
 *                  from the PS copy to the Entra user, copy u_employee_id onto the
 *                  Entra user, then delete the PS copy.
 *      CONFLICT -> Entra user already has a different employee ID: skipped, reported.
 *      UNMATCHED, no references  -> deleted (if DELETE_UNMATCHED_UNREFERENCED).
 *      UNMATCHED, has references -> skipped, reported for manual review.
 *   Records owned by the user (notification devices/preferences, live notifications)
 *   are not treated as references; they are deleted together with the PS copy.
 *
 * ALWAYS run with MODE = 'report' first and review the output.
 * Before MODE = 'execute', export the targets as XML (backup):
 *   sys_user_list.do?sysparm_query=user_nameISEMPTY^u_employee_idISNOTEMPTY
 *   -> list context menu -> Export -> XML
 * Deleted users can also be restored from System Definition > Deleted Records.
 *
 * Run the fixed import (update-only) BEFORE this cleanup, so deleted copies are
 * never recreated and Entra users get their employee ID on the next run.
 */
var MODE = 'report';                     // 'report' = no changes | 'execute' = make changes
var MAX_USERS = 0;                       // 0 = all; e.g. 25 for a first execute batch
var DELETE_UNMATCHED_UNREFERENCED = true;
var ONLY_CREATED_BY = '';                // optional, e.g. 'admin' to limit to the import user
var SAMPLE = 10;

// Manual pairs for copies the script can't match by email (e.g. no email in
// PeopleSoft). Fill from the "Review list" output after confirming each pair.
//   'PS copy sys_id': 'Entra user sys_id'
var MANUAL_MAP = {
};

var importTable = 'x_meug_peoplesof_0_peoplesoft_import';
var SKIP_TABLES = ['sys_audit', 'sys_history_line', 'sys_history_set', 'syslog', 'sys_email',
    'sys_journal_field', 'sys_attachment', 'sys_user_preference', 'sys_user_session',
    'sys_rollback_sequence', 'sys_import_set_row', 'sys_update_xml', 'sys_cache_flush'];
var SKIP_PREFIXES = ['ts_', 'v_', 'syslog', 'sys_rollback', 'sys_history', 'sys_audit'];
// Records that belong to the user itself (auto-created per user). Not counted as
// references and never re-pointed; deleted together with the PS copy.
var OWNED_TABLES = ['cmn_notif_device', 'cmn_notif_message', 'live_notification'];

var execute = (MODE === 'execute');
var out = [];
var stats = { targets: 0, matched: 0, conflict: 0, unmatchedUnref: 0, unmatchedRef: 0,
    noImportRow: 0, noEmail: 0, emailNoEntra: 0, manualMapInvalid: 0, ownedDeleted: 0,
    refsRepointed: 0, groupsMoved: 0, rolesMoved: 0, emplidCopied: 0, deleted: 0 };
var samples = { matched: [], conflict: [], unmatchedUnref: [], unmatchedRef: [], emailNoEntra: [] };
var refsByField = {};

function pushSample(bucket, line) { if (samples[bucket].length < SAMPLE) samples[bucket].push(line); }

function skipTable(t) {
    if (SKIP_TABLES.indexOf(t) > -1) return true;
    for (var i = 0; i < SKIP_PREFIXES.length; i++) if (t.indexOf(SKIP_PREFIXES[i]) === 0) return true;
    return false;
}

// ---- 1. Collect PS copies ----
var copies = {};   // sys_id -> { emplid, name, survivor, conflict }
var ids = [];
var ps = new GlideRecord('sys_user');
ps.addNullQuery('user_name');
ps.addNotNullQuery('u_employee_id');
if (ONLY_CREATED_BY) ps.addQuery('sys_created_by', ONLY_CREATED_BY);
if (MAX_USERS) ps.setLimit(MAX_USERS);
ps.query();
while (ps.next()) {
    var id = ps.getUniqueValue();
    copies[id] = { emplid: ps.getValue('u_employee_id'), name: ps.getValue('name'), active: ps.getValue('active') };
    ids.push(id);
}
stats.targets = ids.length;

// ---- 2. Find the Entra user for each copy ----
var repointMap = {}; // PS copy sys_id -> Entra user sys_id
ids.forEach(function (id) {
    var c = copies[id];
    if (MANUAL_MAP[id]) {
        var m = new GlideRecord('sys_user');
        if (m.get(MANUAL_MAP[id]) && m.getValue('user_name')) {
            c.survivor = m.getUniqueValue();
            c.survivorUid = m.getValue('user_name') + ' [manual]';
            var mEmp = m.getValue('u_employee_id');
            if (mEmp && mEmp !== c.emplid) c.conflict = mEmp; else repointMap[id] = c.survivor;
            return;
        }
        c.reason = 'manualMapInvalid';
    }
    var row = new GlideRecord(importTable);
    row.addQuery('u_emplid', c.emplid);
    row.orderByDesc('sys_created_on');
    row.setLimit(1);
    row.query();
    if (!row.next()) { c.reason = 'noImportRow'; return; }
    var email = (row.getValue('u_emailid') || '').trim();
    if (!email) { c.reason = 'noEmail'; return; }
    c.psEmail = email;

    var u = new GlideRecord('sys_user');
    u.addQuery('user_name', email).addOrCondition('email', email);
    u.addNotNullQuery('user_name');
    u.addQuery('sys_id', '!=', id);
    u.orderByDesc('active');
    u.setLimit(1);
    u.query();
    if (!u.next()) { c.reason = 'emailNoEntra'; return; }

    var existing = u.getValue('u_employee_id');
    c.survivor = u.getUniqueValue();
    c.survivorUid = u.getValue('user_name');
    if (existing && existing !== c.emplid) {
        c.conflict = existing;
    } else {
        repointMap[id] = c.survivor;
    }
});

// ---- 3. Scan (and in execute mode re-point) every reference to sys_user ----
function moveMembership(gr, table, keyField, newId) {
    var ex = new GlideRecord(table);
    ex.addQuery('user', newId);
    ex.addQuery(keyField, gr.getValue(keyField));
    ex.query();
    if (!ex.hasNext()) {
        var ins = new GlideRecord(table);
        ins.initialize();
        ins.setValue('user', newId);
        ins.setValue(keyField, gr.getValue(keyField));
        ins.insert();   // workflow on, so group roles are granted to the Entra user
    }
    gr.deleteRecord();
}

var refFields = [];
var d = new GlideRecord('sys_dictionary');
d.addQuery('internal_type', 'reference');
d.addQuery('reference', 'sys_user');
d.query();
while (d.next()) {
    var t = d.getValue('name'), f = d.getValue('element');
    if (t && f && !skipTable(t)) refFields.push({ t: t, f: f });
}

var CHUNK = 300;
refFields.forEach(function (fd) {
    var probe = new GlideRecord(fd.t);
    if (!probe.isValid() || !probe.isValidField(fd.f)) return;
    for (var i = 0; i < ids.length; i += CHUNK) {
        var chunk = ids.slice(i, i + CHUNK);
        var gr = new GlideRecord(fd.t);
        gr.addQuery(fd.f, 'IN', chunk.join(','));
        gr.query();
        while (gr.next()) {
            var oldId = gr.getValue(fd.f);
            var c = copies[oldId];
            if (!c) continue;
            if (OWNED_TABLES.indexOf(fd.t) > -1) {
                (c.owned = c.owned || []).push([fd.t, gr.getUniqueValue()]);
                var ok = fd.t + '.' + fd.f + ' (owned, deleted with user)';
                refsByField[ok] = (refsByField[ok] || 0) + 1;
                continue;
            }
            c.refs = (c.refs || 0) + 1;
            var key = fd.t + '.' + fd.f;
            refsByField[key] = (refsByField[key] || 0) + 1;

            if (!execute || !repointMap[oldId]) continue;
            var newId = repointMap[oldId];
            if (fd.t === 'sys_user_grmember' && fd.f === 'user') {
                moveMembership(gr, 'sys_user_grmember', 'group', newId); stats.groupsMoved++;
            } else if (fd.t === 'sys_user_has_role' && fd.f === 'user') {
                if (gr.getValue('inherited') == '1') continue;   // follows the group move
                moveMembership(gr, 'sys_user_has_role', 'role', newId); stats.rolesMoved++;
            } else {
                gr.setValue(fd.f, newId);
                gr.setWorkflow(false);   // no notifications / BR side effects on re-point
                gr.update();
                stats.refsRepointed++;
            }
        }
    }
});

function deleteCopy(id, c) {
    (c.owned || []).forEach(function (o) {
        var r = new GlideRecord(o[0]);
        if (r.get(o[1])) { r.deleteRecord(); stats.ownedDeleted++; }
    });
    var del = new GlideRecord('sys_user');
    if (del.get(id)) { del.deleteRecord(); stats.deleted++; }
}

var review = [];

// ---- 4. Classify, copy employee ID, delete ----
ids.forEach(function (id) {
    var c = copies[id];
    var label = c.name + ' | EMPLID ' + c.emplid + ' | PS copy ' + id + ' | refs=' + (c.refs || 0);

    if (repointMap[id]) {
        stats.matched++;
        pushSample('matched', label + ' -> ' + c.survivorUid + ' (' + c.survivor + ')');
        if (execute) {
            var s = new GlideRecord('sys_user');
            if (s.get(c.survivor) && !s.getValue('u_employee_id')) {
                s.setValue('u_employee_id', c.emplid);
                s.update();
                stats.emplidCopied++;
            }
            deleteCopy(id, c);
        }
        return;
    }

    if (c.conflict) {
        stats.conflict++;
        pushSample('conflict', label + ' -> ' + c.survivorUid + ' already has EMPLID ' + c.conflict);
        return;
    }

    // Unmatched
    if (c.reason) stats[c.reason]++;
    if (c.reason === 'emailNoEntra') {
        pushSample('emailNoEntra', c.name + ' | EMPLID ' + c.emplid + ' | PS email ' + c.psEmail);
    }
    if (!c.refs) {
        stats.unmatchedUnref++;
        pushSample('unmatchedUnref', label);
        if (execute && DELETE_UNMATCHED_UNREFERENCED) deleteCopy(id, c);
    } else {
        stats.unmatchedRef++;
        pushSample('unmatchedRef', label);
        review.push(id);
    }
});

// ---- Output ----
out.push('MODE = ' + MODE + (execute ? '' : '  (no changes made)'));
out.push('\nPS copies (blank User ID, has Employee ID): ' + stats.targets);
out.push('  matched to Entra user (re-point + delete):        ' + stats.matched);
out.push('  conflict (Entra user has different EMPLID, skip):  ' + stats.conflict);
out.push('  unmatched, no references (' + (DELETE_UNMATCHED_UNREFERENCED ? 'delete' : 'skip') + '):        ' + stats.unmatchedUnref);
out.push('  unmatched, has references (skip, review):         ' + stats.unmatchedRef);
out.push('\nWhy unmatched (no Entra user found):');
out.push('  EMPLID not in import set:                ' + stats.noImportRow);
out.push('  PeopleSoft has no email:                 ' + stats.noEmail);
out.push('  PS email matches no Entra User ID/Email: ' + stats.emailNoEntra);
if (stats.manualMapInvalid) out.push('  MANUAL_MAP target invalid / no User ID:  ' + stats.manualMapInvalid);
if (execute) {
    out.push('\nExecuted: refs re-pointed=' + stats.refsRepointed + ', groups moved=' + stats.groupsMoved +
        ', roles moved=' + stats.rolesMoved + ', employee IDs copied=' + stats.emplidCopied + ', owned records deleted=' + stats.ownedDeleted + ', users deleted=' + stats.deleted);
}
out.push('\nReferences to PS copies by table.field (refs = everything except owned):');
Object.keys(refsByField).sort(function (a, b) { return refsByField[b] - refsByField[a]; })
    .forEach(function (k) { out.push('  ' + k + ': ' + refsByField[k]); });
// Full review list: unmatched copies that still have references, with
// same-name users that have a User ID (likely the Entra record).
out.push('\nReview list (unmatched, has references): ' + review.length);
review.forEach(function (id) {
    var c = copies[id];
    out.push('  ' + c.name + ' | EMPLID ' + c.emplid + ' | PS copy ' + id + ' | refs=' + c.refs + ' | reason=' + (c.reason || '?'));
    var cand = new GlideRecord('sys_user');
    cand.addQuery('name', c.name);
    cand.addNotNullQuery('user_name');
    cand.orderByDesc('active');
    cand.query();
    if (!cand.hasNext()) out.push('      no same-name user with a User ID');
    while (cand.next()) {
        out.push('      candidate: ' + cand.getValue('user_name') + ' (' + cand.getUniqueValue() + ')' +
            ' | active=' + cand.getValue('active') +
            ' | emplid=' + (cand.getValue('u_employee_id') || '-') +
            ' | created_by=' + cand.getValue('sys_created_by'));
    }
});

for (var b in samples) {
    out.push('\nSample ' + b + ':\n  ' + (samples[b].join('\n  ') || '(none)'));
}
gs.info(out.join('\n'));
