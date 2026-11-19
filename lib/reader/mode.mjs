// Public, read-only review is the initial experience. Published member access
// remains an explicit later opt-in; missing credentials never select login.
/** @param {{DEMO_MODE?: string, READING_MODE?: string}} [env] */
export function readingMode(env=process.env) {
  if(env.DEMO_MODE==='true')return 'demo';
  return env.READING_MODE==='published'?'published':'preview';
}
