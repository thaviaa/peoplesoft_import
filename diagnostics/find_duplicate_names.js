/**
 * Background script (read-only)
 * Finds sys_user names with more than `minCount` records and prints
 * a list URL showing only those users, grouped by name.
 */
var minCount = 1; // names with MORE than this many records
var names = [];

var ga = new GlideAggregate('sys_user');
ga.addNotNullQuery('name');
ga.addAggregate('COUNT', 'name');
ga.groupBy('name');
ga.addHaving('COUNT', '>', String(minCount));
ga.query();
while (ga.next()) {
    names.push(ga.getValue('name'));
}

gs.info('Duplicate names found: ' + names.length);

var query = 'nameIN' + names.join(',') + '^GROUPBYname';
gs.info(gs.getProperty('glide.servlet.uri') + 'sys_user_list.do?sysparm_query=' + encodeURIComponent(query));
