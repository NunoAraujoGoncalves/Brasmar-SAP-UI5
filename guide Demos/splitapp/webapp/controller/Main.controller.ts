import List from "sap/m/List";
import ListItemBase from "sap/m/ListItemBase";
import Page from "sap/m/Page";
import Event from "sap/ui/base/Event";
import Controller from "sap/ui/core/mvc/Controller";
import UIComponent from "sap/ui/core/UIComponent";
import ODataModel from "sap/ui/model/odata/v2/ODataModel";

/**
 * @namespace brasmar.teste.splitapp.controller
 */
export default class Main extends Controller {

    public onInit(): void {
        let oRouter = (this.getOwnerComponent() as UIComponent).getRouter(),
            oRoute = oRouter.getRoute("RouteMain");
        oRoute?.attachPatternMatched(this.onPatternMatched, this);
    }

    private sInitialPath = "";
    private onPatternMatched(oEvent: Event) {
        let oArguments = (oEvent as any).getParameters().arguments;
        if (oArguments["?query"] && oArguments["?query"].path) {
            this.sInitialPath = decodeURIComponent(oArguments["?query"].path);
        }
    }


    private onNavToDetail(oEvent: Event) {
        let oBindindContext = (oEvent as any).getParameters().listItem.getBindingContext(),
            // .getSource().getBindingContext(), 
            oObject = oBindindContext?.getObject(),
            sPath = oBindindContext?.getPath(),
            oDetailPage = this.getView()?.byId("detail") as Page,
            oRouter = (this.getOwnerComponent() as UIComponent).getRouter();
        oDetailPage.bindElement({ path: sPath, parameters: { "$expand": 'carrierFlights' } });
        oRouter.navTo("RouteMain", {
            query: { path: encodeURIComponent(sPath) }
        });
    }

    private bInitial = true;
    private onDataReceived(oEvent: Event) {
        let oList = this.getView()?.byId("carrierList") as List,
            aItems = oList.getItems();
        if (aItems.length > 0 && this.bInitial) {
            let oDetailPage = this.getView()?.byId("detail") as Page,
                oModel = this.getView()?.getModel() as ODataModel,
                oFirstItem: ListItemBase,
                sPath = "";
            if (this.sInitialPath) {
                let aFilteredItems = aItems.filter(
                    (oItem) => oItem.getBindingContext()?.getPath() === this.sInitialPath);
                if (aFilteredItems.length > 0) {
                    oFirstItem = aFilteredItems[0];
                    sPath = this.sInitialPath;
                } else {
                    oFirstItem = aItems[0];
                    sPath = oFirstItem.getBindingContext()?.getPath() as string;
                }
            } else {
                oFirstItem = aItems[0];
                sPath = oFirstItem.getBindingContext()?.getPath() as string;
            }
            oDetailPage.bindElement({ path: sPath, parameters: { "$expand": 'carrierFlights' } });
            oList.setSelectedItem(oFirstItem);
            this.bInitial = false;
        }

        // let oFirstItem = (oEvent as any).getParameters().data.results[0];
        // if (oFirstItem && this.bInitial) {
        //     let oDetailPage = this.getView()?.byId("detail") as Page,
        //         oModel = this.getView()?.getModel() as ODataModel,
        //         sPath = oModel.createKey("/CarrierCollection", { carrid: oFirstItem.carrid });
        //     oDetailPage.bindElement(sPath);
        //     this.bInitial = false;
        // }
    }

    private onRefreshList() {
        let oListBinding = this.getView()?.byId("carrierList")?.getBinding("items");
        oListBinding?.refresh();
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

}