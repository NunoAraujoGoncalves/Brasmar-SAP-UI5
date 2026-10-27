# Two decimal places on all numeric table columns

## Goal
Numeric columns in the `macros:Table`s show 0, 3, 4 or 5 decimals depending on the field and on the
unit. They must show **exactly 2 decimals**, the same as the form fields, which already use
`type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals:false}`.

## Why the decimals differ (and why a metadata extension alone can't fix it)
Fiori Elements builds each table cell from the `$metadata`, not from the UI annotations:

1. **Plain decimals** are formatted with the **`Scale` of the Edm.Decimal type**, which comes from the CDS
   element's data type: `Medicao` 16,4 → 4 decimals, `Valor` 16,5 → 5, `Qtd1`/`Qtd2` 13,3 → 3.
2. **Quantities with a unit** (`@Semantics.quantity.unitOfMeasure` → `Measures.Unit`, e.g. `Pb` + `Uom`)
   are formatted with `sap.ui.model.odata.type.Unit`. It takes the decimals **from the unit's
   customizing** (the `UnitsOfMeasure` code list, T006), and `preserveDecimals` is on by default.
   That's why a G row and a KG row show different decimals.

A metadata extension (`.ddlx`) only carries UI annotations. It can't change a type's `Scale` or a unit's
decimals. The only annotation that controls decimals is `UI.DataPoint` → `ValueFormat.NumberOfFractionalDigits`.
A DataPoint column is **display-only**, so it can't be used in tables that are edited inline.

## Approach
Users edit the line tables inline, so there are two solutions, one per kind of table:

| Table (view) | Editable? | Solution |
|---|---|---|
| `CQDetailLinha_PesoCX_table` (`_PesosCX`) | yes | **A** – custom columns + remove numeric fields from `@UI.lineItem` (backend MDE) |
| `CQDetailLinha_PesoUn_table` (`_PesosUn`) | yes | **A** |
| `CQDetailLinha_Vidragem_table` (`_Vidragens`) | yes | **A** |
| `CQDetailLinha_calibre_table` (`_Calibres`) | yes | **A** |
| `CQDetailLinha_mps_table` (`_mps`) and `CQDetail_mps_table` (`_mp`) | yes | **A** |
| `CQDetail_nutricionais_table` (`_nutricionais`) | yes | **A** |
| `main_table` (`CQCab`, Main.view) | no | **B** – `UI.DataPoint` with 2 fractional digits in local `annotation.xml` |
| `CQDetail_amostragens_table` (`_linhas`) | no | **B** |
| `CQDetailLinha_Temperatura_table`, ingredients, allergens, `CQDetail_fcontrolo_table` | – | no change (already scale 2 or no numeric columns) |

Fields that already have scale 2 and no unit (`Percent1/2`, `Vidragem`, `Temperatura`, `Tempveiculo`,
`Calibremin/max`, `Teorvidragem`, `VidragemM`, `MedVidragem`, …) already show 2 decimals. They are left alone.

---

## A. Editable tables – custom columns

### A.1 Pattern
Every numeric column becomes a `macros:Column` with the same bindings as the form fields:
- **Computed fields** (`Core.Computed`: `Pl`/`Ple`/`Declarado` in Pesos): one `Text`.
- **Editable fields** (`Pb`, `PesoDeclarado`, Vidragens `Pl`/`Ple`, `Medicao`, `Qtd1`/`Qtd2`, `Valor`):
  a `Text` in display mode and an `Input` in edit mode (`ui>/isEditable`), with `change=".onFieldChange"`.
  `onFieldChange` → `EditHelper.requestSideEffects` already reads the row's binding context and requests
  `SideEffects#SAP__Field_<property>` (e.g. `Pb` → `Pl`, `Declarado`, `Ple`), the same as the balança buttons do.
- Constraints: same integer digits as the backend field but **scale 2**
  (13,3 → `precision:12,scale:2`, 16,4 → `14,2`, 16,5 → `13,2`), so the Input rejects a third decimal.
- The unit (`Uom`) is shown the same way the forms do: after the value in the `Text`, as `description` in the `Input`.

The original annotation columns are removed from the LineItem (A.3), otherwise every value would appear twice.
The balança button columns that anchor to `DataField::Pb`, `DataField::Pl` and `DataField::Ple` are re-anchored
to the new custom column keys.

### A.2 `CQLinhaDetail.view.xml`

#### Pesos Caixa (all 4 numeric columns are custom; LineItem becomes empty)
```xml
<macros:Table id="CQDetailLinha_PesoCX_table" header="{i18n>CQLinhaDetail.PesoCX.title}" metaPath="_PesosCX/@com.sap.vocabularies.UI.v1.LineItem">
    <macros:columns>
        <macros:Column id="CQDetailLinha_PesoCX_column_balanca" key="pesoCx_balanca" header="{i18n>CQLinhaDetail.PesoCX.balanca.column}" anchor="num_PesoCx_Pb" placement="Before" width="8rem" importance="High">
            <Button id="CQDetailLinha_PesoCX_btn_balanca" icon="sap-icon://compare" type="Emphasized" text="{i18n>CQLinhaDetail.PesoCX.balanca.column}" tooltip="{i18n>CQLinhaDetail.PesoCX.balanca.tooltip}" press=".onPesoCxBalanca" visible="{ui>/isEditable}" enabled="{= !${balanca>/reading} }"/>
        </macros:Column>

        <macros:Column id="CQDetailLinha_PesoCX_column_Pb" key="num_PesoCx_Pb" header="{i18n>table.col.Pb}" hAlign="End" importance="High">
            <VBox id="CQDetailLinha_PesoCX_Pb_box">
                <Text id="CQDetailLinha_PesoCX_Pb" text="{path:'Pb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetailLinha_PesoCX_Pb_edit" value="{path:'Pb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>

        <macros:Column id="CQDetailLinha_PesoCX_column_Pl" key="num_PesoCx_Pl" header="{i18n>table.col.Pl}" hAlign="End" importance="High">
            <Text id="CQDetailLinha_PesoCX_Pl" text="{path:'Pl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
        </macros:Column>

        <macros:Column id="CQDetailLinha_PesoCX_column_Declarado" key="num_PesoCx_Declarado" header="{i18n>table.col.Declarado}" hAlign="End" importance="High">
            <Text id="CQDetailLinha_PesoCX_Declarado" text="{path:'Declarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
        </macros:Column>

        <macros:Column id="CQDetailLinha_PesoCX_column_Ple" key="num_PesoCx_Ple" header="{i18n>table.col.Ple}" hAlign="End" importance="High">
            <Text id="CQDetailLinha_PesoCX_Ple" text="{path:'Ple', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
        </macros:Column>
    </macros:columns>
</macros:Table>
```

#### Pesos Unidade (all 5 numeric columns are custom; LineItem becomes empty)
```xml
<macros:Table id="CQDetailLinha_PesoUn_table" header="{i18n>CQLinhaDetail.PesoUN.title}" metaPath="_PesosUn/@com.sap.vocabularies.UI.v1.LineItem">
    <macros:columns>
        <macros:Column id="CQDetailLinha_PesoUn_column_Pb" key="num_PesoUn_Pb" header="{i18n>table.col.Pb}" hAlign="End" importance="High">
            <VBox id="CQDetailLinha_PesoUn_Pb_box">
                <Text id="CQDetailLinha_PesoUn_Pb" text="{path:'Pb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetailLinha_PesoUn_Pb_edit" value="{path:'Pb', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>

        <macros:Column id="CQDetailLinha_PesoUn_column_Pl" key="num_PesoUn_Pl" header="{i18n>table.col.Pl}" hAlign="End" importance="High">
            <Text id="CQDetailLinha_PesoUn_Pl" text="{path:'Pl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
        </macros:Column>

        <macros:Column id="CQDetailLinha_PesoUn_column_Declarado" key="num_PesoUn_Declarado" header="{i18n>table.col.Declarado}" hAlign="End" importance="High">
            <Text id="CQDetailLinha_PesoUn_Declarado" text="{path:'Declarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
        </macros:Column>

        <macros:Column id="CQDetailLinha_PesoUn_column_PesoDeclarado" key="num_PesoUn_PesoDeclarado" header="{i18n>table.col.PesoDeclarado}" hAlign="End" importance="High">
            <VBox id="CQDetailLinha_PesoUn_PesoDeclarado_box">
                <Text id="CQDetailLinha_PesoUn_PesoDeclarado" text="{path:'PesoDeclarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetailLinha_PesoUn_PesoDeclarado_edit" value="{path:'PesoDeclarado', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>

        <macros:Column id="CQDetailLinha_PesoUn_column_Ple" key="num_PesoUn_Ple" header="{i18n>table.col.Ple}" hAlign="End" importance="High">
            <Text id="CQDetailLinha_PesoUn_Ple" text="{path:'Ple', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}"/>
        </macros:Column>
    </macros:columns>
</macros:Table>
```

#### Vidragens (`Pl` and `Ple` are custom; `Posnr` and `Vidragem` stay as annotation columns)
Anchors are chained, so the order is deterministic: `Posnr | balança | Pl | balança | Ple | Vidragem`.
```xml
<macros:Table id="CQDetailLinha_Vidragem_table" header="{i18n>CQLinhaDetail.Vidragem.title}" metaPath="_Vidragens/@com.sap.vocabularies.UI.v1.LineItem">
    <macros:columns>
        <macros:Column id="CQDetailLinha_Vidragem_column_Ple" key="num_Vid_Ple" header="{i18n>table.col.VidPle}" anchor="DataField::Vidragem" placement="Before" hAlign="End" importance="High">
            <VBox id="CQDetailLinha_Vidragem_Ple_box">
                <Text id="CQDetailLinha_Vidragem_Ple" text="{path:'Ple', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetailLinha_Vidragem_Ple_edit" value="{path:'Ple', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>

        <macros:Column id="CQDetailLinha_Vidragem_column_balancaPle" key="pesoPle_vid_balanca" header="{i18n>CQLinhaDetail.PesoCX.balanca.column}" anchor="num_Vid_Ple" placement="Before" width="8rem" importance="High">
            <Button id="CQDetailLinha_Vidragem_btn_balancaPle" icon="sap-icon://compare" type="Emphasized" text="{i18n>CQLinhaDetail.PesoCX.balanca.column}" tooltip="{i18n>CQLinhaDetail.PesoCX.balanca.tooltip}" press=".onPesoVidPleBalanca" visible="{ui>/isEditable}" enabled="{= !${balanca>/reading} }"/>
        </macros:Column>

        <macros:Column id="CQDetailLinha_Vidragem_column_Pl" key="num_Vid_Pl" header="{i18n>table.col.Pl}" anchor="pesoPle_vid_balanca" placement="Before" hAlign="End" importance="High">
            <VBox id="CQDetailLinha_Vidragem_Pl_box">
                <Text id="CQDetailLinha_Vidragem_Pl" text="{path:'Pl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}} {Uom}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetailLinha_Vidragem_Pl_edit" value="{path:'Pl', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" description="{Uom}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>

        <macros:Column id="CQDetailLinha_Vidragem_column_balancaPl" key="pesoPl_Vid_balanca" header="{i18n>CQLinhaDetail.PesoCX.balanca.column}" anchor="num_Vid_Pl" placement="Before" width="8rem" importance="High">
            <Button id="CQDetailLinha_Vidragem_btn_balancaPl" icon="sap-icon://compare" type="Emphasized" text="{i18n>CQLinhaDetail.PesoCX.balanca.column}" tooltip="{i18n>CQLinhaDetail.PesoCX.balanca.tooltip}" press=".onPesoVidPlBalanca" visible="{ui>/isEditable}" enabled="{= !${balanca>/reading} }"/>
        </macros:Column>
    </macros:columns>
</macros:Table>
```

#### Calibres (`Medicao` 16,4 → custom; `Posnr` stays)
```xml
<macros:Table id="CQDetailLinha_calibre_table" header="{i18n>CQLinhaDetail.calibre.title}" metaPath="_Calibres/@com.sap.vocabularies.UI.v1.LineItem">
    <macros:columns>
        <macros:Column id="CQDetailLinha_calibre_column_Medicao" key="num_Cal_Medicao" header="{i18n>table.col.Medicao}" anchor="DataField::Posnr" placement="After" hAlign="End" importance="High">
            <VBox id="CQDetailLinha_calibre_Medicao_box">
                <Text id="CQDetailLinha_calibre_Medicao" text="{path:'Medicao', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetailLinha_calibre_Medicao_edit" value="{path:'Medicao', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:14,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>
    </macros:columns>
</macros:Table>
```

#### MPs (`Qtd1`, `Qtd2` 13,3 → custom; `Mp`, `MpDesc`, `Percent1/2`, `Uom` stay)
The same `<macros:columns>` block goes in `CQDetailLinha_mps_table` (CQLinhaDetail) and `CQDetail_mps_table`
(CQDetail, ids prefixed `CQDetail_mps_…`). The unit is already shown in its own `Uom` column, so there's no description.
```xml
<macros:Table id="CQDetailLinha_mps_table" header="{i18n>cqDetail.amostragens.subsection.mps.title}" metaPath="_mps/@com.sap.vocabularies.UI.v1.LineItem" visible="{path: 'HideMps', formatter: '.formatter.hideFormatter'}" enableAutoColumnWidth="true">
    <macros:columns>
        <macros:Column id="CQDetailLinha_mps_column_Qtd1" key="num_Mp_Qtd1" header="{i18n>table.col.Qtd1}" anchor="DataField::Percent1" placement="Before" hAlign="End">
            <VBox id="CQDetailLinha_mps_Qtd1_box">
                <Text id="CQDetailLinha_mps_Qtd1" text="{path:'Qtd1', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetailLinha_mps_Qtd1_edit" value="{path:'Qtd1', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>
        <macros:Column id="CQDetailLinha_mps_column_Qtd2" key="num_Mp_Qtd2" header="{i18n>table.col.Qtd2}" anchor="DataField::Percent2" placement="Before" hAlign="End">
            <VBox id="CQDetailLinha_mps_Qtd2_box">
                <Text id="CQDetailLinha_mps_Qtd2" text="{path:'Qtd2', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetailLinha_mps_Qtd2_edit" value="{path:'Qtd2', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:12,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>
    </macros:columns>
</macros:Table>
```

### A.2b `CQDetail.view.xml`

#### Nutricionais (`Valor` 16,5 → custom; `Descricao`, `ValorNormalizado` stay)
```xml
<macros:Table id="CQDetail_nutricionais_table" header="{i18n>cqDetail.ft.subsection.nutricionais.table.title}" metaPath="_nutricionais/@com.sap.vocabularies.UI.v1.LineItem">
    <macros:columns>
        <macros:Column id="CQDetail_nutricionais_column_Valor" key="num_Nut_Valor" header="{i18n>table.col.Valor}" anchor="DataField::Descricao" placement="After" hAlign="End">
            <VBox id="CQDetail_nutricionais_Valor_box">
                <Text id="CQDetail_nutricionais_Valor" text="{path:'Valor', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:13,scale:2}}" visible="{= !${ui>/isEditable} }"/>
                <Input id="CQDetail_nutricionais_Valor_edit" value="{path:'Valor', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:13,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}"/>
            </VBox>
        </macros:Column>
    </macros:columns>
</macros:Table>
```
`CQDetail_mps_table`: same block as the MPs table above, with `CQDetail_mps_…` ids.

`CQDetail.controller.ts` already has `onFieldChange`, so no controller changes are needed in either view.

### A.3 Backend – metadata extension (`.ddlx`) of each child entity
Remove the `@UI.lineItem` entry **only** for the fields that are now custom columns. Keep `@UI.identification`,
`@UI.fieldGroup`, labels, `@UI.hidden` etc. unchanged. The ABAP sources aren't in this repo, so this is the pattern:

```abap
annotate entity ZC_CQPesosCx with
{
  // @UI.lineItem: [{ position: 10, label: 'Peso Bruto' }]   <- remove
  Pb;
  // @UI.lineItem: [{ position: 20, label: 'Peso Liquido' }] <- remove
  Pl;
  ...
}
```

| Entity | Remove from `@UI.lineItem` |
|---|---|
| CQPesosCx | `Pb`, `Pl`, `Declarado`, `Ple` |
| CQPesosUn | `Pb`, `Pl`, `Declarado`, `PesoDeclarado`, `Ple` |
| CQVidragens | `Pl`, `Ple` |
| CQCalibres | `Medicao` |
| CQMp (and the entity behind `_mps`) | `Qtd1`, `Qtd2` |
| CQNutricionais | `Valor` |

Pesos Caixa/Unidade end up with an empty LineItem. Keep the `@UI.lineItem` annotation present (e.g. leave
`Posnr` with `@UI.lineItem: [{ position: 5 }]` plus `@UI.hidden`, or keep one hidden entry), so that
`_PesosCX/@com.sap.vocabularies.UI.v1.LineItem` still resolves. A table with a missing LineItem fails to render.
Refresh `localService/mainService/metadata.xml` afterwards.

### A.4 i18n (`i18n.properties`)
```properties
table.col.Pb=Peso Bruto
table.col.Pl=Peso Líquido
table.col.Declarado=PLE Declarado
table.col.PesoDeclarado=Peso Declarado
table.col.Ple=PLE Real
table.col.VidPle=Peso Líquido Escorrido
table.col.Medicao=Medição
table.col.Qtd1=Qtd. 1
table.col.Qtd2=Qtd. 2
table.col.Valor=Valor
```

---

## B. Display-only tables – `UI.DataPoint` in local `annotation.xml`
The `CQCab` LineItem (main list) and the `CQLinhas` LineItem (Amostragens) are already **frontend-owned** in
`webapp/annotations/annotation.xml`, so no backend change is needed for them.

Each affected `UI.DataField` becomes a `UI.DataFieldForAnnotation` that points to a `UI.DataPoint` with
`NumberOfFractionalDigits = 2`.

Before (`annotation.xml`, CQCabType LineItem):
```xml
<Record Type="UI.DataField">
    <PropertyValue Property="Value" Path="Cxcomprimento"/>
    <Annotation Term="UI.Importance" EnumMember="UI.ImportanceType/Low"/>
</Record>
```
After:
```xml
<Record Type="UI.DataFieldForAnnotation">
    <PropertyValue Property="Target" AnnotationPath="@UI.DataPoint#Cxcomprimento"/>
    <Annotation Term="UI.Importance" EnumMember="UI.ImportanceType/Low"/>
</Record>
```
And one DataPoint per field in the same `<Annotations Target="SAP__self.CQCabType">` block (outside the LineItem).
If the DataField had a `Label`, move it to the DataPoint's `Title`:
```xml
<Annotation Term="UI.DataPoint" Qualifier="Cxcomprimento">
    <Record Type="UI.DataPointType">
        <PropertyValue Property="Value" Path="Cxcomprimento"/>
        <PropertyValue Property="ValueFormat">
            <Record Type="UI.NumberFormat">
                <PropertyValue Property="NumberOfFractionalDigits" Int="2"/>
            </Record>
        </PropertyValue>
    </Record>
</Annotation>
```

| Target | Fields |
|---|---|
| `CQCabType` (main list) | `Cxcomprimento`, `Cxlargura`, `Cxaltura`, `Cxpesobruto`, `Cxpesoliquido`, `Cxpesoliquidoesc`, `Cxtara` (Title "Tara CX" if labelled), `Uncomprimento`, `Unlargura`, `Unaltura`, `Unpesobruto`, `Unpesoliquido`, `Unpesoliquidoesc`, `Untara` (Title "Tara UN") |
| `CQLinhasType` (Amostragens) | `UnSumPb`, `UnSumPl`, `UnSumPle`, `UnMedPl`, `UnMedPle` (Title = existing `{@i18n>cqDetail.amostragens.table.…}`) |

**Verify first, on one field:** check that `NumberOfFractionalDigits` is respected for a field that has a unit
(e.g. `Cxpesobruto` with `Cxuompeso`) on the UI5 version in use (`minUI5Version` 1.120). If Fiori Elements still
applies the unit's decimals, use the solution A pattern for these two tables too: custom `Text` columns
(display only) + remove the DataFields from the local LineItem.

---

## Checklist
1. Backend: MDE changes (A.3), activate, refresh the local `metadata.xml`.
2. `CQLinhaDetail.view.xml`: PesosCX, PesosUn, Vidragens, Calibres and MPs tables (A.2).
3. `CQDetail.view.xml`: Nutricionais and MPs tables (A.2b).
4. `i18n.properties`: `table.col.*` keys (A.4).
5. `annotation.xml`: DataPoints for CQCab and CQLinhas (B). Test one field before doing them all.

## Tests
1. Display mode: every numeric column in every table shows `x,xx` (e.g. `1.000,00 G`, `0,50 KG`, `12,35`).
2. Edit mode, Pesos Caixa: type `1250,5` in Peso Bruto → it shows `1.250,50`; after leaving the field,
   Pl / PLE Declarado / PLE Real are refreshed (side effect `SAP__Field_Pb`).
3. Type a value with 3 decimals (`12,345`) → the Input shows a validation error (scale 2).
4. Balança buttons (Pesos Caixa, Vidragens Pl/Ple) are still placed before their value columns and still fill the value.
5. Network tab: the `_PesosCX` / `_PesosUn` requests still `$select` `Pb`, `Pl`, `Declarado`, `Ple`, `Uom`
   (the custom column bindings must add them, because the LineItem no longer lists them).
6. Main list and Amostragens: the unit-based columns show 2 decimals for both G and KG rows.
