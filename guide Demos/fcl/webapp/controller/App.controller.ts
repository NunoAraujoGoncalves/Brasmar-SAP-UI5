import FlexibleColumnLayout from "sap/f/FlexibleColumnLayout";
import Event from "sap/ui/base/Event";
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace brasmar.teste.fcl.controller
 */
export default class App extends Controller {

    private oFCL: FlexibleColumnLayout;

    public onInit(): void {
        let oOwnerComponent = (this.getOwnerComponent() as UIComponent);
        oOwnerComponent.getRouter().attachRouteMatched(this.onRouteMatched, this);
        oOwnerComponent.setModel(new JSONModel({ layout: "OneColumn" }), "ui");
        this.oFCL = this.getView()?.byId("fcl") as FlexibleColumnLayout;
    }

    private onRouteMatched(oEvent: Event) {
        let sLayout = (oEvent as any).getParameters().arguments["?query"]?.layout;
        if (!sLayout) {
            // sLayout = "OneColumn"
            let oNextUIState = (this.getOwnerComponent() as any).getHelper().getNextUIState(0);
            sLayout = oNextUIState.layout;
        }
        else {
            ((this.getOwnerComponent() as UIComponent).getModel("ui") as JSONModel).setProperty("/layout", sLayout);
        }
        let oActionButtonsInfo = (this.getOwnerComponent()  as any).getHelper().getCurrentUIState().actionButtonsInfo;
        (this.getOwnerComponent()?.getModel("ui") as JSONModel ).setProperty("/actionButtonsInfo", oActionButtonsInfo);
    }
}