import { App, MarkdownRenderer, TFile } from "obsidian";

interface SearchMatchLike {
  start: number;
  end: number;
  parent: {
    file: TFile;
    content: string;
  };
  parentDom: {
    path: string;
    file: TFile;
  };
}

export class SearchMarkdownRenderer extends MarkdownRenderer {
  app: App;
  subpath: string;
  indent: string;
  file: TFile;
  match: SearchMatchLike;
  filePath: string;

  constructor(app: App, containerEl: HTMLElement, match: SearchMatchLike) {
    super(containerEl);
    this.app = app;
    this.match = match;
    this.subpath = "";
    this.indent = "";
    this.filePath = this.match.parentDom.path;
    this.file = this.match.parentDom.file;
    this.renderer.previewEl.onNodeInserted(() => {
      this.updateOptions();
      return this.renderer.onResize();
    });
  }

  updateOptions() {
    const readableLineLength = this.app.vault.getConfig("readableLineLength");
    this.renderer.previewEl.toggleClass("is-readable-line-width", readableLineLength);
    const foldHeading = this.app.vault.getConfig("foldHeading");
    this.renderer.previewEl.toggleClass("allow-fold-headings", foldHeading);
    const foldIndent = this.app.vault.getConfig("foldIndent");
    this.renderer.previewEl.toggleClass("allow-fold-lists", foldIndent);
    this.renderer.previewEl.toggleClass("rtl", this.app.vault.getConfig("rightToLeft"));

    if (!foldHeading) {
      this.renderer.unfoldAllHeadings();
    }

    if (!foldIndent) {
      this.renderer.unfoldAllLists();
    }

    this.renderer.previewEl.toggleClass("show-frontmatter", this.app.vault.getConfig("showFrontmatter"));
    const tabSize = this.app.vault.getConfig("tabSize");
    // this.renderer.previewEl.style.tabSize = String(tabSize);
    this.renderer.previewEl.style.setProperty('--tab-size', `${tabSize}px`);
    this.renderer.rerender();
  }

  onRenderComplete() {}

  getFile() {
    return this.match.parent.file;
  }

  async edit(content: string) {
    this.renderer.set(content);
    const cachedContent = await this.app.vault.cachedRead(this.file);
    const matchContent = cachedContent.slice(this.match.start, this.match.end);
    const leadingSpaces = matchContent.match(/^\s+/g)?.first();
    if (leadingSpaces) {
      content = content.replace(/^/gm, leadingSpaces);
    }
    const before = cachedContent.slice(0, this.match.start);
    const after = cachedContent.slice(this.match.end, this.match.parent.content.length);
    const combinedContent = before + content + after;
    await this.app.vault.modify(this.file, combinedContent);
  }
}
