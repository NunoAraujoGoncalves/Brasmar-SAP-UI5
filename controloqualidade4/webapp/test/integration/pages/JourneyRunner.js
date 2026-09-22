sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"brasmar/bm01/controloqualidade4/test/integration/pages/CQCabMain"
], function (JourneyRunner, CQCabMain) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('brasmar/bm01/controloqualidade4') + '/test/flp.html#app-preview',
        pages: {
			onTheCQCabMain: CQCabMain
        },
        async: true
    });

    return runner;
});

