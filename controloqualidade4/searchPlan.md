# searchPlan: value-help dialog with editable In-parameter filters, and a search that works without TOLOWER

> After approval, this exact content is saved as `controloqualidade4/searchPlan.md`. That is the only file written. No project code is changed.

## Context
`EditHelper.openValueHelp` ([EditHelper.ts:268](controloqualidade4/webapp/ext/modules/EditHelper.ts#L268)) opens a `sap.m.TableSelectDialog`. It has two problems.

1. **The In parameters can't be seen or changed.** The `Common.ValueListParameterIn/InOut` parameters are built into `valueHelpInFilters` and applied to the binding without the user seeing them. For example, `Responsavel` and `Linha` are filtered by `Centro`, and `Lote` is filtered by material and plant. If the record's value is wrong or empty, the user gets the wrong list and can't fix the filter. `TableSelectDialog` can only hold a search field and a table, so filter fields can't be added to it.
2. **The search breaks on services without TOLOWER.** `onValueHelpSearch` builds `new Filter({ ..., caseSensitive: false })`. OData V4 turns this into `contains(tolower(Prop),tolower('x'))`, and services that don't support `tolower` reject that. The search also only looks at `textProperty ?? keyProperty`, and it fails on numeric keys (for example, `Edm.Int16` codes such as Marca), because `contains` only works on strings.

**Intended outcome:** the user sees the active In filters and can show, hide, edit and clear them. The search returns rows matching the key or the description in a way that is close to case-insensitive, without sending `tolower`.

## Approach

### 1. Replace `TableSelectDialog` with a `sap.m.Dialog` built in code
This stays inside `EditHelper.ts` and uses only sap.m controls, matching the rest of the custom views.

```
┌ Dialog (title = ValueList Label) ──────────────────────────────┐
│ subHeader: [ SearchField ............ ] [⧩ Mostrar filtros (1)] │
│ ┌ filter area (visible = vh>/showFilters) ────────────────────┐ │
│ │ Centro [1000   ]   Material [....]        [Aplicar][Limpar] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ infoToolbar (only when filters are hidden AND active):          │
│   "Filtrado por: Centro: 1000"   ← click shows the filters      │
│ Table (SingleSelectMaster, growing 50) with the ValueList cols   │
│                                              [Cancelar]          │
└─────────────────────────────────────────────────────────────────┘
```

- **Dialog state:** each dialog gets its own `JSONModel`, named `vh`, holding `{ search, showFilters, filters: [{property, localProperty, label, type, value, valueState}], activeCount, activeText }`.
- **Filter fields:** the filter area is a `FlexBox` (wrap) whose `items` are bound to `vh>/filters`. The template is a `VBox` holding a `Label` and an `Input`. The Input's `submit` applies the filters.
- **What is a filter field:** an `In` or `InOut` parameter whose `LocalDataProperty` is not the field being edited. This is the same rule as today, now worked out once in `loadValueList` as `info.inParameters`.
- **Prefilled values:** every time the dialog opens, each filter is filled from the record (`context.getProperty(localProperty)`). This keeps the current default behaviour. The user can then change or clear the values, and an empty value means no filter.
- **The toggle button:**
  - Its label is "Mostrar filtros" or "Ocultar filtros", followed by `(n)` when filters are active.
  - It is hidden when the value list has no In parameters.
  - The show or hide choice is remembered for that dialog while the page is open.
- **Filter values are typed:** `value` is converted using the value-list property's `$Type`:
  - Int16, Int32, Byte, SByte, Double and Single become a number;
  - Int64 and Decimal stay a numeric string, because V4 expects strings for those;
  - everything else stays a string;
  - an invalid number sets `valueState = Error` and that filter is skipped.
- **Filters are combined in one binding call:** the In filters and the search filter are wrapped in a single `Filter({ and: true })`. When two filters use the same path, an array would OR them instead. The constant filters stay on the binding's application filters from `bindItems`, as today.
- **Choosing a row:** `selectionChange` closes the dialog and runs the existing logic to write back the Out parameters, skip computed properties and request side effects. Only the method was renamed, from `onValueHelpConfirm` to `onValueHelpSelect`.

### 2. A search that doesn't use TOLOWER
- **`$search`:** when `SearchSupported` is true, nothing changes and the backend's `$search` is used.
- **Otherwise:** the search builds an OR group over the **key and description** columns:
  - On `Edm.String` columns it uses `contains` with **`caseSensitive: true`**, so no `tolower` is sent. It tries 4 spellings: as typed, UPPER, lower and Capitalized (`"bacalhau" → bacalhau, BACALHAU, Bacalhau`). This covers how SAP descriptions are normally written.
  - On numeric columns it uses `eq` when the text is a valid number, because `contains` would fail there.
- **Limitation:** spellings with mixed case inside a word (for example `"McDonald"` searched as `"mcdonald"`) are only found when the user types the stored spelling.
- **Proper long-term fix (backend, optional):** annotate the value-help CDS views with `@Search.searchable: true` and `@Search.defaultSearchElement` on the key and description fields. The service then reports `SearchSupported = true` and the frontend uses `$search`, which is case-insensitive and fuzzy on the server. The frontend code below already handles that path.

### 3. Files
| File | Change |
|---|---|
| `controloqualidade4/webapp/ext/modules/EditHelper.ts` | Rewrite the value-help section. Nothing else changes. |
| `controloqualidade4/webapp/i18n/i18n.properties` | Add 7 `valueHelp.*` keys at the end. |

The controllers and views don't change: `onValueHelpRequest` still calls `editHelper.openValueHelp(input)`.

## Full source: `controloqualidade4/webapp/ext/modules/EditHelper.ts`

```ts
import Log from "sap/base/Log";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Button from "sap/m/Button";
import Column from "sap/m/Column";
import ColumnListItem from "sap/m/ColumnListItem";
import Dialog from "sap/m/Dialog";
import DraftIndicator from "sap/m/DraftIndicator";
import FlexBox from "sap/m/FlexBox";
import HBox from "sap/m/HBox";
import Input from "sap/m/Input";
import Label from "sap/m/Label";
import { ListBase$SelectionChangeEvent } from "sap/m/ListBase";
import MessageItem from "sap/m/MessageItem";
import MessagePopover from "sap/m/MessagePopover";
import OverflowToolbar from "sap/m/OverflowToolbar";
import OverflowToolbarLayoutData from "sap/m/OverflowToolbarLayoutData";
import SearchField from "sap/m/SearchField";
import Select from "sap/m/Select";
import Table from "sap/m/Table";
import Text from "sap/m/Text";
import Toolbar from "sap/m/Toolbar";
import VBox from "sap/m/VBox";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Item from "sap/ui/core/Item";
import Messaging from "sap/ui/core/Messaging";
import View from "sap/ui/core/mvc/View";
import CompositeBinding from "sap/ui/model/CompositeBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataPropertyBinding from "sap/ui/model/odata/v4/ODataPropertyBinding";
import ResourceModel from "sap/ui/model/resource/ResourceModel";

type ValueListParameter = {
    $Type: string;
    LocalDataProperty?: { $PropertyPath: string };
    ValueListProperty: string;
    Constant?: string;
};

type ValueListMapping = {
    $model: ODataModel;
    CollectionPath: string;
    Label?: string;
    SearchSupported?: boolean;
    Parameters: ValueListParameter[];
};

type ValueListColumn = { property: string; label: string; type: string };

/** In/InOut parameter shown to the user as an editable filter in the value-help dialog */
type ValueListFilterField = { property: string; localProperty: string; label: string; type: string };

type FilterFieldState = ValueListFilterField & { value: string; valueState: string };

type ValueListInfo = {
    mapping: ValueListMapping;
    localProperty: string;
    keyProperty: string;
    textProperty?: string;
    columns: ValueListColumn[];
    inParameters: ValueListFilterField[];
};

type SideEffectsAnnotation = {
    TargetProperties?: (string | { $PropertyPath: string })[];
    TargetEntities?: { $NavigationPropertyPath?: string }[];
};

type ValueHelpTarget = { input: Input; context: Context; info: ValueListInfo };

type ValueHelpDialogParts = { dialog: Dialog; table: Table; model: JSONModel; info: ValueListInfo };

const COMMON = "@com.sap.vocabularies.Common.v1";
const CORE_COMPUTED = "@Org.OData.Core.V1.Computed";
const IN_PARAMETER = /ValueListParameter(In|InOut)$/;
const OUT_PARAMETER = /ValueListParameter(Out|InOut)$/;
const DISPLAY_PARAMETER = /ValueListParameterDisplayOnly$/;
const LOG_COMPONENT = "brasmar.bm01.controloqualidade4.EditHelper";
const CONSTANT_PARAMETER = /ValueListParameterConstant$/;
const NUMBER_TYPE = /^Edm\.(Byte|SByte|Int16|Int32|Double|Single)$/;
const STRING_NUMBER_TYPE = /^Edm\.(Int64|Decimal)$/;

export default class EditHelper {
    private readonly view: View;
    private readonly draftIndicatorId?: string;
    private readonly valueLists = new Map<string, Promise<ValueListInfo | undefined>>();
    private readonly valueHelpDialogs = new Map<string, ValueHelpDialogParts>();
    private valueHelpTarget?: ValueHelpTarget;
    private currentContext?: Context;
    private patchBinding?: ODataContextBinding;
    private messagePopover?: MessagePopover;

    /**
     * Construtor cria Model Message 
     * e evento para mudar edit mode 
     */
    constructor(view: View, draftIndicatorId?: string) {
        this.view = view;
        this.draftIndicatorId = draftIndicatorId;

        Messaging.registerObject(view, true);
        view.setModel(Messaging.getMessageModel(), "message");
        view.attachModelContextChange(this.onContextChange, this);
    }

    /** 
     * Destroi o contesto e a messaging class
     */
    public destroy(): void {
        this.view.detachModelContextChange(this.onContextChange, this);
        Messaging.unregisterObject(this.view);
    }

    /**
     * Verifica se esta em edit mode ou nao
     * Sync => mudifica atributo usado nos campos de input 
     * AttachPatchEvents => Draft related messages
     * initSelects => vai buscar dados para dropdowns dos inputs 
    */
    private onContextChange(): void {
        const context = this.view.getBindingContext() as Context | null | undefined;
        if (!context || context === this.currentContext) {
            return;
        }
        this.currentContext = context;

        const isDraft = context.getProperty("IsActiveEntity") === false || /IsActiveEntity=false\)$/.test(context.getPath());
        this.syncEditMode(isDraft);
        this.attachPatchEvents(context);
        if (isDraft) {
            setTimeout(() => void this.initSelects(), 0)
        }
    }

    /**
     * Mudifica atributo dos inputs
     */
    private syncEditMode(isDraft: boolean): void {
        const uiModel = this.view.getModel("ui") as JSONModel | undefined;
        if (uiModel && uiModel.getProperty("/isEditable") !== isDraft) {
            uiModel.setProperty("/isEditable", isDraft);
            uiModel.setProperty("/editMode", isDraft ? "Editable" : "Display");
        }
    }

    /**
     * Atribui os eventos ao draft
     * Para aparecer Guardando... Guardado
     */
    private attachPatchEvents(context: Context): void {
        const binding = context.getBinding() as ODataContextBinding | undefined;
        if (!binding || binding === this.patchBinding || typeof binding.attachPatchSent !== "function") {
            return;
        }
        this.patchBinding = binding;
        binding.attachPatchSent(() => this.getDraftIndicator()?.showDraftSaving());
        binding.attachPatchCompleted((event: Event<{ success: boolean }>) => {
            const indicator = this.getDraftIndicator();
            if (event.getParameter("success")) {
                indicator?.showDraftSaved();
            } else {
                indicator?.clearDraftState();
            }
        });
    }

    /**
     * Retorna o draftIndicator da view atraves do id
     * passado no construtor
     */
    private getDraftIndicator(): DraftIndicator | undefined {
        return this.draftIndicatorId ? (this.view.byId(this.draftIndicatorId) as DraftIndicator | undefined) : undefined;
    }

    /**
     * Vai vuscar todos os objetos da view que sejam
     * sap.m.Select e que tenham a property valueList = true
     * Por cada obj encontrado associa os valores das dropdowns
     * Promise all para fazer isso concurrentemente
     */
    public async initSelects(): Promise<void> {
        const selects = this.view.findAggregatedObjects(true, (object) =>
            object instanceof Select && object.data("valueList") === "true") as Select[];
        await Promise.all(selects.map((select) => this.bindSelectItems(select)));
    }

    /**
     * Associa binding de search-help aos inputs
     */
    private async bindSelectItems(select: Select): Promise<void> {
        if (select.getBinding("items")) {
            return;
        }
        const binding = select.getBinding("selectedKey") as ODataPropertyBinding | undefined;
        if (!binding) {
            return;
        }
        const info = await this.getValueList(binding);
        if (!info) {
            return;
        }

        select.setModel(info.mapping.$model, "vl");
        select.bindItems({
            path: `vl>/${info.mapping.CollectionPath}`,
            length: 1000,
            templateShareable: false,
            filters: this.getConstantFilters(info),
            template: new Item({
                key: `{vl>${info.keyProperty}}`,
                text: `{vl>${info.textProperty ?? info.keyProperty}}`
            })
        });
    }

    /**
    * Filters from ValueListParameterConstant entries: the value list only offers rows
    * where ValueListProperty equals the constant (e.g. Tipo eq 'A').
    */
    private getConstantFilters(info: ValueListInfo): Filter[] {
        return info.mapping.Parameters
            .filter((p) => CONSTANT_PARAMETER.test(p.$Type) && p.Constant !== undefined)
            .map((p) => new Filter(p.ValueListProperty, FilterOperator.EQ, p.Constant));
    }

    /**
     * Vai buscar os metadados dos search helpers
     */
    private getValueList(binding: ODataPropertyBinding): Promise<ValueListInfo | undefined> {
        const resolvedPath = binding.getResolvedPath();
        if (!resolvedPath) {
            return Promise.resolve(undefined);
        }

        const metaModel = (binding.getModel() as ODataModel).getMetaModel();
        const cacheKey = metaModel.getMetaPath(resolvedPath);
        let promise = this.valueLists.get(cacheKey);
        if (!promise) {
            promise = this.loadValueList(binding, binding.getPath() as string);
            this.valueLists.set(cacheKey, promise);
        }
        return promise;
    }

    private async loadValueList(binding: ODataPropertyBinding, localProperty: string): Promise<ValueListInfo | undefined> {
        try {
            // 1. ask UI5 for the value-list definition of this field
            const mappings = (await binding.requestValueListInfo(true)) as Record<string, ValueListMapping>;
            const mapping = mappings[""] ?? Object.values(mappings)[0];
            if (!mapping) {
                return undefined;
            }

            // 2. which value-list column holds the code of this field
            const keyParameter = mapping.Parameters.find((p) => p.LocalDataProperty?.$PropertyPath === localProperty)
                ?? mapping.Parameters.find((p) => !CONSTANT_PARAMETER.test(p.$Type))
                ?? mapping.Parameters[0];
            const keyProperty = keyParameter.ValueListProperty;

            // 3. which value-list column holds the description
            const valueListMetaModel = mapping.$model.getMetaModel();
            const entityPath = `/${mapping.CollectionPath}`;
            const textProperty = ((await valueListMetaModel.requestObject(`${entityPath}/${keyProperty}${COMMON}.Text/$Path`)) as string | undefined)
                ?? mapping.Parameters.find((p) => DISPLAY_PARAMETER.test(p.$Type))?.ValueListProperty;

            // 4. columns (with labels and Edm types) for the value-help dialog
            const properties = [...new Set(mapping.Parameters.map((p) => p.ValueListProperty))];
            if (textProperty && !properties.includes(textProperty)) {
                properties.push(textProperty);
            }
            const columns = await Promise.all(properties.map(async (property) => {
                const [label, type] = await Promise.all([
                    valueListMetaModel.requestObject(`${entityPath}/${property}${COMMON}.Label`) as Promise<string | undefined>,
                    valueListMetaModel.requestObject(`${entityPath}/${property}/$Type`) as Promise<string | undefined>
                ]);
                return { property, label: label ?? property, type: type ?? "Edm.String" };
            }));

            // 5. In parameters that depend on other fields of the record (e.g. Centro) -> editable dialog filters
            const inParameters = mapping.Parameters
                .filter((p) => IN_PARAMETER.test(p.$Type) && p.LocalDataProperty && p.LocalDataProperty.$PropertyPath !== localProperty)
                .map((p) => {
                    const column = columns.find((c) => c.property === p.ValueListProperty);
                    return {
                        property: p.ValueListProperty,
                        localProperty: p.LocalDataProperty!.$PropertyPath,
                        label: column?.label ?? p.ValueListProperty,
                        type: column?.type ?? "Edm.String"
                    };
                });

            return { mapping, localProperty, keyProperty, textProperty, columns, inParameters };
        } catch (error) {
            Log.warning(`No value list for ${localProperty}`, String(error), LOG_COMPONENT);
            return undefined;
        }
    }

    /* ---------- large value lists (Input + dialog) ---------- */
    public async openValueHelp(input: Input): Promise<void> {
        const binding = this.getPropertyBinding(input, "value");
        const context = input.getBindingContext() as Context | null | undefined;
        if (!binding || !context) {
            return;
        }

        const info = await this.getValueList(binding);
        if (!info) {
            return;
        }

        const parts = this.getValueHelpDialog(info);
        this.valueHelpTarget = { input, context, info };

        //Preenche os filtros com os valores do controlo (p.e. lotes de um material); o utilizador pode altera-los no dialog
        const filters: FilterFieldState[] = info.inParameters.map((field) => {
            const value = context.getProperty(field.localProperty) as unknown;
            return { ...field, value: value === undefined || value === null ? "" : String(value), valueState: "None" };
        });
        parts.model.setData({
            search: "",
            showFilters: parts.model.getProperty("/showFilters") === true,
            filters,
            activeCount: 0,
            activeText: ""
        });

        this.applyValueHelpFilters(parts);
        parts.dialog.open();
    }

    /**
    * Returns the OData property binding of a control property.
    * For composite bindings (e.g. "{parts:['Marca','MarcaDesc'], formatter:…}") the FIRST part is used,
    * so the code field must always be the first part.
     */
    private getPropertyBinding(control: Control, property: string): ODataPropertyBinding | undefined {
        const binding = control.getBinding(property);
        if (!binding) {
            return undefined;
        }
        if (binding.isA("sap.ui.model.CompositeBinding")) {
            return (binding as CompositeBinding).getBindings()[0] as ODataPropertyBinding | undefined;
        }
        return binding as ODataPropertyBinding;
    }


    /**
     * Cria o dialog com as colunas previstas nos metadados,
     * uma search bar e uma area de filtros (In parameters) que pode ser mostrada/escondida
     */
    private getValueHelpDialog(info: ValueListInfo): ValueHelpDialogParts {
        const key = `${info.mapping.CollectionPath}|${info.localProperty}`;
        const existing = this.valueHelpDialogs.get(key);
        if (existing) {
            return existing;
        }

        const model = new JSONModel({ search: "", showFilters: false, filters: [], activeCount: 0, activeText: "" });
        const apply = (): void => this.applyValueHelpFilters(parts);
        const toggleFilters = (): void => model.setProperty("/showFilters", !model.getProperty("/showFilters"));

        const searchField = new SearchField({
            width: "100%",
            placeholder: this.getText("valueHelp.search"),
            value: "{vh>/search}",
            search: apply,
            layoutData: new OverflowToolbarLayoutData({ shrinkable: true, minWidth: "10rem" })
        });

        const filterButton = new Button({
            icon: "sap-icon://filter",
            type: "Transparent",
            visible: info.inParameters.length > 0,
            text: {
                parts: [{ path: "vh>/showFilters" }, { path: "vh>/activeCount" }],
                formatter: (show: boolean, count: number) =>
                    `${this.getText(show ? "valueHelp.hideFilters" : "valueHelp.showFilters")}${count > 0 ? ` (${count})` : ""}`
            },
            press: toggleFilters
        });

        const filterFieldTemplate = new VBox({
            items: [
                new Label({ text: "{vh>label}" }),
                new Input({ value: "{vh>value}", valueState: "{vh>valueState}", width: "12rem", submit: apply })
            ]
        });
        filterFieldTemplate.addStyleClass("sapUiSmallMarginEnd sapUiTinyMarginBottom");

        const filterArea = new VBox({
            visible: "{vh>/showFilters}",
            items: [
                new FlexBox({
                    wrap: "Wrap",
                    alignItems: "End",
                    items: { path: "vh>/filters", template: filterFieldTemplate, templateShareable: false }
                }),
                new HBox({
                    justifyContent: "End",
                    items: [
                        new Button({ text: this.getText("valueHelp.go"), type: "Emphasized", press: apply }),
                        new Button({
                            text: this.getText("valueHelp.clear"),
                            type: "Transparent",
                            press: () => {
                                (model.getProperty("/filters") as FilterFieldState[]).forEach((_f, index) =>
                                    model.setProperty(`/filters/${index}/value`, ""));
                                apply();
                            }
                        })
                    ]
                })
            ]
        });
        filterArea.addStyleClass("sapUiSmallMarginBeginEnd sapUiSmallMarginTop");

        const table = new Table({
            mode: "SingleSelectMaster",
            growing: true,
            growingThreshold: 50,
            growingScrollToLoad: true,
            sticky: ["ColumnHeaders", "InfoToolbar"],
            infoToolbar: new Toolbar({
                active: true,
                design: "Info",
                visible: "{= !${vh>/showFilters} && ${vh>/activeCount} > 0 }",
                content: [new Text({ text: "{vh>/activeText}" })],
                press: toggleFilters
            }),
            columns: info.columns.map((column) => new Column({ header: new Label({ text: column.label }) })),
            selectionChange: (event: ListBase$SelectionChangeEvent) => void this.onValueHelpSelect(event, parts)
        });
        table.setModel(info.mapping.$model, "vl");
        table.bindItems({
            path: `vl>/${info.mapping.CollectionPath}`,
            templateShareable: false,
            filters: this.getConstantFilters(info),
            template: new ColumnListItem({
                cells: info.columns.map((column) => new Text({ text: `{vl>${column.property}}` }))
            })
        });

        const dialog = new Dialog({
            title: info.mapping.Label ?? info.localProperty,
            contentWidth: "50rem",
            contentHeight: "70%",
            resizable: true,
            draggable: true,
            horizontalScrolling: false,
            subHeader: new OverflowToolbar({ content: [searchField, filterButton] }),
            content: [filterArea, table],
            endButton: new Button({ text: this.getText("valueHelp.cancel"), press: () => dialog.close() })
        });
        dialog.setModel(model, "vh");
        this.view.addDependent(dialog);

        const parts: ValueHelpDialogParts = { dialog, table, model, info };
        this.valueHelpDialogs.set(key, parts);
        return parts;
    }

    /**
     * Aplica filtros (In parameters editados pelo utilizador) + pesquisa a tabela do dialog.
     * Constantes ja estao nos application filters do bindItems.
     */
    private applyValueHelpFilters(parts: ValueHelpDialogParts): void {
        const { model, table, info } = parts;
        const search = String(model.getProperty("/search") ?? "").trim();
        const fields = (model.getProperty("/filters") ?? []) as FilterFieldState[];

        const filters: Filter[] = [];
        const active: string[] = [];
        fields.forEach((field, index) => {
            const text = String(field.value ?? "").trim();
            const value = text ? this.parseFilterValue(text, field.type) : undefined;
            model.setProperty(`/filters/${index}/valueState`, text && value === undefined ? "Error" : "None");
            if (value !== undefined) {
                filters.push(new Filter(field.property, FilterOperator.EQ, value));
                active.push(`${field.label}: ${text}`);
            }
        });
        model.setProperty("/activeCount", active.length);
        model.setProperty("/activeText", this.getText("valueHelp.filteredBy", [active.join(", ")]));

        const itemsBinding = table.getBinding("items") as ODataListBinding;
        if (info.mapping.SearchSupported) {
            itemsBinding.changeParameters({ $search: search || undefined });
        } else {
            const searchFilter = this.getSearchFilter(info, search);
            if (searchFilter) {
                filters.push(searchFilter);
            }
        }
        // one AND group: an array of filters on the same path would be OR-ed by UI5
        itemsBinding.filter(filters.length > 0 ? new Filter({ filters, and: true }) : []);
    }

    /**
     * Pesquisa sem tolower() (nao suportado por alguns servicos):
     * contains case-sensitive sobre codigo e descricao, com as variantes
     * original / MAIUSCULAS / minusculas / Capitalizado, ligadas por OR.
     * Colunas numericas usam eq (contains so funciona em Edm.String).
     */
    private getSearchFilter(info: ValueListInfo, search: string): Filter | undefined {
        if (!search) {
            return undefined;
        }
        const variants = [...new Set([search, search.toUpperCase(), search.toLowerCase(), this.capitalize(search)])];
        const searchProperties = new Set([info.keyProperty, info.textProperty ?? info.keyProperty]);

        const filters: Filter[] = [];
        info.columns
            .filter((column) => searchProperties.has(column.property))
            .forEach((column) => {
                if (column.type === "Edm.String") {
                    variants.forEach((variant) => filters.push(new Filter({
                        path: column.property,
                        operator: FilterOperator.Contains,
                        value1: variant,
                        caseSensitive: true // no tolower() in the request
                    })));
                } else if (NUMBER_TYPE.test(column.type) || STRING_NUMBER_TYPE.test(column.type)) {
                    const value = this.parseFilterValue(search, column.type);
                    if (value !== undefined) {
                        filters.push(new Filter(column.property, FilterOperator.EQ, value));
                    }
                }
            });
        return filters.length > 0 ? new Filter({ filters, and: false }) : undefined;
    }

    /**
     * Converte o texto escrito pelo utilizador para o tipo JS esperado pelo OData V4
     * (number para Int16/Int32/..., string para Int64/Decimal). undefined = valor invalido.
     */
    private parseFilterValue(text: string, type: string): unknown {
        if (NUMBER_TYPE.test(type)) {
            const number = Number(text.replace(",", "."));
            return Number.isFinite(number) ? number : undefined;
        }
        if (STRING_NUMBER_TYPE.test(type)) {
            const normalised = text.replace(",", ".");
            return /^-?\d+(\.\d+)?$/.test(normalised) ? normalised : undefined;
        }
        return text;
    }

    private capitalize(text: string): string {
        return text.toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
    }

    private async onValueHelpSelect(event: ListBase$SelectionChangeEvent, parts: ValueHelpDialogParts): Promise<void> {
        const item = event.getParameter("listItem");
        const target = this.valueHelpTarget;
        parts.table.removeSelections(true);
        parts.dialog.close();
        if (!item || !target) {
            return;
        }
        const row = item.getBindingContext("vl") as Context;
        const { context, info, input } = target;

        const outParameters = info.mapping.Parameters
            .filter((p) => OUT_PARAMETER.test(p.$Type) && p.LocalDataProperty);
        if (!outParameters.some((p) => p.LocalDataProperty?.$PropertyPath === info.localProperty)) {
            outParameters.push({
                $Type: "Key",
                LocalDataProperty: { $PropertyPath: info.localProperty },
                ValueListProperty: info.keyProperty
            });
        }

        // never write into computed properties (e.g. descriptions filled by the backend)
        const metaModel = (context.getModel() as ODataModel).getMetaModel();
        const entityMetaPath = metaModel.getMetaPath(context.getPath());
        const computed = await Promise.all(outParameters.map((p) =>
            metaModel.requestObject(`${entityMetaPath}/${p.LocalDataProperty!.$PropertyPath}${CORE_COMPUTED}`)));

        await Promise.all(outParameters
            .filter((_p, index) => !computed[index])
            .map((p) => context.setProperty(p.LocalDataProperty!.$PropertyPath as string, row.getProperty(p.ValueListProperty))));

        await this.requestSideEffects(input);
    }

    /* ---------- side effects ---------- */
    public async requestSideEffects(control: Control): Promise<void> {
        const binding = this.getPropertyBinding(control, "value")
            ?? this.getPropertyBinding(control, "selectedKey")
            ?? this.getPropertyBinding(control, "state");

        const context = control.getBindingContext() as Context | null | undefined;
        if (!binding || !context) {
            return;
        }

        const property = binding.getPath();
        const metaModel = (context.getModel() as ODataModel).getMetaModel();
        const entityMetaPath = metaModel.getMetaPath(context.getPath());

        // backend side effect for the field (if any) and the field's description property (Common.Text)
        const [sideEffects, textPath] = await Promise.all([
            metaModel.requestObject(`${entityMetaPath}/${COMMON}.SideEffects#SAP__Field_${property}`) as Promise<SideEffectsAnnotation | undefined>,
            metaModel.requestObject(`${entityMetaPath}/${property}${COMMON}.Text/$Path`) as Promise<string | undefined>
        ]);

        const targets: ({ $PropertyPath: string } | { $NavigationPropertyPath: string })[] = [
            ...(sideEffects?.TargetProperties ?? []).map((p) => ({ $PropertyPath: typeof p === "string" ? p : p.$PropertyPath })),
            ...(sideEffects?.TargetEntities ?? []).map((n) => ({ $NavigationPropertyPath: n.$NavigationPropertyPath ?? "" }))
        ];

        // the description (e.g. Marca -> MarcaDesc) is filled by the backend, but most fields have no
        // SideEffects annotation, so ask for it explicitly
        if (textPath && !targets.some((t) => "$PropertyPath" in t && t.$PropertyPath === textPath)) {
            targets.push({ $PropertyPath: textPath });
        }

        if (targets.length > 0) {
            await context.requestSideEffects(targets);
        }
    }

    /* ---------- messages ---------- */
    public openMessages(button: Button): void {
        if (!this.messagePopover) {
            this.messagePopover = new MessagePopover({
                items: {
                    path: "message>/",
                    template: new MessageItem({
                        type: "{message>type}",
                        title: "{message>message}",
                        subtitle: "{message>additionalText}",
                        description: "{message>description}"
                    })
                }
            });
            this.view.addDependent(this.messagePopover);
        }
        this.messagePopover.toggle(button);
    }

    /* ---------- helpers ---------- */
    private getText(key: string, args?: string[]): string {
        const bundle = (this.view.getModel("i18n") as ResourceModel | undefined)?.getResourceBundle() as ResourceBundle | undefined;
        return bundle?.getText(key, args) ?? key;
    }
}
```

**Changes compared with the current file:**
- **Removed:** the `TableSelectDialog` import and its event imports, `valueHelpInFilters`, `onValueHelpSearch` and `onValueHelpConfirm`.
- **Added:** `ValueListColumn.type`, `ValueListInfo.inParameters`, `ValueHelpDialogParts`, `applyValueHelpFilters`, `getSearchFilter`, `parseFilterValue`, `capitalize`, `onValueHelpSelect` and `getText`.
- **Rewritten:** `getValueHelpDialog` (now returns the parts), and `openValueHelp`, which fills the filter model instead of building hidden filters.
- **Unchanged:** the draft and edit-mode code, Selects, side effects and messages.

## Additions to `controloqualidade4/webapp/i18n/i18n.properties` (at the end of the file)

```properties

#Value help dialog
valueHelp.search=Pesquisar
valueHelp.showFilters=Mostrar filtros
valueHelp.hideFilters=Ocultar filtros
valueHelp.go=Aplicar
valueHelp.clear=Limpar
valueHelp.cancel=Cancelar
valueHelp.filteredBy=Filtrado por: {0}
```

## Verification
1. Run `npm run ts-typecheck`. It must pass; the UI5 1.120 types cover every control and event used.
2. Run `npm start`, open a CQ, click Edit, and open the value help on **Responsável** or **Linha** (In parameter = `Centro`).
   - The button reads "Mostrar filtros (1)". The info bar reads "Filtrado por: Centro: 1000" and clicking it shows the filters.
   - Change Centro and press Enter or Aplicar, and the list reloads with the new plant. Limpar removes the filter and the list shows every plant.
   - Hide and reopen the filters, then close and reopen the dialog: the filter values are filled again from the record.
3. Search:
   - Type `bacalhau` in a dialog where `SearchSupported` is false. The browser network tab shows `contains(Desc,'bacalhau') or contains(Desc,'BACALHAU') or contains(Desc,'Bacalhau') …` with **no `tolower`**, and no 501 or 400 error.
   - On a value list with a numeric key (for example Marca), searching `12` sends `Marca eq 12`.
4. Pick a row: the field and its Out parameters are filled, the description refreshes through side effects, and the dialog closes.
5. Value help on **Lote** (In parameters = material and plant): the filters are shown, and typing letters into a numeric filter turns that field red and skips it.
