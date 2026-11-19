// Durable rendition references are local paths, never expiring signed URLs or hotlinks.
export function validAssetPath(value) {
  return typeof value === 'string' && /^(?:\/preview-issues\/\d{4}-\d{2}-\d{2}\/)?assets\/[a-f0-9]{64}-(?:web\.webp|print\.jpg)$/.test(value);
}
export const assetLabels = {
  event_photo: '事件照片', file_photo: '資料照片 · 非本次現場',
  illustration: '概念插畫', generated_illustration: 'AI illustration · 概念插畫', icon: '原創分類圖示',
};
