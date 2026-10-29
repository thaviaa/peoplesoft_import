/**
 * Script Include: DuplicateUserUtil   (Global scope)
 *   Accessible from: All application scopes
 *   Client callable / Sandbox enabled: true  (required to use it in a report filter)
 *
 * Returns sys_ids of users that HAVE a User ID and share an Employee ID or an
 * email with at least one other user that has a User ID (Entra-side duplicates).
 *
 * Used by the Dynamic Filter Option "Entra duplicate users" on sys_user, so a
 * report can use: Sys ID  is (dynamic)  Entra duplicate users
 */
var DuplicateUserUtil = Class.create();
DuplicateUserUtil.prototype = {
    initialize: function () {},

    getEntraDuplicateIds: function () {
        var ids = {};
        this._collect('u_employee_id', ids);
        this._collect('email', ids);
        // Comma-separated string: works in list filters, report sources and
        // Platform Analytics data sources (some reject arrays and show "IN NULL").
        return Object.keys(ids).join(',');
    },

    _collect: function (field, ids) {
        var keys = [];
        var ga = new GlideAggregate('sys_user');
        ga.addNotNullQuery(field);
        ga.addNotNullQuery('user_name');
        ga.addAggregate('COUNT', field);
        ga.groupBy(field);
        ga.addHaving('COUNT', '>', '1');
        ga.query();
        while (ga.next()) keys.push(ga.getValue(field));

        for (var i = 0; i < keys.length; i += 500) {
            var gr = new GlideRecord('sys_user');
            gr.addQuery(field, 'IN', keys.slice(i, i + 500).join(','));
            gr.addNotNullQuery('user_name');
            gr.query();
            while (gr.next()) ids[gr.getUniqueValue()] = true;
        }
    },

    type: 'DuplicateUserUtil'
};
