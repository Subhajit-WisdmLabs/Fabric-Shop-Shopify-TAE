(function () {
  'use strict';

  var STORAGE_KEY = 'pdg_favs';
  var LIKES_KEY   = 'pdg_likes';

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

  function toggleFav(handle) {
    var favs = getFavs();
    var idx = favs.indexOf(handle);
    if (idx === -1) favs.push(handle); else favs.splice(idx, 1);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favs)); } catch (e) {}
    return favs;
  }

  function getLikes() {
    try { return JSON.parse(localStorage.getItem(LIKES_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function toggleLike(handle) {
    var likes = getLikes();
    if (likes[handle]) { delete likes[handle]; } else { likes[handle] = true; }
    try { localStorage.setItem(LIKES_KEY, JSON.stringify(likes)); } catch (e) {}
    return likes;
  }

  // ── Boot ────────────────────────────────────────────────────

  document.querySelectorAll('[data-pdg-block]').forEach(function (root) {
    initBlock(root);
  });

  function initBlock(root) {
    var proxyBase       = root.dataset.proxyBase || '/apps/fabric-shop/api';
    var collection      = root.dataset.collection || '';
    var perLoad         = parseInt(root.dataset.perLoad || '24', 10);
    var profileUrl      = root.dataset.profileUrl || '/pages/partners';
    var editorialEvery  = parseInt(root.dataset.editorialInterval || '8', 10);
    var blockId         = root.dataset.pdgBlock;

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

    var state = {
      filters: {
        topic: '', themes: [], suits_use: [], occasions: [],
        scale: '', subject: '', palette: '', studio: ''
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
        state.filters = { topic: '', themes: [], suits_use: [], occasions: [], scale: '', subject: '', palette: '', studio: '' };
        syncFilterUI();
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

    Promise.all([
      fetchFilterMeta(),
      fetchProducts(false),
    ]);

    // ── Filter metadata ──────────────────────────────────────

    function fetchFilterMeta() {
      return fetch(proxyBase + '/tag-subjects-public')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          state.subjectSuggestions = data.subjectSuggestions || [];
          renderFilterSidebar(data.groups || [], data.subjectSuggestions || [], data.palette || []);
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
      return p.toString();
    }

    function fetchProducts(append) {
      if (state.loading) return Promise.resolve();
      state.loading = true;
      if (loadBtn) loadBtn.disabled = true;

      return fetch(proxyBase + '/catalogue-products?' + buildParams(append))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          state.loading = false;
          if (!data) return;

          state.cursor   = data.pageInfo && data.pageInfo.endCursor;
          state.total    = data.total || 0;
          state.showing  = append
            ? state.showing + (data.products || []).length
            : (data.products || []).length;

          renderGrid(data.products || [], append);

          if (countEl) {
            countEl.textContent = 'Showing ' + state.showing + ' of ' + state.total + ' designs';
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
          if (loadBtn) loadBtn.disabled = false;
        });
    }

    function resetAndFetch() {
      state.cursor  = null;
      state.showing = 0;
      fetchProducts(false);
    }

    // ── Grid rendering ───────────────────────────────────────

    function renderGrid(products, append) {
      if (!append) grid.innerHTML = '';

      if (!products.length && !append) {
        grid.innerHTML = '<div class="pdg-no-results">No designs match your filters.</div>';
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

        // 1st editorial after the 6th design; subsequent ones every editorialEvery tiles after that
        if (showEd) {
          var isFirst      = position === 6;
          var isSubsequent = position > 6 && (position - 6) % editorialEvery === 0;
          if (isFirst || isSubsequent) {
            var slotIdx = Math.floor((position - 6) / editorialEvery) % state.editorialSlots.length;
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
      var isFav   = favs.indexOf(p.handle) !== -1;
      var isLiked = !!(likes && likes[p.handle]);
      var el = document.createElement('a');
      el.href = '/products/' + esc(p.handle);
      el.className = 'pdg-card';

      var vendorLink = p.vendorSlug
        ? profileUrl + '?handle=' + encodeURIComponent(p.vendorSlug)
        : '#';

      var badgesHtml = '';
      if (p.isNew)        badgesHtml += '<span class="pdg-badge pdg-badge--new">New</span>';
      if (p.isBestseller) badgesHtml += '<span class="pdg-badge pdg-badge--bestseller">Bestseller</span>';

      var metaHtml = '';
      if (p.scale) metaHtml = '<p class="pdg-card-meta">' + esc(p.scale) + '</p>';

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
            '<span class="pdg-like-count">' + (isLiked ? '1' : '0') + '</span>' +
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
          '<p class="pdg-card-title">' + esc(p.title) + '</p>' +
          '<p class="pdg-card-vendor">by <a href="' + esc(vendorLink) + '" class="pdg-vendor-link" onclick="event.stopPropagation()"><strong>' + esc(p.vendor) + '</strong></a></p>' +
          metaHtml +
        '</div>';

      // Bind like button
      var likeBtn = el.querySelector('.pdg-like-btn');
      if (likeBtn) {
        likeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var handle = likeBtn.dataset.handle;
          var newLikes = toggleLike(handle);
          var likedNow = !!newLikes[handle];
          likeBtn.classList.toggle('pdg-like-btn--active', likedNow);
          var icon = likeBtn.querySelector('svg');
          if (icon) icon.setAttribute('fill', likedNow ? 'currentColor' : 'none');
          var countEl = likeBtn.querySelector('.pdg-like-count');
          if (countEl) countEl.textContent = likedNow ? '1' : '0';
        });
      }

      // Bind fav button once here so Load-more appends don't create duplicate handlers
      var favBtn = el.querySelector('.pdg-fav-btn');
      if (favBtn) {
        favBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var handle = favBtn.dataset.handle;
          var newFavs = toggleFav(handle);
          var favNow = newFavs.indexOf(handle) !== -1;
          favBtn.classList.toggle('pdg-fav-btn--active', favNow);
          var icon = favBtn.querySelector('svg');
          if (icon) icon.setAttribute('fill', favNow ? 'currentColor' : 'none');
        });
      }

      return el;
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

    function renderFilterSidebar(groups, suggestions, palette) {
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

      // Studio search
      if (root.dataset.showStudio !== 'false') {
        filterGroups.appendChild(buildStudioGroup());
      }
    }

    function toCamel(str) {
      return str.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); });
    }

    function buildGroupShell(label) {
      var wrap = document.createElement('div');
      wrap.className = 'pdg-filter-group';

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

      var opts = group.options || [];
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
        btn.textContent = opt;
        btn.addEventListener('click', function () {
          state.filters.scale = state.filters.scale === opt ? '' : opt;
          shell.body.querySelectorAll('.pdg-chip').forEach(function (c) {
            c.classList.toggle('pdg-chip--active', c.textContent === state.filters.scale);
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

    function buildStudioGroup() {
      var shell = buildGroupShell('Studio');
      var proxyBase_ = proxyBase;

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'pdg-studio-search';
      input.placeholder = 'Search studios…';

      var results = document.createElement('div');
      results.className = 'pdg-studio-results';

      var timer;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        var q = input.value.trim();
        if (q.length < 2) { results.innerHTML = ''; return; }
        timer = setTimeout(function () {
          fetch(proxyBase_ + '/partner-search?q=' + encodeURIComponent(q))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
              results.innerHTML = '';
              var items = data && data.results ? data.results : [];
              items.slice(0, 6).forEach(function (s) {
                var label = document.createElement('label');
                label.className = 'pdg-filter-option';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = state.filters.studio === s.slug;
                cb.addEventListener('change', function () {
                  state.filters.studio = cb.checked ? s.slug : '';
                  updateChips();
                  resetAndFetch();
                });
                label.appendChild(cb);
                label.appendChild(document.createTextNode(' ' + s.studioName));
                results.appendChild(label);
              });
            })
            .catch(function () {});
        }, 350);
      });

      shell.body.appendChild(input);
      shell.body.appendChild(results);
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

      if (state.filters.topic) {
        addChip(state.filters.topic, function () { state.filters.topic = ''; syncFilterUI(); });
      }
      state.filters.themes.forEach(function (t) {
        addChip(t, function () {
          state.filters.themes = state.filters.themes.filter(function (v) { return v !== t; });
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
        addChip(state.filters.scale, function () { state.filters.scale = ''; syncFilterUI(); });
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
        chip.classList.toggle('pdg-chip--active', chip.textContent === state.filters.scale);
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
}());
