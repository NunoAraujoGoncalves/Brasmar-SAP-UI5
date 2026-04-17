import Table from "sap/m/Table";
import Event from "sap/ui/base/Event";
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";


export default class CarrierDetail extends Controller {
    public onInit(): void {
        let oRouter = (this.getOwnerComponent() as UIComponent).getRouter(),
            oRoute = oRouter.getRoute("RouteCarrierDetails"),
            oFlightRoute = oRouter.getRoute("RouteFlightDetails");
        oRoute?.attachPatternMatched(this.onPatternMatched, this);
        oFlightRoute?.attachPatternMatched(this.onPatternMatched, this);
        this.getOwnerComponent()?.getEventBus().subscribe(
            "CarrierDetails",
            "resetSelection",
            () => {
                (this.getView()?.byId("tableFlights") as Table).removeSelections(true);
            });
    }


    private onPatternMatched(oEvent: Event) {
        let oArguments = (oEvent as any).getParameters().arguments,
            sPath = decodeURIComponent(oArguments.path);
        this.getView()?.bindElement({
            path: sPath,
            parameters: { "$expand": 'carrierFlights' }
        });
    }


    private stateAvSeats(seats: int, seatsocc: int): string {
        let iDiff = seats - seatsocc;
        if (iDiff <= 15) { return "Error"; }
        else if (iDiff <= 25) { return "Warning"; }
        else { return "Success"; }
    }


    private iconAvSeats(seats: int, seatsocc: int): string {
        let iDiff = seats - seatsocc;
        if (iDiff <= 15) { return "sap-icon://message-error"; }
        else if (iDiff <= 25) { return "sap-icon://message-warning"; }
        else { return "sap-icon://message-success"; }
    }

    private onNavToFlightDetail(oEvent: Event) {
        let oBindingContext = (oEvent as any).getParameters().listItem.getBindingContext(),
            sPath = oBindingContext?.getPath(),
            oNextUIState = (this.getOwnerComponent() as any).getHelper().getNextUIState(2),
            oRouter = (this.getOwnerComponent() as UIComponent).getRouter(),
            oPath = this.getView()?.getElementBinding()?.getPath();
        oRouter.navTo("RouteFlightDetails", {
            path: encodeURIComponent(oPath ? oPath : ""),
            path2: encodeURIComponent(sPath),
            query: { layout: oNextUIState.layout }
        });
    }

    private handleFullScreen() {
        let sNextLayout = (this.getOwnerComponent()?.getModel("ui") as JSONModel).getProperty("/actionButtonsInfo/midColumn/fullScreen"),
            oPath = this.getView()?.getElementBinding()?.getPath();
        (this.getOwnerComponent() as UIComponent).getRouter().navTo("RouteCarrierDetails", {
            path: encodeURIComponent(oPath ? oPath : ""),
            query: { layout: sNextLayout }
        });
    }

    private handleExitFullScreen() {
        let sNextLayout = (this.getOwnerComponent()?.getModel("ui") as JSONModel).getProperty("/actionButtonsInfo/midColumn/exitFullScreen"),
            oPath = this.getView()?.getElementBinding()?.getPath();
        (this.getOwnerComponent() as UIComponent).getRouter().navTo("RouteCarrier", {
            path: encodeURIComponent(oPath ? oPath : ""),
            query: { layout: sNextLayout }
        });
    }

    private handleClose() {
        this.getOwnerComponent()?.getEventBus().publish("Carrier", "resetSelection");
        let sNextLayout = (this.getOwnerComponent()?.getModel("ui") as JSONModel).getProperty("/actionButtonsInfo/midColumn/closeColumn");
        (this.getOwnerComponent() as UIComponent).getRouter().navTo("RouteCarrier", {
            query: { layout: sNextLayout }
        });
    }

}