(function () {
  'use strict';

  const chrome = document.querySelector('.fs-chrome');
  if (!chrome) return;

  /* ── Body padding ────────────────────────────────────────────────────── */
  function syncBodyPadding() {
    document.body.style.paddingTop = chrome.getBoundingClientRect().height + 'px';
  }
  if (window.ResizeObserver) {
    new ResizeObserver(syncBodyPadding).observe(chrome);
  } else {
    window.addEventListener('resize', syncBodyPadding);
  }
  syncBodyPadding();

  /* ── Mega + mini dropdowns ───────────────────────────────────────────── */
  const dropItems = Array.from(
    chrome.querySelectorAll('.fs-nav__item--mega, .fs-nav__item--mini')
  );
  let closeTimer = null;

  function openItem(item) {
    clearTimeout(closeTimer);
    dropItems.forEach(i => { if (i !== item) closeItem(i); });
    item.classList.add('is-open');
    const link = item.querySelector('.fs-nav__link');
    if (link) link.setAttribute('aria-expanded', 'true');
  }

  function closeItem(item) {
    item.classList.remove('is-open');
    const link = item.querySelector('.fs-nav__link');
    if (link) link.setAttribute('aria-expanded', 'false');
  }

  function closeAll() { dropItems.forEach(closeItem); }

  dropItems.forEach(item => {
    const link  = item.querySelector('.fs-nav__link');
    const panel = item.querySelector('.fs-mega-panel, .fs-mini-panel');

    item.addEventListener('mouseenter', () => openItem(item));
    item.addEventListener('mouseleave', () => {
      closeTimer = setTimeout(() => closeItem(item), 120);
    });

    if (panel) {
      panel.addEventListener('mouseenter', () => clearTimeout(closeTimer));
      panel.addEventListener('mouseleave', () => {
        closeTimer = setTimeout(() => closeItem(item), 120);
      });
    }

    if (link) {
      link.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          openItem(item);
          const first = panel && panel.querySelector('a');
          if (first) first.focus();
        }
        if ((e.key === 'Enter' || e.key === ' ') && panel) {
          const href = link.getAttribute('href');
          if (!href || href === '#') {
            e.preventDefault();
            item.classList.contains('is-open') ? closeItem(item) : openItem(item);
          }
        }
      });
    }

    if (panel) {
      const links = panel.querySelectorAll('a');
      const last = links[links.length - 1];
      if (last) {
        last.addEventListener('keydown', e => {
          if (e.key === 'Tab' && !e.shiftKey) closeItem(item);
        });
      }
    }
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('click', e => { if (!chrome.contains(e.target)) closeAll(); });

  /* ── Wishlist badge ──────────────────────────────────────────────────────── */
  const wishlistBadge = document.getElementById('fs-wishlist-badge');

  function setWishlistBadge(n) {
    if (!wishlistBadge) return;
    n = parseInt(n, 10) || 0;
    wishlistBadge.textContent = n > 0 ? n : '';
    wishlistBadge.style.display = n > 0 ? '' : 'none';
  }

  function readLocalWishlist() {
    try {
      const ids = JSON.parse(localStorage.getItem('fp_wishlist') || '[]');
      return Array.isArray(ids) ? ids.length : 0;
    } catch (e) { return 0; }
  }

  // Seed from localStorage immediately
  setWishlistBadge(readLocalWishlist());

  // Mirror the existing .fp-wl-badge element (updated by like-wishlist.js)
  function attachFpBadgeObserver() {
    const fpBadge = document.getElementById('fp-wl-badge');
    if (!fpBadge) return false;
    setWishlistBadge(parseInt(fpBadge.textContent, 10) || 0);
    new MutationObserver(() => {
      setWishlistBadge(parseInt(fpBadge.textContent, 10) || 0);
    }).observe(fpBadge, { childList: true, characterData: true, subtree: true });
    return true;
  }

  if (!attachFpBadgeObserver()) {
    const bodyObserver = new MutationObserver((_, obs) => {
      if (attachFpBadgeObserver()) obs.disconnect();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Cross-tab sync
  window.addEventListener('storage', e => {
    if (e.key === 'fp_wishlist') setWishlistBadge(readLocalWishlist());
  });

  window.fsUpdateWishlistCount = setWishlistBadge;

  /* ── Scoped search ───────────────────────────────────────────────────── */
  const searchWrap = chrome.querySelector('.fs-search-wrap');
  if (searchWrap) {
    const scopeBtn   = searchWrap.querySelector('.fs-search-scope');
    const scopeOpts  = searchWrap.querySelectorAll('.fs-search-scope__opt');
    const form       = searchWrap.querySelector('.fs-search-form');
    const qInput     = form && form.querySelector('input[name="q"]');
    const typeHidden = form && form.querySelector('input[name="type"]');
    let activeScope  = 'designs';

    function slugify(str) {
      return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }

    function closeScopeDrop() {
      scopeBtn.classList.remove('is-open');
      scopeBtn.setAttribute('aria-expanded', 'false');
    }

    scopeBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = scopeBtn.classList.toggle('is-open');
      scopeBtn.setAttribute('aria-expanded', String(isOpen));
    });

    scopeOpts.forEach(opt => {
      opt.addEventListener('click', () => {
        activeScope = opt.dataset.scope;
        scopeBtn.querySelector('.fs-search-scope__label').textContent = opt.textContent.trim();
        scopeOpts.forEach(o => { o.classList.remove('is-active'); o.setAttribute('aria-selected', 'false'); });
        opt.classList.add('is-active');
        opt.setAttribute('aria-selected', 'true');
        if (qInput && opt.dataset.ph) qInput.placeholder = opt.dataset.ph;
        if (typeHidden) typeHidden.disabled = (activeScope !== 'designs');
        closeScopeDrop();
        if (qInput) qInput.focus();
      });
    });

    if (form) {
      form.addEventListener('submit', e => {
        if (activeScope !== 'designs') {
          e.preventDefault();
          const q = qInput ? qInput.value.trim() : '';
          if (q) window.location.href = '/pages/partners?handle=' + slugify(q);
        }
      });
    }

    document.addEventListener('click', e => {
      if (!searchWrap.contains(e.target)) closeScopeDrop();
    });
  }

  /* ── Mobile drawer ───────────────────────────────────────────────────── */
  const hamburger = chrome.querySelector('.fs-hamburger');
  const drawer    = document.getElementById('fs-drawer');

  if (hamburger && drawer) {
    const overlay  = drawer.querySelector('.fs-drawer__overlay');
    const closeBtn = drawer.querySelector('.fs-drawer__close');

    function openDrawer() {
      drawer.classList.add('is-open');
      hamburger.setAttribute('aria-expanded', 'true');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      drawer.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', openDrawer);
    if (overlay)  overlay.addEventListener('click', closeDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
    });

    /* accordion */
    drawer.querySelectorAll('.fs-drawer__trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.fs-drawer__item');
        const isOpen = item.classList.contains('is-open');
        drawer.querySelectorAll('.fs-drawer__item').forEach(i => i.classList.remove('is-open'));
        if (!isOpen) item.classList.add('is-open');
      });
    });
  }
})();
