sap.ui.define(['sap/fe/test/ObjectPage'], function(ObjectPage) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ObjectPage(
        {
            appId: 'brasmar.bra.controloqualidade.controloqual1',
            componentId: 'CQCabObjectPage',
            contextPath: '/CQCab'
        },
        CustomPageDefinitions
    );
});