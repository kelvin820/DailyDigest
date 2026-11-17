import {renderArticle} from '../lib/render.mjs';import type {ArticleView} from '../lib/schemas/edition';
// The shared renderer escapes all content fields and permits only HTTPS links.
export function ArticleContent({article,print=false}:{article:ArticleView;print?:boolean}){return <div dangerouslySetInnerHTML={{__html:renderArticle(article,print)}}/>}
