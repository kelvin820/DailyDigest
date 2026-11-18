// A light overlap check, not a CEFR word list. Difficulty is assessed by prompts/review.
export function learningTermKey(term){return term.toLowerCase().trim().replace(/\s+/g,' ').replace(/\b([a-z]+)ies\b/g,'$1y').replace(/\b([a-z]{3,}[^s])s\b/g,'$1');}
export function vocabularyOverlapErrors(issues){const seen=new Map(),errors=[];
  for(const issue of issues)for(const article of issue.articles)for(const word of article.vocabulary){
    const key=article.storyId+':'+learningTermKey(word.term);
    if(seen.has(key)&&seen.get(key)!==issue.edition)errors.push('Repeated learning term across levels: '+article.storyId+':'+word.term);
    seen.set(key,issue.edition);
  }return errors;
}
