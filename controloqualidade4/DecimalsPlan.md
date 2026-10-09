# DecimalsPlan: quantities must always show exactly 2 decimals

## Context
Quantity fields in the custom views should always show 2 decimal places, both when displayed and when edited. Values whose third decimal isn't 0 still show 3 decimals. Example: CQ `1000000003`, Linha `10`, `UnSumPle = 1939.261` shows **1939.261** instead of **1939.26**.

The binding is already set to 2 decimals ([CQLinhaDetail.view.xml:1160](controloqualidade4/webapp/ext/view/CQLinhaDetail.view.xml#L1160)):

```xml
text="{path:'UnSumPle', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2}, constraints:{precision:12,scale:2}} {UnUom}"
```

### Root cause
`sap.ui.model.odata.type.Decimal` (the `Decimal` in `core:require`) defaults `formatOptions.preserveDecimals` to **true**, and has done so since UI5 1.89. This app runs on 1.120. With `preserveDecimals: true`, `maxFractionDigits` only **pads** to 2 decimals. It never **cuts** decimals that differ from 0:
- `1939.260` → `1939.26`, because the trailing 0 is dropped;
- `1939.261` → `1939.261`, because a significant decimal is kept and not rounded.

That's why the bug shows up only "when the last decimal is not 0". The backend property is `Edm.Decimal Precision="13" Scale="3"` (`metadata.xml:656`), so the third decimal is real data.

## Fix
Add **`preserveDecimals:false`** to the `formatOptions` of every `Decimal` binding. The number is then rounded to `maxFractionDigits` using UI5's standard rounding (half away from zero): `1939.261` → `1939.26` and `1939.265` → `1939.27`.

All 73 decimal bindings use exactly the same `formatOptions`, so one search-and-replace per file covers them:

| File | Occurrences |
|---|---|
| `controloqualidade4/webapp/ext/view/CQLinhaDetail.view.xml` | 33 |
| `controloqualidade4/webapp/ext/view/CQDetail.view.xml` | 40 |

**Find:**
```
formatOptions:{minFractionDigits:2,maxFractionDigits:2}
```
**Replace with:**
```
formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals:false}
```

The 4 `formatOptions: { pattern: 'dd/MM/yyyy' }` bindings in `CQDetail.view.xml` are dates and don't match the search, so they aren't affected.

Example after the change (line 1160):

```xml
<Text id="CQDetailLinha_PesoCX_UnSumPle" emptyIndicatorMode="On" text="{path:'UnSumPle', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals:false}, constraints:{precision:12,scale:2}} {UnUom}"></Text>
```

And an edit field (line 189):

```xml
<Input id="CQDetailLinha_amostra_Sal_edit" value="{path:'Sal', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals:false}, constraints:{precision:4,scale:2}}" textAlign="End" change=".onFieldChange" visible="{ui>/isEditable}">
```

### Effect on edit fields
- **Display only, no automatic save:** an `Input` showing `1939.26` for a stored `1939.261` doesn't write anything back unless the user changes the value. Formatting never triggers a PATCH.
- **When the user types a value:** it is parsed with the existing `constraints:{scale:2}`, so at most 2 decimals are accepted. If someone types 3 decimals, the field shows the standard UI5 validation error. This matches the rule that quantities have 2 decimals.

### Not covered by this fix (Fiori Elements tables)
The Fiori Elements tables (`macros:Table`) work differently. One example is the Amostragens table in `CQDetail`, whose `UnSumPle` column comes from `annotation.xml:515`. Fiori Elements formats `Edm.Decimal` using the **Scale from the metadata** (3), so those columns always show 3 decimals (`1939.261`, `1939.260`). An annotation can't change that, because Scale is part of the property definition, not an annotation. Options, if this should change too:
- **Backend (recommended):** expose the quantity with 2 decimals in the CDS projection, for example `cast(UnSumPle as abap.dec(12,2))`, or round it in the behaviour/CDS layer. The OData metadata then has `Scale="2"`, and every consumer shows 2 decimals.
- **Frontend:** replace those columns with custom columns (`macros:Column` with a `Text` using the same binding as above). This is more code and has to be maintained per column.

## Verification
1. Search both views for `maxFractionDigits:2}`: there should be **0** matches left, and **73** for `preserveDecimals:false`.
2. Run `npm start` and open CQ `1000000003` → Linha `10` → Pesos / Caixas: `UnSumPle` shows **1939.26 KG** (with the unit). Values like `x.260` still show `x.26`.
3. Click Edit on the same field: the input shows `1939.26`. Leave the field without changing it, and the network tab shows **no** PATCH for `UnSumPle`.
4. Type `12.345` into an editable quantity: you get a validation error for more than 2 decimals. Type `12.34`: it is accepted and patched as `12.34`.
5. Check a few `CQDetail` quantities (Dados Produto / Ficha Técnica). They show exactly 2 decimals and round as expected (`x.xx5` rounds up).
