import { translations } from '../i18n/translations.js';
import { getLang } from '../i18n/context.js';

function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.keys(attrs).forEach((key) => {
    if (key === 'class') {
      el.className = attrs[key];
    } else if (key === 'text') {
      el.textContent = attrs[key];
    } else {
      el.setAttribute(key, attrs[key]);
    }
  });
  children.forEach((child) => {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  });
  return el;
}

export default function createWidget(api, config) {
  let root = null;
  let banner = null;
  let modalOverlay = null;
  let privacyButton = null;
  let eventsAttached = false;
  let isModalOpen = false;
  let previousBodyOverflow = '';
  let previouslyFocusedElement = null;
  let bannerHideTimeout = null;

  function t(key) {
    const lang = getLang();
    return (
      translations[lang]?.[key] ??
      translations.en?.[key] ??
      key
    );
  }

  function formatText(key, values = {}) {
    return Object.keys(values).reduce((text, placeholder) => {
      return text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), values[placeholder]);
    }, t(key));
  }

  function getTheme() {
    return config && config.theme === 'dark' ? 'dark' : 'light';
  }

  function getPosition() {
    return config && config.position === 'top' ? 'top' : 'bottom';
  }

  function getPrimaryColor() {
    return config && config.primaryColor ? String(config.primaryColor) : '#111827';
  }

  function getLabel(key, fallback) {
    if (config && config.labels && typeof config.labels[key] === 'string' && config.labels[key].trim()) {
      return config.labels[key].trim();
    }
    return fallback;
  }

  function getUserType() {
    if (api && typeof api.getUserType === 'function') return api.getUserType();
    return 'first-time';
  }

  function ensureRoot() {
    if (root) return root;

    root = createElement('div', { 'data-consentflow': '' });
    root.setAttribute('data-theme', getTheme());
    root.setAttribute('data-position', getPosition());
    root.style.setProperty('--cf-primary', getPrimaryColor());
    root.appendChild(createElement('style', {}, [`
      [data-consentflow]{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--cf-primary:#111827;--cf-banner-bg:rgba(255,255,255,.97);--cf-border:rgba(15,23,42,.10);--cf-text:#0f172a;--cf-muted:#64748b;--cf-surface:#fff;--cf-soft-bg:rgba(255,251,235,.97);--cf-soft-border:rgba(245,158,11,.22);--cf-overlay:rgba(15,23,42,.42);--cf-shadow:0 16px 44px rgba(15,23,42,.14);--cf-shadow-soft:0 8px 20px rgba(15,23,42,.10)}
      [data-consentflow][data-theme="dark"]{--cf-banner-bg:rgba(15,23,42,.97);--cf-border:rgba(148,163,184,.20);--cf-text:#f8fafc;--cf-muted:#cbd5e1;--cf-surface:#0f172a;--cf-soft-bg:rgba(66,32,6,.96);--cf-soft-border:rgba(245,158,11,.26);--cf-overlay:rgba(2,6,23,.62);--cf-shadow:0 18px 52px rgba(2,6,23,.46);--cf-shadow-soft:0 10px 26px rgba(2,6,23,.34)}
      [data-consentflow] .cf-banner{position:fixed;left:16px;right:16px;bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 20px;background:var(--cf-banner-bg);border:1px solid var(--cf-border);border-radius:12px;box-shadow:var(--cf-shadow);backdrop-filter:blur(16px);z-index:2147483000;animation:cf-slide-up .28s ease-out both;transition:transform .3s ease,opacity .3s ease,box-shadow .18s ease}
      [data-consentflow][data-position="top"] .cf-banner{top:16px;bottom:auto}
      [data-consentflow] .cf-banner.is-hiding{transform:translateY(100%);opacity:0;pointer-events:none}
      [data-consentflow] .cf-copy{flex:1;min-width:0}
      [data-consentflow][data-position="top"] .cf-banner.is-hiding{transform:translateY(-100%)}
      [data-consentflow] .cf-title{margin:0 0 6px;color:var(--cf-text);font-size:15px;font-weight:700;letter-spacing:-.01em}
      [data-consentflow] .cf-message{margin:0;color:var(--cf-muted);font-size:13px;line-height:1.55}
      [data-consentflow] .cf-banner-minimal .cf-title{margin-bottom:0}
      [data-consentflow] .cf-banner-soft{background:var(--cf-soft-bg);border-color:var(--cf-soft-border)}
      [data-consentflow] .cf-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      [data-consentflow] .cf-btn{appearance:none;border:1px solid var(--cf-border);background:rgba(255,255,255,.72);color:var(--cf-text);border-radius:10px;padding:10px 14px;font-size:13px;font-weight:650;line-height:1.2;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease,opacity .16s ease}
      [data-consentflow][data-theme="dark"] .cf-btn{background:rgba(15,23,42,.72)}
      [data-consentflow] .cf-btn:hover{transform:translateY(-1px);box-shadow:var(--cf-shadow-soft);border-color:rgba(15,23,42,.18)}
      [data-consentflow] .cf-btn.primary{background:var(--cf-primary);color:#fff;border-color:var(--cf-primary);box-shadow:0 8px 18px rgba(15,23,42,.18)}
      [data-consentflow] .cf-btn.primary:hover{box-shadow:0 12px 26px rgba(15,23,42,.22);filter:brightness(1.02)}
      [data-consentflow] .cf-btn.secondary{background:transparent;color:var(--cf-muted)}
      [data-consentflow] .cf-btn.secondary:hover{background:rgba(148,163,184,.10);color:var(--cf-text)}
      [data-consentflow] .cf-privacy-btn{position:fixed;right:20px;bottom:20px;padding:10px 14px;border-radius:999px;border:1px solid var(--cf-border);background:var(--cf-primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;z-index:2147482999;box-shadow:0 12px 30px rgba(15,23,42,.18);transition:transform .16s ease,box-shadow .16s ease,opacity .16s ease}
      [data-consentflow][data-position="top"] .cf-privacy-btn{top:20px;bottom:auto}
      [data-consentflow] .cf-privacy-btn:hover{transform:translateY(-1px);box-shadow:0 16px 36px rgba(15,23,42,.22)}
      [data-consentflow] .cf-privacy-btn:focus-visible{outline:2px solid #2563eb;outline-offset:3px}
      [data-consentflow] .cf-btn:focus-visible,[data-consentflow] .cf-close:focus-visible,[data-consentflow] .cf-toggle input:focus-visible + .cf-switch{outline:2px solid #2563eb;outline-offset:3px}
      [data-consentflow] .cf-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--cf-overlay);backdrop-filter:blur(10px);z-index:2147483001;animation:cf-fade-in .18s ease-out both}
      [data-consentflow] .cf-modal{width:min(100%,520px);max-height:calc(100vh - 48px);overflow:auto;background:var(--cf-surface);border-radius:12px;border:1px solid var(--cf-border);box-shadow:0 24px 72px rgba(15,23,42,.24);padding:28px;animation:cf-modal-in .22s ease-out both}
      [data-consentflow] .cf-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
      [data-consentflow] .cf-modal-title{margin:0;color:var(--cf-text);font-size:22px;font-weight:750;letter-spacing:-.02em}
      [data-consentflow] .cf-modal-desc{margin:8px 0 0;color:var(--cf-muted);font-size:14px;line-height:1.55}
      [data-consentflow] .cf-close{appearance:none;border:1px solid transparent;background:transparent;color:var(--cf-muted);width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;line-height:1;transition:background .16s ease,color .16s ease,border-color .16s ease}
      [data-consentflow] .cf-close:hover{background:rgba(148,163,184,.12);color:var(--cf-text);border-color:var(--cf-border)}
      [data-consentflow] .cf-groups{display:grid;gap:12px}
      [data-consentflow] .cf-group{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px;border:1px solid rgba(15,23,42,.08);border-radius:12px;background:rgba(148,163,184,.05)}
      [data-consentflow][data-theme="dark"] .cf-group{border-color:rgba(148,163,184,.16);background:rgba(148,163,184,.06)}
      [data-consentflow] .cf-group-title{margin:0 0 4px;color:var(--cf-text);font-size:15px;font-weight:650}
      [data-consentflow] .cf-group-desc{margin:0;color:var(--cf-muted);font-size:13px;line-height:1.5}
      [data-consentflow] .cf-toggle{position:relative;display:inline-flex;align-items:center;flex:none}
      [data-consentflow] .cf-toggle input{position:absolute;opacity:0;pointer-events:none}
      [data-consentflow] .cf-switch{position:relative;display:inline-block;width:48px;height:28px;border-radius:999px;background:#cbd5e1;transition:background .18s ease,opacity .18s ease}
      [data-consentflow] .cf-switch::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.16);transition:transform .18s ease}
      [data-consentflow] .cf-toggle input:checked + .cf-switch{background:var(--cf-primary)}
      [data-consentflow] .cf-toggle input:checked + .cf-switch::after{transform:translateX(20px)}
      [data-consentflow] .cf-toggle input:disabled + .cf-switch{opacity:.55;cursor:not-allowed}
      [data-consentflow] .cf-modal-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:24px}
      @keyframes cf-slide-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      [data-consentflow][data-position="top"] .cf-banner{animation-name:cf-slide-down}
      @keyframes cf-slide-down{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}
      @keyframes cf-fade-in{from{opacity:0}to{opacity:1}}
      @keyframes cf-modal-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
      @media (prefers-reduced-motion:reduce){
        [data-consentflow] .cf-banner,[data-consentflow] .cf-overlay,[data-consentflow] .cf-modal{animation:none}
        [data-consentflow] .cf-btn,[data-consentflow] .cf-close,[data-consentflow] .cf-switch,[data-consentflow] .cf-switch::after{transition:none}
      }
      @media (max-width:720px){
        [data-consentflow] .cf-banner{left:12px;right:12px;bottom:12px;flex-direction:column;align-items:flex-start;padding:16px;gap:14px}
        [data-consentflow][data-position="top"] .cf-banner{top:12px;bottom:auto}
        [data-consentflow] .cf-actions{width:100%}
        [data-consentflow] .cf-actions .cf-btn{flex:1;justify-content:center}
        [data-consentflow] .cf-privacy-btn{right:12px;bottom:12px}
        [data-consentflow][data-position="top"] .cf-privacy-btn{top:12px;bottom:auto}
        [data-consentflow] .cf-overlay{padding:16px}
        [data-consentflow] .cf-modal{padding:22px 18px;border-radius:12px}
        [data-consentflow] .cf-modal-actions .cf-btn{flex:1}
      }
    `]));

    return root;
  }

  function ensureMounted() {
    const container = ensureRoot();
    if (!container.isConnected && document.body) {
      document.body.appendChild(container);
    }
    renderFloatingButton();
    attachEvents();
    return container;
  }

  function renderFloatingButton() {
    const shouldShow = getUserType() !== 'first-time';
    if (!shouldShow) {
      if (privacyButton && privacyButton.parentNode) {
        privacyButton.parentNode.removeChild(privacyButton);
      }
      privacyButton = null;
      return;
    }

    if (privacyButton && privacyButton.parentNode) return;

    privacyButton = createElement('button', {
      id: 'cf-privacy-btn',
      class: 'cf-privacy-btn',
      type: 'button',
      'data-action': 'floating-preferences',
      'aria-label': t('privacyAriaLabel')
    }, [getLabel('privacyButton', t('privacyButton'))]);
    root.appendChild(privacyButton);
  }

  function buildBanner() {
    const bannerEl = createElement('div', { id: 'consentflow-banner', class: 'cf-banner', role: 'dialog', 'aria-live': 'polite', 'aria-label': t('bannerAriaLabel') });
    const copy = createElement('div', { class: 'cf-copy' });
    const actions = createElement('div', { class: 'cf-actions' });
    const userType = getUserType();
    let titleText = t('title');
    let messageText = config && config.companyName
      ? formatText('descriptionWithCompany', { companyName: config.companyName })
      : t('description');

    if (userType === 'rejected') {
      bannerEl.classList.add('cf-banner-soft');
      titleText = getLabel('rejectedTitle', t('reconsiderTitle'));
      messageText = getLabel('rejectedMessage', t('reconsiderDescription'));
      actions.appendChild(createElement('button', { class: 'cf-btn secondary', type: 'button', 'data-action': 'customize' }, [getLabel('managePreferences', t('managePreferences'))]));
      actions.appendChild(createElement('button', { class: 'cf-btn primary', type: 'button', 'data-action': 'accept' }, [getLabel('enableAnalytics', t('enableAnalytics'))]));
    } else if (userType === 'returning') {
      bannerEl.classList.add('cf-banner-minimal');
      titleText = getLabel('returningTitle', t('returningTitle'));
      messageText = '';
      actions.appendChild(createElement('button', { class: 'cf-btn secondary', type: 'button', 'data-action': 'customize' }, [getLabel('managePreferences', t('managePreferences'))]));
    } else {
      titleText = getLabel('bannerTitle', titleText);
      messageText = getLabel('bannerMessage', messageText);
      actions.appendChild(createElement('button', { class: 'cf-btn secondary', type: 'button', 'data-action': 'customize' }, [getLabel('customize', t('customize'))]));
      actions.appendChild(createElement('button', { class: 'cf-btn', type: 'button', 'data-action': 'reject' }, [getLabel('rejectAll', t('rejectAll'))]));
      actions.appendChild(createElement('button', { class: 'cf-btn primary', type: 'button', 'data-action': 'accept' }, [getLabel('acceptAll', t('acceptAll'))]));
    }

    copy.appendChild(createElement('p', { class: 'cf-title', text: titleText }));
    if (messageText) {
      copy.appendChild(createElement('p', { class: 'cf-message', text: messageText }));
    }
    bannerEl.appendChild(copy);
    bannerEl.appendChild(actions);
    return bannerEl;
  }

  function buildCategoryRow({ key, title, description, checked = false, disabled = false }) {
    const row = createElement('div', { class: 'cf-group' });
    const copy = createElement('div');
    const toggle = createElement('label', { class: 'cf-toggle' });
    const input = createElement('input', { type: 'checkbox', 'data-category': key });

    input.checked = checked;
    input.disabled = disabled;

    copy.appendChild(createElement('p', { class: 'cf-group-title', text: title }));
    copy.appendChild(createElement('p', { class: 'cf-group-desc', text: description }));
    toggle.appendChild(input);
    toggle.appendChild(createElement('span', { class: 'cf-switch', 'aria-hidden': 'true' }));

    row.appendChild(copy);
    row.appendChild(toggle);
    return row;
  }

  function buildModal() {
    const overlay = createElement('div', {
      class: 'cf-overlay',
      'data-cf-overlay': 'true',
      'aria-hidden': 'false'
    });
    const modal = createElement('div', {
      class: 'cf-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'cf-modal-title',
      'aria-describedby': 'cf-modal-desc'
    });

    const head = createElement('div', { class: 'cf-modal-head' });
    const headCopy = createElement('div');
    const actions = createElement('div', { class: 'cf-modal-actions' });

    headCopy.appendChild(createElement('h2', { class: 'cf-modal-title', id: 'cf-modal-title', text: getLabel('modalTitle', t('preferencesTitle')) }));
    headCopy.appendChild(createElement('p', { class: 'cf-modal-desc', id: 'cf-modal-desc', text: getLabel('modalDescription', t('preferencesDescription')) }));

    head.appendChild(headCopy);
    head.appendChild(createElement('button', {
      class: 'cf-close',
      type: 'button',
      'data-action': 'close-modal',
      'aria-label': getLabel('closeLabel', t('closePreferences'))
    }, ['×']));

    const groups = createElement('div', { class: 'cf-groups' });
    groups.appendChild(buildCategoryRow({
      key: 'necessary',
      title: getLabel('necessaryTitle', t('necessary')),
      description: getLabel('necessaryDescription', t('necessaryDescription')),
      checked: true,
      disabled: true
    }));
    groups.appendChild(buildCategoryRow({
      key: 'analytics',
      title: getLabel('analyticsTitle', t('analytics')),
      description: getLabel('analyticsDescription', t('analyticsDescription'))
    }));
    groups.appendChild(buildCategoryRow({
      key: 'marketing',
      title: getLabel('marketingTitle', t('marketing')),
      description: getLabel('marketingDescription', t('marketingDescription'))
    }));

    actions.appendChild(createElement('button', { class: 'cf-btn primary', type: 'button', 'data-action': 'save' }, [getLabel('savePreferences', t('savePreferences'))]));

    modal.appendChild(head);
    modal.appendChild(groups);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    return overlay;
  }

  function syncModalState() {
    if (!modalOverlay || typeof api.getConsent !== 'function') return;
    const consent = api.getConsent() || {};
    const analytics = modalOverlay.querySelector('[data-category="analytics"]');
    const marketing = modalOverlay.querySelector('[data-category="marketing"]');
    const necessary = modalOverlay.querySelector('[data-category="necessary"]');

    if (necessary) necessary.checked = true;
    if (analytics) analytics.checked = Boolean(consent.analytics);
    if (marketing) marketing.checked = Boolean(consent.marketing);
  }

  function setScrollLock(locked) {
    if (!document || !document.body) return;
    if (locked) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return;
    }
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = '';
  }

  function hideBanner() {
    const bannerEl = banner || (typeof document !== 'undefined' ? document.getElementById('consentflow-banner') : null);
    if (!bannerEl) return;

    if (bannerHideTimeout) {
      clearTimeout(bannerHideTimeout);
      bannerHideTimeout = null;
    }

    bannerEl.classList.add('is-hiding');
    bannerHideTimeout = setTimeout(() => {
      if (bannerEl.parentNode) {
        bannerEl.parentNode.removeChild(bannerEl);
      }
      if (banner === bannerEl) banner = null;
      bannerHideTimeout = null;
    }, 300);
  }

  function onRootClick(event) {
    const actionEl = event.target.closest && event.target.closest('[data-action]');
    if (!actionEl || !root || !root.contains(actionEl)) return;

    const action = actionEl.getAttribute('data-action');
    if (action === 'customize') {
      openModal();
      return;
    }

    if (action === 'floating-preferences') {
      openModal();
      return;
    }

    if (action === 'accept') {
      api.acceptAll();
      closeModal();
      hideBanner();
      if (typeof console !== 'undefined' && console.log) console.log('Consent saved');
      return;
    }

    if (action === 'reject') {
      api.rejectAll();
      closeModal();
      hideBanner();
      if (typeof console !== 'undefined' && console.log) console.log('Consent saved');
      return;
    }

    if (action === 'save') {
      const analytics = modalOverlay && modalOverlay.querySelector('[data-category="analytics"]');
      const marketing = modalOverlay && modalOverlay.querySelector('[data-category="marketing"]');

      const updatedConsent = api.savePreferences({
        analytics: Boolean(analytics && analytics.checked),
        marketing: Boolean(marketing && marketing.checked)
      });
      closeModal();
      if (updatedConsent && updatedConsent.status === 'rejected') {
        api.showBanner();
      } else {
        hideBanner();
      }
      if (typeof console !== 'undefined' && console.log) console.log('Consent saved');
      return;
    }

    if (action === 'close-modal') {
      closeModal();
    }
  }

  function onDocumentClick(event) {
    if (!isModalOpen || !modalOverlay) return;
    if (event.target === modalOverlay) closeModal();
  }

  function onDocumentKeydown(event) {
    if (!isModalOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  }

  function attachEvents() {
    if (eventsAttached || !root) return;
    root.addEventListener('click', onRootClick);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeydown);
    eventsAttached = true;
  }

  function detachEvents() {
    if (!eventsAttached || !root) return;
    root.removeEventListener('click', onRootClick);
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onDocumentKeydown);
    eventsAttached = false;
  }

  function openModal() {
    ensureMounted();
    if (isModalOpen && modalOverlay) {
      syncModalState();
      return;
    }

    closeModal();

    previouslyFocusedElement = document.activeElement;
    modalOverlay = buildModal();
    root.appendChild(modalOverlay);
    syncModalState();
    setScrollLock(true);
    isModalOpen = true;

    const closeButton = modalOverlay.querySelector('[data-action="close-modal"]');
    if (closeButton && typeof closeButton.focus === 'function') closeButton.focus();
  }

  function closeModal() {
    if (!modalOverlay) {
      isModalOpen = false;
      setScrollLock(false);
      return;
    }

    const overlayToRemove = modalOverlay;
    modalOverlay = null;
    isModalOpen = false;
    setScrollLock(false);

    if (overlayToRemove.parentNode) {
      overlayToRemove.parentNode.removeChild(overlayToRemove);
    }

    if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  }

  function showBanner() {
    if (typeof console !== 'undefined' && console.log) {
      console.log('ConsentFlow showBanner called', { userType: getUserType() });
    }

    ensureMounted();

    if (banner && !banner.isConnected) {
      banner = null;
    }

    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
      banner = null;
    }

    if (!banner) {
      banner = buildBanner();
      root.appendChild(banner);
      if (typeof console !== 'undefined' && console.log) {
        console.log('ConsentFlow banner inserted into DOM', { userType: getUserType() });
      }
    }
    if (bannerHideTimeout) {
      clearTimeout(bannerHideTimeout);
      bannerHideTimeout = null;
    }
    banner.classList.remove('is-hiding');
  }

  function destroy() {
    closeModal();
    detachEvents();
    if (bannerHideTimeout) {
      clearTimeout(bannerHideTimeout);
      bannerHideTimeout = null;
    }

    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }

    banner = null;
    root = null;
    modalOverlay = null;
    privacyButton = null;
  }

  return {
    mountEntryPoints: ensureMounted,
    open: openModal,
    close: closeModal,
    showBanner,
    destroy
  };
}
