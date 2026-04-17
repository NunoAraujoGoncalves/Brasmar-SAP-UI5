import List from "sap/m/List";
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";

/**
 * @namespace brasmar.teste.fcl.controller
 */
export default class Carrier extends Controller {

    public onInit(): void {
        this.getOwnerComponent()?.getEventBus().subscribe(
            "Carrier",
            "resetSelection",
            () => {
                (this.getView()?.byId("carrierList") as List).removeSelections(true);
            });
    }


    private onNavToDetail(oEvent: Event) {
        let oBindingContext = (oEvent as any).getParameters().listItem.getBindingContext(),
            sPath = oBindingContext?.getPath(),
            oNextUIState = (this.getOwnerComponent() as any).getHelper().getNextUIState(1),
            oRouter = (this.getOwnerComponent() as UIComponent).getRouter();
        oRouter.navTo("RouteCarrierDetails", {
            path: encodeURIComponent(sPath),
            query: { layout: oNextUIState.layout }
        });
    }
}