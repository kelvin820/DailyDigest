// Current daily policy; older payloads without a snapshot retain their eight-story layout.
export const DAILY_STORY_COUNT = 4;
export const supportedStoryCounts = [4, 8];
export const storyCountOf = issue => issue.storyCount ?? 8;
