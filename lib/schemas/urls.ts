import { z } from 'zod';
export const httpsUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Only HTTPS URLs without credentials are allowed');
