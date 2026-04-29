import Controller from "sap/fe/core/PageController";
import FilterBar from "sap/fe/macros/filterBar/FilterBarAPI";
import Table, { TableCreationOptions } from "sap/fe/macros/table/TableAPI";
import IconTabBar from "sap/m/IconTabBar";
import IconTabFilter from "sap/m/IconTabFilter";
import Event from "sap/ui/base/Event";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

/**
 * @namespace brasmar.bm01.controloqualidade3.ext.main
 */
export default class Main extends Controller {

    /**
     * Called when a controller is instantiated and its View controls (if available) are already created.
     * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
     * @memberOf brasmar.bm01.controloqualidade3.ext.main.Main
     */
    public onInit(): void {
        super.onInit(); // needs to be called to properly initialize the page controller

        let oIconTabBar = (this.getView()?.byId("mainIconTabBar") as IconTabBar);
        oIconTabBar.setSelectedKey("pendentes").fireSelect();
    }

    private async onFilterSelect(oEvent: Event) {
        let oFilterSelect = (this.getView()?.byId("filterCQ") as FilterBar),
            sKey = (oEvent as any).getParameter("key");

        // oModel = (this.getView()?.getModel() as ODataModel),
        // oListBinding = oModel.bindList("/CQCab"),
        // oTabFilter: IconTabFilter;

        // oListBinding.changeParameters({ $count: true });
        console.log(sKey)
        if (sKey === 'all') {
            await oFilterSelect.setFilterValues("Estado", "", []);


            // oTabFilter = this.getView()?.byId("mainFilterTodos") as IconTabFilter;
            // oListBinding.requestContexts().then((result) => {
            //     console.log(oListBinding.getCount());
            //     oTabFilter.setCount(oListBinding.getCount()?.toString());
            // });

        } else if (sKey === 'pendentes' || !sKey) {
            await oFilterSelect.setFilterValues("Estado", "", ["A"]);
            // oFilterSelect.triggerSearch();

            // oTabFilter = this.getView()?.byId("mainFilterPendentes") as IconTabFilter;
            // oListBinding.requestContexts().then((result) => {
            //     console.log(oListBinding.getCount());
            //     oTabFilter.setCount(oListBinding.getCount()?.toString());
            // });
        } else if (sKey === 'concluidos') {
            await oFilterSelect.setFilterValues("Estado", "", ["B"]);
            // oFilterSelect.triggerSearch();

            // oTabFilter = this.getView()?.byId("mainFilterConcluidos") as IconTabFilter;
            // oListBinding.requestContexts().then((result) => {
            //     console.log(oListBinding.getCount());
            //     oTabFilter.setCount(oListBinding.getCount()?.toString());
            // });
        }
        oFilterSelect.triggerSearch();

    }




    /**
     * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
     * (NOT before the first rendering! onInit() is used for that one!).
     * @memberOf brasmar.bm01.controloqualidade3.ext.main.Main
     */
    // public  onBeforeRendering(): void {
    //
    //  }

    /**
     * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
     * This hook is the same one that SAPUI5 controls get after being rendered.
     * @memberOf brasmar.bm01.controloqualidade3.ext.main.Main
     */
    // public  onAfterRendering(): void {
    //
    //  }

    /**
     * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
     * @memberOf brasmar.bm01.controloqualidade3.ext.main.Main
     */
    // public onExit(): void {
    //
    //  }
}