# Open amostra tabs in the URL (refresh / shared link)

## Goal
The `CQDetailLinha_multi_tabs` TabContainer must keep its tabs when the page is **refreshed**, or when the link is
**pasted** in another tab, browser or e-mail. Today the tabs live only in memory (`MultiInstance.model`):
- After a refresh the page shows a single tab.
- A pasted link opens a single amostra.

## URL format
The FE route of the amostra page already accepts a query string:
```
"pattern": "CQCab({CQCabKey})/_linhas({_linhasKey}):?query:"
```
The open tabs go into one parameter, **`amostras`**. Its value is the list of their `Linha` values, in tab order:
```
#app-preview&/CQCab(Centro='BM01',ID='1000000102',DraftUUID=…,IsActiveEntity=false)/_linhas(Centro='BM01',Id='1000000102',Linha='20',DraftUUID=…,IsActiveEntity=false)?amostras=10,20,30
                                                                                                            └── selected tab (route path) ─┘       └ all open tabs ┘
```
- **The selected tab** is the amostra in the route path, exactly as today.
- **Only `Linha` goes in the query.** The other keys (`Centro`, `Id`, `DraftUUID`, `IsActiveEntity`) are the same for every
  tab: all tabs belong to the same CQ, in the same draft or active state. Each tab's path is rebuilt from the route key
  by swapping its `Linha`.
- **A single tab** writes no `?amostras`. The URL then stays identical to the standard FE row navigation.

## Design
**The URL is the source of truth for the tab list.** `MultiInstance.model` is still the model the TabContainer is
bound to, but it is rebuilt from the URL every time the route matches.

| Moment | Before | Now |
|---|---|---|
| "Abrir selecionadas" (CQDetail) | `MultiInstance.open(selected)` + `navigate(selected[0])` | `navigateToRoute(ROUTE, {keys of selected[0], ?query: {amostras}})` |
| Route `CQLinhasCQLinhaDetailPage` matched (any navigation, **refresh, pasted link**) | – | `MultiInstance.fromRoute(arguments)` rebuilds the tabs from `?amostras` and selects the route amostra |
| Tab click | `navigate(context)` | `navigateToRoute` with the current tab list |
| "+" (new amostra) | `add` + `navigate(context)` | `add` + `navigateToRoute`, so the new Linha is in the URL |
| × close | navigates only if the shown amostra changes | **always** navigates, so the closed Linha leaves the URL; the last tab still goes to the CQ |
| Row click in the CQ table (standard FE) | single tab | single tab (no `?amostras`), unchanged |
| Back on the CQ page | `clear()` | `clear()`, unchanged |

Why `navigateToRoute` instead of writing the hash directly:
- It goes through the same FE routing as today, so FE rebinds the page, keeps the draft handling and
  preserves the history behaviour.
- FE builds the hash with `Router.getURL(route, parameters)`, which turns `"?query": {amostras: "10,20"}`
  into `?amostras=10,20` for the `:?query:` pattern.

`onAmostraContextChange` keeps calling `MultiInstance.ensure` as a fallback for a path that isn't in the tabs. It now
takes `Linha` from the path (`linhaOf`) instead of reading it from the backend, because `Linha` is part of the key.

## Files
| File | Change |
|---|---|
| `webapp/ext/modules/MultiInstance.ts` | `ROUTE`, `AmostraRouteArguments`, `fromRoute`, `getRouteParameters`, `linhaOf`; `open` removed (no longer used) |
| `webapp/ext/view/CQDetail.controller.ts` | `onOpenAmostras` navigates with `?amostras` |
| `webapp/ext/view/CQLinhaDetail.controller.ts` | route `patternMatched` → `fromRoute`; `navigateToPath` uses `navigateToRoute`; close always navigates; `ensure` uses `linhaOf` |

No changes to views, CSS, manifest or i18n.

The sources below were applied to a copy of the **current working tree**. They **compile with the project's `strict`
TypeScript settings against the UI5 1.120 typings**.

---

## 1. `webapp/ext/modules/MultiInstance.ts` (full)
```ts
import JSONModel from "sap/ui/model/json/JSONModel";

//Tipo de um separator
export type AmostraTab = { path: string; linha: string };

/** Argumentos da rota da amostra: "CQCab({CQCabKey})/_linhas({_linhasKey}):?query:" */
export type AmostraRouteArguments = {
    CQCabKey: string;
    _linhasKey: string;
    "?query"?: Record<string, string>;
};

/** "/CQCab(...)" no início do caminho de uma amostra "/CQCab(...)/_linhas(...)" */
const CAB_PATH = /^\/CQCab\([^)]*\)/;
/** "/CQCab(<chave CQ>)/_linhas(<chave amostra>)" */
const AMOSTRA_PATH = /^\/CQCab\(([^)]*)\)\/_linhas\(([^)]*)\)$/;
/** Linha='10' dentro da chave da amostra */
const LINHA_KEY = /Linha='([^']*)'/;
/** parâmetro do URL com as Linhas dos separadores abertos: ...?amostras=10,20,30 */
const QUERY_AMOSTRAS = "amostras";

/** decodeURIComponent que não rebenta com texto já descodificado (p.e. um "%" solto) */
function decode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value;
    }
}

/**
 * Estado partilhado entre o CQDetail (seleção na tabela de amostras) e o CQLinhaDetail (TabContainer).
 * São views diferentes, por isso o modelo é estático (mesmo padrão que SerialScale.model).
 * A lista de separadores vive no URL (?amostras=10,20,30): refrescar a página ou abrir um link
 * colado noutro sítio volta a mostrar os mesmos separadores.
 */
export default class MultiInstance {
    /** rota FE da página da amostra (manifest.json) */
    static readonly ROUTE = "CQLinhasCQLinhaDetailPage";

    static readonly model = new JSONModel({ tabs: [] as AmostraTab[], selectedPath: "" });

    // chamada depois de se criar uma amostra nova
    static refreshAmostras?: () => void;

    /**
     * A rota da amostra foi resolvida (navegação, refresh ou link colado): os separadores passam a ser
     * os do URL. A amostra da rota é sempre um separador e fica selecionada.
     */
    static fromRoute(args: AmostraRouteArguments): void {
        const cabKey = decode(args.CQCabKey);
        const linhaKey = decode(args._linhasKey);
        const selectedPath = `/CQCab(${cabKey})/_linhas(${linhaKey})`;
        const selectedLinha = MultiInstance.linhaOf(selectedPath);

        const linhas = decode(args["?query"]?.[QUERY_AMOSTRAS] ?? "")
            .split(",")
            .map((linha) => linha.trim())
            .filter(Boolean);
        if (selectedLinha && !linhas.includes(selectedLinha)) {
            linhas.unshift(selectedLinha);
        }

        // mesma chave da amostra da rota, só muda a Linha (mesmo CQ, mesmo draft / ativo)
        const tabs = [...new Set(linhas)].map((linha) => ({
            path: `/CQCab(${cabKey})/_linhas(${linhaKey.replace(LINHA_KEY, `Linha='${linha}'`)})`,
            linha
        }));
        MultiInstance.model.setData({
            tabs: tabs.length ? tabs : [{ path: selectedPath, linha: selectedLinha }],
            selectedPath
        });
    }

    /**
     * Parâmetros de navigateToRoute(ROUTE, ...) para abrir a amostra `path` com os separadores `paths`
     * (por defeito os abertos). Com um só separador o URL fica igual ao da navegação normal (sem ?amostras).
     */
    static getRouteParameters(path: string, paths: string[] = MultiInstance.getPaths()): AmostraRouteArguments | undefined {
        const match = AMOSTRA_PATH.exec(path);
        if (!match) {
            return undefined;
        }
        const linhas = paths.map((tabPath) => MultiInstance.linhaOf(tabPath)).filter(Boolean);
        return {
            CQCabKey: match[1],
            _linhasKey: match[2],
            ...(linhas.length > 1 ? { "?query": { [QUERY_AMOSTRAS]: linhas.join(",") } } : {})
        };
    }

    /**
     * A página da amostra foi ligada a `path`. Se não estiver nos separadores (navegação normal,
     * clique numa linha da tabela) passa a ser o único separador. Fica sempre selecionado.
     * Usado para quando a navegação é externa e não a partir da tabela
     */
    static ensure(path: string, linha: string): void {
        const tabs = MultiInstance.getTabs();
        const index = tabs.findIndex((tab) => tab.path === path);
        if (index < 0) {
            MultiInstance.model.setProperty("/tabs", [{ path, linha }]);
        } else if (linha && tabs[index].linha !== linha) {
            MultiInstance.model.setProperty(`/tabs/${index}/linha`, linha);
        }
        MultiInstance.model.setProperty("/selectedPath", path);
    }

    /** Novo separador (amostra acabada de criar), já selecionado */
    static add(path: string, linha: string): void {
        MultiInstance.model.setProperty("/tabs", [...MultiInstance.getTabs(), { path, linha }]);
        MultiInstance.model.setProperty("/selectedPath", path);
    }

    /**
     * Fecha o separador (NÃO apaga a amostra).
     * Devolve o caminho a mostrar a seguir: o vizinho se o fechado era o selecionado,
     * o selecionado atual nos outros casos, ou undefined se não sobrar nenhum separador.
     */
    static remove(path: string): string | undefined {
        const tabs = MultiInstance.getTabs();
        const selected = MultiInstance.model.getProperty("/selectedPath") as string;
        const index = tabs.findIndex((tab) => tab.path === path);
        if (index < 0) {
            return selected || undefined;
        }

        const remaining = tabs.filter((_tab, i) => i !== index);
        const next = remaining.length === 0
            ? undefined
            : selected !== path ? selected : remaining[Math.min(index, remaining.length - 1)].path;

        MultiInstance.model.setProperty("/selectedPath", next ?? "");
        MultiInstance.model.setProperty("/tabs", remaining);
        return next;
    }

    static getSelectedPath(): string {
        return (MultiInstance.model.getProperty("/selectedPath") as string | undefined) ?? "";
    }

    static clear(): void {
        MultiInstance.model.setData({ tabs: [], selectedPath: "" });
    }

    static getPaths(): string[] {
        return MultiInstance.getTabs().map((tab) => tab.path);
    }

    /** "/CQCab(...)/_linhas(...)" -> "/CQCab(...)" */
    static getCabPath(path: string): string | undefined {
        return CAB_PATH.exec(path)?.[0];
    }

    /** "/CQCab(...)/_linhas(...,Linha='10',...)" -> "10" */
    static linhaOf(path: string): string {
        return LINHA_KEY.exec(path)?.[1] ?? "";
    }

    private static getTabs(): AmostraTab[] {
        return (MultiInstance.model.getProperty("/tabs") as AmostraTab[] | undefined) ?? [];
    }
}
```

## 2. `webapp/ext/view/CQDetail.controller.ts`
### `onOpenAmostras` (end of the method)
Before:
```ts
        MultiInstance.open(selected);
        this.getExtensionAPI().getRouting().navigate(selected[0]);
    }
```
After:
```ts
        // as Linhas selecionadas vão no URL (?amostras=...): o CQLinhaDetail cria os separadores a partir dele
        const paths = selected.map((context) => context.getPath());
        const parameters = MultiInstance.getRouteParameters(paths[0], paths);
        if (parameters) {
            void this.getExtensionAPI().getRouting().navigateToRoute(MultiInstance.ROUTE, parameters);
        }
    }
```

## 3. `webapp/ext/view/CQLinhaDetail.controller.ts`
### Imports
Before:
```ts
import MultiInstance from "../modules/MultiInstance";

```
After:
```ts
import MultiInstance, { AmostraRouteArguments } from "../modules/MultiInstance";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";

```

### `onInit` (end of the method)
Before:
```ts
        tabs.getBinding("items")?.attachChange(this.syncAmostraTab, this);
        this.syncAmostraTab();
    }
```
After:
```ts
        tabs.getBinding("items")?.attachChange(this.syncAmostraTab, this);
        this.syncAmostraTab();
        // os separadores abertos vêm do URL (?amostras=...): refresh / link colado mantém-nos
        this.getAppComponent().getRouter().getRoute(MultiInstance.ROUTE)?.attachPatternMatched(this.onAmostraRouteMatched, this);
    }
```

### `onExit` (first line)
Before:
```ts
        this.getView()?.detachModelContextChange(this.onAmostraContextChange, this);

```
After:
```ts
        this.getView()?.detachModelContextChange(this.onAmostraContextChange, this);
        this.getAppComponent().getRouter().getRoute(MultiInstance.ROUTE)?.detachPatternMatched(this.onAmostraRouteMatched, this);

```

### `onAmostraContextChange` (end) + new `onAmostraRouteMatched`
Before:
```ts
        MultiInstance.ensure(path, String(context.getProperty("Linha") ?? ""));
        this.selectAmostraTab(path);
        if (!context.getProperty("Linha")) {
            void context.requestProperty("Linha").then((linha) => MultiInstance.ensure(path, String(linha ?? "")));
        }
    }
```
After:
```ts
        // a Linha faz parte da chave: lê-se do caminho, sem pedido ao backend
        MultiInstance.ensure(path, MultiInstance.linhaOf(path));
        this.selectAmostraTab(path);
    }

    /**
     * Rota da amostra resolvida (separador, "Abrir selecionadas", refresh ou link colado):
     * os separadores passam a ser os do URL (?amostras=10,20,30) mais a amostra da rota.
     */
    private onAmostraRouteMatched(oEvent: Route$PatternMatchedEvent): void {
        MultiInstance.fromRoute(oEvent.getParameter("arguments") as AmostraRouteArguments);
        this.syncAmostraTab();
    }
```

### `onAmostraTabClose` (end of the method)
Before:
```ts
        if (next !== this.getContext().getPath()) {
            this.navigateToPath(next);
        } else {
            this.selectAmostraTab(next);
        }
    }
```
After:
```ts
        // mesmo que a amostra mostrada não mude, navega-se para o URL deixar de ter a amostra fechada
        this.navigateToPath(next);
    }
```

### `navigateToPath`
Before:
```ts
    /** Navega (routing FE) para a amostra / CQ com este caminho OData */
    private navigateToPath(path: string): void {
        const binding = this.getContext().getModel().bindContext(path);
        this.getExtensionAPI().getRouting().navigate(binding.getBoundContext() as Context);
    }
```
After:
```ts
    /**
     * Navega (routing FE) para a amostra / CQ com este caminho OData.
     * Para uma amostra o URL leva os separadores abertos (?amostras=...), para o refresh / link colado.
     */
    private navigateToPath(path: string): void {
        const parameters = MultiInstance.getRouteParameters(path);
        if (parameters) {
            void this.getExtensionAPI().getRouting().navigateToRoute(MultiInstance.ROUTE, parameters);
            return;
        }
        // CQ (fechar o último separador)
        const binding = this.getContext().getModel().bindContext(path);
        this.getExtensionAPI().getRouting().navigate(binding.getBoundContext() as Context);
    }
```

---

## Risks to verify first
1. **`?query` passes through FE.**
   - After "Abrir selecionadas" the address bar must end in `?amostras=…`.
   - If it doesn't, FE's `navigateToRoute` dropped the query. Fallback: build the hash with
     `this.getAppComponent().getRouter().getURL(MultiInstance.ROUTE, parameters)` and navigate with
     `HashChanger.getInstance().setHash(hash)`.
2. **Same amostra, different query.**
   - Closing a tab other than the selected one navigates to the same amostra with a shorter `?amostras`.
   - Check that FE doesn't reload the page or lose unsaved input: it should see the same context and skip the rebind.
   - If it does reload, use `HashChanger.getInstance().replaceHash(...)` for this case only. That also avoids a history
     entry.
3. **Key format.**
   - The route arguments (`CQCabKey`, `_linhasKey`) are decoded and compared with the page context path. They must
     match exactly (`'`, `=`, `,`, GUIDs).
   - If FE URL-encodes the keys differently, `ensure` resets to one tab after every refresh. The `decode` helper
     covers `%27`-style encoding.
4. **Shared links and drafts.**
   - A link copied while the CQ is in edit has `IsActiveEntity=false`. Only the draft owner can open it; this is the same
     limitation as any FE draft link.
   - When FE redirects such a link to the active version (or the other way round), it rewrites the hash, and the
     `?amostras` query may be lost. The page then shows one tab: acceptable, but worth a test.
5. **Invalid Linhas in the URL.**
   - An edited or old link can list a Linha that no longer exists. Its tab is shown, and selecting it gives FE's
     "not found".
   - Optional hardening: after `fromRoute`, `requestObject()` each non-selected path. Remove the ones that fail with
     `MultiInstance.remove`, then navigate to update the URL.
6. **History.** Each tab change already adds a browser-history entry; that doesn't change. Back now also restores
   the previous tab **set**, not only the previous amostra.

## Tests
1. Select 10, 20 and 30 → **Abrir selecionadas**. The URL shows `…Linha='10'…)?amostras=10,20,30`, with 3 tabs and 10
   selected.
2. **F5** → the same 3 tabs, with 10 selected.
3. Click tab 30 → the URL shows `…Linha='30'…)?amostras=10,20,30`. **F5** → 3 tabs, with 30 selected.
4. Copy the URL → paste it in a new browser tab → the same tabs and the same selection.
5. × on tab 20 (not selected) → the URL becomes `?amostras=10,30`, and the page doesn't reload. **F5** → 2 tabs.
6. × on the selected tab → the neighbour is shown and the URL is updated. × on the last tab → the CQ page, with no query.
7. In edit mode, "+" → the new Linha is appended to `?amostras`. **F5** → the new tab is still there.
8. Row click in the CQ Amostras table → a single tab, with no `?amostras` in the URL.
9. Browser **Back** after several tab changes → the previous amostra and the previous tab set.
10. A URL with a bogus Linha (`?amostras=10,999`) → tab 999 appears, and selecting it shows FE's not-found message
    (see risk 5).
