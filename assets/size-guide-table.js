/** @param {MouseEvent} event */
const handleUnitClick = (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest('[data-size-guide-unit]');
  if (!(button instanceof HTMLButtonElement)) return;

  const unit = button.dataset.sizeGuideUnit;
  if (unit !== 'mm' && unit !== 'cm' && unit !== 'in') return;

  event.preventDefault();

  const table = button.closest('[data-size-guide-table]');
  if (!(table instanceof HTMLElement)) return;

  table.dataset.activeUnit = unit;

  table.querySelectorAll('[data-size-guide-unit]').forEach((el) => {
    if (!(el instanceof HTMLButtonElement)) return;
    const isActive = el.dataset.sizeGuideUnit === unit;
    el.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
};

const initTables = () => {
  document.querySelectorAll('[data-size-guide-table]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const initial = el.dataset.defaultUnit;
    const unit = initial === 'cm' || initial === 'in' || initial === 'mm' ? initial : 'mm';
    el.dataset.activeUnit = unit;
    el.querySelectorAll('[data-size-guide-unit]').forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.setAttribute('aria-selected', btn.dataset.sizeGuideUnit === unit ? 'true' : 'false');
    });
  });
};

document.addEventListener('click', handleUnitClick);
document.addEventListener('DOMContentLoaded', initTables);

/** @param {MouseEvent} event */
const handleAccordionClick = (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest('[data-sg-accordion-trigger]');
  if (!(trigger instanceof HTMLButtonElement)) return;

  event.preventDefault();

  const item = trigger.closest('[data-sg-accordion-item]');
  if (!(item instanceof HTMLElement)) return;

  const content = item.querySelector('[data-sg-accordion-content]');
  if (!(content instanceof HTMLElement)) return;

  const nextOpen = content.hasAttribute('hidden');
  if (nextOpen) content.removeAttribute('hidden');
  else content.setAttribute('hidden', '');

  trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
};

const initAccordions = () => {
  document.querySelectorAll('[data-sg-accordion-item]').forEach((item) => {
    if (!(item instanceof HTMLElement)) return;
    const trigger = item.querySelector('[data-sg-accordion-trigger]');
    const content = item.querySelector('[data-sg-accordion-content]');
    if (!(trigger instanceof HTMLButtonElement)) return;
    if (!(content instanceof HTMLElement)) return;

    const defaultOpen = item.dataset.defaultOpen === 'true';
    if (defaultOpen) content.removeAttribute('hidden');
    else content.setAttribute('hidden', '');

    trigger.setAttribute('aria-expanded', defaultOpen ? 'true' : 'false');
  });
};

document.addEventListener('click', handleAccordionClick);
document.addEventListener('DOMContentLoaded', initAccordions);
