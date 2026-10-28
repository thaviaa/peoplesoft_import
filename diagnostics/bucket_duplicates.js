/**
 * Background script (read-only)
 * Classifies duplicate-name users:
 *   sameEmpId       - share u_employee_id      -> almost certainly same person
 *   sameEmail       - share email               -> very likely same person
 *   psEntraSplit    - mix of blank / populated User ID -> likely PeopleSoft + Entra copy
 *   likelyDifferent - no shared identifiers     -> probably different people
 */
var dupNames = [];
var ga = new GlideAggregate('sys_user');
ga.addNotNullQuery('name');
ga.addAggregate('COUNT', 'name');
ga.groupBy('name');
ga.addHaving('COUNT', '>', '1');
ga.query();
while (ga.next()) dupNames.push(ga.getValue('name'));

var buckets = { sameEmpId: [], sameEmail: [], psEntraSplit: [], likelyDifferent: [] };

dupNames.forEach(function (n) {
    var gr = new GlideRecord('sys_user');
    gr.addQuery('name', n);
    gr.query();
    var emails = {}, empIds = {}, blankUid = 0, total = 0, sameEmail = false, sameEmp = false;
    while (gr.next()) {
        total++;
        var e  = (gr.getValue('email') || '').toLowerCase().trim();
        var en = (gr.getValue('u_employee_id') || '').trim();
        if (!gr.getValue('user_name')) blankUid++;
        if (e)  { if (emails[e])  sameEmail = true; emails[e] = 1; }
        if (en) { if (empIds[en]) sameEmp = true;   empIds[en] = 1; }
    }
    var label = n + ' (' + total + ')';
    if (sameEmp) buckets.sameEmpId.push(label);
    else if (sameEmail) buckets.sameEmail.push(label);
    else if (blankUid > 0 && blankUid < total) buckets.psEntraSplit.push(label);
    else buckets.likelyDifferent.push(label);
});

for (var b in buckets) {
    gs.info('=== ' + b + ': ' + buckets[b].length + ' ===\n' + buckets[b].join('\n'));
}
