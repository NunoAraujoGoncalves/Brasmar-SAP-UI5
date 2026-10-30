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
The open tabs go into one parameter, **`amostras`**: one **token per tab**, in tab order.
```
#app-preview&/CQCab(Centro='BM01',ID='1000000102',DraftUUID=…,IsActiveEntity=false)/_linhas(Centro='BM01',Id='1000000102',Linha='20',DraftUUID=…,IsActiveEntity=false)?amostras=10,20,~6f1c2a3b-…
                                                                                                            └── selected tab (route path) ─┘       └── all open tabs ──┘
```
- **The selected tab** is the amostra in the route path, exactly as today.

### Tokens: `Linha` is not enough
The `CQLinhas` key is `Centro, Id, Linha, DraftUUID, IsActiveEntity`.

**`Linha` is numbered by the backend only when the whole CQ is saved.** An amostra created with "+" in the draft has
`Linha=''` and is identified by its own **`DraftUUID`**. Amostras that already existed have
`DraftUUID=00000000-…`, both active and in the CQ draft.

So each token carries what tells the tabs apart:

| Amostra | Key (`_linhas(...)`) | Token |
|---|---|---|
| existing | `…Linha='10',DraftUUID=00000000-…,…` | `10` |
| new, in the draft (not saved yet) | `…Linha='',DraftUUID=6f1c2a3b-…,…` | `~6f1c2a3b-…` |
| any other non-empty `DraftUUID` | `…Linha='30',DraftUUID=9a…,…` | `30~9a…` |

- Rule: `<Linha>` plus `~<DraftUUID>` whenever the `DraftUUID` is not the empty GUID.
- **The other key fields** (`Centro`, `Id`, `IsActiveEntity`) are the same for every tab, because all tabs belong to
  the same CQ and the same draft or active state. Each tab's path is rebuilt from the route key by swapping
  `Linha` and `DraftUUID`.
- **Safe characters:** tokens contain only digits, hex, `-` and `~`, so the URL needs no escaping.
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

### Label of a new amostra's tab
A new amostra has no `Linha` yet, so the tab would read "Nº Amostra: ". The tab name shows **"Nova amostra"** instead
(section 4), and the creation toast no longer prints an empty number (section 5).

## Files
| File | Change |
|---|---|
| `webapp/ext/modules/MultiInstance.ts` | `ROUTE`, `AmostraRouteArguments`, `fromRoute`, `getRouteParameters`, `linhaOf`, URL tokens (`Linha` / `~DraftUUID`); `open` removed (no longer used) |
| `webapp/ext/view/CQDetail.controller.ts` | `onOpenAmostras` navigates with `?amostras` |
| `webapp/ext/view/CQLinhaDetail.controller.ts` | route `patternMatched` → `fromRoute`; `navigateToPath` uses `navigateToRoute`; close always navigates; `ensure` uses `linhaOf` |
| `webapp/ext/view/CQLinhaDetail.view.xml` | tab name: "Nova amostra" when `Linha` is empty |
| `webapp/i18n/i18n.properties` | `multiInstance.tab.new`; `multiInstance.msg.created` without the number |

The sources below were applied to a copy of the **current working tree** and **compile with the project's `strict`
TypeScript settings against the UI5 1.120 typings**.

The URL round trip of `MultiInstance` was run in Node against a stubbed JSONModel. It covered two existing amostras
plus one new draft amostra: `getRouteParameters` → `fromRoute` gives back the same 3 paths and the same selection.

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
/** DraftUUID=... dentro da chave da amostra */
const DRAFT_KEY = /DraftUUID=([0-9a-fA-F-]+)/;
/** DraftUUID das amostras que já existiam (ativas ou no draft do CQ) */
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";
/**
 * parâmetro do URL com os separadores abertos, um token por amostra: ...?amostras=10,20,~6f1c…
 * - amostra existente: a Linha ("10")
 * - amostra nova no draft: ainda sem Linha (numerada só ao gravar o CQ), identificada pelo DraftUUID ("~<guid>")
 */
const QUERY_AMOSTRAS = "amostras";
/** separa a Linha do DraftUUID num token */
const TOKEN_DRAFT = "~";

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
        const selectedToken = MultiInstance.toToken(selectedPath);

        const tokens = decode(args["?query"]?.[QUERY_AMOSTRAS] ?? "")
            .split(",")
            .map((token) => token.trim())
            .filter(Boolean);
        if (!tokens.includes(selectedToken)) {
            tokens.unshift(selectedToken);
        }

        // mesma chave da amostra da rota, só mudam a Linha e o DraftUUID (mesmo CQ, mesmo draft / ativo)
        const tabs = [...new Set(tokens)].map((token) => {
            const [linha, draftUUID] = token.split(TOKEN_DRAFT);
            const key = linhaKey
                .replace(LINHA_KEY, `Linha='${linha}'`)
                .replace(DRAFT_KEY, `DraftUUID=${draftUUID || ZERO_GUID}`);
            return { path: `/CQCab(${cabKey})/_linhas(${key})`, linha };
        });
        MultiInstance.model.setData({ tabs, selectedPath });
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
        const tokens = paths.map((tabPath) => MultiInstance.toToken(tabPath));
        return {
            CQCabKey: match[1],
            _linhasKey: match[2],
            ...(tokens.length > 1 ? { "?query": { [QUERY_AMOSTRAS]: tokens.join(",") } } : {})
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

    /** "/CQCab(...)/_linhas(...,Linha='10',...)" -> "10" ("" numa amostra nova ainda por gravar) */
    static linhaOf(path: string): string {
        return LINHA_KEY.exec(path)?.[1] ?? "";
    }

    /**
     * Token do URL de uma amostra: "10" (existente) ou "~<DraftUUID>" (nova, sem Linha até gravar o CQ).
     * Se o DraftUUID não for o vazio vai sempre no token, mesmo com Linha ("10~<guid>").
     */
    private static toToken(path: string): string {
        // só a chave da amostra: o CQ também tem DraftUUID
        const key = AMOSTRA_PATH.exec(path)?.[2] ?? "";
        const draftUUID = DRAFT_KEY.exec(key)?.[1] ?? ZERO_GUID;
        const linha = MultiInstance.linhaOf(key);
        return draftUUID.toLowerCase() === ZERO_GUID ? linha : `${linha}${TOKEN_DRAFT}${draftUUID}`;
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

## 4. `webapp/ext/view/CQLinhaDetail.view.xml` – tab name
Before:
```xml
<TabContainerItem id="CQDetailLinha_multi_tab" key="{multi>path}" name="{parts:[ 'i18n>CQLinhaDetail.Title', 'multi>linha' ], formatter: '.formatter.detailLineFormatter'}"></TabContainerItem>
```
After:
```xml
<TabContainerItem id="CQDetailLinha_multi_tab" key="{multi>path}" name="{= ${multi>linha} ? ${i18n>CQLinhaDetail.Title} + ': ' + ${multi>linha} : ${i18n>multiInstance.tab.new} }"></TabContainerItem>
```

## 5. `webapp/i18n/i18n.properties`
```properties
# separador de uma amostra criada no draft (a Linha só é numerada ao gravar o CQ)
multiInstance.tab.new=Nova amostra
# era "Amostra {0} criada." - a Linha ainda vem vazia
multiInstance.msg.created=Amostra criada.
```
`onAmostraAdd` can keep passing `[linha]`; the text just no longer uses it.

---

## Fix: page stuck busy when switching tabs fast
**Symptom:** the user clicks several tabs quickly. The whole page shows the busy animation and stays stuck.
The console shows:
```
The PageReady Event was not fired within the 7000 ms timeout . It has been forced.
  PageReadyControllerExtension.onAfterBinding ← InternalRouting._bindPageToContext ← _bindPageToPath
```

**Cause (most likely):** every click started a new FE navigation (`navigateToRoute`) while the previous one was still
**routing**, that is, resolving the path and rebinding the page. Two FE routings running at the same time leave the
page busy. The data that never arrives for a binding that was already replaced also leaves FE's PageReady waiting
until its 7 s timeout.

**Fix:** no waiting for each amostra to load. Two small mechanisms:
1. **Debounce the clicks (300 ms).**
   - The clicked tab is marked immediately.
   - Navigation starts only once the user has stopped clicking for 300 ms, and only to the **last** tab clicked.
   - Clicking 2 → 3 → 4 → 3 quickly gives one navigation, to 3. Amostras 2 and 4 are never bound or loaded, so no
     load is left half-done.
2. **One FE routing at a time, without waiting for data.**
   - `navigateToPath` waits only for the `navigateToRoute` promise, which resolves when FE has routed and rebound the
     page. That is a short step.
   - It does **not** wait for the amostra's data or for PageReady. The next tab can start while the previous amostra is
     still loading, as in any FE app.
   - A navigation requested while a routing is running is kept in `pendingAmostraPath` (last one wins) and starts as
     soon as that routing ends.

Supporting details:
- **Programmatic selection is not a click.** `selectAmostraTab` sets `selectingAmostraTab`, so re-marking the shown tab
  is not treated as a click.
- **Return to the starting amostra.** If a routing is running when the debounce fires, the navigation is always queued,
  even to the amostra shown before. When the routing ends, it compares against the amostra actually shown and then
  either navigates or only re-marks the tab.
- **Safety timeout.** If a routing never resolves, the queue unlocks after 10 s (`AMOSTRA_NAVIGATION_TIMEOUT_MS`).
- **Same queue for × and "+".** Both call `navigateToPath` directly, without the debounce, and share the queue.

**Trade-off:** each tab switch waits 300 ms before it starts. The tab itself is marked immediately.

**If the page still sticks busy:** the busy then comes from overlapping **data** loads, not overlapping routings.
Apply the fallback below ("Fallback: wait for each amostra to load (v2)").

These blocks **replace** `onAmostraTabSelect`, `navigateToPath` and `selectAmostraTab` from section 3. They compile
with the rest of the plan under `strict` TypeScript.

### Constants (next to `ROW_WEIGHING_TIMEOUT_MS`)
```ts
/** Tempo máximo à espera de uma navegação entre separadores de amostras */
const AMOSTRA_NAVIGATION_TIMEOUT_MS = 10000;

/** Pausa nos cliques dos separadores antes de navegar: cliques rápidos só carregam a última amostra */
const AMOSTRA_TAB_DEBOUNCE_MS = 300;
```
### Fields (after `currentAmostraPath`)
```ts
    /** navegação entre amostras em curso (só uma de cada vez) */
    amostraNavigation?: Promise<void>;
    /** último separador clicado durante uma navegação: é para lá que se vai quando ela acabar */
    pendingAmostraPath?: string;
    /** setSelectedItem feito pelo código (não é um clique) */
    selectingAmostraTab = false;
    /** espera entre cliques nos separadores (só o último navega) */
    amostraTabTimer?: ReturnType<typeof setTimeout>;
```
### `onExit` (add the `clearTimeout` line)
```ts
    public onExit(): void {
        this.getView()?.detachModelContextChange(this.onAmostraContextChange, this);
        this.getAppComponent().getRouter().getRoute(MultiInstance.ROUTE)?.detachPatternMatched(this.onAmostraRouteMatched, this);
        clearTimeout(this.amostraTabTimer);
        this.cancelRowWeighing?.();
        // ...
```
### `onAmostraTabSelect`
```ts
    /** Clique num separador: liga a página a essa amostra (FE refaz o binding de toda a página)
     * O TabContainer também dispara itemSelect sem clique (setSelectedItem programático e seleção por defeito
     * no onBeforeRendering, quando a página pode ainda não ter contexto). Por isso compara-se com o
     * separador selecionado no modelo "multi" e não com o contexto da view. 
     */
    public onAmostraTabSelect(oEvent: TabContainer$ItemSelectEvent): void {
        const item = oEvent.getParameter("item") as TabContainerItem | null;
        const path = item?.getKey();
        const selectedPath = MultiInstance.getSelectedPath();
        if (this.selectingAmostraTab || !path || !selectedPath) {
            return;
        }
        // cliques seguidos: o separador fica marcado logo, mas só se navega para o último,
        // quando o utilizador pára de clicar (as amostras do meio nem chegam a ser carregadas)
        clearTimeout(this.amostraTabTimer);
        this.amostraTabTimer = setTimeout(() => {
            this.amostraTabTimer = undefined;
            // com uma navegação em curso navega-se sempre (pode ser o regresso à amostra de onde se saiu)
            if (this.amostraNavigation || path !== MultiInstance.getSelectedPath()) {
                this.navigateToPath(path);
            }
        }, AMOSTRA_TAB_DEBOUNCE_MS);
    }
```
### `navigateToPath` + new `navigateAndWait` + `selectAmostraTab`
```ts
    /**
     * Navega (routing FE) para a amostra / CQ com este caminho OData.
     * Para uma amostra o URL leva os separadores abertos (?amostras=...), para o refresh / link colado.
     */
    private navigateToPath(path: string): void {
        const parameters = MultiInstance.getRouteParameters(path);
        if (!parameters) {
            // CQ (fechar o último separador)
            const binding = this.getContext().getModel().bindContext(path);
            this.getExtensionAPI().getRouting().navigate(binding.getBoundContext() as Context);
            return;
        }
        if (this.amostraNavigation) {
            this.pendingAmostraPath = path;
            return;
        }

        // um routing do FE de cada vez: dois em simultâneo deixavam a página presa no busy do FE
        this.amostraNavigation = this.navigateAndWait(parameters).finally(() => {
            this.amostraNavigation = undefined;
            const pending = this.pendingAmostraPath;
            this.pendingAmostraPath = undefined;
            if (pending && pending !== MultiInstance.getSelectedPath()) {
                this.navigateToPath(pending);
            } else {
                this.syncAmostraTab(); // o separador marcado volta a ser o da amostra mostrada
            }
        });
    }

    /**
     * Navega para a amostra e espera só pelo routing do FE (hash + binding da página), não pelos dados:
     * os dados da amostra podem continuar a carregar enquanto o utilizador já escolhe outro separador.
     */
    private navigateAndWait(parameters: object): Promise<void> {
        const navigation = this.getExtensionAPI().getRouting().navigateToRoute(MultiInstance.ROUTE, parameters)
            .then(() => undefined, () => undefined); // navegação cancelada / inexistente: o FE já mostra o erro
        // segurança: os separadores nunca ficam bloqueados mais do que isto
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, AMOSTRA_NAVIGATION_TIMEOUT_MS));
        return Promise.race([navigation, timeout]);
    }


    /** Marca no TabContainer o separador da amostra com este caminho (sem contar como clique) */
    private selectAmostraTab(path: string): void {
        const tabs = this.byId("CQDetailLinha_multi_tabs") as TabContainer | undefined;
        const item = tabs?.getItems().find((tab) => tab.getKey() === path);
        if (tabs && item) {
            this.selectingAmostraTab = true;
            try {
                tabs.setSelectedItem(item);
            } finally {
                this.selectingAmostraTab = false;
            }
        }
    }
```

### Fallback: wait for each amostra to load (v2)
**Symptom that remained with the first fallback:** fast clicks still left the page busy, and the console showed:
```
busy lock for brasmar.bm01.controloqualidade4::CQLinhasCQLinhaDetailPage/busy with value 1 timed out after 30 seconds!
  BusyLocker.unlock ← InternalRouting.onDataReceived
```

**What the log says:**
- When FE binds the page to an amostra, it **locks** the page busy as the page context's request starts
  (`dataRequested`). It **unlocks** it when that request's data arrives (`InternalRouting.onDataReceived`).
- The lock is a counter. "value 1 after unlock" means two amostras locked the page but only one unlocked it.
- So the page was rebound to a new amostra while the previous amostra's request was still running. That request's
  `dataReceived` never reaches FE, and the busy stays locked for good.

**Why the first fallback didn't prevent it:**
- `navigateToRoute(...)` resolves as soon as the **hash** changes. FE binds the page only after that, in its
  route-matched handler.
- At that moment the view still had the **previous** amostra's context. So `context.getPath() === path` was false
  and `requestObject()` was skipped.
- `waitPageReady()` resolved immediately, because the previous page was still "ready".
- In practice nothing was awaited, and the next queued navigation started while FE was still loading.

**Fix (v2): wait until the page is actually bound to the target amostra**, then for its data:
1. Before navigating, register a waiter for the target path: `waitForAmostraBound(path)`.
2. `navigateToRoute(...)`: the hash changes.
3. `onAmostraContextChange` sees the view context become the target path and resolves the waiter. FE has now bound
   the page and started its request, and the lock is taken.
4. `context.requestObject()`: the page context's data has arrived. This is the same request FE unlocks on, so the
   lock is released.
5. `pageReady.waitPageReady()`: the tables and other bindings have loaded. By now FE has reset PageReady for the new
   binding.

Only then may the next navigation start. Step 4 alone already covers the busy lock, so this holds even if
`waitPageReady` doesn't exist at runtime.

**What stays from the fix above:**
- the debounce (`onAmostraTabSelect`);
- the queue in which the last click wins (`navigateToPath`, `pendingAmostraPath`);
- `selectAmostraTab`;
- the `onExit` line.

**Safety timeout raised from 10 s to 20 s.** FE's own PageReady gives up after 7 s, so a slow amostra can take
data time + 7 s. With 10 s, the queue could unlock while FE was still loading and start an overlapping navigation,
which recreates the bug. 20 s only matters if something really hangs.

**Trade-off:** fast clicking waits for the shown amostra to finish loading before moving to the last tab clicked. The
clicked tab is marked immediately.

**Already-stuck page:** a leaked lock can't be released from the app, so reload the page (F5) after the bug has
happened once.

#### Constant (replace the value)
```ts
/** Tempo máximo à espera de uma navegação entre separadores de amostras (o PageReady do FE desiste aos 7 s) */
const AMOSTRA_NAVIGATION_TIMEOUT_MS = 20000;
```

#### Field (after `amostraTabTimer`)
```ts
    /** navegação à espera que o FE ligue a página a esta amostra (resolvida em onAmostraContextChange) */
    amostraBound?: { path: string; resolve: () => void };
```

#### `onAmostraContextChange` (start of the method: the new `if` goes **before** the early return)
```ts
    private onAmostraContextChange(): void {
        const context = this.getView()?.getBindingContext() as Context | null | undefined;
        const path = context?.getPath();
        // a navegação entre separadores em curso chegou à amostra pedida
        if (path && this.amostraBound?.path === path) {
            this.amostraBound.resolve();
            this.amostraBound = undefined;
        }
        if (!context || !path || path === this.currentAmostraPath) {
            return;
        }
        this.currentAmostraPath = path;
        // ... resto igual
```

#### `navigateToPath` (only the `navigateAndWait` call changes: it now also passes `path`)
```ts
        // um routing do FE de cada vez: dois em simultâneo deixavam a página presa no busy do FE
        this.amostraNavigation = this.navigateAndWait(path, parameters).finally(() => {
```

#### `navigateAndWait` + new `waitForAmostraBound` (replace the version above)
```ts
    /**
     * Navega para a amostra e só termina quando ela acabou de carregar:
     * 1. o FE ligou a página à amostra (onAmostraContextChange). A promise do navigateToRoute
     *    resolve logo que o hash muda, ANTES do binding: não serve para esperar.
     * 2. dados da amostra (o pedido do contexto da página é o que prende o busy do FE)
     * 3. PageReady do FE (tabelas e restantes bindings da página)
     * Assim nunca começa outra navegação com a página ainda a carregar.
     */
    private navigateAndWait(path: string, parameters: object): Promise<void> {
        const navigation = (async () => {
            try {
                const bound = this.waitForAmostraBound(path); // antes de navegar, para não perder o evento
                await this.getExtensionAPI().getRouting().navigateToRoute(MultiInstance.ROUTE, parameters);
                await bound;
                const context = this.getView()?.getBindingContext() as Context | undefined | null;
                if (context?.getPath() === path) {
                    await context.requestObject();
                }
                // waitPageReady existe no FE mas não está nos tipos 1.120
                const pageReady = (this as unknown as { pageReady?: { waitPageReady?: () => Promise<void> } }).pageReady;
                await pageReady?.waitPageReady?.();
            } catch (error) {
                // navegação cancelada / amostra inexistente: o FE já mostra o erro
            }
        })();
        // segurança: os separadores nunca ficam bloqueados mais do que isto
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, AMOSTRA_NAVIGATION_TIMEOUT_MS));
        return Promise.race([navigation, timeout]).finally(() => {
            this.amostraBound = undefined;
        });
    }

    /** Resolve quando a página estiver ligada à amostra `path` (já resolvida se a página já a mostra) */
    private waitForAmostraBound(path: string): Promise<void> {
        if (this.getView()?.getBindingContext()?.getPath() === path) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
            this.amostraBound = { path, resolve };
        });
    }
```

#### Verify the fallback
1. Add a temporary `console.log("bound", path)` after `await bound;` and `console.log("loaded", path)` after
   `waitPageReady`. Click tabs fast. Each `bound` is followed by its `loaded` before the next `bound`, never interleaved.
2. Click four tabs as fast as possible. The busy indicator appears and clears, and the last tab clicked is shown. No
   "busy lock … timed out" and no PageReady timeout appear in the console.
3. Click tab 2, then tab 3 while tab 2 is still loading. Tab 3 is marked immediately, and its content appears right
   after tab 2 finishes loading.
4. Close a tab with × (not the selected one). The page shows the same amostra, so the wait resolves at once and
   doesn't block for 20 s.
5. **If a `bound` log never appears** (each navigation waits the full 20 s), the view's context path differs from the
   tab path. Log both: `this.getView()?.getBindingContext()?.getPath()` and `path`. Typically the difference is key
   encoding, or FE redirecting draft ↔ active. Report the two values.

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
6. **New amostras after saving the CQ.**
   - Once the CQ is saved, a new amostra gets its `Linha`, and its draft key (`~<DraftUUID>`) no longer exists.
   - Save happens on the CQ page, which clears the tabs, so this doesn't break the normal flow.
   - Only an **old link** that still contains `~<DraftUUID>` will show that tab as not found (see risk 5).
7. **Draft GUID format.** The token uses the `DraftUUID` exactly as it appears in the context path. Check one new
   amostra's path (`created.getPath()` in `onAmostraAdd`) to confirm it has `Linha=''` and its own `DraftUUID`.
8. **History.** Each tab change already adds a browser-history entry; that doesn't change. Back now also restores
   the previous tab **set**, not only the previous amostra.

## Tests
1. Select 10, 20 and 30 → **Abrir selecionadas**. The URL shows `…Linha='10'…)?amostras=10,20,30`, with 3 tabs and 10
   selected.
2. **F5** → the same 3 tabs, with 10 selected.
3. Click tab 30 → the URL shows `…Linha='30'…)?amostras=10,20,30`. **F5** → 3 tabs, with 30 selected.
4. Copy the URL → paste it in a new browser tab → the same tabs and the same selection.
5. × on tab 20 (not selected) → the URL becomes `?amostras=10,30`, and the page doesn't reload. **F5** → 2 tabs.
6. × on the selected tab → the neighbour is shown and the URL is updated. × on the last tab → the CQ page, with no query.
7. In edit mode, "+" → a **"Nova amostra"** tab appears and `?amostras` ends in `,~<guid>`. **F5** → the new tab is
   still there and opens the same new amostra. Add a second one → two different `~<guid>` tokens.
7b. Save the CQ, then reopen the amostras → the new ones now show their numbers (`Linha`), and their tokens are plain numbers.
8. Row click in the CQ Amostras table → a single tab, with no `?amostras` in the URL.
8b. Open 4 tabs and click 2 → 3 → 4 → 3 very fast. The page never stays busy and ends on **3**, with tab 3 marked and
    the URL on `Linha='3…'`. Click 2 and then back to the current tab quickly → the page stays on the current one.
9. Browser **Back** after several tab changes → the previous amostra and the previous tab set.
10. A URL with a bogus Linha (`?amostras=10,999`) → tab 999 appears, and selecting it shows FE's not-found message
    (see risk 5).
