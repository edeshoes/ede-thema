import { Component } from '@theme/component';

export class SizeGuideTabs extends Component {
  /** @type {HTMLButtonElement[]} */
  #tabs = [];
  /** @type {HTMLElement[]} */
  #panels = [];

  connectedCallback() {
    super.connectedCallback();
    this.#sync();
    this.addEventListener('click', this.#handleClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.#handleClick);
  }

  /** @param {MouseEvent} event */
  #handleClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest('button[data-size-guide-tab]');
    if (!(button instanceof HTMLButtonElement)) return;

    event.preventDefault();
    this.selectTab(button.dataset.sizeGuideTab || '');
  };

  #sync() {
    const tabs = Array.from(this.querySelectorAll('button[data-size-guide-tab]')).filter((el) =>
      el instanceof HTMLButtonElement
    );
    const panels = Array.from(this.querySelectorAll('[data-size-guide-panel]')).filter((el) => el instanceof HTMLElement);

    this.#tabs = /** @type {HTMLButtonElement[]} */ (tabs);
    this.#panels = /** @type {HTMLElement[]} */ (panels);

    if (tabs.length <= 1 || panels.length <= 1) {
      const tabsWrap = this.querySelector('[data-size-guide-tabs]');
      if (tabsWrap instanceof HTMLElement) tabsWrap.hidden = true;
      panels.forEach((panel) => panel.removeAttribute('hidden'));
      return;
    }

    const defaultTab = this.getAttribute('default-tab') || tabs[0]?.dataset.sizeGuideTab || '';
    this.selectTab(defaultTab);
  }

  /** @param {string} tab */
  selectTab(tab) {
    const tabs = this.#tabs;
    const panels = this.#panels;
    const normalized = String(tab || '').toUpperCase();
    const match = tabs.find((t) => (t.dataset.sizeGuideTab || '').toUpperCase() === normalized);
    const activeTab = match || tabs[0];
    const activeKey = (activeTab?.dataset.sizeGuideTab || '').toUpperCase();

    tabs.forEach((t) => {
      const isActive = (t.dataset.sizeGuideTab || '').toUpperCase() === activeKey;
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      t.toggleAttribute('data-active', isActive);
      t.tabIndex = isActive ? 0 : -1;
    });

    panels.forEach((p) => {
      const panelKey = (p.dataset.sizeGuidePanel || '').toUpperCase();
      p.toggleAttribute('hidden', panelKey !== activeKey);
    });
  }
}

if (!customElements.get('size-guide-tabs')) {
  customElements.define('size-guide-tabs', SizeGuideTabs);
}
