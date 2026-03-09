/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require([
    "student/com/sap/training/advancedsapui5/qunit/test/unit/AllTests"
], function () {
    "use strict";

    QUnit.start();
});