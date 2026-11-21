import type { NextConfig } from "next";
import {withWorkflow} from 'workflow/next';
const pdfAssets=['./prompts/*.txt','./app/globals.css','./public/fonts/*.ttf','./public/preview-issues/**/*.{jpg,webp}',
 './node_modules/@sparticuz/chromium/bin/**/*','./node_modules/.pnpm/@sparticuz+chromium*/node_modules/@sparticuz/chromium/bin/**/*',
 // playwright-core loads registry metadata dynamically from coreBundle.js.
 // Tracing its JavaScript alone omits browsers.json on Vercel.
 './node_modules/playwright-core/**/*','./node_modules/.pnpm/playwright-core*/node_modules/playwright-core/**/*'];
const config:NextConfig={poweredByHeader:false,
 serverExternalPackages:['@sparticuz/chromium','playwright-core','pg'],
 outputFileTracingIncludes:{'/api/editorial/jobs/**':pdfAssets,'/api/internal/pdf':pdfAssets,
 '/api/editorial/setup':['./supabase/migrations/*.sql',...pdfAssets],
 '/.well-known/workflow/v1/step':pdfAssets,'/.well-known/workflow/v1/flow':pdfAssets},
 async headers(){return [{source:"/:path*",headers:[{key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"same-origin"},{key:"X-Frame-Options",value:"DENY"}]}]}};
export default withWorkflow(config);
