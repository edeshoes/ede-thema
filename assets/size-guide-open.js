const setSizeGuideEnabled = () => {
  const enabled = Boolean(document.querySelector('[data-size-guide-dialog]'));
  if (enabled) {
    document.documentElement.dataset.sizeGuideEnabled = 'true';
  } else {
    delete document.documentElement.dataset.sizeGuideEnabled;
  }
};

/** @param {MouseEvent} event */
const handleClick = (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest('[data-open-size-guide]');
  if (!(trigger instanceof HTMLElement)) return;

  event.preventDefault();
  setSizeGuideEnabled();

  const scope =
    trigger.closest('.product-details') ||
    trigger.closest('.quick-add-modal__content') ||
    trigger.closest('featured-product-information') ||
    document;

  const dialog =
    scope.querySelector('[data-size-guide-dialog]') ||
    scope.querySelector('dialog-component.size-guide-modal') ||
    document.querySelector('[data-size-guide-dialog]');

  if (!(dialog instanceof HTMLElement)) return;

  const maybeDialog = /** @type {{ showDialog?: () => void }} */ (/** @type {unknown} */ (dialog));
  if (maybeDialog.showDialog) {
    maybeDialog.showDialog();
    return;
  }

  const nativeDialog = dialog.querySelector('dialog');
  if (nativeDialog instanceof HTMLDialogElement) {
    if (!nativeDialog.open) nativeDialog.showModal();
  }
};

document.addEventListener('click', handleClick);
document.addEventListener('DOMContentLoaded', setSizeGuideEnabled);

const observer = new MutationObserver(setSizeGuideEnabled);
observer.observe(document.documentElement, { childList: true, subtree: true });
