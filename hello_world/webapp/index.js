sap.ui.define(["sap/ui/core/ComponentContainer"], function (ComponentContainer) {
  "use strict";

  var oContainer = new ComponentContainer({
    id: "Container",
    name: "sap.training.exc",
    manifest: true,
    asunc: true,
    settings: {
        id: "sap.training.exc"
    }
  });
  oContainer.placeAt("content");
});