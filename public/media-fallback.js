/* Original icon remains available if a locally served web rendition cannot decode. */
(() => {
  const fallback = image => {
    if (!(image instanceof HTMLImageElement)) return;
    const figure = image.closest('.media-figure');
    if (!figure) return;
    image.hidden = true;
    figure.querySelector('.asset-fallback').hidden = false;
    figure.querySelector('.asset-credit').hidden = true;
    figure.querySelector('.asset-fallback-credit').hidden = false;
  };
  document.addEventListener('error', event => fallback(event.target), true);
  document.querySelectorAll('.media-figure img').forEach(image => {
    if (image.complete && !image.naturalWidth) fallback(image);
  });
})();
