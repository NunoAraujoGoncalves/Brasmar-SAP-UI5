import Controller from "sap/fe/core/PageController";
import Formatter from "../modules/Formatter";
import { GenericTag$PressEvent } from "sap/m/GenericTag";
import Fragment from "sap/ui/core/Fragment";
import Popover from "sap/m/Popover";

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.view
 */
export default class CQDetail extends Controller {

    formatter = new Formatter();
    oPopover: Promise<Popover> | undefined;

    onGenericTagPress(oEvent: GenericTag$PressEvent) {
        const oView = this.getView(),
            oSourceControl = oEvent.getSource();

        if (!this.oPopover) {
            this.oPopover = Fragment.load({
                id: oView?.getId(),
                name: "brasmar.bm01.controloqualidade4.ext.fragments.IDTag",
                controller: this
            }) as Promise<Popover>;
            this.oPopover.then((_Popover) => {
                oView?.addDependent(_Popover);
            })
        }

        this.oPopover.then((_Popover) => {
            _Popover.openBy(oSourceControl);
        });

    }

    /**
     * Called when a controller is instantiated and its View controls (if available) are already created.
     * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
     * @memberOf brasmar.bm01.controloqualidade4.ext.view.CQDetail
     */
    // public onInit(): void {
    //     super.onInit(); // needs to be called to properly initialize the page controller
    //}

    /**
     * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
     * (NOT before the first rendering! onInit() is used for that one!).
     * @memberOf brasmar.bm01.controloqualidade4.ext.view.CQDetail
     */
    // public  onBeforeRendering(): void {
    //
    //  }

    /**
     * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
     * This hook is the same one that SAPUI5 controls get after being rendered.
     * @memberOf brasmar.bm01.controloqualidade4.ext.view.CQDetail
     */
    // public  onAfterRendering(): void {
    //
    //  }

    /**
     * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
     * @memberOf brasmar.bm01.controloqualidade4.ext.view.CQDetail
     */
    // public onExit(): void {
    //
    //  }
}