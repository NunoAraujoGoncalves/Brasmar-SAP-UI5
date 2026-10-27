# Balança – new columns "PLE Declarado" and "Peso Declarado"

## Goal
When the Balança dialog is opened from the **Pesos Unidade** button (`onPesoUnBalanca`), the weighings
table gets 2 extra columns:

| Column | Type | Value |
|---|---|---|
| Peso Bruto (existing) | Input | `PB` from the scale / editable |
| **PLE Declarado** | Text (read-only) | `(PB − UnTara) − ((PB − UnTara) × Teorvidragem / 100)` |
| **Peso Declarado** | Input (empty) | filled in manually → written to `PesoDeclarado` of the new `_PesosUn` line |

When opened from **Calibres** (`onPesoCalibreBalanca`) the dialog stays as it is today.

## Files to change
| File | Change |
|---|---|
| `webapp/ext/fragments/Balanca.fragment.xml` | 2 new columns (visible only when `balanca>/showDeclarado`) + cells in the static template |
| `webapp/ext/view/CQLinhaDetail.controller.ts` | `balanca` model, `openBalancaDialog`, `onBalancaBeforeOpen`, `onPressOkayDialog`, `addPesagem`, `toEntityData`, new helpers |
| `webapp/i18n/i18n.properties` | 3 new texts |

## Design notes
- **`onBalancaBeforeOpen` rebinds the items (`bindItems`) with a template built in TypeScript**, so the new
  cells must be created there (the fragment's `<items>` is replaced). `sap.m.Table` needs one cell per
  column; a hidden column hides its cells, so the template always has 3 cells.
- `Untara`, `Unuompeso` and `Teorvidragem` come from the current line (`CQLinhasType`, the page context) and
  are copied into the `balanca` model when the dialog opens, so PLE Declarado is recalculated whenever the
  user corrects Peso Bruto by hand.
- **PLE Declarado is a composite binding on `balanca>PB`**. The path must match the property `addPesagem`
  writes (`PB`, uppercase). JSON model paths are case-sensitive, so `balanca>Pb` always resolves to
  `undefined` and the column stays empty.
- **Recalculating on a manual edit:** the Peso Bruto `Input` is two-way bound to `PB`. Each model write
  runs `checkUpdate` on the composite binding, which calls `formatPleDeclarado` again. Without
  `valueLiveUpdate` the model is only written on Enter/blur; with `valueLiveUpdate: true` it is written on
  every keystroke, so PLE Declarado updates as the user types.
- In `onPressOkayDialog`, `const navigation = this.currentNavigation;` must be declared **before** step 1b
  (which uses it). Declaring it after step 1b throws `ReferenceError` at runtime, because a `const` can't be used before its declaration line.
- Dialog weighings are always in **G**; the tare is in `Unuompeso` → if it is `KG`, multiply by 1000.
- PLE Declarado is only a preview; it is not sent (the backend still calculates `Declarado`).
- Peso Declarado is **optional**: empty → not sent; filled → must be a number > 0
  (same check as Peso Bruto, `toWeightString`).
- Weighings that fail to save stay in the dialog with their Peso Declarado (the whole `Pesagem` object is kept).

---

## 1. `Balanca.fragment.xml` (full file)

```xml
<core:FragmentDefinition xmlns:core="sap.ui.core"
    xmlns="sap.m"
    xmlns:l="sap.ui.layout"
    xmlns:form="sap.ui.layout.form">
    <Dialog id="BalancaDialog_title" title="{i18n>BalancaDialog.title}" contentWidth="{= ${balanca>/showDeclarado} ? '800px' : '500px' }" beforeOpen=".onBalancaBeforeOpen" afterClose=".onBalancaAfterClose">
        <form:SimpleForm id="BalancaDialog_form" editable="true" labelSpanS="2">
            <Button id="BalancaDialog_btn_start" text="{i18n>BalancaDialog.btn.start}" icon="sap-icon://begin" press=".onPressBalancaStart" enabled="{= !${balanca>/reading} }"  />
            <Button id="BalancaDialog_btn_stop" text="{i18n>BalancaDialog.btn.stop}" icon="sap-icon://media-pause" press=".onPressBalancaEnd" enabled="{balanca>/reading}" />
        </form:SimpleForm>

        <!-- peso atual da balança + estado da sessão -->
        <MessageStrip id="BalancaDialog_status" showIcon="true" class="sapUiSmallMarginBeginEnd sapUiTinyMarginBottom" type="{= ${balanca>/reading} ? 'Information' : 'None' }" text="{= ${balanca>/reading} ? ${i18n>BalancaDialog.status.reading} : ${i18n>BalancaDialog.status.idle} }">
        </MessageStrip>
        <HBox id="BalancaDialog_live" alignItems="Center" class="sapUiSmallMarginBeginEnd" visible="{serial>/connected}">
            <Label id="BalancaDialog_live_label" text="{i18n>BalancaDialog.liveWeight}" class="sapUiTinyMarginEnd"/>
            <ObjectNumber id="BalancaDialog_live_value" number="{serial>/lastReading/text}" emphasized="true"/>
        </HBox>

        <Table id="BalancaDialog_table" growing="true" growingThreshold="10" mode="MultiSelect" items="{balanca>/PesosUn}">
            <headerToolbar>
                <OverflowToolbar id="BalancaDialog_toolbar">
                    <Title id="BalancaDialog_table_title" text="{i18n>BalancaDialog.table.title}" />
                    <ToolbarSpacer id="BalancaDialog_table_spacer" />
                    <Button id="BalancaDialog_table_btn_delete" text="{i18n>BalancaDialog.table.btn.delete}" enabled="{= !${balanca>/reading} }" press=".onPressBalancaDelete" />
                </OverflowToolbar>
            </headerToolbar>
            <columns>
                <Column id="BalancaDialog_column_peso_label" demandPopin="true" minScreenWidth="Phone">
                    <Text id="BalancaDialog_column_peso" text="{i18n>BalancaDialog.table.peso}" />
                </Column>
                <!-- só Pesos Unidade (onPesoUnBalanca) -->
                <Column id="BalancaDialog_column_pleDeclarado_label" demandPopin="true" minScreenWidth="Tablet" hAlign="End" visible="{balanca>/showDeclarado}">
                    <Text id="BalancaDialog_column_pleDeclarado" text="{i18n>BalancaDialog.table.pleDeclarado}" />
                </Column>
                <Column id="BalancaDialog_column_pesoDeclarado_label" demandPopin="true" minScreenWidth="Tablet" visible="{balanca>/showDeclarado}">
                    <Text id="BalancaDialog_column_pesoDeclarado" text="{i18n>BalancaDialog.table.pesoDeclarado}" />
                </Column>
            </columns>
            <!-- template real é criado em onBalancaBeforeOpen (bindItems); este fica só coerente com as colunas -->
            <items>
                <ColumnListItem id="BalancaDialog_item_peso" vAlign="Middle">
                    <cells>
                        <Input id="BalancaDialog_input_peso" value="{balanca>PB}" description="{balanca>uom}" />
                        <Text id="BalancaDialog_text_pleDeclarado" text="" />
                        <Input id="BalancaDialog_input_pesoDeclarado" value="{balanca>PesoDeclarado}" description="{balanca>uom}" />
                    </cells>
                </ColumnListItem>
            </items>
        </Table>

        <beginButton>
            <Button id="BalancaDialog_btn_okay" text="{i18n>BalancaDialog.btn.okay}" icon="sap-icon://accept" press=".onPressOkayDialog" enabled="{= !${balanca>/reading} }" />
        </beginButton>
        <endButton>
            <Button id="BalancaDialog_btn_close" text="{i18n>BalancaDialog.btn.close}" icon="sap-icon://decline" press=".onPressCloseDialog" enabled="{= !${balanca>/reading} }"/>
        </endButton>
    </Dialog>
</core:FragmentDefinition>
```

## 2. `CQLinhaDetail.controller.ts` (changed parts only)

### 2.1 Imports and `Pesagem` type
```ts
import Text from "sap/m/Text";

/** Uma linha da tabela de pesagens do dialog Balanca */
type Pesagem = { PB: string; uom: string; PesoDeclarado?: string };
```

### 2.2 `onInit` – `balanca` model
```ts
const oPesosModel = new JSONModel({
    "PesosUn": [],
    "Calibres": [],
    "reading": false,
    "showDeclarado": false, // colunas PLE/Peso Declarado (só Pesos Unidade)
    "Untara": 0,            // tara da linha em G
    "Teorvidragem": 0
});
```

### 2.3 `onBalancaBeforeOpen` – template with 3 cells
```ts
public async onBalancaBeforeOpen(): Promise<void> {
    const pesoTable = this.getView()?.byId("BalancaDialog_table") as Table;
    pesoTable.bindItems({
        model: "balanca",
        path: this.currentPesoCollection,
        template: new ColumnListItem({
            vAlign: "Middle",
            cells: [
                new Input({
                    value: "{balanca>PB}",
                    description: "{balanca>uom}",
                    valueLiveUpdate: true // escreve no modelo a cada tecla -> PLE Declarado recalcula logo
                }),
                // PLE Declarado: recalculado sempre que o PB muda (path "PB" em maiúsculas, igual a addPesagem)
                new Text({
                    text: {
                        parts: ["balanca>PB", "balanca>/Untara", "balanca>/Teorvidragem", "balanca>uom"],
                        formatter: (pb: unknown, tara: number, teor: number, uom: string) => this.formatPleDeclarado(pb, tara, teor, uom)
                    }
                }),
                new Input({
                    value: "{balanca>PesoDeclarado}",
                    description: "{balanca>uom}"
                })
            ]
        })
    })
}
```

### 2.4 `openBalancaDialog` – flag + values from the current line
```ts
private async openBalancaDialog(collection: string, uomProperty: string, navigation: PesagemNavigation): Promise<void> {
    if (!this.balancaDialog) {
        this.balancaDialog = await Fragment.load({
            id: this.getView()?.getId(),
            name: "brasmar.bm01.controloqualidade4.ext.fragments.Balanca",
            controller: this
        }) as Dialog;
        this.getView()?.addDependent(this.balancaDialog);
    }
    this.currentPesoCollection = collection;
    this.currentPesoUom = uomProperty;
    this.currentNavigation = navigation;

    // Colunas PLE Declarado / Peso Declarado só para Pesos Unidade
    const model = this.getBalancaModel();
    const showDeclarado = navigation === "_PesosUn";
    model.setProperty("/showDeclarado", showDeclarado);
    if (showDeclarado) {
        const [tara, taraUom, teor] = await this.getContext().requestProperty(["Untara", "Unuompeso", "Teorvidragem"]) as unknown[];
        model.setProperty("/Untara", this.toGrams(tara, taraUom));
        model.setProperty("/Teorvidragem", Number(teor ?? 0) || 0);
    }

    this.balancaDialog.open();
}
```
(`onPesoUnBalanca` and `onPesoCalibreBalanca` stay unchanged.)

### 2.5 `onPressOkayDialog` – validate and send `PesoDeclarado`
Changes: `navigation` moves to the top, new step **1b**, and `toEntityData` receives the declared weight.
```ts
public async onPressOkayDialog(oEvent: Button$PressEvent): Promise<void> {
    const model = this.getBalancaModel();
    const path = this.currentPesoCollection.replace(/^balanca>/, "");
    const navigation = this.currentNavigation;
    const rows = (model.getProperty(path) as Pesagem[] | undefined) ?? [];
    if (rows.length === 0) {
        this.balancaDialog.close();
        return;
    }

    // 1. validar tudo antes de gravar (os pesos podem ter sido corrigidos à mão no dialog)
    const weights = rows.map((row) => this.toWeightString(row.PB));
    const invalidIndex = weights.findIndex((weight) => weight === undefined);
    if (invalidIndex >= 0) {
        MessageBox.error(this.getText("BalancaDialog.error.invalidWeight", [String(invalidIndex + 1), String(rows[invalidIndex].PB ?? "")]));
        return;
    }

    // 1b. Peso Declarado (só Pesos Unidade): opcional, mas se preenchido tem de ser válido
    const isEmpty = (value: unknown): boolean => String(value ?? "").trim() === "";
    const declarados = rows.map((row) =>
        navigation === "_PesosUn" && !isEmpty(row.PesoDeclarado) ? this.toWeightString(row.PesoDeclarado) : undefined);
    const invalidDeclarado = rows.findIndex((row, index) =>
        navigation === "_PesosUn" && !isEmpty(row.PesoDeclarado) && declarados[index] === undefined);
    if (invalidDeclarado >= 0) {
        MessageBox.error(this.getText("BalancaDialog.error.invalidPesoDeclarado", [String(invalidDeclarado + 1), String(rows[invalidDeclarado].PesoDeclarado ?? "")]));
        return;
    }

    const context = this.getContext();
    this.balancaDialog.setBusy(true);
    try {
        // 2. ... (unchanged)

        // 3. criar: binding proprio relativo á linha; o grupo $auto envia tudo num só $batch
        const binding = context.getModel().bindList(navigation, context, undefined, undefined, {
            $$ownRequest: true
        }) as ODataListBinding;
        const results = await Promise.allSettled(rows.map((row, index) =>
            binding.create(this.toEntityData(navigation, weights[index]!, row, declarados[index]), true).created() ?? Promise.resolve()
        ));
        binding.destroy();

        // 4. e 5. ... (unchanged)
    } catch (error) {
        // ... (unchanged)
    } finally {
        this.balancaDialog.setBusy(false);
    }
}
```

### 2.6 `addPesagem` – new row starts with an empty Peso Declarado
```ts
model.setProperty(path, [...rows, { PB: (weight * 100).toFixed(2), uom, PesoDeclarado: "" }]);
```

### 2.7 `toEntityData` – `PesoDeclarado`
```ts
/**
 * Dialog Pesos para Odata Pesos da chamada
 */
private toEntityData(navigation: PesagemNavigation, weight: string, row: Pesagem, pesoDeclarado?: string): Record<string, string> {
    if (navigation === "_Calibres") {
        return row.uom ? { Medicao: weight, UomInternal: row.uom } : { Medicao: weight, UomInternal: "G" };
    }
    const data: Record<string, string> = row.uom ? { Pb: weight, Uom: row.uom } : { Pb: weight, Uom: "G" };
    if (pesoDeclarado !== undefined) {
        data.PesoDeclarado = pesoDeclarado;
    }
    return data;
}
```

### 2.8 New helpers (in the `/* ---------- helpers ---------- */` section)
```ts
/**
 * PLE Declarado do dialog (igual à coluna Declarado das Vidragens):
 * (PB - UnTara) - ((PB - UnTara) x Teorvidragem / 100)
 */
private formatPleDeclarado(pb: unknown, tara: number, teor: number, uom: string): string {
    const weight = this.toWeightString(pb);
    if (weight === undefined) {
        return "";
    }
    const pl = Number(weight) - (tara ?? 0);
    const ple = pl - (pl * (teor ?? 0) / 100);
    return `${this.round2(ple).toFixed(2)} ${uom ?? ""}`.trim();
}

/** Tara da linha (Unuompeso) para G, a unidade das pesagens do dialog */
private toGrams(value: unknown, uom: unknown): number {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) {
        return 0;
    }
    return String(uom ?? "").toUpperCase() === "KG" ? number * 1000 : number;
}
```

## 3. `i18n.properties` (next to the `BalancaDialog.*` keys)
```properties
BalancaDialog.table.pleDeclarado=PLE Declarado
BalancaDialog.table.pesoDeclarado=Peso Declarado
BalancaDialog.error.invalidPesoDeclarado=A pesagem {0} tem um Peso Declarado inválido ("{1}"). Corrija-o ou deixe-o vazio antes de carregar em OK.
```

## 4. Backend prerequisites (RAP)
- `PesoDeclarado` of `CQPesosUn` must not be `readonly` in the BDEF (it has to be accepted on create).
- Confirm that `Unuompeso` only takes the values `G`/`KG` (otherwise extend `toGrams`).

## 5. Tests
1. Line with Pesos Unidade, edit mode → **Balança** → the 3 columns show and the dialog is 800px wide.
2. Weigh (or use `onTestStart`) → PLE Declarado is calculated; correct Peso Bruto by hand → PLE updates.
   E.g.: PB 1000 G, Untara 0.05 KG (=50 G), Teorvidragem 10 → (950) − 95 = **855.00 G**.
3. Fill Peso Declarado on some rows, leave others empty → OK → lines created in
   `_PesosUn` with `PesoDeclarado` (empty ones get the backend default, 0).
4. Peso Declarado "abc" → `invalidPesoDeclarado` error, nothing is saved.
5. Calibres **Balança** button → only the Peso Bruto column, 500px, Calibres saved as before.
