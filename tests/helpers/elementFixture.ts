/**
 * Minimal DOM-shaped fixture for testing loader traversal. This is not an XML
 * parser or a substitute for browser/real-asset integration tests.
 */
export class ElementFixture {
  constructor(readonly nodeName: string, readonly attributes: Record<string, string | number> = {}, readonly children: ElementFixture[] = []) {}
  getAttribute(name: string): string | null { const value = this.attributes[name]; return value === undefined ? null : String(value); }
  hasAttribute(name: string): boolean { return this.getAttribute(name) !== null; }
  get outerHTML(): string { return `<${this.nodeName}>fixture</${this.nodeName}>`; }
  querySelector(selector: string): ElementFixture | null { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector: string): ElementFixture[] {
    const result = new Set<ElementFixture>();
    for (const term of selector.split(',').map(s => s.trim())) {
      const direct = term.startsWith(':scope > ');
      const tag = direct ? term.slice(':scope > '.length) : term;
      if (!/^[A-Za-z][\w-]*$/.test(tag)) throw Error(`Unsupported test fixture selector: ${term}`);
      for (const child of this.children) {
        if (child.nodeName === tag) result.add(child);
        if (!direct) for (const match of child.querySelectorAll(tag)) result.add(match);
      }
    }
    return [...result];
  }
}
export const element = (name: string, attributes: Record<string, string | number> = {}, ...children: ElementFixture[]): ElementFixture => new ElementFixture(name, attributes, children);
export const documentFixture = (documentElement: ElementFixture) => ({documentElement, querySelector: (selector: string) => documentElement.querySelector(selector)});
