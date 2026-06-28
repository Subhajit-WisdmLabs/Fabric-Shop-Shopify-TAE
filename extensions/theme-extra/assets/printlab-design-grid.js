(function () {
  'use strict';

  var STORAGE_KEY = 'fp_wishlist';
  var LIKES_KEY   = 'fp_likes';

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getFavs() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function getLikes() {
    try { return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function parseProductId(gid) {
    if (!gid) return '';
    var s = String(gid);
    var idx = s.lastIndexOf('/');
    return idx >= 0 ? s.slice(idx + 1) : s;
  }

  function updateWishlistBadge(count) {
    var badge = document.getElementById('fp-wl-badge');
    if (badge) {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? '' : 'none';
    }
    if (typeof window.fsUpdateWishlistCount === 'function') {
      window.fsUpdateWishlistCount(count);
    }
  }

  // ── Response cache (30-min TTL, keyed by request params) ───

  var CACHE_TTL    = 30 * 60 * 1000;
  var CACHE_PREFIX = 'pdg_c_';

  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (Date.now() - entry.ts > CACHE_TTL) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return entry.data;
    } catch (e) { return null; }
  }

  function cacheSet(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  var SCALE_LABELS = {
    Ditsy:     'Ditsy < 8 cm',
    Small:     'Small < 15 cm',
    Medium:    'Medium < 30 cm',
    Large:     'Large < 60 cm',
    Oversized: 'Oversized ≥ 60 cm',
  };

  // ── Boot ────────────────────────────────────────────────────

  document.querySelectorAll('[data-pdg-block]').forEach(function (root) {
    initBlock(root);
  });

  function initBlock(root) {
    var lwData      = document.getElementById('fp-lw-data');
    var isLoggedIn  = !!(lwData && lwData.dataset.customerId);
    var loginUrl    = (lwData && lwData.dataset.loginUrl) || '/account/login';

    var proxyBase       = root.dataset.proxyBase || '/apps/fabric-shop/api';
    var collection      = root.dataset.collection || '';
    var perLoad         = parseInt(root.dataset.perLoad || '24', 10);
    var profileUrl      = root.dataset.profileUrl || '/pages/partners';
    var blockId         = root.dataset.pdgBlock;

    function getEditorialEvery() {
      return parseInt(root.dataset.editorialInterval || '8', 10);
    }

    var sidebar         = root.querySelector('.pdg-sidebar');
    var backdrop        = root.querySelector('.pdg-sidebar-backdrop');
    var filterGroups    = root.querySelector('.pdg-filter-groups');
    var grid            = root.querySelector('.pdg-grid');
    var countEl         = root.querySelector('.pdg-count');
    var sortEl          = root.querySelector('.pdg-sort');
    var loadMoreWrap    = root.querySelector('.pdg-load-more');
    var loadBtn         = root.querySelector('.pdg-load-btn');
    var loadCountEl     = root.querySelector('.pdg-load-count');
    var chipsRow        = root.querySelector('.pdg-active-chips');
    var clearAllBtn     = root.querySelector('.pdg-clear-all');
    var clearCount      = root.querySelector('.pdg-clear-count');
    var openBtn         = root.querySelector('.pdg-filter-open-btn');
    var closeBtn        = root.querySelector('.pdg-sidebar-close');
    var mainEl          = root.querySelector('.pdg-main');

    // Keep sidebar below the fixed nav — update whenever the chrome resizes
    // (the utility bar collapses on scroll, changing the chrome height).
    (function () {
      var chrome = document.querySelector('.fs-chrome');
      function applyNavOffset() {
        var h = chrome ? chrome.getBoundingClientRect().height : 72;
        root.style.setProperty('--pdg-nav-h', (h + 16) + 'px');
      }
      applyNavOffset();
      if (chrome && window.ResizeObserver) {
        new ResizeObserver(applyNavOffset).observe(chrome);
      }
    }());

    // Read topic and theme from URL on load
    var _urlParams = new URLSearchParams(window.location.search);

    var state = {
      filters: {
        topic: _urlParams.get('topic') || '',
        themes: (_urlParams.get('theme') || '').split(',').filter(Boolean),
        suits_use: [], occasions: [],
        scale: '', subject: '', palette: '', studio: '',
        q: _urlParams.get('q') || ''
      },
      sort: 'newest',
      cursor: null,
      total: 0,
      showing: 0,
      loading: false,
      editorialSlots: [],
      subjectSuggestions: [],
    };

    // ── Sidebar open/close (mobile) ──────────────────────────

    if (openBtn) {
      openBtn.addEventListener('click', function () {
        sidebar.classList.add('pdg-sidebar--open');
        backdrop.classList.add('pdg-sidebar-backdrop--visible');
      });
    }

    function closeSidebar() {
      sidebar.classList.remove('pdg-sidebar--open');
      backdrop.classList.remove('pdg-sidebar-backdrop--visible');
    }

    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // ── Sort ────────────────────────────────────────────────

    if (sortEl) {
      sortEl.addEventListener('change', function () {
        state.sort = sortEl.value;
        resetAndFetch();
      });
    }

    // ── Clear all ───────────────────────────────────────────

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function () {
        state.filters = { topic: '', themes: [], suits_use: [], occasions: [], scale: '', subject: '', palette: '', studio: '', q: '' };
        syncTopicUrl();
        syncThemeUrl();
        syncQUrl();
        syncFilterUI();
        updateChips();
        resetAndFetch();
      });
    }

    // ── Load more ───────────────────────────────────────────

    if (loadBtn) {
      loadBtn.addEventListener('click', function () {
        if (!state.loading) fetchProducts(true);
      });
    }

    // ── Initial skeleton while JS fetches ───────────────────

    (function renderSkeletons() {
      var skFrag = document.createDocumentFragment();
      for (var s = 0; s < perLoad; s++) {
        var sk = document.createElement('div');
        sk.className = 'pdg-card pdg-card--skeleton';
        sk.setAttribute('aria-hidden', 'true');
        sk.innerHTML =
          '<div class="pdg-card-img-wrap"></div>' +
          '<div class="pdg-card-info">' +
            '<div class="pdg-skel" style="margin-top:8px;"></div>' +
            '<div class="pdg-skel pdg-skel--sm"></div>' +
          '</div>';
        skFrag.appendChild(sk);
      }
      grid.appendChild(skFrag);

      if (filterGroups) {
        var fgFrag = document.createDocumentFragment();
        for (var f = 0; f < 4; f++) {
          var fg = document.createElement('div');
          fg.className = 'pdg-filter-group';
          fg.setAttribute('aria-hidden', 'true');
          fg.innerHTML =
            '<div class="pdg-skel" style="width:60%;height:13px;margin:0 0 12px;"></div>' +
            '<div class="pdg-skel pdg-skel--sm" style="margin:6px 0;"></div>' +
            '<div class="pdg-skel pdg-skel--sm" style="margin:6px 0;"></div>' +
            '<div class="pdg-skel pdg-skel--sm" style="margin:6px 0;"></div>';
          fgFrag.appendChild(fg);
        }
        filterGroups.appendChild(fgFrag);
      }
    }());

    // ── Initial parallel fetch ───────────────────────────────

    // Render any chips pre-set from URL params before first fetch
    updateChips();

    Promise.all([
      fetchFilterMeta(),
      fetchProducts(false),
    ]);

    // Arrived via search (?q=…)? The grid sits below the fold — scroll it
    // into view so the user sees their results actually loaded.
    if (state.filters.q) {
      requestAnimationFrame(function () {
        var chrome  = document.querySelector('.fs-chrome');
        var offset  = (chrome ? chrome.getBoundingClientRect().height : 0) + 12;
        var top     = root.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      });
    }

    // ── Filter metadata ──────────────────────────────────────

    function fetchFilterMeta() {
      var metaKey = 'meta_' + proxyBase;
      var cached = cacheGet(metaKey);
      if (cached) {
        state.subjectSuggestions = cached.subjectSuggestions || [];
        renderFilterSidebar(cached.groups || [], cached.subjectSuggestions || [], cached.palette || [], cached.studios || []);
        return Promise.resolve();
      }
      return fetch(proxyBase + '/tag-subjects-public')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          cacheSet(metaKey, data);
          state.subjectSuggestions = data.subjectSuggestions || [];
          renderFilterSidebar(data.groups || [], data.subjectSuggestions || [], data.palette || [], data.studios || []);
        })
        .catch(function () {});
    }

    // ── Products fetch ───────────────────────────────────────

    function buildParams(append) {
      var p = new URLSearchParams();
      if (collection) p.set('collection', collection);
      p.set('sort', state.sort);
      p.set('limit', String(perLoad));
      if (append && state.cursor) p.set('cursor', state.cursor);
      if (state.filters.topic)     p.set('topic', state.filters.topic);
      if (state.filters.themes.length)    p.set('themes', state.filters.themes.join(','));
      if (state.filters.suits_use.length) p.set('suits_use', state.filters.suits_use.join(','));
      if (state.filters.occasions.length) p.set('occasions', state.filters.occasions.join(','));
      if (state.filters.scale)     p.set('scale', state.filters.scale);
      if (state.filters.subject)   p.set('subject', state.filters.subject);
      if (state.filters.palette)   p.set('palette', state.filters.palette);
      if (state.filters.studio)    p.set('studio', state.filters.studio);
      if (state.filters.q)         p.set('q', state.filters.q);
      return p.toString();
    }

    function fetchProducts(append) {
      if (state.loading) return Promise.resolve();
      state.loading = true;
      if (loadBtn) loadBtn.disabled = true;

      var params  = buildParams(append);
      var cached  = cacheGet('prod_' + params);
      var request = cached
        ? Promise.resolve(cached)
        : fetch(proxyBase + '/catalogue-products?' + params)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { if (data) cacheSet('prod_' + params, data); return data; });

      return request
        .then(function (data) {
          state.loading = false;
          if (!append && mainEl) mainEl.classList.remove('pdg-main--loading');
          if (!data) return;

          state.cursor   = data.pageInfo && data.pageInfo.endCursor;
          state.total    = data.total || 0;
          state.showing  = append
            ? state.showing + (data.products || []).length
            : (data.products || []).length;

          renderGrid(data.products || [], append);

          if (countEl) {
            countEl.textContent = 'Showing ' + state.showing + ' of ' + state.total + ' designs'
              + (state.filters.q ? ' for “' + state.filters.q + '”' : '');
          }

          var hasNext = data.pageInfo && data.pageInfo.hasNextPage;
          if (loadMoreWrap) loadMoreWrap.hidden = !hasNext;
          if (loadBtn)      loadBtn.disabled = false;
          if (loadCountEl)  loadCountEl.textContent = hasNext
            ? (state.total - state.showing) + ' more to load'
            : '';
        })
        .catch(function () {
          state.loading = false;
          if (!append && mainEl) mainEl.classList.remove('pdg-main--loading');
          if (loadBtn) loadBtn.disabled = false;
        });
    }

    function resetAndFetch() {
      state.cursor  = null;
      state.showing = 0;
      if (mainEl) mainEl.classList.add('pdg-main--loading');
      fetchProducts(false);
    }

    // ── Grid rendering ───────────────────────────────────────

    function renderGrid(products, append) {
      if (!append) grid.innerHTML = '';

      if (!products.length && !append) {
        grid.innerHTML = '<div class="pdg-no-results">' +
          (state.filters.q ? 'No designs found for “' + esc(state.filters.q) + '”.' : 'No designs match your filters.') +
          '</div>';
        return;
      }

      var favs  = getFavs();
      var likes = getLikes();
      var frag = document.createDocumentFragment();
      var positionInPage = append ? state.showing - products.length : 0;
      var showEd = root.dataset.showEditorial !== 'false' && state.editorialSlots.length > 0;
      var edInserted = false;

      products.forEach(function (product, i) {
        var position = positionInPage + i;

        // 1st editorial after the 6th design; subsequent ones every N tiles after that
        if (showEd) {
          var edEvery = getEditorialEvery();
          var isFirst      = position === 6;
          var isSubsequent = position > 6 && (position - 6) % edEvery === 0;
          if (isFirst || isSubsequent) {
            var slotIdx = Math.floor((position - 6) / edEvery) % state.editorialSlots.length;
            var edEl = buildEditorialCard(state.editorialSlots[slotIdx]);
            if (edEl) { frag.appendChild(edEl); edInserted = true; }
          }
        }

        frag.appendChild(buildCard(product, favs, likes));
      });

      // Fewer than 6 designs: append 1st editorial at the end
      if (showEd && !edInserted && !append && products.length > 0) {
        var edEl = buildEditorialCard(state.editorialSlots[0]);
        if (edEl) frag.appendChild(edEl);
      }

      grid.appendChild(frag);
    }

    function buildCard(p, favs, likes) {
      var productId = parseProductId(p.id);
      var isFav     = favs.indexOf(productId) !== -1;
      var likeData  = likes[productId];
      var isLiked   = likeData ? !!likeData.liked : false;
      // Base count is the authoritative server total for this page; localStorage
      // only carries THIS user's liked-state + any optimistic value newer than the
      // server snapshot (covers the cached-response window).
      var serverCount = (typeof p.likeCount === 'number') ? p.likeCount : 0;
      var likeCount = (likeData && typeof likeData.count === 'number')
        ? Math.max(serverCount, likeData.count)
        : serverCount;
      var el = document.createElement('a');
      el.href = '/products/' + esc(p.handle);
      el.className = 'pdg-card';

      var vendorLink = p.vendorSlug
        ? profileUrl + '?handle=' + encodeURIComponent(p.vendorSlug)
        : '#';

      var badgesHtml = '';
      if (p.isNew)        badgesHtml += '<span class="pdg-badge pdg-badge--new">New</span>';
      if (p.isBestseller) badgesHtml += '<span class="pdg-badge pdg-badge--bestseller">Bestseller</span>';

      // Colour options — replaces the old scale/repeat meta line. Only shown
      // when there is more than one colourway (a single colour is just the
      // card image itself). Opens a modal; each swatch deep-links to the PDP
      // with that colour preselected (?colour=<value>).
      var metaHtml = '';
      var colours = Array.isArray(p.colours) ? p.colours : [];
      if (colours.length > 1) {
        var dotsHtml = colours.slice(0, 3).map(function (c) {
          return '<span class="pdg-colours-dot"' +
            (c.image ? ' style="background-image:url(\'' + esc(c.image) + '\')"' : '') + '></span>';
        }).join('');
        metaHtml =
          '<div class="pdg-card-colours">' +
            '<button class="pdg-colours-toggle" type="button">' +
              '<span class="pdg-colours-dots">' + dotsHtml + '</span>' +
              '<span class="pdg-colours-count">' + colours.length + ' Colors</span>' +
              '<svg class="pdg-colours-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
            '</button>' +
          '</div>';
      }

      el.innerHTML =
        '<div class="pdg-card-img-wrap">' +
          (p.image
            ? '<img src="' + esc(p.image) + '" alt="' + esc(p.imageAlt || p.title) + '" loading="lazy">'
            : '') +
          badgesHtml +
          '<button class="pdg-like-btn' + (isLiked ? ' pdg-like-btn--active' : '') +
            '" data-handle="' + esc(p.handle) + '" aria-label="Like this design" type="button">' +
            '<svg viewBox="0 0 24 24" fill="' + (isLiked ? 'currentColor' : 'none') +
              '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"></path>' +
              '<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>' +
            '</svg>' +
            '<span class="pdg-like-count">' + likeCount + '</span>' +
          '</button>' +
          '<div class="pdg-card-hover-bar">' +
            '<span class="pdg-card-view-btn">View Product</span>' +
            '<span class="pdg-hover-bar-sep"></span>' +
            '<button class="pdg-fav-btn' + (isFav ? ' pdg-fav-btn--active' : '') +
              '" data-handle="' + esc(p.handle) + '" aria-label="Save to favourites" type="button">' +
              '<svg viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') +
                '" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="pdg-card-info">' +
          '<h2 class="pdg-card-title">' + esc(p.title) + '</h2>' +
          '<p class="pdg-card-vendor">by <a href="' + esc(vendorLink) + '" class="pdg-vendor-link" onclick="event.stopPropagation()"><strong>' + esc(p.vendor) + '</strong></a></p>' +
          metaHtml +
        '</div>';

      // Bind like button
      var likeBtn = el.querySelector('.pdg-like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!isLoggedIn) {
            window.location.href = loginUrl + '?return_url=' + encodeURIComponent(window.location.pathname + window.location.search);
            return;
          }
          var wasLiked = likeBtn.classList.contains('pdg-like-btn--active');
          var icon = likeBtn.querySelector('svg');
          var cntEl = likeBtn.querySelector('.pdg-like-count');
          var prevCount = parseInt((cntEl && cntEl.textContent) || '0', 10);
          var newCount = wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1;
          // Optimistic update + save to localStorage immediately
          likeBtn.classList.toggle('pdg-like-btn--active', !wasLiked);
          if (icon) icon.setAttribute('fill', !wasLiked ? 'currentColor' : 'none');
          if (cntEl) cntEl.textContent = String(newCount);
          var lCache = getLikes();
          lCache[productId] = { count: newCount, liked: !wasLiked, ts: Date.now() };
          try { localStorage.setItem(LIKES_KEY, JSON.stringify(lCache)); } catch (e) {}
          // Send to API
          fetch(proxyBase + '/like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: productId })
          }).then(function (r) { return r.json(); }).then(function (result) {
            if (result.liked !== undefined) {
              likeBtn.classList.toggle('pdg-like-btn--active', result.liked);
              if (icon) icon.setAttribute('fill', result.liked ? 'currentColor' : 'none');
              if (cntEl) cntEl.textContent = String(result.count || 0);
              var lCache2 = getLikes();
              lCache2[productId] = { count: result.count, liked: result.liked, ts: Date.now() };
              try { localStorage.setItem(LIKES_KEY, JSON.stringify(lCache2)); } catch (e) {}
            }
          }).catch(function () { /* keep localStorage state */ });
        });
      }

      // Bind fav button
      var favBtn = el.querySelector('.pdg-fav-btn');
      if (favBtn) {
        favBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!isLoggedIn) {
            window.location.href = loginUrl + '?return_url=' + encodeURIComponent(window.location.pathname + window.location.search);
            return;
          }
          var wasAdded = favBtn.classList.contains('pdg-fav-btn--active');
          var action = wasAdded ? 'remove' : 'add';
          var icon = favBtn.querySelector('svg');
          // Optimistic update
          favBtn.classList.toggle('pdg-fav-btn--active', !wasAdded);
          if (icon) icon.setAttribute('fill', !wasAdded ? 'currentColor' : 'none');
          // API call
          fetch(proxyBase + '/wishlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, productId: productId })
          }).then(function (r) { return r.json(); }).then(function (result) {
            if (result.error) {
              favBtn.classList.toggle('pdg-fav-btn--active', wasAdded);
              if (icon) icon.setAttribute('fill', wasAdded ? 'currentColor' : 'none');
              return;
            }
            updateWishlistBadge(result.count);
            var wlCache = getFavs();
            if (action === 'add' && wlCache.indexOf(productId) === -1) wlCache.push(productId);
            if (action === 'remove') wlCache = wlCache.filter(function (id) { return id !== productId; });
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(wlCache)); } catch (e) {}
          }).catch(function () {
            // Revert on network error
            favBtn.classList.toggle('pdg-fav-btn--active', wasAdded);
            if (icon) icon.setAttribute('fill', wasAdded ? 'currentColor' : 'none');
          });
        });
      }

      // Bind colours toggle → open anchored popover (overlays, no reflow)
      var coloursToggle = el.querySelector('.pdg-colours-toggle');
      if (coloursToggle) {
        coloursToggle.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openColoursPopover(p, colours, coloursToggle);
        });
      }

      return el;
    }

    // Colour picker popover — appended to <body> and fixed-positioned under the
    // toggle so it floats over the cards below (the card has overflow:hidden, so
    // an in-card popover would be clipped) and never reflows the grid. Swatches
    // are anchors that open the PDP with the colour preselected.
    function closeColoursPopover() {
      var pop = document.querySelector('.pdg-colours-pop');
      if (pop) {
        if (typeof pop.cleanup === 'function') pop.cleanup();
        if (pop.parentNode) pop.parentNode.removeChild(pop);
      }
    }

    function openColoursPopover(p, colours, toggleEl) {
      // Re-clicking the open toggle closes it.
      var existing = document.querySelector('.pdg-colours-pop');
      var wasForThis = existing && existing.owner === toggleEl;
      closeColoursPopover();
      if (wasForThis) return;

      var swatchesHtml = colours.map(function (c) {
        return '<a class="pdg-colour-swatch" href="/products/' + esc(p.handle) +
          '?colour=' + encodeURIComponent(c.value) + '"' +
          ' title="' + esc(c.name || '') + '"' +
          (c.image ? ' style="background-image:url(\'' + esc(c.image) + '\')"' : '') + '></a>';
      }).join('');

      var pop = document.createElement('div');
      pop.className = 'pdg-colours-pop';
      pop.innerHTML = '<div class="pdg-colours-pop-grid">' + swatchesHtml + '</div>';
      pop.owner = toggleEl;
      document.body.appendChild(pop);
      toggleEl.classList.add('pdg-colours-toggle--open');

      // Match the card width (capped) and align to the card so the popover and
      // its swatches always fit within the card — important on narrow mobile
      // cards. Clamp to the viewport.
      var r = toggleEl.getBoundingClientRect();
      var card = toggleEl.closest('.pdg-card');
      var cardRect = card ? card.getBoundingClientRect() : r;
      var margin = 8;
      var width = Math.min(280, cardRect.width);
      pop.style.width = width + 'px';
      var left = cardRect.left;
      if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
      if (left < margin) left = margin;
      var top = r.bottom + 6;
      var maxH = window.innerHeight - top - margin;
      if (maxH < pop.offsetHeight) pop.style.maxHeight = Math.max(140, maxH) + 'px';
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';

      function onDocDown(e) {
        if (!pop.contains(e.target) && !toggleEl.contains(e.target)) closeColoursPopover();
      }
      function onKey(e) { if (e.key === 'Escape') closeColoursPopover(); }
      pop.cleanup = function () {
        document.removeEventListener('mousedown', onDocDown, true);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', closeColoursPopover, true);
        window.removeEventListener('resize', closeColoursPopover);
        toggleEl.classList.remove('pdg-colours-toggle--open');
      };
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onKey);
      window.addEventListener('scroll', closeColoursPopover, true);
      window.addEventListener('resize', closeColoursPopover);
    }

    function buildEditorialCard(slot) {
      if (!slot || !slot.title) return null;
      var el = document.createElement('a');
      el.href = slot.ctaUrl || '#';
      el.className = 'pdg-editorial';
      el.innerHTML =
        '<div class="pdg-editorial-body-wrap">' +
          (slot.eyebrow ? '<p class="pdg-editorial-eyebrow">' + esc(slot.eyebrow) + '</p>' : '') +
          '<p class="pdg-editorial-title">' + esc(slot.title) + '</p>' +
          (slot.body ? '<p class="pdg-editorial-body">' + esc(slot.body) + '</p>' : '') +
        '</div>' +
        (slot.ctaText ? '<span class="pdg-editorial-cta">' + esc(slot.ctaText) + ' →</span>' : '');
      return el;
    }

    // ── Filter sidebar rendering ─────────────────────────────

    function renderFilterSidebar(groups, suggestions, palette, studios) {
      if (!filterGroups) return;
      filterGroups.innerHTML = '';

      groups.forEach(function (group) {
        var isEnabled = root.dataset['show' + toCamel(group.role)] !== 'false';
        if (!isEnabled) return;

        if (group.type === 'chips') {
          filterGroups.appendChild(buildChipsGroup(group));
        } else {
          filterGroups.appendChild(buildCheckGroup(group));
        }
      });

      // Subject text search
      if (root.dataset.showSubject !== 'false') {
        filterGroups.appendChild(buildSubjectGroup(suggestions));
      }

      // Palette swatches
      if (root.dataset.showPalette !== 'false' && palette.length) {
        filterGroups.appendChild(buildPaletteGroup(palette));
      }

      // Studio: pre-loaded list with inline search
      if (root.dataset.showStudio !== 'false') {
        filterGroups.appendChild(buildStudioGroup(studios || []));
      }
    }

    function toCamel(str) {
      return str.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
    }

    function buildGroupShell(label) {
      var wrap = document.createElement('div');
      wrap.className = 'pdg-filter-group pdg-filter-group--collapsed';

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'pdg-filter-toggle';
      toggle.innerHTML =
        '<span>' + esc(label) + '</span>' +
        '<svg class="pdg-filter-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';

      toggle.addEventListener('click', function () {
        wrap.classList.toggle('pdg-filter-group--collapsed');
      });

      var body = document.createElement('div');
      body.className = 'pdg-filter-body';

      wrap.appendChild(toggle);
      wrap.appendChild(body);
      return { wrap: wrap, body: body };
    }

    function buildCheckGroup(group) {
      var shell = buildGroupShell(group.label);
      var filterKey = group.role === 'theme' ? 'themes'
        : group.role === 'occasion' ? 'occasions'
        : group.role;
      var isMulti = group.type === 'checkbox';
      var limit = group.limit || 99;

      var opts = (group.options || []).slice().sort(function (a, b) { return a.localeCompare(b); });
      var showAll = false;
      var SHOW_INITIAL = 6;

      function render() {
        shell.body.innerHTML = '';
        var visible = showAll ? opts : opts.slice(0, SHOW_INITIAL);

        visible.forEach(function (opt) {
          var label = document.createElement('label');
          label.className = 'pdg-filter-option';

          var input = document.createElement('input');
          input.type = isMulti ? 'checkbox' : 'radio';
          input.name = 'pdg-filter-' + group.role + '-' + blockId;
          input.value = opt;

          var currentVals = isMulti ? state.filters[filterKey] : [state.filters[filterKey]];
          input.checked = isMulti
            ? currentVals.indexOf(opt) !== -1
            : state.filters[filterKey] === opt;

          // Disable when limit reached and this option is not already selected
          if (isMulti && currentVals.length >= limit && currentVals.indexOf(opt) === -1) {
            label.classList.add('pdg-filter-option--disabled');
          }

          input.addEventListener('change', function () {
            if (isMulti) {
              var vals = state.filters[filterKey].slice();
              if (input.checked) {
                if (vals.length < limit) vals.push(opt);
                else input.checked = false;
              } else {
                vals = vals.filter(function (v) { return v !== opt; });
              }
              state.filters[filterKey] = vals;
            } else {
              state.filters[filterKey] = input.checked ? opt : '';
            }
            render();
            updateChips();
            resetAndFetch();
          });

          label.appendChild(input);
          label.appendChild(document.createTextNode(' ' + opt));
          shell.body.appendChild(label);
        });

        if (opts.length > SHOW_INITIAL) {
          var moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'pdg-show-more';
          moreBtn.textContent = showAll ? 'Show fewer' : 'Show ' + (opts.length - SHOW_INITIAL) + ' more';
          moreBtn.addEventListener('click', function () {
            showAll = !showAll;
            render();
          });
          shell.body.appendChild(moreBtn);
        }
      }

      render();
      return shell.wrap;
    }

    function buildChipsGroup(group) {
      var shell = buildGroupShell(group.label);
      var opts = group.options || [];

      opts.forEach(function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdg-chip' + (state.filters.scale === opt ? ' pdg-chip--active' : '');
        btn.setAttribute('data-value', opt);
        btn.textContent = SCALE_LABELS[opt] || opt;
        btn.addEventListener('click', function () {
          state.filters.scale = state.filters.scale === opt ? '' : opt;
          shell.body.querySelectorAll('.pdg-chip').forEach(function (c) {
            c.classList.toggle('pdg-chip--active', c.dataset.value === state.filters.scale);
          });
          updateChips();
          resetAndFetch();
        });
        shell.body.appendChild(btn);
      });

      var row = document.createElement('div');
      row.className = 'pdg-chips-row';
      while (shell.body.firstChild) row.appendChild(shell.body.firstChild);
      shell.body.appendChild(row);

      return shell.wrap;
    }

    function buildSubjectGroup(suggestions) {
      var shell = buildGroupShell('Subject');

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'pdg-subject-search';
      input.placeholder = 'e.g. wildflowers…';
      input.value = state.filters.subject;

      var timer;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () {
          state.filters.subject = input.value.trim();
          updateChips();
          resetAndFetch();
        }, 350);
      });

      shell.body.appendChild(input);

      // Autocomplete suggestions as chips
      if (suggestions.length) {
        var suggestRow = document.createElement('div');
        suggestRow.className = 'pdg-chips-row';
        suggestions.slice(0, 8).forEach(function (s) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'pdg-chip';
          btn.textContent = s.value;
          btn.addEventListener('click', function () {
            state.filters.subject = s.value;
            input.value = s.value;
            suggestRow.querySelectorAll('.pdg-chip').forEach(function (c) {
              c.classList.toggle('pdg-chip--active', c.textContent === s.value);
            });
            updateChips();
            resetAndFetch();
          });
          suggestRow.appendChild(btn);
        });
        shell.body.appendChild(suggestRow);
      }

      return shell.wrap;
    }

    function buildPaletteGroup(palette) {
      var shell = buildGroupShell('Palette');
      var grid = document.createElement('div');
      grid.className = 'pdg-palette-grid';

      palette.forEach(function (swatch) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdg-swatch' + (state.filters.palette === swatch.slug ? ' pdg-swatch--active' : '');
        btn.setAttribute('data-slug', swatch.slug);
        btn.setAttribute('title', swatch.label);
        btn.style.background = swatch.hex;
        btn.addEventListener('click', function () {
          state.filters.palette = state.filters.palette === swatch.slug ? '' : swatch.slug;
          grid.querySelectorAll('.pdg-swatch').forEach(function (s) {
            s.classList.toggle('pdg-swatch--active', s.dataset.slug === state.filters.palette);
          });
          updateChips();
          resetAndFetch();
        });
        grid.appendChild(btn);
      });

      shell.body.appendChild(grid);
      return shell.wrap;
    }

    function buildStudioGroup(allStudios) {
      var shell = buildGroupShell('Studio');
      allStudios = allStudios.slice().sort(function (a, b) { return a.studioName.localeCompare(b.studioName); });
      var SHOW_INITIAL = 6;
      var query = '';

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'pdg-studio-search';
      input.placeholder = 'Search studios…';

      var listEl = document.createElement('div');
      listEl.className = 'pdg-studio-results';

      function renderList(studios) {
        listEl.innerHTML = '';
        var visible = studios.slice(0, SHOW_INITIAL);
        visible.forEach(function (s) {
          var label = document.createElement('label');
          label.className = 'pdg-filter-option';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.name = 'pdg-filter-studio-' + blockId;
          cb.value = s.slug;
          cb.checked = state.filters.studio === s.slug;
          cb.addEventListener('change', function () {
            state.filters.studio = cb.checked ? s.slug : '';
            updateChips();
            resetAndFetch();
          });
          label.appendChild(cb);
          label.appendChild(document.createTextNode(' ' + s.studioName));
          listEl.appendChild(label);
        });
        if (studios.length > SHOW_INITIAL) {
          var note = document.createElement('p');
          note.className = 'pdg-show-more';
          note.style.cssText = 'pointer-events:none;opacity:0.55;';
          note.textContent = (studios.length - SHOW_INITIAL) + ' more — type to search';
          listEl.appendChild(note);
        }
      }

      // Show initial 6 from pre-loaded list
      renderList(allStudios);

      var timer;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        query = input.value.trim();
        if (!query) { renderList(allStudios); return; }
        // Filter pre-loaded list first (instant)
        var local = allStudios.filter(function (s) {
          return s.studioName.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
        if (local.length) { renderList(local); return; }
        // Fallback to API if nothing matches locally
        if (query.length < 2) return;
        timer = setTimeout(function () {
          fetch(proxyBase + '/partner-search?q=' + encodeURIComponent(query))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
              var items = (data && data.results) ? data.results : [];
              renderList(items);
            })
            .catch(function () {});
        }, 350);
      });

      shell.body.appendChild(input);
      shell.body.appendChild(listEl);
      return shell.wrap;
    }

    // ── Active filter chips ──────────────────────────────────

    function updateChips() {
      if (!chipsRow) return;
      chipsRow.innerHTML = '';

      var count = 0;

      function addChip(label, clear) {
        count++;
        var chip = document.createElement('span');
        chip.className = 'pdg-active-chip';
        var txt = document.createTextNode(label);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pdg-active-chip-remove';
        btn.setAttribute('aria-label', 'Remove ' + label);
        btn.innerHTML = '&times;';
        btn.addEventListener('click', function () { clear(); updateChips(); resetAndFetch(); });
        chip.appendChild(txt);
        chip.appendChild(btn);
        chipsRow.appendChild(chip);
      }

      syncTopicUrl();
      syncThemeUrl();
      syncQUrl();
      if (state.filters.q) {
        addChip('Search: ' + state.filters.q, function () { state.filters.q = ''; syncQUrl(); });
      }
      if (state.filters.topic) {
        addChip(state.filters.topic, function () { state.filters.topic = ''; syncTopicUrl(); syncFilterUI(); });
      }
      state.filters.themes.forEach(function (t) {
        addChip(t, function () {
          state.filters.themes = state.filters.themes.filter(function (v) { return v !== t; });
          syncThemeUrl();
          syncFilterUI();
        });
      });
      state.filters.suits_use.forEach(function (t) {
        addChip(t, function () {
          state.filters.suits_use = state.filters.suits_use.filter(function (v) { return v !== t; });
          syncFilterUI();
        });
      });
      state.filters.occasions.forEach(function (t) {
        addChip(t, function () {
          state.filters.occasions = state.filters.occasions.filter(function (v) { return v !== t; });
          syncFilterUI();
        });
      });
      if (state.filters.scale) {
        addChip(SCALE_LABELS[state.filters.scale] || state.filters.scale, function () { state.filters.scale = ''; syncFilterUI(); });
      }
      if (state.filters.subject) {
        addChip(state.filters.subject, function () {
          state.filters.subject = '';
          var inp = filterGroups && filterGroups.querySelector('.pdg-subject-search');
          if (inp) inp.value = '';
        });
      }
      if (state.filters.palette) {
        addChip(state.filters.palette, function () { state.filters.palette = ''; syncFilterUI(); });
      }
      if (state.filters.studio) {
        addChip(state.filters.studio, function () { state.filters.studio = ''; syncFilterUI(); });
      }

      chipsRow.hidden = count === 0;
      if (clearAllBtn) clearAllBtn.hidden = count === 0;
      if (clearCount)  clearCount.textContent = String(count);
    }

    function syncTopicUrl() {
      try {
        var p = new URLSearchParams(window.location.search);
        if (state.filters.topic) { p.set('topic', state.filters.topic); }
        else { p.delete('topic'); }
        history.replaceState(null, '', window.location.pathname + (p.toString() ? '?' + p.toString() : ''));
      } catch (e) {}
    }

    function syncThemeUrl() {
      try {
        var p = new URLSearchParams(window.location.search);
        if (state.filters.themes.length) { p.set('theme', state.filters.themes.join(',')); }
        else { p.delete('theme'); }
        history.replaceState(null, '', window.location.pathname + (p.toString() ? '?' + p.toString() : ''));
      } catch (e) {}
    }

    function syncQUrl() {
      try {
        var p = new URLSearchParams(window.location.search);
        if (state.filters.q) { p.set('q', state.filters.q); }
        else { p.delete('q'); }
        history.replaceState(null, '', window.location.pathname + (p.toString() ? '?' + p.toString() : ''));
      } catch (e) {}
    }

    // Re-render sidebar inputs to reflect cleared state
    function syncFilterUI() {
      if (!filterGroups) return;
      filterGroups.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(function (inp) {
        var role = inp.name ? inp.name.replace('pdg-filter-', '').replace('-' + blockId, '') : '';
        var filterKey = role === 'theme' ? 'themes' : role === 'occasion' ? 'occasions' : role;
        var vals = Array.isArray(state.filters[filterKey]) ? state.filters[filterKey] : [state.filters[filterKey]];
        inp.checked = vals.indexOf(inp.value) !== -1;
      });
      filterGroups.querySelectorAll('.pdg-chip').forEach(function (chip) {
        chip.classList.toggle('pdg-chip--active', chip.dataset.value === state.filters.scale);
      });
      filterGroups.querySelectorAll('.pdg-swatch').forEach(function (swatch) {
        swatch.classList.toggle('pdg-swatch--active', swatch.dataset.slug === state.filters.palette);
      });
      var subjectInp = filterGroups.querySelector('.pdg-subject-search');
      if (subjectInp) subjectInp.value = state.filters.subject || '';
      var studioInp = filterGroups.querySelector('.pdg-studio-search');
      if (studioInp && !state.filters.studio) studioInp.value = '';
    }

    // ── Editorial slots from data attrs ─────────────────────

    var ed1 = {
      eyebrow: root.dataset.ed1Eyebrow || '',
      title:   root.dataset.ed1Title   || '',
      body:    root.dataset.ed1Body    || '',
      ctaText: root.dataset.ed1CtaText || '',
      ctaUrl:  root.dataset.ed1CtaUrl  || '#',
    };
    var ed2 = {
      eyebrow: root.dataset.ed2Eyebrow || '',
      title:   root.dataset.ed2Title   || '',
      body:    root.dataset.ed2Body    || '',
      ctaText: root.dataset.ed2CtaText || '',
      ctaUrl:  root.dataset.ed2CtaUrl  || '#',
    };
    if (ed1.title) state.editorialSlots.push(ed1);
    if (ed2.title) state.editorialSlots.push(ed2);
  }

  // Re-init blocks when Shopify theme editor reloads a section (setting change live preview)
  document.addEventListener('shopify:section:load', function (e) {
    var section = e.target;
    section.querySelectorAll('[data-pdg-block]').forEach(function (root) {
      initBlock(root);
    });
  });
}());
