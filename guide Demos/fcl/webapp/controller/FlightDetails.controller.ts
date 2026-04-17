import Event from "sap/ui/base/Event";
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";

export default class FlightDetails extends Controller {
    private sParentPath: string;


    public onInit(): void {
        let oRouter = (this.getOwnerComponent() as UIComponent).getRouter(),
            oRoute = oRouter.getRoute("RouteFlightDetails");
        oRoute?.attachPatternMatched(this.onPatternMatched, this);
    }


    private onPatternMatched(oEvent: Event) {
        let oArguments = (oEvent as any).getParameters().arguments,
            sPath = decodeURIComponent(oArguments.path2);
        this.getView()?.bindElement({
            path: sPath,
            parameters: { "$expand": "flightBookings" }
        });
        this.sParentPath = oArguments.path;
    }


    private handleFullScreen() {
        let sNextLayout = (this.getOwnerComponent()?.getModel("ui") as JSONModel).getProperty("/actionButtonsInfo/endColumn/fullScreen"),
            sPath = this.getView()?.getElementBinding()?.getPath();
        (this.getOwnerComponent() as UIComponent).getRouter().navTo("RouteCarrierDetails", {
            path: encodeURIComponent(sPath ? sPath : ""),
            path2: this.sParentPath,
            "?query": { layout: sNextLayout }
        });
    }


    private handleExitFullScreen() {
        let sNextLayout = (this.getOwnerComponent()?.getModel("ui") as JSONModel).getProperty("/actionButtonsInfo/endColumn/exitFullScreen"),
            sPath = this.getView()?.getElementBinding()?.getPath();
        (this.getOwnerComponent() as UIComponent).getRouter().navTo("RouteCarrierDetails", {
            path: encodeURIComponent(sPath ? sPath : ""),
            path2: this.sParentPath,
            "?query": { layout: sNextLayout }
        });
    }

    private handleClose() {
        let sNextLayout = (this.getOwnerComponent()?.getModel("ui") as JSONModel).getProperty("/actionButtonsInfo/endColumn/closeColumn");
        (this.getOwnerComponent() as UIComponent).getRouter().navTo("RouteCarrierDetails", {
            path: this.sParentPath,
            query: { layout: sNextLayout }
        });
        this.getOwnerComponent()?.getEventBus().publish("CarrierDetails", "resetSelection");
    }
}