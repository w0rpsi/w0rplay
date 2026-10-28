(() => {
  const stats = window.__w0rplayRenderProbe = { raf: 0, ticks: 0, input: 0 };
  const tick = () => { stats.raf++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  setInterval(() => stats.ticks++, 250);
  for (const name of ['pointermove', 'pointerdown', 'pointerup'])
    addEventListener(name, () => stats.input++, { passive: true, capture: true });
})();
