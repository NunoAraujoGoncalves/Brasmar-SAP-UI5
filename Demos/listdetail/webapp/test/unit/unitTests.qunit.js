/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"studentcomsaptrainingadvanced_sapui5/listdetail/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
