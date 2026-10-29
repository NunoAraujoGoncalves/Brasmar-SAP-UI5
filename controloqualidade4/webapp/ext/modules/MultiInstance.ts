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
    static getRouteParameters(path: string, paths: string[] = MultiInstance.getPaths() ): AmostraRouteArguments | undefined {
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
        const key = AMOSTRA_PATH.exec(path)?.[2] ?? "";
        const draftUUID = DRAFT_KEY.exec(key)?.[1] ?? ZERO_GUID;
        const linha = MultiInstance.linhaOf(key);
        return draftUUID.toLowerCase() === ZERO_GUID ? linha : `${linha}${TOKEN_DRAFT}${draftUUID}`; 
    }

    private static getTabs(): AmostraTab[] {
        return (MultiInstance.model.getProperty("/tabs") as AmostraTab[] | undefined) ?? [];
    }
}