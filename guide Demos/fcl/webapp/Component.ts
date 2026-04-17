import BaseComponent from "sap/ui/core/UIComponent";
import { createDeviceModel } from "./model/models";
import FlexibleColumnLayout from "sap/f/FlexibleColumnLayout";
import { LayoutType } from "sap/f/library";
import FlexibleColumnLayoutSemanticHelper from "sap/f/FlexibleColumnLayoutSemanticHelper";

/**
 * @namespace brasmar.teste.fcl
 */
export default class Component extends BaseComponent {

    public static metadata = {
        manifest: "json",
        interfaces: [
            "sap.ui.core.IAsyncContentCreation"
        ]
    };

    public init(): void {
        // call the base component's init function
        super.init();

        // set the device model
        this.setModel(createDeviceModel(), "device");

        // enable routing
        this.getRouter().initialize();
    }

    public getHelper() {
        let oFCL = (this.getRootControl() as any).byId("fcl") as FlexibleColumnLayout,
            oParams = new URLSearchParams(window.location.search),
            oSettings = {
                defaultTwoColumnLayoutType: LayoutType.TwoColumnsMidExpanded,
                defaultThreeColumnLayoutType: LayoutType.ThreeColumnsMidExpanded,
                maxColumnsCount: oParams.get("max")
            };
        return FlexibleColumnLayoutSemanticHelper.getInstanceFor(oFCL, oSettings);
    }
}