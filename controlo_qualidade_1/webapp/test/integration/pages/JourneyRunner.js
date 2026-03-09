sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"controlo/qualidade1/controloqualidade1/test/integration/pages/CQCabList",
	"controlo/qualidade1/controloqualidade1/test/integration/pages/CQCabObjectPage",
	"controlo/qualidade1/controloqualidade1/test/integration/pages/CQLinhasObjectPage"
], function (JourneyRunner, CQCabList, CQCabObjectPage, CQLinhasObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('controlo/qualidade1/controloqualidade1') + '/test/flp.html#app-preview',
        pages: {
			onTheCQCabList: CQCabList,
			onTheCQCabObjectPage: CQCabObjectPage,
			onTheCQLinhasObjectPage: CQLinhasObjectPage
        },
        async: true
    });

    return runner;
});

