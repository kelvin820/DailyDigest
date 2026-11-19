import snapshot from '../../content/reading-preview/2026-11-19.json';
import {editionSchema} from '../schemas/edition';
import type {Edition} from '../../config/editions';

const editions=snapshot.map(issue=>editionSchema.parse(issue));
if(editions.length!==3||new Set(editions.map(i=>i.edition)).size!==3||editions.some(
  i=>!i.reviewCopy||i.isDemo||i.publishedAt!==null||i.articles.length!==4
))throw Error('INVALID_READING_PREVIEW');

export const PREVIEW_DATE=editions[0].issueDate;
export function previewIssue(edition:Edition){return editions.find(i=>i.edition===edition)!;}
