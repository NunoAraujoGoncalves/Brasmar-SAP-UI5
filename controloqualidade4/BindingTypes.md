# Fix the "failed to load 'Decimal.js'" errors on page load

## Symptom
Opening `CQDetail` or `CQLinhaDetail` logs many errors like this, while the page keeps working:
```
[FUTURE FATAL] - ModuleError: failed to load 'Decimal.js' from ../resources/Decimal.js: script load error
```

## Cause (most likely, not yet confirmed in the browser)
Both views declare short aliases for their binding types on the root element:
```xml
core:require="{ Decimal: 'sap/ui/model/odata/type/Decimal', Date: 'sap/ui/model/odata/type/Date', CodeDescType: '…/CodeDescType' }"
```
and use them in bindings as `type:'Decimal'`, `type:'Date'`, `type:'CodeDescType'`.

Both views are FPM custom views with building blocks. FE runs them through the **XML templating preprocessor**
before the view is created:
- The preprocessor parses every binding string, including the plain `{path:'Sal', type:'Decimal', …}` ones and the
  ones inside `macros:Column` templates.
- At that point the `core:require` aliases are not in scope.
- `'Decimal'` is then treated as a global name / module id. UI5 tries to load `resources/Decimal.js`, which
  doesn't exist, and logs the `ModuleError`. UI5 1.120 reports this as `FUTURE FATAL`, meaning a hard error in
  UI5 2.x.
- The page still works because the real view creation does resolve the alias through `core:require`. The error
  comes only from the earlier preprocessing pass.

## Fix
Use the **full type name** in the bindings instead of the alias. The full name resolves the same way in both passes.
The module is already loaded by `core:require`, so no extra request is made.

Keep the `core:require` attribute on both views: it still preloads the modules.

| Alias | Replace with | Occurrences |
|---|---|---|
| `type:'Decimal'` | `type:'sap.ui.model.odata.type.Decimal'` | 107 (CQDetail 40 + CQLinhaDetail 67) |
| `type:'Date'` | `type:'sap.ui.model.odata.type.Date'` | 10 (CQDetail) |
| `type:'CodeDescType'` | `type:'brasmar.bm01.controloqualidade4.ext.modules.CodeDescType'` | 14 (CQDetail) |

`Date` and `CodeDescType` have the same problem. They only log less often because they are used less.

### VS Code find / replace (regex on, files `webapp/ext/view/*.view.xml`)
| Find | Replace |
|---|---|
| `type:\s*'Decimal'` | `type:'sap.ui.model.odata.type.Decimal'` |
| `type:\s*'Date'` | `type:'sap.ui.model.odata.type.Date'` |
| `type:\s*'CodeDescType'` | `type:'brasmar.bm01.controloqualidade4.ext.modules.CodeDescType'` |

Example (`CQLinhaDetail.view.xml`, `CQDetailLinha_amostra_Sal`):
```xml
<!-- before -->
<Text id="CQDetailLinha_amostra_Sal" emptyIndicatorMode="On" text="{path:'Sal', type:'Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" visible="{= !${ui>/isEditable} }">
<!-- after -->
<Text id="CQDetailLinha_amostra_Sal" emptyIndicatorMode="On" text="{path:'Sal', type:'sap.ui.model.odata.type.Decimal', formatOptions:{minFractionDigits:2,maxFractionDigits:2,preserveDecimals: false}, constraints:{precision:4,scale:2}}" visible="{= !${ui>/isEditable} }">
```

## Verify
1. Reload both pages with the console open. The `failed to load 'Decimal.js'` (and `Date.js` /
   `CodeDescType.js`) errors are gone.
2. Values are still shown with 2 decimals, and editing a decimal field still validates and saves.
3. The Network tab shows no request to `resources/Decimal.js`, `Date.js` or `CodeDescType.js`.

## If errors remain
If UI5 now logs a *warning* about global name access for `sap.ui.model.odata.type.Decimal`, it is harmless and much
less severe than the module error.

If a `ModuleError` still appears for one of these names, a binding still uses the alias. Search for
`type:'Decimal'` again; the alias may be written with spaces or double quotes.
