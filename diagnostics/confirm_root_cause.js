/**
 * Background script (read-only)
 * Quantifies users affected by the AND-coalesce defect.
 */
var ga = new GlideAggregate('sys_user');
ga.addNotNullQuery('u_employee_id');
ga.addAggregate('COUNT', 'u_employee_id');
ga.groupBy('u_employee_id');
ga.addHaving('COUNT', '>', '1');
ga.query();
var dupEmp = 0;
while (ga.next()) dupEmp++;

var blank = new GlideAggregate('sys_user');
blank.addNotNullQuery('u_employee_id');
blank.addNullQuery('user_name');
blank.addAggregate('COUNT');
blank.query();
blank.next();

var noEmp = new GlideAggregate('sys_user');
noEmp.addQuery('active', true);
noEmp.addNullQuery('u_employee_id');
noEmp.addNotNullQuery('user_name');
noEmp.addAggregate('COUNT');
noEmp.query();
noEmp.next();

gs.info('Employee IDs on 2+ users: ' + dupEmp);
gs.info('Users with Employee ID but blank User ID: ' + blank.getAggregate('COUNT'));
gs.info('Active users with User ID but no Employee ID (never matched by PeopleSoft): ' + noEmp.getAggregate('COUNT'));
