import Controller from "sap/fe/core/PageController";
import Event from "sap/ui/base/Event";
import FilterBar from "sap/fe/macros/filterBar/FilterBarAPI";

/**
 * @namespace brasmar.bm01.controloqualidade4.ext.main
 */
export default class Main extends Controller {

    /**
     * Called when a controller is instantiated and its View controls (if available) are already created.
     * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
     * @memberOf brasmar.bm01.controloqualidade4.ext.main.Main
     */
    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller
    }

    onFilterSelect(oEvent: Event) {
        let sKey = (oEvent as any).getParameter("key"),
            oFilterSelect = (this.getView()?.byId("main_filter") as FilterBar);

        this.setStatusFilter(sKey);
    }

    private async setStatusFilter(oKey: string) {
        let oFilterSelect = (this.getView()?.byId("main_filter") as FilterBar);

        if (oKey === 'all') {
            await oFilterSelect.setFilterValues("Estado", "", []);

        } else if (oKey === 'pendentes') {
            await oFilterSelect.setFilterValues("Estado", "", ["A"]);

        } else if (oKey === 'concluidos') {
            await oFilterSelect.setFilterValues("Estado", "", ["B"]);

        } else if (oKey === 'aprovados') {
            await oFilterSelect.setFilterValues("Estado", "", ["C"]);
        }
        oFilterSelect.triggerSearch();
    }


    /**
     * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
     * (NOT before the first rendering! onInit() is used for that one!).
     * @memberOf brasmar.bm01.controloqualidade4.ext.main.Main
     */
    // public  onBeforeRendering(): void {
    //
    //  }

    /**
     * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
     * This hook is the same one that SAPUI5 controls get after being rendered.
     * @memberOf brasmar.bm01.controloqualidade4.ext.main.Main
     */
    // public  onAfterRendering(): void {
    //
    //  }

    /**
     * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
     * @memberOf brasmar.bm01.controloqualidade4.ext.main.Main
     */
    // public onExit(): void {
    //
    //  }
}