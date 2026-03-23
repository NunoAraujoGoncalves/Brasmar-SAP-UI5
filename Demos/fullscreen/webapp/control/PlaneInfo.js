
sap.ui.define([
    "sap/ui/core/Control",
    "student/com/sap/training/advancedsapui5/fullscreen/control/PlaneInfoRenderer"
],

    function (Control, PlaneInfoRenderer) {
        "use strict";

        return Control.extend("student.com.sap.training.advancedsapui5.fullscreen.control.PlaneInfo", {

            metadata: {
                properties: {
                    "seatsMax": {
                        type: "string"
                    },
                    "seatsOcc": {
                        type: "string"
                    }
                }
            },
            renderer: PlaneInfoRenderer
        });
    }
);
