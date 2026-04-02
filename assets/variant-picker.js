import { Component } from '@theme/component';
import { VariantSelectedEvent, VariantUpdateEvent } from '@theme/events';
import { morph, MORPH_OPTIONS } from '@theme/morph';
import { yieldToMainThread, getViewParameterValue, ResizeNotifier } from '@theme/utilities';

/**
 * @typedef {object} VariantPickerRefs
 * @property {HTMLFieldSetElement[]} fieldsets – The fieldset elements.
 */

/**
 * A custom element that manages a variant picker.
 *
 * @template {import('@theme/component').Refs} [TRefs=VariantPickerRefs]
 * @extends Component<TRefs>
 */
export default class VariantPicker extends Component {
  /** @type {string | undefined} */
  #pendingRequestUrl;

  /** @type {AbortController | undefined} */
  #abortController;

  /** @type {number[][]} */
  #checkedIndices = [];

  /** @type {HTMLInputElement[][]} */
  #radios = [];

  /** @type {'US' | 'EU'} */
  #sizeUnit = 'US';

  /** @type {AbortController | null} */
  #sizeUnitController = null;

  #resizeObserver = new ResizeNotifier(() => this.updateVariantPickerCss());

  connectedCallback() {
    super.connectedCallback();
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);

    fieldsets.forEach((fieldset) => {
      const radios = Array.from(fieldset?.querySelectorAll('input') ?? []);
      this.#radios.push(radios);

      const initialCheckedIndex = radios.findIndex((radio) => radio.dataset.currentChecked === 'true');
      if (initialCheckedIndex !== -1) {
        this.#checkedIndices.push([initialCheckedIndex]);
      }
    });

    this.addEventListener('change', this.variantChanged.bind(this));
    this.#resizeObserver.observe(this);
    this.#initSizeUnit();
    this.#applySizeUnitUI();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver.disconnect();
    this.#sizeUnitController?.abort();
    this.#sizeUnitController = null;
  }

  /**
   * Handles the variant change event.
   * @param {Event} event - The variant change event.
   */
  variantChanged(event) {
    if (!(event.target instanceof HTMLElement)) return;

    const selectedOption =
      event.target instanceof HTMLSelectElement ? event.target.options[event.target.selectedIndex] : event.target;

    if (!selectedOption) return;

    this.updateSelectedOption(event.target);
    this.dispatchEvent(new VariantSelectedEvent({
      id: selectedOption.dataset.optionValueId ?? '',
    }));

    const isOnProductPage =
      this.dataset.templateProductMatch === 'true' &&
      !event.target.closest('product-card') &&
      !event.target.closest('quick-add-dialog');

    // Morph the entire main content for combined listings child products, because changing the product
    // might also change other sections depending on recommendations, metafields, etc.
    const currentUrl = this.dataset.productUrl?.split('?')[0];
    const newUrl = selectedOption.dataset.connectedProductUrl;
    const loadsNewProduct = isOnProductPage && !!newUrl && newUrl !== currentUrl;
    const isOnFeaturedProductSection = Boolean(this.closest('featured-product-information'));

    const morphElementSelector = loadsNewProduct
      ? 'main'
      : isOnFeaturedProductSection
      ? 'featured-product-information'
      : undefined;

    this.fetchUpdatedSection(this.buildRequestUrl(selectedOption), morphElementSelector);

    const url = new URL(window.location.href);

    const variantId = selectedOption.dataset.variantId || null;

    if (isOnProductPage) {
      if (variantId) {
        url.searchParams.set('variant', variantId);
      } else {
        url.searchParams.delete('variant');
      }
    }

    // Change the path if the option is connected to another product via combined listing.
    if (loadsNewProduct) {
      url.pathname = newUrl;
    }

    if (url.href !== window.location.href) {
      yieldToMainThread().then(() => {
        history.replaceState({}, '', url.toString());
      });
    }
  }

  /**
   * @typedef {object} FieldsetMeasurements
   * @property {HTMLFieldSetElement} fieldset
   * @property {number | undefined} currentIndex
   * @property {number | undefined} previousIndex
   * @property {number | undefined} currentWidth
   * @property {number | undefined} previousWidth
   */

  /**
   * Gets measurements for a single fieldset (read phase).
   * @param {number} fieldsetIndex
   * @returns {FieldsetMeasurements | null}
   */
  #getFieldsetMeasurements(fieldsetIndex) {
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
    const fieldset = fieldsets[fieldsetIndex];
    const checkedIndices = this.#checkedIndices[fieldsetIndex];
    const radios = this.#radios[fieldsetIndex];

    if (!radios || !checkedIndices || !fieldset) return null;

    const [currentIndex, previousIndex] = checkedIndices;

    return {
      fieldset,
      currentIndex,
      previousIndex,
      currentWidth: currentIndex !== undefined ? radios[currentIndex]?.parentElement?.offsetWidth : undefined,
      previousWidth: previousIndex !== undefined ? radios[previousIndex]?.parentElement?.offsetWidth : undefined,
    };
  }

  /**
   * Applies measurements to a fieldset (write phase).
   * @param {FieldsetMeasurements} measurements
   */
  #applyFieldsetMeasurements({ fieldset, currentWidth, previousWidth, currentIndex, previousIndex }) {
    if (currentWidth) {
      fieldset.style.setProperty('--pill-width-current', `${currentWidth}px`);
    } else if (currentIndex !== undefined) {
      fieldset.style.removeProperty('--pill-width-current');
    }

    if (previousWidth) {
      fieldset.style.setProperty('--pill-width-previous', `${previousWidth}px`);
    } else if (previousIndex !== undefined) {
      fieldset.style.removeProperty('--pill-width-previous');
    }
  }

  /**
   * Updates the fieldset CSS.
   * @param {number} fieldsetIndex - The fieldset index.
   */
  updateFieldsetCss(fieldsetIndex) {
    if (Number.isNaN(fieldsetIndex)) return;

    const measurements = this.#getFieldsetMeasurements(fieldsetIndex);
    if (measurements) {
      this.#applyFieldsetMeasurements(measurements);
    }
  }

  /**
   * Updates the selected option.
   * @param {string | Element} target - The target element.
   */
  updateSelectedOption(target) {
    if (typeof target === 'string') {
      const targetElement = this.querySelector(`[data-option-value-id="${target}"]`);

      if (!targetElement) throw new Error('Target element not found');

      target = targetElement;
    }

    if (target instanceof HTMLInputElement) {
      const fieldsetIndex = Number.parseInt(target.dataset.fieldsetIndex || '');
      const inputIndex = Number.parseInt(target.dataset.inputIndex || '');

      if (!Number.isNaN(fieldsetIndex) && !Number.isNaN(inputIndex)) {
        const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);
        const fieldset = fieldsets[fieldsetIndex];
        const checkedIndices = this.#checkedIndices[fieldsetIndex];
        const radios = this.#radios[fieldsetIndex];

        if (radios && checkedIndices && fieldset) {
          // Clear previous checked states
          const [currentIndex, previousIndex] = checkedIndices;

          if (currentIndex !== undefined && radios[currentIndex]) {
            radios[currentIndex].dataset.previousChecked = 'false';
          }
          if (previousIndex !== undefined && radios[previousIndex]) {
            radios[previousIndex].dataset.previousChecked = 'false';
          }

          // Update checked indices array - keep only the last 2 selections
          checkedIndices.unshift(inputIndex);
          checkedIndices.length = Math.min(checkedIndices.length, 2);

          // Update the new states
          const newCurrentIndex = checkedIndices[0]; // This is always inputIndex
          const newPreviousIndex = checkedIndices[1]; // This might be undefined

          // newCurrentIndex is guaranteed to exist since we just added it
          if (newCurrentIndex !== undefined && radios[newCurrentIndex]) {
            radios[newCurrentIndex].dataset.currentChecked = 'true';
          }

          if (newPreviousIndex !== undefined && radios[newPreviousIndex]) {
            radios[newPreviousIndex].dataset.previousChecked = 'true';
            radios[newPreviousIndex].dataset.currentChecked = 'false';
          }

          this.updateFieldsetCss(fieldsetIndex);
        }
      }
      target.checked = true;
    }

    if (target instanceof HTMLSelectElement) {
      const newValue = target.value;
      const newSelectedOption = Array.from(target.options).find((option) => option.value === newValue);

      if (!newSelectedOption) throw new Error('Option not found');

      for (const option of target.options) {
        option.removeAttribute('selected');
      }

      newSelectedOption.setAttribute('selected', 'selected');
    }
  }

  /**
   * Builds the request URL.
   * @param {HTMLElement} selectedOption - The selected option.
   * @param {string | null} [source] - The source.
   * @param {string[]} [sourceSelectedOptionsValues] - The source selected options values.
   * @returns {string} The request URL.
   */
  buildRequestUrl(selectedOption, source = null, sourceSelectedOptionsValues = []) {
    // this productUrl and pendingRequestUrl will be useful for the support of combined listing. It is used when a user changes variant quickly and those products are using separate URLs (combined listing).
    // We create a new URL and abort the previous fetch request if it's still pending.
    let productUrl = selectedOption.dataset.connectedProductUrl || this.#pendingRequestUrl || this.dataset.productUrl;
    this.#pendingRequestUrl = productUrl;
    const params = [];
    const viewParamValue = getViewParameterValue();

    // preserve view parameter, if it exists, for alternative product view testing
    if (viewParamValue) params.push(`view=${viewParamValue}`);

    if (this.selectedOptionsValues.length && !source) {
      params.push(`option_values=${this.selectedOptionsValues.join(',')}`);
    } else if (source === 'product-card') {
      if (this.selectedOptionsValues.length) {
        params.push(`option_values=${sourceSelectedOptionsValues.join(',')}`);
      } else {
        params.push(`option_values=${selectedOption.dataset.optionValueId}`);
      }
    }

    // If variant-picker is a child of some specific sections, we need to append section_id=xxxx to the URL
    const SECTION_ID_MAP = {
      'quick-add-component': 'section-rendering-product-card',
      'swatches-variant-picker-component': 'section-rendering-product-card',
      'featured-product-information': this.closest('featured-product-information')?.id,
    };

    const closestSectionId = /** @type {keyof typeof SECTION_ID_MAP} | undefined */ (
      Object.keys(SECTION_ID_MAP).find((sectionId) => this.closest(sectionId))
    );

    if (closestSectionId) {
      if (productUrl?.includes('?')) {
        productUrl = productUrl.split('?')[0];
      }
      return `${productUrl}?section_id=${SECTION_ID_MAP[closestSectionId]}&${params.join('&')}`;
    }

    return `${productUrl}?${params.join('&')}`;
  }

  /**
   * Fetches the updated section.
   * @param {string} requestUrl - The request URL.
   * @param {string} [morphElementSelector] - The selector of the element to be morphed. By default, only the variant picker is morphed.
   */
  fetchUpdatedSection(requestUrl, morphElementSelector) {
    // We use this to abort the previous fetch request if it's still pending.
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    fetch(requestUrl, { signal: this.#abortController.signal })
      .then((response) => response.text())
      .then((responseText) => {
        this.#pendingRequestUrl = undefined;
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        // Defer is only useful for the initial rendering of the page. Remove it here.
        html.querySelector('overflow-list[defer]')?.removeAttribute('defer');

        const textContent = html.querySelector(`variant-picker script[type="application/json"]`)?.textContent;
        if (!textContent) return;

        let newProduct;

        if (morphElementSelector === 'main') {
          this.updateMain(html);
        } else if (morphElementSelector) {
          this.updateElement(html, morphElementSelector);
        } else {
          newProduct = this.updateVariantPicker(html);
        }

        // Dispatch for all paths so product-form-component can reset #variantChangeInProgress
        if (this.selectedOptionId) {
          this.dispatchEvent(
            new VariantUpdateEvent(JSON.parse(textContent), this.selectedOptionId, {
              html,
              productId: this.dataset.productId ?? '',
              newProduct,
            })
          );
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          console.warn('Fetch aborted by user');
        } else {
          console.error(error);
        }
      });
  }

  /**
   * @typedef {Object} NewProduct
   * @property {string} id
   * @property {string} url
   */

  /**
   * Re-renders the variant picker.
   * @param {Document | Element} newHtml - The new HTML.
   * @returns {NewProduct | undefined} Information about the new product if it has changed, otherwise undefined.
   */
  updateVariantPicker(newHtml) {
    /** @type {NewProduct | undefined} */
    let newProduct;

    const newVariantPickerSource = newHtml.querySelector(this.tagName.toLowerCase());

    if (!newVariantPickerSource) {
      throw new Error('No new variant picker source found');
    }

    // For combined listings, the product might have changed, so update the related data attribute.
    if (newVariantPickerSource instanceof HTMLElement) {
      const newProductId = newVariantPickerSource.dataset.productId;
      const newProductUrl = newVariantPickerSource.dataset.productUrl;

      if (newProductId && newProductUrl && this.dataset.productId !== newProductId) {
        newProduct = { id: newProductId, url: newProductUrl };
      }

      this.dataset.productId = newProductId;
      this.dataset.productUrl = newProductUrl;
    }

    morph(this, newVariantPickerSource, {
      ...MORPH_OPTIONS,
      getNodeKey: (node) => {
        if (!(node instanceof HTMLElement)) return undefined;
        const key = node.dataset.key;
        return key;
      },
    });
    this.updateVariantPickerCss();
    this.#applySizeUnitUI();

    return newProduct;
  }

  #initSizeUnit() {
    try {
      const stored = window.localStorage.getItem('variantPicker:sizeUnit');
      if (stored === 'EU' || stored === 'US') this.#sizeUnit = stored;
    } catch {}
  }

  /** @param {'US' | 'EU'} unit */
  #setSizeUnit(unit) {
    this.#sizeUnit = unit;
    try {
      window.localStorage.setItem('variantPicker:sizeUnit', unit);
    } catch {}
    this.#applySizeUnitUI();
  }

  #applySizeUnitUI() {
    const injected = document.getElementById('variant-size-heading-style');
    if (injected && injected.parentNode) injected.parentNode.removeChild(injected);
    const sizeFieldset = this.#findSizeFieldset();
    const sizeSelect = this.#findSizeSelect();

    if (!sizeFieldset && !sizeSelect) return;
    this.dataset.sizeUnit = this.#sizeUnit;
    this.dataset.sizeUnitEnabled = 'true';

    this.#sizeUnitController?.abort();
    this.#sizeUnitController = new AbortController();
    const { signal } = this.#sizeUnitController;

    const legend =
      sizeFieldset?.querySelector('legend') ??
      sizeSelect?.closest('.variant-option')?.querySelector('label');
    const wrapper = sizeFieldset ?? sizeSelect?.closest('.variant-option');
    if (legend instanceof HTMLElement || wrapper instanceof HTMLElement) {
      let toggle = null;
      if (sizeFieldset) {
        const prev = sizeFieldset.previousElementSibling;
        if (prev instanceof HTMLElement && prev.classList.contains('variant-option__header')) {
          const t = prev.querySelector('.variant-size-unit-toggle');
          if (t instanceof HTMLElement) toggle = t;
        }
      }
      if (!toggle) {
        toggle =
          wrapper?.querySelector('.variant-option__header .variant-size-unit-toggle') ||
          legend?.querySelector('.variant-size-unit-toggle') ||
          wrapper?.querySelector('.variant-size-unit-toggle');
      }
      if (!(toggle instanceof HTMLElement) && legend instanceof HTMLElement) {
        toggle = document.createElement('div');
        toggle.className = 'variant-size-unit-toggle';
        toggle.innerHTML =
          '<button type="button" class="variant-size-unit-toggle__button" data-unit="US" aria-selected="false">US</button><button type="button" class="variant-size-unit-toggle__button" data-unit="EU" aria-selected="false">EU</button>';
        const header =
          (sizeFieldset?.previousElementSibling instanceof HTMLElement &&
            sizeFieldset.previousElementSibling.classList.contains('variant-option__header')) ?
            sizeFieldset.previousElementSibling :
            null;
        if (header) {
          header.appendChild(toggle);
        } else {
          legend.append(toggle);
        }
      }
      legend?.classList.add('variant-option__legend--with-size-toggle');

      if (!(toggle instanceof HTMLElement)) return;
      const label = toggle.querySelector('.variant-size-unit-label');
      if (!(label instanceof HTMLElement)) {
        const next = document.createElement('div');
        next.className = 'variant-size-unit-label';
        next.innerHTML =
          '<span class="variant-size-unit-label__prefix"></span><span class="variant-size-unit-label__suffix variant-size-unit-label__suffix--us"> / US SIZE</span><span class="variant-size-unit-label__suffix variant-size-unit-label__suffix--eu"> / EU SIZE</span>';
        toggle.appendChild(next);
      }
      const prefixSpan = toggle.querySelector('.variant-size-unit-label__prefix');
      if (prefixSpan instanceof HTMLElement && prefixSpan.textContent.trim() === '') {
        let prefix = getComputedStyle(this).getPropertyValue('--variant-size-unit-prefix').trim();
        if (
          (prefix.startsWith('"') && prefix.endsWith('"')) ||
          (prefix.startsWith("'") && prefix.endsWith("'"))
        ) {
          prefix = prefix.slice(1, -1);
        }
        prefixSpan.textContent = prefix || 'WOMEN';
      }
      toggle.addEventListener(
        'click',
        (event) => {
          const target = event.target instanceof Element ? event.target : null;
          const button = target?.closest('button[data-unit]');
          if (!(button instanceof HTMLButtonElement)) return;
          const unit = button.dataset.unit === 'EU' ? 'EU' : 'US';
          this.#setSizeUnit(unit);
        },
        { signal }
      );

      toggle.querySelectorAll('button[data-unit]').forEach((btn) => {
        const b = /** @type {HTMLButtonElement} */ (btn);
        const active = (b.dataset.unit || 'US') === this.#sizeUnit;
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }

    if (sizeFieldset) {
      this.#applySizeUnitToFieldset(sizeFieldset);
    }

    if (sizeSelect) {
      this.#applySizeUnitToSelect(sizeSelect);
    }
  }

  /**
   * @param {HTMLFieldSetElement | null} fieldset
   * @param {HTMLSelectElement | null} select
   */
  #applySizeHeading(fieldset, select) {
  }

  #ensureDynamicSizeHeadingStyle() {
  }

  /** @returns {HTMLFieldSetElement | null} */
  #findSizeFieldset() {
    const fieldsets = Array.from(this.querySelectorAll('fieldset.variant-option')).filter(
      (el) => el instanceof HTMLFieldSetElement
    );
    return (
      fieldsets.find((fs) => {
        const legend = fs.querySelector('legend');
        const text = legend?.textContent?.trim().toLowerCase() || '';
        return (
          text.includes('size') ||
          text.includes('numara') ||
          text.includes('number') ||
          text.includes('beden')
        );
      }) ?? null
    );
  }

  #findSizeSelect() {
    const wrappers = Array.from(this.querySelectorAll('.variant-option--dropdowns'));
    const wrap = wrappers.find((w) => {
      const label = w.querySelector('label');
      const text = label?.textContent?.trim().toLowerCase() || '';
      return (
        text.includes('size') ||
        text.includes('numara') ||
        text.includes('number') ||
        text.includes('beden')
      );
    });
    const select = wrap?.querySelector('select');
    return select instanceof HTMLSelectElement ? select : null;
  }

  /** @param {HTMLFieldSetElement} fieldset */
  #applySizeUnitToFieldset(fieldset) {
    const inputs = Array.from(fieldset.querySelectorAll('input[type="radio"]')).filter((el) => el instanceof HTMLInputElement);
    for (const input of /** @type {HTMLInputElement[]} */ (inputs)) {
      const label = input.closest('label') ?? input.nextElementSibling;
      if (!(label instanceof HTMLLabelElement)) continue;

      const text = label.querySelector('[data-key="variant-option-text"], .variant-option__button-label__text, .size-text');
      if (!(text instanceof HTMLElement)) continue;

      const raw = input.value;
      const numeric = this.#parseNumeric(raw);
      if (numeric == null) continue;

      if (!text.dataset.baseValue) {
        text.dataset.baseValue = String(numeric);
      }

      if (!text.dataset.baseUnit) {
        text.dataset.baseUnit = this.#detectBaseUnit(raw, numeric);
      }

      const baseUnit = text.dataset.baseUnit === 'EU' ? 'EU' : 'US';
      const baseValue = this.#parseNumeric(text.dataset.baseValue) ?? numeric;

      const converted = this.#convertSizeValue(baseValue, baseUnit, this.#sizeUnit);
      if (converted == null) continue;
      text.textContent = `${this.#sizeUnit} ${converted}`;
    }
  }

  /** @param {HTMLSelectElement} select */
  #applySizeUnitToSelect(select) {
    const options = Array.from(select.options);
    for (const option of options) {
      const raw = option.value;
      const numeric = this.#parseNumeric(raw);
      if (numeric == null) continue;

      if (!option.dataset.baseValue) option.dataset.baseValue = String(numeric);
      if (!option.dataset.baseUnit) option.dataset.baseUnit = this.#detectBaseUnit(raw, numeric);

      const baseUnit = option.dataset.baseUnit === 'EU' ? 'EU' : 'US';
      const baseValue = this.#parseNumeric(option.dataset.baseValue) ?? numeric;
      const converted = this.#convertSizeValue(baseValue, baseUnit, this.#sizeUnit);
      if (converted == null) continue;
      option.textContent = `${this.#sizeUnit} ${converted}`;
    }
  }

  /** @param {string} value */
  #parseNumeric(value) {
    const match = String(value).replace(',', '.').match(/(\d+(\.\d+)?)/);
    if (!match?.[1]) return null;
    const n = Number.parseFloat(match[1]);
    return Number.isFinite(n) ? n : null;
  }

  /** @param {number} n */
  #formatHalf(n) {
    return Number.isInteger(n) ? String(n) : String(n);
  }

  /**
   * @param {string} raw
   * @param {number} numeric
   * @returns {'US' | 'EU'}
   */
  #detectBaseUnit(raw, numeric) {
    const normalized = String(raw).toUpperCase();
    if (normalized.includes('EU')) return 'EU';
    if (normalized.includes('US')) return 'US';
    return numeric >= 20 ? 'EU' : 'US';
  }

  /**
   * @param {number} value
   * @param {'US' | 'EU'} from
   * @param {'US' | 'EU'} to
   * @returns {string | null}
   */
  #convertSizeValue(value, from, to) {
    if (from === to) return from === 'US' ? this.#formatHalf(value) : String(value);
    if (from === 'US' && to === 'EU') return this.#mapUsToEu(value);
    if (from === 'EU' && to === 'US') return this.#mapEuToUs(value);
    return null;
  }

  /** @param {number} us */
  #mapUsToEu(us) {
    /** @type {Record<string, string>} */
    const map = {
      3.5: '33.5',
      4: '34',
      4.5: '35',
      5: '35.5',
      5.5: '36',
      6: '36.5',
      6.5: '37.5',
      7: '38',
      7.5: '38.5',
      8: '39',
      8.5: '40',
      9: '40.5',
      9.5: '41',
      10: '42',
      10.5: '42.5',
      11: '43',
      11.5: '43.5',
      12: '44',
      12.5: '45',
      13: '46',
      13.5: '46.5',
      14: '47',
    };
    const key = String(us);
    return map[key] ?? null;
  }

  /** @param {number} eu */
  #mapEuToUs(eu) {
    /** @type {Record<string, string>} */
    const map = {
      33.5: '3.5',
      34: '4',
      35: '4.5',
      35.5: '5',
      36: '5.5',
      36.5: '6',
      37.5: '6.5',
      38: '7',
      38.5: '7.5',
      39: '8',
      40: '8.5',
      40.5: '9',
      41: '9.5',
      42: '10',
      42.5: '10.5',
      43: '11',
      43.5: '11.5',
      44: '12',
      45: '12.5',
      46: '13',
      46.5: '13.5',
      47: '14',
    };
    const key = String(eu);
    return map[key] ?? null;
  }

  updateVariantPickerCss() {
    const fieldsets = /** @type {HTMLFieldSetElement[]} */ (this.refs.fieldsets || []);

    // Batch all reads first across all fieldsets to avoid layout thrashing
    const measurements = fieldsets.map((_, index) => this.#getFieldsetMeasurements(index)).filter((m) => m !== null);

    // Batch all writes after all reads
    for (const measurement of measurements) {
      this.#applyFieldsetMeasurements(measurement);
    }
  }

  /**
   * Re-renders the desired element.
   * @param {Document} newHtml - The new HTML.
   * @param {string} elementSelector - The selector of the element to re-render.
   */
  updateElement(newHtml, elementSelector) {
    const element = this.closest(elementSelector);
    const newElement = newHtml.querySelector(elementSelector);

    if (!element || !newElement) {
      throw new Error(`No new element source found for ${elementSelector}`);
    }

    morph(element, newElement);
  }

  /**
   * Re-renders the entire main content.
   * @param {Document} newHtml - The new HTML.
   */
  updateMain(newHtml) {
    const main = document.querySelector('main');
    const newMain = newHtml.querySelector('main');

    if (!main || !newMain) {
      throw new Error('No new main source found');
    }

    morph(main, newMain);
  }

  /**
   * Gets the selected option.
   * @returns {HTMLInputElement | HTMLOptionElement | undefined} The selected option.
   */
  get selectedOption() {
    const selectedOption = this.querySelector('select option[selected], fieldset input:checked');

    if (!(selectedOption instanceof HTMLInputElement || selectedOption instanceof HTMLOptionElement)) {
      return undefined;
    }

    return selectedOption;
  }

  /**
   * Gets the selected option ID.
   * @returns {string | undefined} The selected option ID.
   */
  get selectedOptionId() {
    const { selectedOption } = this;
    if (!selectedOption) return undefined;
    const { optionValueId } = selectedOption.dataset;

    if (!optionValueId) {
      throw new Error('No option value ID found');
    }

    return optionValueId;
  }

  /**
   * Gets the selected options values.
   * @returns {string[]} The selected options values.
   */
  get selectedOptionsValues() {
    /** @type HTMLElement[] */
    const selectedOptions = Array.from(this.querySelectorAll('select option[selected], fieldset input:checked'));

    return selectedOptions.map((option) => {
      const { optionValueId } = option.dataset;

      if (!optionValueId) throw new Error('No option value ID found');

      return optionValueId;
    });
  }
}

if (!customElements.get('variant-picker')) {
  customElements.define('variant-picker', VariantPicker);
}
