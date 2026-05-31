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
      link.addEventListener('click', () => {
        item.classList.contains('is-open') ? closeItem(item) : openItem(item);
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

  /* ── Scoped search + predictive suggestions ─────────────────────────── */
  const searchWrap = chrome.querySelector('.fs-search-wrap');
  if (searchWrap) {
    const scopeBtn   = searchWrap.querySelector('.fs-search-scope');
    const scopeOpts  = searchWrap.querySelectorAll('.fs-search-scope__opt');
    const form       = searchWrap.querySelector('.fs-search-form');
    const qInput     = form && form.querySelector('input[name="q"]');
    const typeHidden = form && form.querySelector('input[name="type"]');
    const suggEl     = searchWrap.querySelector('.fs-search-sugg');
    let activeScope  = 'all';
    let suggTimer    = null;
    let focusIdx     = -1;
    let suggItems    = [];

    function slugify(str) {
      return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }

    function escHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ── scope dropdown ── */
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
        hideSugg();
        if (qInput) qInput.focus();
      });
    });

    if (form) form.addEventListener('submit', e => e.preventDefault());

    document.addEventListener('click', e => {
      if (!searchWrap.contains(e.target)) { closeScopeDrop(); hideSugg(); }
    });

    /* ── predictive suggestions ── */
    if (suggEl) suggEl.addEventListener('mousedown', e => e.preventDefault());

    function hideSugg() {
      if (suggEl) { suggEl.hidden = true; suggEl.innerHTML = ''; }
      focusIdx = -1; suggItems = [];
    }

    function moveFocus(dir) {
      if (!suggItems.length) return;
      focusIdx = (focusIdx + dir + suggItems.length) % suggItems.length;
      suggItems.forEach((el, i) => el.classList.toggle('is-focused', i === focusIdx));
    }

    function applySugg(html) {
      if (!suggEl) return;
      suggEl.innerHTML = html;
      suggEl.hidden = false;
      suggItems = Array.from(suggEl.querySelectorAll('[role="option"]'));
      focusIdx = -1;
    }

    function productItems(products, limit) {
      let html = '';
      products.slice(0, limit).forEach(p => {
        const imgUrl = p.featured_image?.url || p.image;
        const thumb = imgUrl
          ? `<img class="fs-sugg__thumb" src="${escHtml(imgUrl)}&width=96" alt="" loading="lazy">`
          : `<div class="fs-sugg__thumb fs-sugg__thumb--empty"></div>`;
        html += `<a class="fs-sugg__item" href="${escHtml(p.url)}" role="option">${thumb}<div class="fs-sugg__body"><span class="fs-sugg__title">${escHtml(p.title)}</span><span class="fs-sugg__sub">${escHtml(p.vendor)}</span></div></a>`;
      });
      return html;
    }

    function partnerItems(partners, limit) {
      let html = '';
      partners.slice(0, limit).forEach(p => {
        const thumb = p.profileImageUrl
          ? `<img class="fs-sugg__thumb" src="${escHtml(p.profileImageUrl)}" alt="" loading="lazy" style="border-radius:50%">`
          : `<div class="fs-sugg__avatar">${escHtml(p.studioName[0].toUpperCase())}</div>`;
        html += `<a class="fs-sugg__item" href="/pages/partners?handle=${encodeURIComponent(p.slug)}" role="option">${thumb}<div class="fs-sugg__body"><span class="fs-sugg__title">${escHtml(p.studioName)}</span><span class="fs-sugg__sub">Designer</span></div></a>`;
      });
      return html;
    }

    function collectionItems(collections, limit) {
      let html = '';
      collections.slice(0, limit).forEach(c => {
        const url = `/pages/partners?handle=${encodeURIComponent(c.partnerSlug)}&tab=collection&slug=${encodeURIComponent(c.handle)}`;
        const thumb = c.image
          ? `<img class="fs-sugg__thumb" src="${escHtml(c.image)}" alt="" loading="lazy">`
          : `<div class="fs-sugg__thumb fs-sugg__thumb--empty"></div>`;
        html += `<a class="fs-sugg__item" href="${escHtml(url)}" role="option">${thumb}<div class="fs-sugg__body"><span class="fs-sugg__title">${escHtml(c.title)}</span><span class="fs-sugg__sub">${escHtml(c.partnerName)}</span></div></a>`;
      });
      return html;
    }

    function renderProductSugg(products) {
      if (!products.length) { hideSugg(); return; }
      applySugg(productItems(products, 6));
    }

    function renderVendorSugg(partners) {
      if (!partners.length) { hideSugg(); return; }
      applySugg(partnerItems(partners, 6));
    }

    function renderCollectionSugg(collections) {
      if (!collections.length) { hideSugg(); return; }
      applySugg(collectionItems(collections, 6));
    }

    function productSearchUrl(query, limit) {
      const q = query + ' -tag:_fp-base-fabric';
      return `/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=${limit}&resources[options][unavailable_products]=hide`;
    }

    async function cachedSearchFetch(url) {
      return cachedFetch(url, 5 * MIN, sessionStorage);
    }

    async function renderAllSugg(query) {
      const [pRes, dRes, cRes] = await Promise.allSettled([
        fetch(productSearchUrl(query, 3)),
        cachedSearchFetch(`/apps/fabric-shop/api/partner-search?q=${encodeURIComponent(query)}`),
        cachedSearchFetch(`/apps/fabric-shop/api/collection-search?q=${encodeURIComponent(query)}`),
      ]);

      let products = [], partners = [], collections = [];
      if (pRes.status === 'fulfilled' && pRes.value.ok) {
        const d = await pRes.value.json();
        products = d.resources?.results?.products || [];
      }
      if (dRes.status === 'fulfilled') partners = dRes.value?.results || [];
      if (cRes.status === 'fulfilled') collections = cRes.value?.results || [];

      if (!products.length && !partners.length && !collections.length) { hideSugg(); return; }

      let html = '';
      if (products.length) {
        html += `<div class="fs-sugg__section"><div class="fs-sugg__section-head">Designs</div>${productItems(products, 2)}</div>`;
      }
      if (partners.length) {
        html += `<div class="fs-sugg__section"><div class="fs-sugg__section-head">Designers</div>${partnerItems(partners, 2)}</div>`;
      }
      if (collections.length) {
        html += `<div class="fs-sugg__section"><div class="fs-sugg__section-head">Collections</div>${collectionItems(collections, 2)}</div>`;
      }
      applySugg(html);
    }

    async function loadSugg(query) {
      if (!query || query.length < 2) { hideSugg(); return; }
      try {
        if (activeScope === 'all') {
          await renderAllSugg(query);
        } else if (activeScope === 'designs') {
          const r = await fetch(productSearchUrl(query, 6));
          if (!r.ok) return;
          const { resources } = await r.json();
          renderProductSugg(resources?.results?.products || []);
        } else if (activeScope === 'collections') {
          const data = await cachedSearchFetch(`/apps/fabric-shop/api/collection-search?q=${encodeURIComponent(query)}`);
          renderCollectionSugg(data?.results || []);
        } else {
          const data = await cachedSearchFetch(`/apps/fabric-shop/api/partner-search?q=${encodeURIComponent(query)}`);
          renderVendorSugg(data?.results || []);
        }
      } catch (_) {}
    }

    if (qInput) {
      qInput.addEventListener('input', () => {
        clearTimeout(suggTimer);
        const q = qInput.value.trim();
        if (!q) { hideSugg(); return; }
        suggTimer = setTimeout(() => loadSugg(q), 280);
      });

      qInput.addEventListener('keydown', e => {
        if (!suggEl || suggEl.hidden) return;
        if (e.key === 'ArrowDown')       { e.preventDefault(); moveFocus(1); }
        else if (e.key === 'ArrowUp')    { e.preventDefault(); moveFocus(-1); }
        else if (e.key === 'Enter' && focusIdx >= 0) { e.preventDefault(); suggItems[focusIdx]?.click(); }
        else if (e.key === 'Escape')     { hideSugg(); }
      });

      qInput.addEventListener('blur', () => setTimeout(hideSugg, 200));
    }
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
  /* ── Browse menu nested item accordion ─────────────────────────────── */
  chrome.querySelectorAll('.fs-mega-list__link--btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.fs-mega-list__item--parent');
      const isOpen = item.classList.contains('is-open');
      item.classList.toggle('is-open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
      const sub = item.querySelector('.fs-mega-sub');
      if (sub) sub.hidden = isOpen;
    });
  });

  /* ── Cache helpers ──────────────────────────────────────────────────── */
  const HOUR = 3600000;
  const MIN  = 60000;

  function cacheGet(store, key) {
    try {
      const raw = store.getItem(key);
      if (!raw) return null;
      const { data, expires } = JSON.parse(raw);
      if (Date.now() > expires) { store.removeItem(key); return null; }
      return data;
    } catch (_) { return null; }
  }

  function cacheSet(store, key, data, ttlMs) {
    try { store.setItem(key, JSON.stringify({ data, expires: Date.now() + ttlMs })); } catch (_) {}
  }

  async function cachedFetch(url, ttlMs, store) {
    store = store || localStorage;
    const key = 'fs_cache:' + url;
    const hit = cacheGet(store, key);
    if (hit !== null) return hit;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    cacheSet(store, key, data, ttlMs);
    return data;
  }

  /* shared promise so both featured sections use one network call */
  let _slugMapPromise = null;
  function getSlugMap() {
    if (!_slugMapPromise) {
      _slugMapPromise = cachedFetch('/apps/fabric-shop/api/partner-vendor-slugs', HOUR)
        .catch(() => ({}));
    }
    return _slugMapPromise;
  }

  async function getPartnerProfile(slug) {
    const url = `/apps/fabric-shop/api/partner-profile?handle=${encodeURIComponent(slug)}`;
    return cachedFetch(url, HOUR);
  }

  /* ── Featured product designer names ───────────────────────────────── */
  (async function loadFeaturedstudioNames() {
    const designerEls = Array.from(
      chrome.querySelectorAll('.fs-mega-feat-item__designer[data-vendor]')
    );
    if (!designerEls.length) return;

    const vendors = [...new Set(designerEls.map(el => el.dataset.vendor).filter(Boolean))];
    if (!vendors.length) return;

    try {
      const slugMap = await getSlugMap();

      await Promise.allSettled(vendors.map(async vendor => {
        const slug = slugMap[vendor];
        if (!slug) return;
        const profile = await getPartnerProfile(slug);
        if (!profile.fullName) return;
        designerEls.forEach(el => {
          if (el.dataset.vendor === vendor) el.textContent = profile.fullName;
        });
      }));
    } catch (_) {}
  })();

  /* ── Featured partner cards ─────────────────────────────────────────── */
  (async function loadFeaturedPartners() {
    const partnerLinks = Array.from(
      chrome.querySelectorAll('.fs-mega-feat-item--partner[data-partner-handle]')
    );
    if (!partnerLinks.length) return;

    const handles = [...new Set(partnerLinks.map(el => el.dataset.partnerHandle).filter(Boolean))];

    await Promise.allSettled(handles.map(async handle => {
      try {
        const profile = await getPartnerProfile(handle);

        partnerLinks.forEach(el => {
          if (el.dataset.partnerHandle !== handle) return;

          const thumb    = el.querySelector('.fs-mega-feat-item__thumb--avatar');
          const initials = el.querySelector('.fs-mega-feat-item__avatar-initials');
          const titleEl  = el.querySelector('.fs-mega-feat-item__title');
          const studioEl = el.querySelector('.fs-mega-feat-item__studio');
          const metaEl   = el.querySelector('.fs-mega-feat-item__meta');

          if (profile.profileImageUrl && thumb) {
            const img = document.createElement('img');
            img.className = 'fs-mega-feat-item__img';
            img.src = profile.profileImageUrl;
            img.alt = profile.studioName || profile.fullName || '';
            img.loading = 'lazy';
            if (initials) initials.replaceWith(img);
          } else if (initials && profile.fullName) {
            initials.textContent = profile.fullName.slice(0, 1).toUpperCase();
          }

          if (titleEl) titleEl.textContent = profile.studioName || profile.fullName || handle;
          if (studioEl) studioEl.textContent = profile.fullName || '';
          if (metaEl && profile.designCount != null) {
            metaEl.textContent = profile.designCount + ' design' + (profile.designCount !== 1 ? 's' : '');
          }
        });
      } catch (_) {}
    }));
  })();

  /* ── Featured collection designer names ─────────────────────────────── */
  (async function loadCollectionstudioNames() {
    const colEls = Array.from(
      chrome.querySelectorAll('.fs-mega-feat-item__studio[data-col-vendor]')
    );
    if (!colEls.length) return;

    const vendors = [...new Set(colEls.map(el => el.dataset.colVendor).filter(Boolean))];
    if (!vendors.length) return;

    try {
      const slugMap = await getSlugMap();

      await Promise.allSettled(vendors.map(async vendor => {
        const slug = slugMap[vendor];
        if (!slug) return;
        const profile = await getPartnerProfile(slug);
        if (!profile.fullName) return;
        colEls.forEach(el => {
          if (el.dataset.colVendor === vendor) {
            el.textContent = vendor + ' · ' + profile.fullName;
            const anchor = el.closest('a.fs-mega-feat-item');
            if (anchor && anchor.dataset.colHandle) {
              anchor.href = `/pages/partners?handle=${encodeURIComponent(slug)}&tab=collection&slug=${encodeURIComponent(anchor.dataset.colHandle)}`;
            }
          }
        });
      }));
    } catch (_) {}
  })();

})();
