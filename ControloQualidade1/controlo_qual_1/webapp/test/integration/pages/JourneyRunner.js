sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"brasmar/bra/controloqualidade/controloqual1/test/integration/pages/CQCabList",
	"brasmar/bra/controloqualidade/controloqual1/test/integration/pages/CQCabObjectPage",
	"brasmar/bra/controloqualidade/controloqual1/test/integration/pages/CQLinhasObjectPage"
], function (JourneyRunner, CQCabList, CQCabObjectPage, CQLinhasObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('brasmar/bra/controloqualidade/controloqual1') + '/test/flp.html#app-preview',
        pages: {
			onTheCQCabList: CQCabList,
			onTheCQCabObjectPage: CQCabObjectPage,
			onTheCQLinhasObjectPage: CQLinhasObjectPage
        },
        async: true
    });

    return runner;
});

