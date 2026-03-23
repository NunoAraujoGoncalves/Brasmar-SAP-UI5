/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["helloworld/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
