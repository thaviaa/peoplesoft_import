/**
 * Background script (read-only)
 * Dumps every transform map on the PeopleSoft import set table:
 * header settings, field maps (coalesce flagged), transform scripts,
 * plus the import set's source columns.
 */
var importTable = 'x_meug_peoplesof_0_peoplesoft_import';

var maps = new GlideRecord('sys_transform_map');
maps.addQuery('source_table', importTable);
maps.orderBy('order');
maps.query();
while (maps.next()) {
    var out = [];
    out.push('\n########## MAP: ' + maps.name + ' -> ' + maps.target_table +
        ' | order=' + maps.order + ' | active=' + maps.active +
        ' | run_bus_rules=' + maps.run_business_rules +
        ' | create_new=' + maps.create_new_record_on_empty_coalesce_fields);

    if (maps.run_script == true) out.push('--- Map script (run_script) ---\n' + maps.script);

    var fm = new GlideRecord('sys_transform_entry');
    fm.addQuery('map', maps.sys_id);
    fm.orderByDesc('coalesce');
    fm.query();
    out.push('--- Field maps ---');
    while (fm.next()) {
        out.push((fm.coalesce == true ? '[COALESCE] ' : '           ') +
            fm.source_field + ' -> ' + fm.target_field +
            (fm.use_source_script == true ? ' [SOURCE SCRIPT]\n' + fm.source_script : '') +
            (fm.choice_action ? ' | choice_action=' + fm.choice_action : ''));
    }

    var ts = new GlideRecord('sys_transform_script');
    ts.addQuery('map', maps.sys_id);
    ts.addActiveQuery();
    ts.orderBy('order');
    ts.query();
    while (ts.next()) {
        out.push('--- Transform script: ' + ts.when + ' (order ' + ts.order + ') ---\n' + ts.script);
    }
    gs.info(out.join('\n'));
}

var cols = [];
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', importTable);
d.addQuery('element', 'STARTSWITH', 'u_');
d.query();
while (d.next()) cols.push(d.element.toString());
gs.info('\n########## IMPORT SET COLUMNS:\n' + cols.join(', '));
