sap.ui.define(['sap/fe/test/ListReport'], function(ListReport) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ListReport(
        {
            appId: 'controlo.qualidade1.controloqualidade1',
            componentId: 'CQCabList',
            contextPath: '/CQCab'
        },
        CustomPageDefinitions
    );
});