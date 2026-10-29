/**
 * One-time background script — run in GLOBAL scope, with your update set selected
 * (the Report Source is captured in the update set).
 *
 * Creates a Report Source ("predefined condition") on sys_user that lists the
 * Entra duplicate users. It then appears under "Predefined conditions" when you
 * add sys_user as a data source in Platform Analytics / Visualization designer,
 * and as a Source in the classic report builder.
 *
 * Requires Script Include DuplicateUserUtil (Client callable / Sandbox enabled).
 */
var NAME = 'Entra duplicate users';
var FILTER = 'sys_idINjavascript:new DuplicateUserUtil().getEntraDuplicateIds()^ORDERBYname';

var rs = new GlideRecord('sys_report_source');
rs.addQuery('name', NAME);
rs.query();
if (rs.next()) {
    gs.info('Report Source already exists: ' + rs.getUniqueValue());
} else {
    rs.initialize();
    rs.setValue('name', NAME);
    rs.setValue('table', 'sys_user');
    rs.setValue('filter', FILTER);
    var id = rs.insert();
    gs.info('Created Report Source ' + id + ' | filter=' + rs.getValue('filter'));
}
