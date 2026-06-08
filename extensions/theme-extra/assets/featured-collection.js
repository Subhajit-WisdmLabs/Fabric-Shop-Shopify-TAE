document.querySelectorAll('.fc-wrap').forEach(function (wrap) {
  var grid     = wrap.querySelector('.fc-grid');
  var arrowsEl = wrap.querySelector('.fc-arrows');
  var prevBtn  = wrap.querySelector('.fc-arrow--prev');
  var nextBtn  = wrap.querySelector('.fc-arrow--next');

  var cols       = parseInt(grid.dataset.columns, 10);
  var count      = parseInt(grid.dataset.count, 10);
  var autoScroll = grid.dataset.autoscroll === 'true';
  var delay      = parseInt(grid.dataset.delay, 10);

  function visibleCols() {
    var w = window.innerWidth;
    if (w <= 640)  return Math.min(cols, 2);
    if (w <= 1024) return Math.min(cols, 3);
    return cols;
  }
  if (count <= visibleCols()) return;
  arrowsEl.removeAttribute('hidden');

  function syncPulse() {
    [prevBtn, nextBtn].forEach(function (b) { b.style.animationName = 'none'; });
    void prevBtn.offsetWidth;
    [prevBtn, nextBtn].forEach(function (b) { b.style.animationName = ''; });
  }
  syncPulse();

  function cardWidth() {
    var c = grid.querySelector('.fc-card');
    if (!c) return 220;
    var gap = parseFloat(window.getComputedStyle(grid).gap) || 12;
    return c.offsetWidth + gap;
  }

  function atStart() { return grid.scrollLeft <= 4; }
  function atEnd()   { return grid.scrollLeft >= grid.scrollWidth - grid.clientWidth - 4; }

  function scrollNext() {
    if (atEnd()) {
      grid.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      grid.scrollBy({ left: cardWidth(), behavior: 'smooth' });
    }
  }

  function scrollPrev() {
    if (atStart()) {
      grid.scrollTo({ left: grid.scrollWidth, behavior: 'smooth' });
    } else {
      grid.scrollBy({ left: -cardWidth(), behavior: 'smooth' });
    }
  }

  nextBtn.addEventListener('click', scrollNext);
  prevBtn.addEventListener('click', scrollPrev);

  function updateArrows() {
    var prevWas = prevBtn.classList.contains('fc-arrow--disabled');
    var nextWas = nextBtn.classList.contains('fc-arrow--disabled');
    prevBtn.classList.toggle('fc-arrow--disabled', atStart());
    nextBtn.classList.toggle('fc-arrow--disabled', atEnd());
    if ((prevWas && !prevBtn.classList.contains('fc-arrow--disabled')) ||
        (nextWas && !nextBtn.classList.contains('fc-arrow--disabled'))) {
      syncPulse();
    }
  }
  grid.addEventListener('scroll', updateArrows, { passive: true });
  updateArrows();

  if (autoScroll) {
    var timer = null;

    function start() { timer = setInterval(scrollNext, delay); }
    function stop()  { clearInterval(timer); timer = null; }

    grid.addEventListener('mouseenter', stop);
    grid.addEventListener('mouseleave', start);
    grid.addEventListener('touchstart', stop, { passive: true });
    grid.addEventListener('touchend', function () { setTimeout(start, 1000); });

    start();
  }
});
