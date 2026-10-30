# CQLinhaDetail.controller.ts – cleanup

## Goal
Tidy `webapp/ext/view/CQLinhaDetail.controller.ts` after the multi-instance and navigation work. **No behaviour
changes**, except where a row below says otherwise. The file goes from 988 to 952 lines.

The cleaned file was built from the **current working tree** and compiles with the project's `strict` settings. It also
compiles with `--noUnusedLocals --noUnusedParameters`. Before the cleanup, those two flags reported 8 unused
parameters, and the cleanup itself left one import unused (`UI5Element`), which it removes.

## Changes
| # | Where | Change | Why |
|---|---|---|---|
| 1 | `navigateAndWait` | Remove the two `console.log("bound"/"loaded")` | Debug output from testing the fallback |
| 2 | `AMOSTRA_NAVIGATION_TIMEOUT_MS` | `10000` → `20000` (as in Navigation.md fallback v2) | Wait for data + FE's 7 s PageReady can exceed 10 s. The queue would then unlock early and allow the overlap that caused the stuck busy. See note below. |
| 3 | `amostraBound` field | Add the doc comment | Same style as the other fields |
| 4 | `onFilterSelect` | `switch` with 9 branches → `SECTION_TITLES` map + 3 lines | Same mapping, including the `Amostra` default. No longer calls `scrollToElement(undefined)` if an id is missing. `UI5Element` import no longer needed |
| 5 | `onCalcular`, `onGetMp`, `onApply` | New helper `withBusy(control, action)` | `setBusy(false)` now sits in a `finally`. Errors are still swallowed, because FE already shows the action's message, as before. `onApply` still runs `applyDocument` after the calculations |
| 6 | `onBalancaConfig`, `openBalancaDialog` | New helper `loadDialog(name)` + `??=` | Same `Fragment.load` + `addDependent` code was written twice |
| 7 | `onPesoCxBalanca`, `onPesoVidPlBalanca`, `onPesoVidPleBalanca` | `return this.onPesoLinhaBalanca(...)`, without `async` | The promise wasn't awaited before, so errors were lost |
| 8 | 4× `String((error as Error)?.message ?? error)` | New helper `errorDetails(error)` | Repeated code |
| 9 | 3× `currentPesoCollection.replace(/^balanca>/, "")` | New helper `getPesoPath()` | Repeated code |
| 10 | `onPressBalancaDelete` | `Set` of selected paths + `filter` | Same result without parsing indexes, sorting and `splice`. **Small behaviour change:** the model gets a new array instead of the same one mutated. The table still updates, because `setProperty` is called either way |
| 11 | `toEntityData` | `const uom = row.uom \|\| "G"` | The two ternaries repeated each object only to default the uom |
| 12 | Unused `oEvent` parameters (8 handlers); `async` without `await` (`onBalancaBeforeOpen`, `onPressCloseDialog`, `onPressBalancaEnd`, `onTestStart`) | Removed | UI5 still passes the event; the handler just ignores it. The handlers stay referenced from `Balanca.fragment.xml` / the view by the same names |
| 13 | `this.getView()?.byId(...)` (3×) | `this.byId(...)` | Same as the rest of the controller |

**Note on #2:** your code still has `10000` and the fix works. 20 s only matters when one amostra takes more than
10 s to load. With 10 s, that case would bring the stuck busy back. If 10 s has been fine in practice, keeping it is a
valid choice.

## Not changed (considered)
- **Navigation methods outside their section.**
  - `navigateToPath`, `navigateAndWait`, `waitForAmostraBound` and `selectAmostraTab` sit under "helpers", between
    `getBalancaModel` and `addPesagem`.
  - Moving them up into the "Multi-instância" section would group all tab code. It isn't in the diff, to keep the diff
    readable; it's a pure cut and paste.
- **`private` on the multi-instance fields** (`amostraNavigation`, `pendingAmostraPath`, `selectingAmostraTab`,
  `amostraTabTimer`, `amostraBound`). Only this controller uses them, so they can be `private`. The other fields of the
  class are public too, so this is left for consistency.
- **The redundant `context?.getPath() === path` check in `navigateAndWait`.** After `await bound` it is always true,
  except when the safety timeout wins. It costs nothing and protects that case, so it stays.
- **`onTestStart` / `iTimer`** (the test with fake weights): left as is. If it's no longer needed, remove the button,
  the method, `iTimer` and the `clearInterval` block in `stopWeighing`.
- **`MultiInstance` key in i18n.** `onAmostraAdd` still passes `[linha]` to `multiInstance.msg.created`, which is harmless (see Navigation.md §5).

## Diff
The diff runs against the current `CQLinhaDetail.controller.ts`. Apply it by hand, or save it as a `.diff` file and run
`git apply` from the `controloqualidade4` folder.

```diff
--- a/webapp/ext/view/CQLinhaDetail.controller.ts
+++ b/webapp/ext/view/CQLinhaDetail.controller.ts
@@ -3,5 +3,4 @@ import Formatter from "../modules/Formatter";
 import { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
 import ScrollContainer from "sap/m/ScrollContainer";
-import UI5Element from "sap/ui/core/Element";
 import EditHelper from "../modules/EditHelper";
 import { Actions } from "../modules/Constants";
@@ -39,10 +38,22 @@ type PesagemNavigation = "_PesosUn" | "_Calibres";
 const ROW_WEIGHING_TIMEOUT_MS = 20000;
 
-/** Tempo máximo à espera de uma navegação entre separadores de amostras */
-const AMOSTRA_NAVIGATION_TIMEOUT_MS = 10000;
+/** Tempo máximo à espera de uma navegação entre separadores de amostras (o PageReady do FE desiste aos 7 s) */
+const AMOSTRA_NAVIGATION_TIMEOUT_MS = 20000;
 
 /** Pausa nos cliques dos separadores antes de navegar: cliques rápidos só carregam a última amostra */
 const AMOSTRA_TAB_DEBOUNCE_MS = 300;
 
+/** Separador do IconTabBar -> título da secção para onde se faz scroll */
+const SECTION_TITLES: Record<string, string> = {
+    Amostra: "CQDetailLinha_amostra_title",
+    PerdaPeso: "CQDetailLinha_perdaPeso_title",
+    Pesos: "CQDetailLinha_Peso_title",
+    PesoCx: "CQDetailLinha_Peso_title",
+    PesoUn: "CQDetailLinha_PesoUn",
+    Vidragens: "CQDetailLinha_vidragem_title",
+    Calibres: "CQDetailLinha_calibre_title",
+    Temperaturas: "CQDetailLinha_Temperaturas_title"
+};
+
 /**
  * @namespace brasmar.bm01.controloqualidade4.ext.view
@@ -73,4 +84,5 @@ export default class CQLinhaDetail extends Controller {
     /** espera entre cliques nos separadores (só o último navega) */
     amostraTabTimer?: ReturnType<typeof setTimeout>;
+    /** navegação à espera que o FE ligue a página a esta amostra (resolvida em onAmostraContextChange) */
     amostraBound?: { path: string; resolve: () => void };
 
@@ -114,55 +126,19 @@ export default class CQLinhaDetail extends Controller {
 
     public onFilterSelect(oEvent: IconTabBar$SelectEvent) {
-        const sKey = oEvent.getParameter("key") as string;
-
-        const oScrollContainer = this.byId("CQDetailLinha_Content_scroll") as ScrollContainer;
-        if (!oScrollContainer) { return; }
-
-        let oElement: UI5Element;
-        switch (sKey) {
-            case "Amostra":
-                oElement = this.byId("CQDetailLinha_amostra_title") as UI5Element;
-                break;
-            case "PerdaPeso":
-                oElement = this.byId("CQDetailLinha_perdaPeso_title") as UI5Element;
-                break;
-            case "Pesos":
-                oElement = this.byId("CQDetailLinha_Peso_title") as UI5Element;
-                break;
-            case "PesoCx":
-                oElement = this.byId("CQDetailLinha_Peso_title") as UI5Element;
-                break;
-            case "PesoUn":
-                oElement = this.byId("CQDetailLinha_PesoUn") as UI5Element;
-                break;
-            case "Vidragens":
-                oElement = this.byId("CQDetailLinha_vidragem_title") as UI5Element;
-                break;
-            case "Calibres":
-                oElement = this.byId("CQDetailLinha_calibre_title") as UI5Element;
-                break;
-            case "Temperaturas":
-                oElement = this.byId("CQDetailLinha_Temperaturas_title") as UI5Element;
-                break;
-            default:
-                oElement = this.byId("CQDetailLinha_amostra_title") as UI5Element;
+        const key = oEvent.getParameter("key") as string;
+        const scrollContainer = this.byId("CQDetailLinha_Content_scroll") as ScrollContainer | undefined;
+        const element = this.byId(SECTION_TITLES[key] ?? SECTION_TITLES.Amostra);
+        if (scrollContainer && element) {
+            scrollContainer.scrollToElement(element, 400);
         }
-
-        oScrollContainer.scrollToElement(oElement, 400);
     }
 
     /* ---------- Header Functions ---------- */
     public async onCalcular(): Promise<void> {
-        const oContainer = this.getView()?.byId("CQDetailLinha_Content_scroll") as ScrollContainer;
-        oContainer.setBusy(true);
-
-        try {
-            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.doCalculations, {
+        await this.withBusy(this.byId("CQDetailLinha_Content_scroll") as ScrollContainer, () =>
+            this.getExtensionAPI().getEditFlow().invokeAction(Actions.doCalculations, {
                 contexts: this.getContext(),
                 label: this.getText("CQLinhaDetail.btn.Calcular")
-            });
-        } catch (error) { }
-
-        oContainer.setBusy(false);
+            }));
     }
 
@@ -184,16 +160,10 @@ export default class CQLinhaDetail extends Controller {
 
     public async onGetMp(): Promise<void> {
-        const page = this.byId("CQDetailLinha_dynamicPage") as DynamicPage;
-        page.setBusy(true);
-
-        try {
-            await this.getExtensionAPI().getEditFlow().invokeAction(Actions.getMp, {
+        await this.withBusy(this.byId("CQDetailLinha_dynamicPage") as DynamicPage, () =>
+            this.getExtensionAPI().getEditFlow().invokeAction(Actions.getMp, {
                 contexts: this.getContext(),
                 invocationGrouping: "Isolated",
                 label: this.getText("cqDetail.amostragens.subsection.mps.btn.getMp")
-            })
-        } catch (error) { }
-
-        page.setBusy(false);
+            }));
     }
 
@@ -205,13 +175,5 @@ export default class CQLinhaDetail extends Controller {
      */
     public async onBalancaConfig(): Promise<void> {
-        if (!this.serialDialog) {
-            this.serialDialog = await Fragment.load({
-                id: this.getView()?.getId(),
-                name: "brasmar.bm01.controloqualidade4.ext.fragments.BalancaConfig",
-                controller: this
-            }) as Dialog;
-            this.getView()?.addDependent(this.serialDialog);
-        }
-
+        this.serialDialog ??= await this.loadDialog("BalancaConfig");
         this.serialDialog.open();
         try {
@@ -281,14 +243,14 @@ export default class CQLinhaDetail extends Controller {
      * e escreve-a no Pb dessa linha (draft). Depois pede os side effects do Pb (Pl, Declarado, Ple).
      */
-    public async onPesoCxBalanca(oEvent: Button$PressEvent): Promise<void> {
-        this.onPesoLinhaBalanca(oEvent, "Pb");
+    public onPesoCxBalanca(oEvent: Button$PressEvent): Promise<void> {
+        return this.onPesoLinhaBalanca(oEvent, "Pb");
     }
 
-    public async onPesoVidPlBalanca(oEvent: Button$PressEvent): Promise<void> {
-        this.onPesoLinhaBalanca(oEvent, "Pl");
+    public onPesoVidPlBalanca(oEvent: Button$PressEvent): Promise<void> {
+        return this.onPesoLinhaBalanca(oEvent, "Pl");
     }
 
-    public async onPesoVidPleBalanca(oEvent: Button$PressEvent): Promise<void> {
-        this.onPesoLinhaBalanca(oEvent, "Ple");
+    public onPesoVidPleBalanca(oEvent: Button$PressEvent): Promise<void> {
+        return this.onPesoLinhaBalanca(oEvent, "Ple");
     }
 
@@ -327,7 +289,5 @@ export default class CQLinhaDetail extends Controller {
                 MessageToast.show(this.getText("BalancaLinha.msg.done", [text]));
             } catch (error) {
-                MessageBox.error(this.getText("BalancaLinha.error.write", [text]), {
-                    details: String((error as Error)?.message ?? error)
-                });
+                MessageBox.error(this.getText("BalancaLinha.error.write", [text]), { details: this.errorDetails(error) });
             }
         } finally {
@@ -338,6 +298,6 @@ export default class CQLinhaDetail extends Controller {
 
     /* ---------- Balanças Functions ---------- */
-    public async onBalancaBeforeOpen(): Promise<void> {
-        const pesoTable = this.getView()?.byId("BalancaDialog_table") as Table;
+    public onBalancaBeforeOpen(): void {
+        const pesoTable = this.byId("BalancaDialog_table") as Table;
         pesoTable.bindItems({
             model: "balanca",
@@ -366,12 +326,5 @@ export default class CQLinhaDetail extends Controller {
 
     private async openBalancaDialog(collection: string, uomProperty: string, navigation: PesagemNavigation): Promise<void> {
-        if (!this.balancaDialog) {
-            this.balancaDialog = await Fragment.load({
-                id: this.getView()?.getId(),
-                name: "brasmar.bm01.controloqualidade4.ext.fragments.Balanca",
-                controller: this
-            }) as Dialog;
-            this.getView()?.addDependent(this.balancaDialog);
-        }
+        this.balancaDialog ??= await this.loadDialog("Balanca");
         this.currentPesoCollection = collection;
         this.currentPesoUom = uomProperty;
@@ -390,19 +343,18 @@ export default class CQLinhaDetail extends Controller {
     }
 
-    public async onPesoUnBalanca(oEvent: Button$PressEvent): Promise<void> {
+    public async onPesoUnBalanca(): Promise<void> {
         await this.openBalancaDialog("balanca>/PesosUn", "UnUom", "_PesosUn");
     }
 
-    public async onPesoCalibreBalanca(oEvent: Button$PressEvent): Promise<void> {
+    public async onPesoCalibreBalanca(): Promise<void> {
         await this.openBalancaDialog("balanca>/Calibres", "CalibreUom", "_Calibres");
     }
 
-    public async onPressCloseDialog(oEvent: Button$PressEvent): Promise<void> {
+    public onPressCloseDialog(): void {
         this.balancaDialog.close();
     }
 
-
     /** Test function com pesos ficticios para testar outras fms sem balanca */
-    public async onTestStart(oEvent: Button$PressEvent): Promise<void> {
+    public onTestStart(): void {
         let pesoTeste = 0.200;
         this.getBalancaModel().setProperty("/reading", true);
@@ -418,5 +370,5 @@ export default class CQLinhaDetail extends Controller {
      * guardados) e passa a adicionar uma linha por cada produto pesado.
      */
-    public async onPressBalancaStart(oEvent: Button$PressEvent): Promise<void> {
+    public async onPressBalancaStart(): Promise<void> {
         if (this.stopReading) {
             return;
@@ -442,5 +394,5 @@ export default class CQLinhaDetail extends Controller {
     }
 
-    public async onPressBalancaEnd(oEvent: Button$PressEvent): Promise<void> {
+    public onPressBalancaEnd(): void {
         this.stopWeighing();
     }
@@ -456,7 +408,7 @@ export default class CQLinhaDetail extends Controller {
      * Só fecha o dialog se todas forem gravadas; as que falharem ficam para tentar de novo.
      */
-    public async onPressOkayDialog(oEvent: Button$PressEvent): Promise<void> {
+    public async onPressOkayDialog(): Promise<void> {
         const model = this.getBalancaModel();
-        const path = this.currentPesoCollection.replace(/^balanca>/, "");
+        const path = this.getPesoPath();
         const navigation = this.currentNavigation;
         const rows = (model.getProperty(path) as Pesagem[] | undefined) ?? [];
@@ -520,12 +472,10 @@ export default class CQLinhaDetail extends Controller {
                 const reasons = results
                     .filter((result): result is PromiseRejectedResult => result.status === "rejected")
-                    .map((result) => String((result.reason as Error)?.message ?? result.reason));
+                    .map((result) => this.errorDetails(result.reason));
                 MessageBox.error(this.getText("BalancaDialog.error.createFailed", [String(failed.length)]),
                     { details: reasons.join("\n") });
             }
         } catch (error) {
-            MessageBox.error(this.getText("BalancaDialog.error.createFailed", [String(rows.length)]), {
-                details: String((error as Error)?.message ?? error)
-            });
+            MessageBox.error(this.getText("BalancaDialog.error.createFailed", [String(rows.length)]), { details: this.errorDetails(error) });
         } finally {
             this.balancaDialog.setBusy(false);
@@ -534,25 +484,16 @@ export default class CQLinhaDetail extends Controller {
 
 
-    public async onPressBalancaDelete(oEvent: Button$PressEvent): Promise<void> {
-        const oTable = this.getView()?.byId("BalancaDialog_table") as Table;
-        const selectedLines = oTable.getSelectedContexts();
+    public onPressBalancaDelete(): void {
+        const table = this.byId("BalancaDialog_table") as Table;
+        const selected = new Set(table.getSelectedContexts().map((context) => context.getPath()));
+        if (!selected.size) {
+            return;
+        }
+
         const model = this.getBalancaModel();
-        const path = this.currentPesoCollection.replace(/^balanca>/, "");
+        const path = this.getPesoPath();
         const rows = (model.getProperty(path) as Pesagem[] | undefined) ?? [];
-
-        if (!selectedLines.length) { return; }
-
-        const selectedIndex = selectedLines
-            .map((context) => {
-                return parseInt(context.getPath().split("/").pop() ?? "", 10);
-            })
-            .sort((a, b) => { return b - a; });
-
-        selectedIndex.forEach((index) => {
-            rows.splice(index, 1);
-        });
-
-        model.setProperty(path, rows);
-        oTable.removeSelections(true);
+        model.setProperty(path, rows.filter((_row, index) => !selected.has(`${path}/${index}`)));
+        table.removeSelections(true);
     }
 
@@ -684,7 +625,5 @@ export default class CQLinhaDetail extends Controller {
             this.navigateToPath(path);
         } catch (error) {
-            MessageBox.error(this.getText("multiInstance.error.create"), {
-                details: String((error as Error)?.message ?? error)
-            });
+            MessageBox.error(this.getText("multiInstance.error.create"), { details: this.errorDetails(error) });
         } finally {
             cabBinding.destroy();
@@ -696,7 +635,4 @@ export default class CQLinhaDetail extends Controller {
     /** Aplicar: calcula todas as amostras abertas nos separadores e volta ao CQ */
     public async onApply(): Promise<void> {
-        const oContainer = this.getView()?.byId("CQDetailLinha_Content_scroll") as ScrollContainer;
-        oContainer.setBusy(true);
-
         const current = this.getContext();
         const model = current.getModel();
@@ -704,12 +640,13 @@ export default class CQLinhaDetail extends Controller {
         const editFlow = this.getExtensionAPI().getEditFlow();
         const label = this.getText("CQLinhaDetail.btn.Calcular");
-        try {
-            await editFlow.invokeAction(Actions.doCalculations, { contexts: current, label });
 
+        // uma amostra de cada vez: pedidos em paralelo disputavam o lock do draft do CQ
+        await this.withBusy(this.byId("CQDetailLinha_Content_scroll") as ScrollContainer, async () => {
+            await editFlow.invokeAction(Actions.doCalculations, { contexts: current, label });
             for (const path of paths) {
                 const binding = model.bindContext(path);
                 try {
                     const context = binding.getBoundContext() as Context;
-                    await context.requestObject();
+                    await context.requestObject(); // etag para o If-Match
                     await editFlow.invokeAction(Actions.doCalculations, { contexts: context, label });
                 } finally {
@@ -717,7 +654,6 @@ export default class CQLinhaDetail extends Controller {
                 }
             }
-        } catch (error) { }
-        oContainer.setBusy(false);
-        await this.getExtensionAPI().getEditFlow().applyDocument(current);
+        });
+        await editFlow.applyDocument(current);
     }
 
@@ -771,4 +707,37 @@ export default class CQLinhaDetail extends Controller {
     }
 
+    /** Caminho da coleção do dialog no modelo "balanca" ("balanca>/PesosUn" -> "/PesosUn") */
+    private getPesoPath(): string {
+        return this.currentPesoCollection.replace(/^balanca>/, "");
+    }
+
+    /** Texto de um erro para o "details" das MessageBox */
+    private errorDetails(error: unknown): string {
+        return String((error as Error)?.message ?? error);
+    }
+
+    /** Fragment de dialog da pasta ext/fragments, ligado a este controller e à view */
+    private async loadDialog(name: string): Promise<Dialog> {
+        const dialog = await Fragment.load({
+            id: this.getView()?.getId(),
+            name: `brasmar.bm01.controloqualidade4.ext.fragments.${name}`,
+            controller: this
+        }) as Dialog;
+        this.getView()?.addDependent(dialog);
+        return dialog;
+    }
+
+    /** Busy no controlo enquanto a ação corre; os erros das ações já são mostrados pelo FE */
+    private async withBusy(control: Control, action: () => Promise<unknown>): Promise<void> {
+        control.setBusy(true);
+        try {
+            await action();
+        } catch (error) {
+            // o FE já mostrou a mensagem
+        } finally {
+            control.setBusy(false);
+        }
+    }
+
 
     /** 
@@ -816,7 +785,4 @@ export default class CQLinhaDetail extends Controller {
                 await this.getExtensionAPI().getRouting().navigateToRoute(MultiInstance.ROUTE, parameters);
                 await bound;
-
-                console.log("bound", path)
-
                 const context = this.getView()?.getBindingContext() as Context | undefined | null;
                 if (context?.getPath() === path) {
@@ -826,7 +792,4 @@ export default class CQLinhaDetail extends Controller {
                 const pageReady = (this as unknown as { pageReady?: { waitPageReady?: () => Promise<void> } }).pageReady;
                 await pageReady?.waitPageReady?.();
-
-                console.log("loaded", path)
-                
             } catch (error) {
                 // navegação cancelada / amostra inexistente: o FE já mostra o erro
@@ -870,5 +833,5 @@ export default class CQLinhaDetail extends Controller {
     private addPesagem(weight: number, uom: string): void {
         const model = this.getBalancaModel();
-        const path = this.currentPesoCollection.replace(/^balanca>/, "");
+        const path = this.getPesoPath();
         const rows = (model.getProperty(path) as Pesagem[] | undefined) ?? [];
         model.setProperty(path, [...rows, { PB: (weight * 1000).toFixed(2), uom, PesoDeclarado: "" }]);
@@ -930,8 +893,9 @@ export default class CQLinhaDetail extends Controller {
      */
     private toEntityData(navigation: PesagemNavigation, weight: string, row: Pesagem, pesoDeclarado?: string): Record<string, string> {
+        const uom = row.uom || "G";
         if (navigation === "_Calibres") {
-            return row.uom ? { Medicao: weight, UomInternal: row.uom } : { Medicao: weight, UomInternal: "G" };
+            return { Medicao: weight, UomInternal: uom };
         }
-        const data: Record<string, string> = row.uom ? { Pb: weight, Uom: row.uom } : { Pb: weight, Uom: "G" };
+        const data: Record<string, string> = { Pb: weight, Uom: uom };
         if (pesoDeclarado !== undefined) {
             data.PesoDeclarado = pesoDeclarado;
```

## Verify
1. Calcular, Get MP and Aplicar: busy shows and clears; an action error still shows the FE message and clears the busy.
2. IconTabBar: every section tab scrolls to its section.
3. Balança dialog: opens (both buttons), deletes selected rows (several at once), OK creates the rows.
4. Balança config dialog opens and connects.
5. Row weighing buttons (Pb / Pl / Ple) still read and write.
6. Amostra tabs: fast switching still works (no stuck busy); no `bound`/`loaded` logs in the console.
