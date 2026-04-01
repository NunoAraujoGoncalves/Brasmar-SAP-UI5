sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"controloqualidade2/test/integration/pages/CQCabList",
	"controloqualidade2/test/integration/pages/CQCabObjectPage"
], function (JourneyRunner, CQCabList, CQCabObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('controloqualidade2') + '/test/flpSandbox.html#controloqualidade2-tile',
        pages: {
			onTheCQCabList: CQCabList,
			onTheCQCabObjectPage: CQCabObjectPage
        },
        async: true
    });

    return runner;
});

