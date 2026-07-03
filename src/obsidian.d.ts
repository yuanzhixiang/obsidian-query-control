import "obsidian";

type QueryControlSettingValue = boolean | string;

declare module "obsidian" {
  export interface Workspace extends Events {
    on(name: "status-bar-updated", callback: () => unknown, ctx?: unknown): EventRef;
    on(name: "ribbon-bar-updated", callback: () => unknown, ctx?: unknown): EventRef;
    on(name: "bartender-workspace-change", callback: () => unknown, ctx?: unknown): EventRef;
    on(
      name: "bartender-leaf-split",
      callback: (originLeaf: WorkspaceItem, newLeaf: WorkspaceItem) => unknown,
      ctx?: unknown
    ): EventRef;
  }
  interface View {
    actionsEl: HTMLElement;
  }
  interface WorkspaceLeaf {
    tabHeaderEl: HTMLElement;
    parentSplit: WorkspaceSplit;
  }
  interface WorkspaceSplit {
    children: WorkspaceTabs[];
  }
  interface MarkdownRenderer {
    renderer: MarkdownPreviewRenderer;
    rerender(): void;
  }
  interface MarkdownPreviewRenderer {
    previewEl: HTMLElement;
    onResize(): void;
    set(content: string): void;
    unfoldAllHeadings(): void;
    unfoldAllLists(): void;
    rerender(): void;
    text: string;
  }

  class SearchResultDOM {
    el: HTMLElement;
    childrenEl: HTMLElement;
    startLoader(): void;
    infinityScroll: InfinityScroll;
    patched: boolean;
    hidden: boolean;
    renderMarkdown: boolean;
    extraContext: boolean;
    showTitle: boolean;
    collapseAll: boolean;
    sortOrder: string;
    settings: Record<string, QueryControlSettingValue>;
    vChildren?: SearchResultRootElements;
    parent?: SearchView;
    children: SearchResultItem[];
    addResult(): void;
    removeResult(): void;
  }
  class BacklinkDOMClass {
    el: HTMLElement;
    childrenEl: HTMLElement;
    startLoader(): void;
    infinityScroll: InfinityScroll;
    patched: boolean;
    hidden: boolean;
    extraContext: boolean;
    showTitle: boolean;
    collapseAll: boolean;
    sortOrder: string;
    renderMarkdown: boolean;
    settings: Record<string, QueryControlSettingValue>;
    vChildren?: SearchResultRootElements;
    renderMarkdownButtonEl: HTMLElement;
    setRenderMarkdown(value: boolean): void;
    onCopyResultsClick(event: MouseEvent): Promise<void>;
    children: SearchResultItem[];
    addResult(): void;
    removeResult(): void;
  }
  interface VaultSettings {
    foldHeading: boolean;
    foldIndent: boolean;
    rightToLeft: boolean;
    readableLineLength: boolean;
    tabSize: number;
    showFrontmatter: boolean;
  }

  interface Vault {
    config: Record<string, unknown>;
    getConfig<T extends keyof VaultSettings>(setting: T): VaultSettings[T];
  }

  interface InfinityScroll {
    // on node insert calls queueCompute
    rootEl: RootElements;
    scrollEl: HTMLElement;
    filtered: boolean;
    filter: string;
    compute(): void;
    invalidate(item: SearchResultItemMatch, includeChildren: boolean): void; // calls queueCompute
    invalidateAll(): void; // calls queueCompute
    updateVirtualDisplay(scrollTop?: number): void;
    updateShownSections(): void;
    queueCompute(): void;
    computeSync(): void;
    update(match: SearchResultItemMatch, val1: number, val2: number, val3: number, val4: number): void;
    measure(parent: SearchResultItem, item: SearchResultItemMatch): void;
    scrollIntoView(item: unknown): void;
    getRootTop(): number;
    findElementTop(a: unknown, b: unknown, c: unknown): void;
    onScroll(): void; // this calls updateVirtualDisplay()
  }
  class SearchResultItem {
    renderContentMatches(): void;
    setCollapse(value: boolean, animate: boolean): void;
    setExtraContext(value: boolean): void;
    onResultClick(event: MouseEvent, e?: unknown): void;
    info: ItemInfo;
    collapsible: boolean;
    collapsed: boolean;
    extraContext: boolean;
    showTitle: boolean;
    parent: SearchResultDOM;
    children: SearchResultItemMatch[];
    vChildren?: SearchResultMatchRootElements;
    file: TFile;
    path: string;
    content: string;
    el: HTMLElement;
    pusherEl: HTMLElement;
    containerEl: HTMLElement;
    childrenEl: HTMLElement;
  }
  class SearchResultItemMatch {
    render(truncateLeft: boolean, truncateRight: boolean): void;
    start: number;
    end: number;
    parent: SearchResultItem;
    parentDom: SearchResultItem;
    el: HTMLElement;
    matches: MatchIndices[];
    info: ItemInfo;
    onMatchRender?: (match: MatchIndices, el: HTMLElement) => unknown;
  }
  type MatchIndices = number[];
  interface ItemInfo {
    height: number;
    width: number;
    childTop: number;
    computed: boolean;
    queued: boolean;
    hidden: boolean;
  }
  interface SearchResultRootElements {
    _children: SearchResultItem[];
  }
  interface SearchResultMatchRootElements {
    _children: SearchResultItemMatch[];
  }
  class SearchHeaderDOM {
    constructor(app: App, el: HTMLElement);
    navHeaderEl: HTMLElement;
    addNavButton(
        icon: string,
        label: string,
        onClick: (evt: MouseEvent) => unknown,
        className?: string
    ): HTMLElement;
  }
  class EmbeddedSearchClass extends MarkdownRenderChild {
    dom: SearchResultDOM;
    containerEl: HTMLElement;
    query: string;
    settings: Record<string, QueryControlSettingValue>;
    onunload(): void;
    onload(): void;
  }
  class BacklinksClass extends Component {
    backlinkDom: BacklinkDOMClass;
    unlinkedDom: BacklinkDOMClass;
    headerDom: SearchHeaderDOM;
    patched: boolean;
    sortOrder: string;
    setExtraContext(value: boolean): void;
    setCollapseAll(value: boolean): void;
  }
  interface WorkspaceItem {
    tabsInnerEl: HTMLElement;
    view: View;
    type: string;
  }
  interface SearchView extends View {
    onCopyResultsClick(event: MouseEvent): void;
    headerDom: SearchHeaderDOM;
  }
  // interface SearchViewHeader
  interface WorkspaceTabs {
    children: WorkspaceLeaf[];
    component: Component;
    currentTab: number;
    recomputeChildrenDimensions(): void;
    updateDecorativeCurves(): void;
  }
}

declare global {
  const i18next: {
    t(key: string, options?: Record<string, unknown>): string;
  };
}

declare module "sortablejs" {
  interface SortableEvent extends Event {
    items: HTMLElement[];
  }
}

declare module "obsidian" {
  export interface Workspace extends Events {
    on(name: "view-registered", callback: (type: string, viewCreator: ViewCreator) => unknown, ctx?: unknown): EventRef;
    on(name: "file-explorer-load", callback: (fileExplorer: FileExplorerView) => unknown, ctx?: unknown): EventRef;
    on(name: "file-explorer-sort-change", callback: (sortMethod: string) => unknown, ctx?: unknown): EventRef;
    on(name: "infinity-scroll-compute", callback: (infinityScroll: InfinityScroll) => unknown, ctx?: unknown): EventRef;
    on(name: "file-explorer-draggable-change", callback: (dragEnabled: boolean) => unknown, ctx?: unknown): EventRef;
    on(name: "file-explorer-filter-change", callback: (filterEnabled: boolean) => unknown, ctx?: unknown): EventRef;
  }
  export interface PluginInstance {
    id: string;
  }
  export interface ViewRegistry {
    viewByType: Record<string, (leaf: WorkspaceLeaf) => unknown>;
    isExtensionRegistered(extension: string): boolean;
  }

  export interface App {
    internalPlugins: InternalPlugins;
    viewRegistry: ViewRegistry;
  }
  export interface InstalledPlugin {
    enabled: boolean;
    instance: PluginInstance;
  }

  export interface InternalPlugins {
    plugins: Record<string, InstalledPlugin>;
    getPluginById(id: string): InstalledPlugin;
  }
  export interface FileExplorerView extends View {
    dom: FileExplorerViewDom;
    createFolderDom(folder: TFolder): FileExplorerFolder;
    headerDom: FileExplorerHeader;
    sortOrder: string;
    hasCustomSorter?: boolean;
    dragEnabled: boolean;
  }
  interface FileExplorerHeader {
    addSortButton(sorter: (sortType: string) => void, sortOrder: () => string): void;
    navHeaderEl: HTMLElement;
  }
  interface FileExplorerFolder {
    el?: HTMLElement;
  }
  export interface FileExplorerViewDom {
    infinityScroll: InfinityScroll;
    navFileContainerEl: HTMLElement;
  }
  export interface InfinityScroll {
    rootEl: RootElements;
    scrollEl: HTMLElement;
    filtered: boolean;
    filter: string;
    compute(): void;
  }
  export interface RootElements {
    childrenEl: HTMLElement;
    children: ChildElement[];
    _children: ChildElement[];
    file: TAbstractFile;
    fileExplorer: FileExplorerView;
  }
  export interface ChildElement {
    el: HTMLElement;
    file: TAbstractFile;
    fileExplorer: FileExplorerView;
    titleEl: HTMLElement;
    titleInnerEl: HTMLElement;
    children?: ChildElement[];
    childrenEl?: HTMLElement;
  }
}

interface SortOption {
  key: string;
  label: string;
}
