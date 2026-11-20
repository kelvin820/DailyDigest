import type { NextConfig } from "next";
const config:NextConfig={poweredByHeader:false,
 serverExternalPackages:['@sparticuz/chromium','playwright-core','pg'],
 outputFileTracingIncludes:{'/api/editorial/jobs/**':['./prompts/*.txt','./app/globals.css','./public/fonts/*.ttf','./public/preview-issues/**/*.{jpg,webp}','./node_modules/@sparticuz/chromium/bin/**/*','./node_modules/.pnpm/@sparticuz+chromium*/node_modules/@sparticuz/chromium/bin/**/*'],
 '/api/editorial/setup':['./supabase/migrations/*.sql','./prompts/*.txt','./app/globals.css','./public/fonts/*.ttf','./public/preview-issues/**/*.{jpg,webp}','./node_modules/@sparticuz/chromium/bin/**/*','./node_modules/.pnpm/@sparticuz+chromium*/node_modules/@sparticuz/chromium/bin/**/*']},
 async headers(){return [{source:"/:path*",headers:[{key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"same-origin"},{key:"X-Frame-Options",value:"DENY"}]}]}};
export default config;
