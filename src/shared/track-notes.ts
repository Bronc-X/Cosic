import type { Track } from './contracts/bridge';

const moodCopy: Record<string, string> = {
  Focused: '收束的推进',
  Calm: '低亮度的呼吸',
  Cinematic: '带叙事弧线的声场',
  Open: '开阔的留白'
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, ' ');

const stableIndex = (value: string, modulo: number) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return modulo > 0 ? hash % modulo : 0;
};

const unique = (items: string[]) => {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const buildTrackContext = (track: Track) => {
  const artist = normalizeText(track.artist) || '这位艺人';
  const album = normalizeText(track.album);
  const year = normalizeText(track.year);

  if (album && year) {
    return `${artist} 的《${album}》（${year}）`;
  }

  if (album) {
    return `${artist} 的《${album}》`;
  }

  if (year) {
    return `${artist} ${year} 年前后的作品`;
  }

  return `${artist} 的作品`;
};

const buildTextureCopy = (track: Track) => {
  const artist = normalizeText(track.artist);
  const album = normalizeText(track.album);
  const descriptors = unique([
    moodCopy[track.mood] ?? normalizeText(track.mood),
    ...track.tags.map(normalizeText)
  ])
    .filter((item) => item && item !== artist && item !== album && item !== '外部相似搜索')
    .slice(0, 2);

  return descriptors.length > 0 ? descriptors.join('、') : '克制而有层次的声音纹理';
};

export const buildLocalTrackNote = (track: Track) => {
  const title = normalizeText(track.title) || '这首歌';
  const context = buildTrackContext(track);
  const texture = buildTextureCopy(track);
  const templates = [
    `《${title}》来自${context}。先听声音的距离：${texture}没有急着铺满，主角常留在几步之外。这样的处理会把人带到很具体的位置：一句话说出口前的停顿，一段关系退潮后的余温，以及那些还没整理好的念头。`,
    `《${title}》适合从${context}听起。${texture}让歌曲少了一点说明，多了一点现场感；像一段话说到半句，剩下的交给呼吸和间隔。它留下的情绪很轻，不催人表态，只提醒人：有些记忆不用反复翻译，也会在某个音色里回来。`,
    `听《${title}》，先别急着找大词。${context}给了它来处，${texture}给了它触感。旋律或节拍往前走时，情绪没有被端出来讲道理，只在边缘慢慢显形。它最耐听的地方，是让人意识到：很多事并没有被解决，只是可以暂时放下。`,
    `《${title}》把${context}里的气味带了出来。${texture}让声音保持近身，却不把话说死。听到后面，会觉得它关心的东西很小：走神、想起、停顿，某个瞬间回到身体里，然后把自己重新放回当下。`
  ];

  return templates[stableIndex(`${track.id}:${track.title}:${track.artist}:${track.album}`, templates.length)];
};
