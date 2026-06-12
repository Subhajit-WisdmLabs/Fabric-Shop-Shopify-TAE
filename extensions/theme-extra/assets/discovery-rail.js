(function () {
  function initRail(wrap) {
    var cardEls = wrap.querySelectorAll('[data-dr-card]');
    if (!cardEls.length) return;

    var slugs = Array.prototype.map.call(cardEls, function (el) {
      return el.getAttribute('data-dr-card');
    }).join(',');

    fetch('/apps/fabric-shop/api/discovery-rail?slugs=' + encodeURIComponent(slugs))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;

        var linkEl = wrap.querySelector('[data-dr-studios-link]');
        if (linkEl && data.studioCount) {
          linkEl.textContent = 'All ' + data.studioCount + ' studios →';
        }

        if (!data.cards || !data.cards.length) return;

        var cardMap = {};
        data.cards.forEach(function (c) { cardMap[c.slug] = c; });

        cardEls.forEach(function (cardEl) {
          var slug = cardEl.getAttribute('data-dr-card');
          var c = cardMap[slug];
          if (!c) return;

          var thumbEls = cardEl.querySelectorAll('.dr-thumb');
          thumbEls.forEach(function (thumb, i) {
            if (c.thumbs[i]) thumb.style.backgroundImage = 'url("' + c.thumbs[i] + '")';
          });

          var nameEl = cardEl.querySelector('.dr-name');
          if (nameEl) {
            nameEl.classList.remove('dr-skel', 'dr-skel--name');
            nameEl.textContent = c.studioName;
          }

          var metaEl = cardEl.querySelector('.dr-meta');
          if (metaEl) {
            metaEl.classList.remove('dr-skel', 'dr-skel--meta');
            metaEl.textContent = c.fullName + ' \xb7 ' + c.city + ' \xb7 ' + c.designCount + ' designs';
          }

          cardEl.classList.remove('dr-card--loading');
          cardEl.removeAttribute('aria-busy');
        });
      })
      .catch(function () {});

    // Carousel controls
    var track    = wrap.querySelector('.dr-track');
    var dotsWrap = wrap.querySelector('.dr-dots');
    var prevBtn  = wrap.querySelector('.dr-arrow--prev');
    var nextBtn  = wrap.querySelector('.dr-arrow--next');

    if (!track || !dotsWrap) return;

    var dots = dotsWrap.querySelectorAll('.dr-dot');

    function getActiveIdx() {
      var cards = track.querySelectorAll('.dr-card');
      if (!cards.length) return 0;
      var trackLeft = track.getBoundingClientRect().left;
      var activeIdx = 0;
      var minDist = Infinity;
      Array.prototype.forEach.call(cards, function (card, i) {
        var dist = Math.abs(card.getBoundingClientRect().left - trackLeft);
        if (dist < minDist) { minDist = dist; activeIdx = i; }
      });
      return activeIdx;
    }

    function updateControls() {
      var cards = track.querySelectorAll('.dr-card');
      var idx = getActiveIdx();
      Array.prototype.forEach.call(dots, function (dot, i) {
        dot.classList.toggle('dr-dot--active', i === idx);
      });
      if (prevBtn) prevBtn.disabled = (idx === 0);
      if (nextBtn) nextBtn.disabled = (idx >= cards.length - 1);
    }

    track.addEventListener('scroll', updateControls, { passive: true });

    Array.prototype.forEach.call(dots, function (dot, i) {
      dot.addEventListener('click', function () {
        var cards = track.querySelectorAll('.dr-card');
        if (cards[i]) track.scrollTo({ left: cards[i].offsetLeft, behavior: 'smooth' });
      });
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        var cards = track.querySelectorAll('.dr-card');
        var idx = getActiveIdx();
        if (idx > 0) track.scrollTo({ left: cards[idx - 1].offsetLeft, behavior: 'smooth' });
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        var cards = track.querySelectorAll('.dr-card');
        var idx = getActiveIdx();
        if (idx < cards.length - 1) track.scrollTo({ left: cards[idx + 1].offsetLeft, behavior: 'smooth' });
      });
    }

    updateControls();
  }

  function initAll() {
    document.querySelectorAll('[data-dr-block]:not([data-dr-init])').forEach(function (el) {
      el.setAttribute('data-dr-init', '1');
      initRail(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
