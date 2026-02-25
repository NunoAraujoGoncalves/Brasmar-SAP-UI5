sap.ui.define(['sap/fe/test/ListReport'], function(ListReport) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ListReport(
        {
            appId: 'brasmar.bra.controloqualidade.controloqual1',
            componentId: 'CQCabList',
            contextPath: '/CQCab'
        },
        CustomPageDefinitions
    );
});