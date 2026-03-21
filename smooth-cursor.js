(function () {
  function shouldDisable() {
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const isSmall = window.innerWidth < 768;
    return isTouch || isSmall;
  }

  function initSmoothCursor() {
    if (shouldDisable()) return;

    const body = document.body;
    if (!body) return;

    const dot = document.createElement('div');
    dot.className = 'smooth-cursor-dot';

    const ring = document.createElement('div');
    ring.className = 'smooth-cursor-ring';

    body.appendChild(dot);
    body.appendChild(ring);
    body.classList.add('has-smooth-cursor');

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let dx = tx;
    let dy = ty;
    let rx = tx;
    let ry = ty;

    let visible = false;

    const interactiveSelector = [
      'a',
      'button',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '.semaforo-item',
      '.semaforo-bill',
      '.year-pie-item',
      '.pdf-link',
      'canvas'
    ].join(',');

    const setActive = (on) => {
      ring.classList.toggle('active', !!on);
    };

    window.addEventListener('mousemove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!visible) {
        visible = true;
        dot.style.opacity = '1';
        ring.style.opacity = '1';
      }

      const interactive = e.target && e.target.closest && e.target.closest(interactiveSelector);
      setActive(!!interactive);
    }, { passive: true });

    window.addEventListener('mousedown', () => setActive(true), { passive: true });
    window.addEventListener('mouseup', () => setActive(false), { passive: true });

    document.addEventListener('mouseleave', () => {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
      visible = false;
    });

    function tick() {
      dx += (tx - dx) * 0.38;
      dy += (ty - dy) * 0.38;
      rx += (tx - rx) * 0.18;
      ry += (ty - ry) * 0.18;

      dot.style.transform = `translate(${dx}px, ${dy}px) translate(-50%, -50%)`;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmoothCursor);
  } else {
    initSmoothCursor();
  }
})();
