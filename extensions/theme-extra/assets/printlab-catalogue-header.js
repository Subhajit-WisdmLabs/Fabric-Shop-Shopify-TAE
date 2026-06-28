(function () {
  document.querySelectorAll('.plch-wrap').forEach(function (wrap) {
    fetch('/apps/fabric-shop/api/printlab-stats')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        ['designs', 'studios', 'countries', 'collections', 'newThisMonth'].forEach(function (key) {
          var el = wrap.querySelector('[data-plch-stat="' + key + '"]');
          if (el && data[key] != null) el.textContent = data[key];
        });
      })
      .catch(function () {
        wrap.querySelectorAll('.plch-skel').forEach(function (s) { s.remove(); });
      });
  });
})();
