(function () {
  function initEom(wrap) {
    var gid = wrap.dataset.collectionGid;
    if (!gid) return;

    fetch('/apps/fabric-shop/api/featured-collection?collection_gid=' + encodeURIComponent(gid))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data) return;

        // Swap placeholder with cover image / mosaic
        var mediaWrap = wrap.querySelector('.eom-media-wrap');
        var placeholder = mediaWrap ? mediaWrap.querySelector('.eom-img--placeholder') : null;
        if (placeholder) {
          if (data.coverType === 'auto_mosaic' && data.previewImages && data.previewImages.length > 0) {
            var mosaic = document.createElement('div');
            mosaic.className = 'eom-mosaic';
            data.previewImages.slice(0, 4).forEach(function(url) {
              var img = document.createElement('img');
              img.className = 'eom-mosaic__img';
              img.src = url;
              img.alt = '';
              img.loading = 'lazy';
              mosaic.appendChild(img);
            });
            placeholder.replaceWith(mosaic);
          } else if (data.coverImageUrl) {
            var img = document.createElement('img');
            img.className = 'eom-img';
            img.alt = (mediaWrap && mediaWrap.dataset.alt) ? mediaWrap.dataset.alt : '';
            img.src = data.coverImageUrl;
            placeholder.replaceWith(img);
          }
        }

        // Split last word of title into <em>
        var titleEl = wrap.querySelector('.eom-title');
        if (titleEl) {
          var text = titleEl.textContent.trim();
          var lastSpace = text.lastIndexOf(' ');
          if (lastSpace !== -1) {
            titleEl.innerHTML = text.slice(0, lastSpace) + ' <em>' + text.slice(lastSpace + 1) + '</em>';
          }
        }

        // Designer card
        if (!data.designer) return;
        var d = data.designer;

        var avatarImg      = wrap.querySelector('.eom-avatar__img');
        var avatarInitials = wrap.querySelector('.eom-avatar__initials');

        if (d.profileImageUrl && avatarImg) {
          avatarImg.src = d.profileImageUrl;
          avatarImg.alt = d.name || '';
          avatarImg.removeAttribute('hidden');
          if (avatarInitials) avatarInitials.setAttribute('hidden', '');
        } else if (avatarInitials) {
          avatarInitials.textContent = d.initials || '';
        }

        // Designer name (fullName) and studio name (studioName) are separate fields
        var nameText = wrap.querySelector('.eom-owner-name__text');
        if (nameText) nameText.textContent = d.fullName || d.name || '';

        var studioEl = wrap.querySelector('.eom-owner-studio');
        if (studioEl) studioEl.textContent = d.name || '';

        var bioEl = wrap.querySelector('.eom-owner-bio');
        if (bioEl) bioEl.textContent = d.bio || '';

        var ownerEl = wrap.querySelector('.eom-owner');
        if (ownerEl) ownerEl.removeAttribute('hidden');

        // Update "Explore the collection" button to partner collection URL
        if (d.slug) {
          var collHandle = wrap.dataset.collectionHandle || '';
          var collBtn = wrap.querySelector('.eom-collection-btn');
          if (collBtn && collHandle) {
            collBtn.href = '/pages/partners?handle=' + encodeURIComponent(d.slug) +
              '&tab=collection&slug=' + encodeURIComponent(collHandle);
          }

          // Studio CTA
          var studioBtn = wrap.querySelector('.eom-studio-btn');
          if (studioBtn) {
            studioBtn.href = '/pages/partners?handle=' + encodeURIComponent(d.slug);
            studioBtn.removeAttribute('hidden');
          }
        }
      })
      .catch(function () { /* graceful fail — Shopify data still shows */ });
  }

  document.querySelectorAll('.eom-wrap').forEach(initEom);
}());
