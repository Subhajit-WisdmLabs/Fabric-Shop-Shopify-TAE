document.querySelectorAll('.cl-wrap').forEach(function (wrap) {
  var grid  = wrap.querySelector('.cl-grid');
  var cards = grid.querySelectorAll('.cl-card[data-slug]');

  cards.forEach(function (card) {
    var slug = card.dataset.slug;
    fetch('/apps/fabric-shop/api/collection-search?handle=' + encodeURIComponent(slug))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var result = data.results && data.results[0];
        if (!result) { card.style.display = 'none'; return; }

        card.href = '/pages/partners?handle=' + encodeURIComponent(result.partnerSlug)
                  + '&tab=collection&slug=' + encodeURIComponent(result.handle);

        var titleEl   = card.querySelector('.cl-card__title');
        var partnerEl = card.querySelector('.cl-card__partner');
        var countEl   = card.querySelector('.cl-card__count');
        if (titleEl)   titleEl.textContent  = result.title;
        if (partnerEl) partnerEl.textContent = result.partnerName;
        if (countEl)   countEl.textContent   = result.productsCount + ' designs';

        if (!card.dataset.imageSet && result.image) {
          var placeholder = card.querySelector('.cl-card__img-placeholder');
          if (placeholder) {
            var img = document.createElement('img');
            img.src       = result.image;
            img.className = 'cl-card__img';
            img.loading   = 'lazy';
            img.alt       = result.title;
            placeholder.replaceWith(img);
          }
        }

        card.classList.remove('cl-card--pending');
      })
      .catch(function () { card.style.display = 'none'; });
  });

  var arrowsEl = wrap.querySelector('.cl-arrows');
  if (!arrowsEl) return;

  var prevBtn = arrowsEl.querySelector('.cl-arrow--prev');
  var nextBtn = arrowsEl.querySelector('.cl-arrow--next');
  var cols  = parseInt(grid.dataset.columns, 10) || 4;
  var count = grid.querySelectorAll('.cl-card[data-slug]').length;

  function visibleCols() {
    var w = window.innerWidth;
    if (w <= 640)  return Math.min(cols, 2);
    if (w <= 1024) return Math.min(cols, 3);
    return cols;
  }

  function maybeShowArrows() {
    if (count > visibleCols()) arrowsEl.removeAttribute('hidden');
    else arrowsEl.setAttribute('hidden', '');
  }

  maybeShowArrows();
  window.addEventListener('resize', maybeShowArrows);

  function syncPulse() {
    [prevBtn, nextBtn].forEach(function (b) { b.style.animationName = 'none'; });
    void prevBtn.offsetWidth;
    [prevBtn, nextBtn].forEach(function (b) { b.style.animationName = ''; });
  }
  syncPulse();

  function cardWidth() {
    var c = grid.querySelector('.cl-card');
    if (!c) return 240;
    var gap = parseFloat(window.getComputedStyle(grid).gap) || 16;
    return c.offsetWidth + gap;
  }

  function atStart() { return grid.scrollLeft <= 4; }
  function atEnd()   { return grid.scrollLeft >= grid.scrollWidth - grid.clientWidth - 4; }

  function scrollNext() {
    atEnd()
      ? grid.scrollTo({ left: 0, behavior: 'smooth' })
      : grid.scrollBy({ left: cardWidth(), behavior: 'smooth' });
  }
  function scrollPrev() {
    atStart()
      ? grid.scrollTo({ left: grid.scrollWidth, behavior: 'smooth' })
      : grid.scrollBy({ left: -cardWidth(), behavior: 'smooth' });
  }

  nextBtn.addEventListener('click', scrollNext);
  prevBtn.addEventListener('click', scrollPrev);

  function updateArrows() {
    var prevWas = prevBtn.classList.contains('cl-arrow--disabled');
    var nextWas = nextBtn.classList.contains('cl-arrow--disabled');
    prevBtn.classList.toggle('cl-arrow--disabled', atStart());
    nextBtn.classList.toggle('cl-arrow--disabled', atEnd());
    if ((prevWas && !prevBtn.classList.contains('cl-arrow--disabled')) ||
        (nextWas && !nextBtn.classList.contains('cl-arrow--disabled'))) {
      syncPulse();
    }
  }
  grid.addEventListener('scroll', updateArrows, { passive: true });
  updateArrows();
});
