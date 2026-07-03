import {around} from "monkey-around";
import {
  BacklinkDOMClass,
  BacklinksClass,
  Component,
  EmbeddedSearchClass,
  Notice,
  Plugin,
  SearchResultDOM,
  SearchResultItem,
  SearchView,
  Setting,
  setIcon,
  setTooltip,
  ViewCreator,
  WorkspaceLeaf
} from "obsidian";
import {SearchMarkdownRenderer} from "./search-renderer";
import {DEFAULT_SETTINGS, EmbeddedQueryControlSettings, SettingTab, sortOptions} from "./settings";
import {translate} from "./utils";
import {createSortPopup} from "./sort";
import {SortOption} from "./obsidian";

type PatchFn = (...args: unknown[]) => unknown;
type SearchResultItemMatchConstructor = {
  prototype: {
    render: PatchFn;
  };
};

// Live Preview creates an embedded query block
// LP calls addChild with an instance of the EmbeddedSearch class

// EmbeddedSearch `onload` is patched to add a nav bar
// a new component is added to handle the lifecycle of the rendered markdown elements

// EmbeddedSearch has a `dom` property which holds an instance ofthe SearchResultDOM class
// SearchResultDOM has children which are of type SearchResultItem

// SearchResultItem has children which are of type SearchResultItemMatch
// There is one SearchResultItem per matched TFile

// SearchResultItemMatch has a render() method which is used to render matches
// There is a SearchResultItemMatch for every match found within a TFile

// Hierarchy
// - LivePreviewDOM
//   - EmbeddedSearch
//     - SearchResultDOM
//       - SearchResultItem
//         - SearchResultItemMatch

const backlinkDoms = new WeakMap<HTMLElement, BacklinksClass>();

function hasOwn(value: unknown, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function createSearchHeaderDom(el: HTMLElement) {
  const navHeaderEl = el.createDiv({cls: "nav-header", prepend: true});
  const navButtonsEl = navHeaderEl.createDiv("nav-buttons-container");

  return {
    navHeaderEl,
    addNavButton(icon: string, label: string, onClick: (evt: MouseEvent) => unknown, className?: string) {
      const buttonEl = navButtonsEl.createDiv("clickable-icon nav-action-button");
      if (className) buttonEl.addClass(className);
      buttonEl.addEventListener("click", onClick);
      setIcon(buttonEl, icon);
      setTooltip(buttonEl, label);
      return buttonEl;
    },
  };
}

export default class EmbeddedQueryControlPlugin extends Plugin {
  settings: EmbeddedQueryControlSettings;
  settingsTab: SettingTab;
  isSearchResultItemPatched: boolean;
  isSearchResultItemMatchPatched: boolean;
  isBacklinksPatched: boolean;
  isSearchPatched: boolean;

  async onload() {
    await this.loadSettings();
    const plugin = this;
    this.registerSettingsTab();
    this.register(
        around(this.app.viewRegistry.constructor.prototype, {
          registerView(old: PatchFn) {
            return function (type: string, viewCreator: ViewCreator, ...args: unknown[]) {
              plugin.app.workspace.trigger("view-registered", type, viewCreator);
              return old.call(this, type, viewCreator, ...args);
            };
          },
        })
    );
    if (!this.app.workspace.layoutReady) {
      const eventRef = this.app.workspace.on("view-registered", (type: string, viewCreator: ViewCreator) => {
        if (type !== "search") return;
        this.app.workspace.offref(eventRef);
        const Leaf = WorkspaceLeaf as unknown as new (app: typeof plugin.app) => WorkspaceLeaf;
        const leaf = new Leaf(plugin.app);
        const searchView = viewCreator(leaf) as SearchView;
        plugin.patchNativeSearch(searchView);
      });
    }

    // The only way to obtain the EmbeddedSearch class is to catch it while it's being added to a parent component
    // The following will patch Component.addChild and will remove itself once it finds and patches EmbeddedSearch
    this.register(
        around(Component.prototype, {
          addChild(old: PatchFn) {
            return function (child: unknown, ...args: unknown[]) {
              try {
                if (
                    !plugin.isSearchPatched &&
                    child instanceof Component &&
                    hasOwn(child, "searchQuery") &&
                    hasOwn(child, "sourcePath") &&
                    hasOwn(child, "dom")
                ) {
                  const EmbeddedSearch = child as EmbeddedSearchClass;
                  plugin.patchSearchView(EmbeddedSearch);
                  plugin.isSearchPatched = true;
                }
                if (child instanceof Component && hasOwn(child, "backlinkDom")) {
                  const backlinks = child as BacklinksClass;
                  const backlinkPane = backlinks.backlinkDom.el.closest(".backlink-pane");
                  if (backlinkPane instanceof HTMLElement) {
                    backlinkDoms.set(backlinkPane, backlinks);
                  }
                  if (!plugin.isBacklinksPatched) {
                    plugin.patchBacklinksView(backlinks);
                    plugin.isBacklinksPatched = true;
                  }
                }
              } catch (err) {
                console.error('Error in Component.addChild around patch:', err);
              }
              const result = old.call(this, child, ...args);
              return result;
            };
          },
        })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  registerSettingsTab() {
    this.settingsTab = new SettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
  }


  onunload(): void {
    const unloadMessage = "Query Control: Please restart Obsidian to complete plugin unload.";
    console.log(unloadMessage);
    new Notice(unloadMessage);
  }

  patchNativeSearch(searchView: SearchView) {
    const plugin = this;
    this.register(
        around(searchView.constructor.prototype, {
          onResize(old: PatchFn) {
            return function (...args: unknown[]) {
              // this works around measurement issues when the search el width
              // goes to zero and then back to a non-zero value
              const _children = this.dom.vChildren?._children;
              if (this.dom.el.clientWidth === 0) {
                _children.forEach((child: SearchResultItem) => {
                  child.setCollapse(true, false);
                });
                this.dom.hidden = true;
              } else if (this.dom.hidden) {
                this.dom.hidden = false;
                // if we toggle too quickly, measurement happens before we want it to
                window.setTimeout(() => {
                  _children.forEach((child: SearchResultItem) => {
                    child.setCollapse(this.dom.collapseAll, false);
                  });
                }, 100);
              }
              return old.call(this, ...args);
            };
          },
          stopSearch(old: PatchFn) {
            return function (...args: unknown[]) {
              const result = old.call(this, ...args);
              if (this.renderComponent) {
                this.renderComponent.unload();
                this.renderComponent = new Component();
              }
              return result;
            };
          },
          addChild(old: PatchFn) {
            return function (...args: unknown[]) {
              try {
                if (!this.patched) {
                  if (!this.renderComponent) {
                    this.renderComponent = new Component();
                    this.renderComponent.load();
                  }
                  this.patched = true;
                  this.dom.parent = this;
                  plugin.patchSearchResultDOM(this.dom.constructor);
                  this.setRenderMarkdown = function (value: boolean) {
                    const _children = this.dom.vChildren?._children;
                    this.dom.renderMarkdown = value;
                    _children.forEach((child: SearchResultItem) => {
                      child.renderContentMatches();
                    });
                    this.dom.infinityScroll.invalidateAll();
                    this.dom.childrenEl.toggleClass("cm-preview-code-block", value);
                    this.dom.childrenEl.toggleClass("is-rendered", value);
                    this.renderMarkdownButtonEl?.toggleClass("is-active", value);
                  };
                  this.renderMarkdownButtonEl = this.headerDom?.addNavButton("reading-glasses", "Render Markdown", () => {
                    return this.setRenderMarkdown(!this.dom.renderMarkdown);
                  });

                  const allSettings = {
                    renderMarkdown: plugin.settings.defaultRenderMarkdown,
                  };
                  if (!this.settings) this.settings = {};
                  Object.entries(allSettings).forEach(([setting, defaultValue]) => {
                    if (!hasOwn(this.settings, setting)) {
                      this.settings[setting] = defaultValue;
                    } else if (setting === "sort" && !sortOptions.some(option => option.key === this.settings.sort)) {
                      this.settings[setting] = defaultValue;
                    }
                  });
                  this.setRenderMarkdown(this.settings.renderMarkdown);
                }
              } catch (err) {
                console.error('Error in searchView.addChild around patch:', err);
              }
              const result = old.call(this, ...args);
              return result;
            };
          },
        })
    );
  }

  patchSearchResultDOM(SearchResult: typeof SearchResultDOM) {
    const plugin = this;
    const uninstall = around(SearchResult.prototype, {
      addResult(old: PatchFn) {
        return function (...args: unknown[]) {
          uninstall();
          const result = old.call(this, ...args) as SearchResultItem;
          const SearchResultItemClass = result.constructor as typeof SearchResultItem;
          if (!plugin.isSearchResultItemPatched) {
            plugin.patchSearchResultItem(SearchResultItemClass);
          }
          return result;
        };
      },
    });
    this.register(uninstall);
    this.register(
        around(SearchResult.prototype, {
          // startLoader is called for many different use cases
          // in this patch, we try to determine the context we were called in
          // if we recognize a context (backlinks, embedded search, native search), we patch it
          startLoader(old: PatchFn) {
            return function (...args: unknown[]) {
              try {
                // Are we in a backlinks view?
                const containerEl = this.el.closest(".backlink-pane");
                if (containerEl) {
                  const backlinksInstance = backlinkDoms.get(containerEl);
                  if (backlinksInstance) {
                    if (!backlinksInstance.patched) {
                      handleBacklinks(this, plugin, backlinksInstance);
                    }
                  }
                }
                // Are we in a native search view?
                if (
                    !this.parent?.searchParamsContainerEl?.patched &&
                    this.el?.parentElement?.getAttribute("data-type") === "search"
                ) {
                  if (!this.parent) return;
                  this.parent.searchParamsContainerEl.patched = true;
                  new Setting(this.parent.searchParamsContainerEl)
                      .setName("Render Markdown")
                      .setClass("mod-toggle")
                      .addToggle((toggle) => {
                        toggle.setValue(plugin.settings.defaultRenderMarkdown);
                        toggle.onChange((value) => {
                          this.renderMarkdown = value;
                          const _children = this.vChildren?._children;
                          _children.forEach((child: SearchResultItem) => {
                            child.renderContentMatches();
                          });
                          this.infinityScroll.invalidateAll();
                          this.childrenEl.toggleClass("cm-preview-code-block", value);
                          this.childrenEl.toggleClass("is-rendered", value);
                        });
                      });
                }

                // Are we in an embedded search view?
                if (!this.patched && this.el.parentElement?.hasClass("internal-query")) {
                  let defaultHeaderEl = this.el.parentElement.querySelector(".internal-query-header");

                  if (defaultHeaderEl && this.el?.closest(".internal-query")) {
                    this.patched = true;
                    defaultHeaderEl = this.el.parentElement.querySelector(".internal-query-header");
                    this.setExtraContext = function (value: boolean) {
                      const _children = this.vChildren?._children;
                      this.extraContext = value;
                      this.extraContextButtonEl.toggleClass("is-active", value);
                      _children.forEach((child: SearchResultItem) => {
                        child.setExtraContext(value);
                      });
                      this.infinityScroll.invalidateAll();
                    };
                    this.setTitleDisplay = function (value: boolean) {
                      this.showTitle = value;
                      this.showTitleButtonEl.toggleClass("is-active", value);
                      defaultHeaderEl.toggleClass("is-hidden", value);
                    };
                    this.setResultsDisplay = function (value: boolean) {
                      this.showResults = value;
                      this.showResultsButtonEl.toggleClass("is-active", value);
                      this.el.toggleClass("is-hidden", value);
                    };
                    this.setRenderMarkdown = function (value: boolean) {
                      this.renderMarkdown = value;
                      const _children = this.vChildren?._children;
                      _children.forEach((child: SearchResultItem) => {
                        child.renderContentMatches();
                      });
                      this.infinityScroll.invalidateAll();
                      this.childrenEl.toggleClass("cm-preview-code-block", value);
                      this.childrenEl.toggleClass("is-rendered", value);
                      this.renderMarkdownButtonEl.toggleClass("is-active", value);
                    };
                    this.setCollapseAll = function (value: boolean) {
                      const _children = this.vChildren?._children;
                      this.collapseAllButtonEl.toggleClass("is-active", value);
                      this.collapseAll = value;
                      _children.forEach((child: SearchResultItem) => {
                        child.setCollapse(value, false);
                      });
                      this.infinityScroll.invalidateAll();
                    };
                    this.setSortOrder = (sortType: string) => {
                      this.sortOrder = sortType;
                      this.changed();
                      this.infinityScroll.invalidateAll();
                    };
                    this.onCopyResultsClick = async (event: MouseEvent) => {
                      event.preventDefault();

                      // Collect the search results
                      const results = [];
                      const _children = this.vChildren?._children;

                      for (const item of _children) {
                        const filePath = item.file.path;
                        let matchesText = '';
                        const matches = item.vChildren?._children;
                        for (const match of matches) {
                          const content = match.parent.content.substring(match.start, match.end);
                          matchesText += content + '\n';
                        }
                        results.push(`## ${filePath}\n${matchesText}`);
                      }

                      const resultsText = results.join('\n');
                      try {
                        await navigator.clipboard.writeText(resultsText);
                        new Notice('Search results copied to clipboard.');
                      } catch (err) {
                        console.error('Failed to copy search results:', err);
                        new Notice('Failed to copy search results.');
                      }
                    };


                    const headerDom = (this.headerDom = createSearchHeaderDom(this.el.parentElement));
                    defaultHeaderEl.insertAdjacentElement("afterend", headerDom.navHeaderEl);
                    this.collapseAllButtonEl = headerDom.addNavButton(
                        "bullet-list",
                        translate("plugins.search.label-collapse-results"),
                        (event: MouseEvent) => {
                          event.stopPropagation();
                          return this.setCollapseAll(!this.collapseAll);
                        }
                    );
                    this.extraContextButtonEl = headerDom.addNavButton(
                        "expand-vertically",
                        translate("plugins.search.label-more-context"),
                        (event: MouseEvent) => {
                          event.stopPropagation();
                          return this.setExtraContext(!this.extraContext);
                        }
                    );
                    this.showSortButtonEl = headerDom.addNavButton(
                        'arrow-up-narrow-wide', // Initial icon
                        'Sort', // Tooltip
                        (event: MouseEvent) => {
                          event.stopPropagation();
                          const validSortOptionKeys = sortOptions.map(option => option.key);
                          const setSortOrderCallback = (selectedOptionKey: string) => {
                            if (validSortOptionKeys.includes(selectedOptionKey)) {
                              this.sortOrder = selectedOptionKey;

                              // Find the selected option's label
                              const selectedOption: SortOption = sortOptions.find(option => option.key === selectedOptionKey);
                              const toolTip = `Sort (${selectedOption.label})`;

                              this.showSortButtonEl.setAttribute('aria-label', toolTip);
                              this.setSortOrder(selectedOptionKey);
                            } else {
                              console.error(`Invalid sort option: ${selectedOptionKey}`);
                            }
                          };
                          createSortPopup(sortOptions, this.showSortButtonEl, setSortOrderCallback, this.sortOrder, this.app);
                        }
                    );
                    this.showTitleButtonEl = headerDom.addNavButton("strikethrough-glyph", "Hide title", (event: MouseEvent) => {
                      event.stopPropagation();
                      return this.setTitleDisplay(!this.showTitle);
                    });
                    this.showResultsButtonEl = headerDom.addNavButton("minus-with-circle", "Hide results", (event: MouseEvent) => {
                      event.stopPropagation();
                      return this.setResultsDisplay(!this.showResults);
                    });
                    this.renderMarkdownButtonEl = headerDom.addNavButton("reading-glasses", "Render Markdown", (event: MouseEvent) => {
                      event.stopPropagation();
                      return this.setRenderMarkdown(!this.renderMarkdown);
                    });
                    headerDom.addNavButton("documents", "Copy results", this.onCopyResultsClick.bind(this));
                    const allSettings = {
                      title: plugin.settings.defaultHideResults,
                      collapsed: plugin.settings.defaultCollapse,
                      context: plugin.settings.defaultShowContext,
                      hideTitle: plugin.settings.defaultHideTitle,
                      hideResults: plugin.settings.defaultHideResults,
                      renderMarkdown: plugin.settings.defaultRenderMarkdown,
                      sort: plugin.settings.defaultSortOrder,
                    };
                    if (!this.settings) this.settings = {};
                    Object.entries(allSettings).forEach(([setting, defaultValue]) => {
                      if (!hasOwn(this.settings, setting)) {
                        this.settings[setting] = defaultValue;
                      } else if (setting === "sort" && !sortOptions.some(option => option.key === this.settings.sort)) {
                        this.settings[setting] = defaultValue;
                      }
                    });
                    this.setExtraContext(this.settings.context);
                    this.sortOrder = this.settings.sort;
                    this.setCollapseAll(this.settings.collapsed);
                    this.setTitleDisplay(this.settings.hideTitle);
                    this.setRenderMarkdown(this.settings.renderMarkdown);
                    this.setResultsDisplay(this.settings.hideResults);
                  }
                }
              } catch (err) {
                console.error('Error in SearchResultDOM.startLoader around patch:', err);
              }
              const result = old.call(this, ...args);
              return result;
            };
          }
          ,
        })
    );
  }

  patchSearchResultItem(SearchResultItemClass: typeof SearchResultItem) {
    this.isSearchResultItemPatched = true;
    const plugin = this;
    const uninstall = around(SearchResultItemClass.prototype, {
      onResultClick(old: PatchFn) {
        return function (event: MouseEvent, e: unknown, ...args: unknown[]) {
          if (
              // TODO: Improve this exclusion list which allows for clicking
              //       on elements without navigating to the match result
              event.target instanceof HTMLElement &&
              (event.target.hasClass("internal-link") ||
                  event.target.hasClass("task-list-item-checkbox") ||
                  event.target.hasClass("admonition-title-content"))
          ) {
            // Do nothing
          } else {
            return old.call(this, event, e, ...args);
          }
        };
      },
      renderContentMatches(old: PatchFn) {
        return function (...args: unknown[]) {
          // TODO: Move this to its own around registration and uninstall on patch
          const result = old.call(this, ...args);
          const _children = this.vChildren?._children;
          if (!plugin.isSearchResultItemMatchPatched && _children.length) {
            const SearchResultItemMatch = _children.first().constructor;
            plugin.patchSearchResultItemMatch(SearchResultItemMatch);
          }
          return result;
        };
      },
    });
    plugin.register(uninstall);
  }

  patchSearchResultItemMatch(SearchResultItemMatch: SearchResultItemMatchConstructor) {
    this.isSearchResultItemMatchPatched = true;
    const plugin = this;
    plugin.register(
        around(SearchResultItemMatch.prototype, {
          render(old: PatchFn) {
            return function (...args: unknown[]) {
              // NOTE: if we don't mangle ```query blocks, we could end up with infinite query recursion
              const _parent = this.parentDom;
              let content = _parent.content.substring(this.start, this.end).replace("```query", "\\`\\`\\`query");
              const leadingSpaces = content.match(/^\s+/g)?.first();
              if (leadingSpaces) {
                content = content.replace(new RegExp(`^${leadingSpaces}`, "gm"), "");
              }
              const parentComponent = _parent.parent.parent;
              if (parentComponent && _parent.parent.renderMarkdown) {
                const component = parentComponent?.renderComponent;
                this.el.empty();
                const renderer = new SearchMarkdownRenderer(plugin.app, this.el, this);
                renderer.onRenderComplete = () => {
                  // TODO: See if we can improve measurement
                  // It exists because the markdown renderer is rendering async
                  // and the measurement processes are happening before the content has been rendered
                  _parent?.parent?.infinityScroll.measure(_parent, this);
                };
                component.addChild(renderer);
                renderer.renderer.set(content);
              } else {
                return old.call(this, ...args);
              }
            };
          },
        })
    );
  }

  patchSearchView(embeddedSearch: EmbeddedSearchClass) {
    const EmbeddedSearch = embeddedSearch.constructor as typeof EmbeddedSearchClass;
    const SearchResult = embeddedSearch.dom.constructor as typeof SearchResultDOM;

    this.register(
        around(EmbeddedSearch.prototype, {
          onunload(old: PatchFn) {
            return function (...args: unknown[]) {
              if (this.renderComponent) {
                this.renderComponent.unload();
                this.dom = null;
                this.queue = null;
                this.renderComponent = null;
                this._children = null;
                this.containerEl = null;
              }

              const result = old.call(this, ...args);
              return result;
            };
          },
          onload(old: PatchFn) {
            return function (...args: unknown[]) {
              try {
                if (!this.renderComponent) {
                  this.renderComponent = new Component();
                  this.renderComponent.load();
                }
                this.dom.parent = this;
                const defaultHeaderEl = this.containerEl.parentElement.querySelector(
                    ".internal-query-header"
                ) as HTMLElement;
                const matches = this.query.matchAll(
                    /^(collapsed|context|hideTitle|renderMarkdown|hideResults|sort|title):\s*(.+?)$/gm
                );
                const settings: Record<string, string | boolean> = {};
                for (const match of matches) {
                  const key = match[1];
                  let value: string | boolean = match[2].toLowerCase();
                  if (value === "true" || value === "false") {
                    value = value === "true";
                  }
                  settings[key] = value;
                }
                this.query = this.query
                    .replace(/^((collapsed|context|hideTitle|renderMarkdown|hideResults|sort|title):.+?)$/gm, "")
                    .trim();
                defaultHeaderEl.setText(settings.title || this.query);
                this.dom.settings = settings;
              } catch (err) {
                console.error('Error in EmbeddedSearch.onload:', err);
              }
              const result = old.call(this, ...args);
              return result;
            };
          },
        })
    );
    this.patchSearchResultDOM(SearchResult);
  }

  patchBacklinksView(backlinks: BacklinksClass) {
    const Backlink = backlinks.constructor as typeof EmbeddedSearchClass;
    const BacklinkDOM = backlinks.backlinkDom.constructor as typeof BacklinkDOMClass;

    this.register(
        around(Backlink.prototype, {
          onunload(old: PatchFn) {
            return function (...args: unknown[]) {
              if (this.renderComponent) {
                this.renderComponent.unload();
                this.dom = null;
                this.queue = null;
                this.renderComponent = null;
                this._children = null;
                this.containerEl = null;
              }
              const result = old.call(this, ...args);
              return result;
            };
          },
          onload(old: PatchFn) {
            return function (...args: unknown[]) {
              try {
                if (!this.renderComponent) {
                  this.renderComponent = new Component();
                  this.renderComponent.load();
                }

                if (!this.dom) {
                  console.warn('Backlink `dom` is undefined. Initializing default properties.');
                  this.dom = {};
                }

                this.backlinkDom.parent = this;
                this.unlinkedDom.parent = this;

                this.dom.settings = this.dom.settings || {};
              } catch (err) {
                console.error('Error in Backlink.onload:', err);
              }
              return old.call(this, ...args);
            };
          },
        })
    );
    this.patchSearchResultDOM(BacklinkDOM);
  }
}

function handleBacklinks(
    instance: BacklinkDOMClass,
    plugin: EmbeddedQueryControlPlugin,
    backlinksInstance: BacklinksClass
) {
  if (backlinksInstance) {
    backlinksInstance.patched = true;
    instance.setRenderMarkdown = function (value: boolean) {
      const doms = [backlinksInstance.backlinkDom, backlinksInstance.unlinkedDom];
      doms.forEach(dom => {
        dom.renderMarkdown = value;
        const _children = dom.vChildren?._children;
        _children.forEach((child: SearchResultItem) => {
          child.renderContentMatches();
        });
        dom.infinityScroll.invalidateAll();
        dom.childrenEl.toggleClass("cm-preview-code-block", value);
        dom.childrenEl.toggleClass("is-rendered", value);
      });
      this.renderMarkdownButtonEl.toggleClass("is-active", value);
    };

    // Updated onCopyResultsClick method
    instance.onCopyResultsClick = async (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();

      // Collect the search results
      const results = [];
      const doms = [backlinksInstance.backlinkDom, backlinksInstance.unlinkedDom];

      for (const dom of doms) {
        const _children = dom.vChildren?._children;

        for (const item of _children) {
          const filePath = item.file.path;
          let matchesText = '';
          const matches = item.vChildren?._children;
          for (const match of matches) {
            const content = match.parent.content.substring(match.start, match.end);
            matchesText += content + '\n';
          }
          results.push(`## ${filePath}\n${matchesText}`);
        }
      }

      const resultsText = results.join('\n');
      try {
        await navigator.clipboard.writeText(resultsText);
      } catch (err) {
        console.error('Failed to copy backlinks:', err);
        new Notice('Failed to copy backlinks.');
      }
    };

    // Ensure the button is bound to the updated method
    instance.renderMarkdownButtonEl = backlinksInstance.headerDom.addNavButton(
        "reading-glasses",
        "Render Markdown",
        (event: MouseEvent) => {
          event.stopPropagation();
          return instance.setRenderMarkdown(!instance.renderMarkdown);
        }
    );
    backlinksInstance.headerDom.addNavButton("documents", "Copy results", instance.onCopyResultsClick.bind(instance));

    const allSettings = {
      title: plugin.settings.defaultHideResults,
      collapsed: plugin.settings.defaultCollapse,
      context: plugin.settings.defaultShowContext,
      hideTitle: plugin.settings.defaultHideTitle,
      hideResults: plugin.settings.defaultHideResults,
      renderMarkdown: plugin.settings.defaultRenderMarkdown,
      sort: plugin.settings.defaultSortOrder,
    };
    if (!instance.settings) instance.settings = {};
    Object.entries(allSettings).forEach(([setting, defaultValue]) => {
      if (!hasOwn(instance.settings, setting)) {
        instance.settings[setting] = defaultValue;
      } else if (setting === "sort" && !sortOptions.some(option => option.key === instance.settings.sort)) {
        instance.settings[setting] = defaultValue;
      }
    });
    backlinksInstance.setExtraContext(instance.settings.context === true);
    backlinksInstance.sortOrder = String(instance.settings.sort);
    backlinksInstance.setCollapseAll(instance.settings.collapsed === true);
    instance.setRenderMarkdown(instance.settings.renderMarkdown === true);
  }
}
