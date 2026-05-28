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

  function updateWishlistBadge(count) {
    if (!wishlistBadge) return;
    const n = parseInt(count, 10) || 0;
    if (n > 0) {
      wishlistBadge.textContent = n;
      wishlistBadge.style.display = '';
    } else {
      wishlistBadge.style.display = 'none';
    }
  }

  try {
    const stored = localStorage.getItem('fs_wishlist_count');
    if (stored) updateWishlistBadge(stored);
  } catch (e) {}

  // Wishlist apps can call window.fsUpdateWishlistCount(n) to update the badge
  // or write to localStorage.setItem('fs_wishlist_count', n)
  window.fsUpdateWishlistCount = updateWishlistBadge;

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
