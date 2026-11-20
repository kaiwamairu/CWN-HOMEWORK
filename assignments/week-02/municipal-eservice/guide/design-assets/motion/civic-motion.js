/* Approved civic scenes. Pause off screen, in hidden tabs, or on reduced motion. */
window.CivicMotion = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = reduced.matches;
  let items = [];
  let observer;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function markup(asset, context = 'hero') {
    if (!asset) return '';
    // New sign-in art remains a still preview until the user selects it for video.
    if (!asset.src) return `<div class="scene-media scene-media--${escape(context)}" data-motion-scene="${escape(asset.scene)}" aria-hidden="true"><img class="scene-poster" src="${escape(asset.poster)}" alt="" decoding="async"></div>`;
    return `<div class="scene-media scene-media--${escape(context)}" data-motion-scene="${escape(asset.scene)}" aria-hidden="true"><img class="scene-poster" src="${escape(asset.poster)}" alt="" decoding="async"><video class="scene-video" data-motion-video data-src="${escape(asset.src)}" poster="${escape(asset.poster)}" muted loop playsinline preload="none" tabindex="-1" aria-hidden="true"></video></div><button type="button" class="scene-motion-toggle" data-motion-toggle aria-label="หยุดภาพเคลื่อนไหว" title="หยุดภาพเคลื่อนไหว" aria-pressed="false"><span aria-hidden="true">Ⅱ</span></button>`;
  }

  function label(item) {
    const stopped = userPaused || item.failed || item.video.paused;
    const text = item.failed ? 'แสดงภาพนิ่ง' : stopped ? 'เล่นภาพเคลื่อนไหว' : 'หยุดภาพเคลื่อนไหว';
    item.button.setAttribute('aria-label', text);
    item.button.setAttribute('title', text);
    item.button.setAttribute('aria-pressed', String(stopped));
    item.button.firstElementChild.textContent = item.failed ? '▧' : stopped ? '▶' : 'Ⅱ';
    item.button.disabled = item.failed;
  }

  function update(item) {
    const {video, frame} = item;
    if (userPaused || !item.visible || document.hidden || item.failed) {
      video.pause();
      label(item);
      return;
    }
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    video.muted = true;
    video.play().then(() => {
      if (!video.isConnected) { video.pause(); return; }
      frame.classList.add('has-frames');
      label(item);
    }).catch(() => label(item));
  }

  function mount(root = document) {
    observer?.disconnect();
    items.forEach(({video}) => video.pause());
    items = [];
    root.querySelectorAll('[data-motion-video]').forEach(video => {
      const frame = video.closest('[data-motion-scene]');
      const button = frame?.parentElement.querySelector('[data-motion-toggle]');
      if (!frame || !button) return;
      const rect = frame.getBoundingClientRect();
      const item = {video, frame, button, failed:false, visible:rect.bottom > 0 && rect.top < innerHeight};
      video.muted = true;
      video.addEventListener('playing', () => { frame.classList.add('has-frames'); label(item); });
      video.addEventListener('pause', () => label(item));
      video.addEventListener('error', () => {
        item.failed = true;
        frame.classList.remove('has-frames');
        frame.classList.add('motion-failed');
        label(item);
      });
      button.addEventListener('click', () => {
        userPaused = !userPaused;
        items.forEach(update);
      });
      items.push(item);
      label(item);
    });
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const item = items.find(x => x.frame === entry.target);
          if (item) { item.visible = entry.isIntersecting; update(item); }
        });
      }, {threshold:0.02});
      items.forEach(item => observer.observe(item.frame));
    }
    items.forEach(update);
  }

  reduced.addEventListener('change', event => {
    userPaused = event.matches;
    items.forEach(update);
  });
  document.addEventListener('visibilitychange', () => items.forEach(update));
  return {markup, mount};
})();
