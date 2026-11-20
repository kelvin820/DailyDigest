export async function checkPrintLayout(page, minimumPt, expectedStories = 8) {
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode()));
    for (const family of ['DD Sans', 'DD Serif', 'DD CJK']) {
      const fonts = await document.fonts.load(`14pt "${family}"`);
      if (!fonts.length || fonts.some(font => font.status !== 'loaded')) throw Error('FONT_NOT_LOADED:' + family);
    }
  });
  const layout = await page.evaluate(() => ({
    pages: document.querySelectorAll('.print-page').length,natural:!!document.querySelector('.flow-page'),
    articles: [...document.querySelectorAll('.print-article')].map(e => ({
      storyId: e.dataset.story, height: e.clientHeight, scrollHeight: e.scrollHeight,
      width: e.clientWidth, scrollWidth: e.scrollWidth,
      childBottom: Math.max(...[...e.querySelectorAll('*')].map(x => x.getBoundingClientRect().bottom)),
      bottom: e.getBoundingClientRect().bottom,
      fontPt: Number.parseFloat(getComputedStyle(e.querySelector('.body-copy')).fontSize) * 72 / 96,
      visuals: e.querySelectorAll('svg, img').length,
    })),
    missingImages: [...document.images].some(img => !img.complete || img.naturalWidth === 0),
    pageOverflow: [...document.querySelectorAll('.print-page')].some(e => e.scrollHeight > e.clientHeight + 1),
  }));
  if (!layout.pages || layout.articles.length !== expectedStories) throw Error('PDF_STORY_COUNT');
  if (layout.missingImages || layout.articles.some(a => a.visuals < 1)) throw Error('PDF_MISSING_IMAGE');
  if (layout.pageOverflow || layout.articles.some(a => a.scrollHeight > a.height + 1 ||
    a.scrollWidth > a.width + 1 || a.childBottom > a.bottom + 1)) throw Error('PDF_OVERFLOW');
  if (layout.articles.some(a => a.fontPt < minimumPt - 0.01)) throw Error('PDF_BODY_TOO_SMALL');
  return layout;
}
