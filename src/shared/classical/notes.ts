import type { ClassicalWorkNote, Track } from '../contracts/bridge';

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const classicalSignals = [
  'classical',
  'baroque',
  'romantic',
  'orchestra',
  'symphony',
  'sonata',
  'concerto',
  'prelude',
  'nocturne',
  'fugue',
  'suite',
  'variation',
  'bach',
  'mozart',
  'beethoven',
  'chopin',
  'debussy',
  'vivaldi',
  'tchaikovsky',
  'schubert',
  'schumann',
  'brahms',
  'liszt',
  'rachmaninov',
  'dvorak',
  '古典',
  '巴洛克',
  '浪漫',
  '交响',
  '奏鸣曲',
  '协奏曲',
  '前奏曲',
  '赋格',
  '组曲',
  '变奏曲',
  '夜曲',
  '五线谱',
  '巴赫',
  '莫扎特',
  '贝多芬',
  '肖邦',
  '德彪西',
  '维瓦尔第',
  '柴可夫斯基',
  '舒伯特',
  '舒曼',
  '勃拉姆斯',
  '李斯特',
  '拉赫玛尼诺夫',
  '德沃夏克'
];

export const isClassicalLikeTrack = (track: Track): boolean => {
  const searchable = normalizeText(
    [track.title, track.artist, track.album, track.mood, ...track.tags].join(' ')
  );

  return classicalSignals.some((signal) => searchable.includes(normalizeText(signal)));
};

export const buildClassicalFallbackNote = (track: Track): ClassicalWorkNote => {
  const composer = track.artist.trim() || '未知作曲家';
  const workTitle = track.title.trim() || '未命名作品';

  return {
    composer,
    workTitle,
    period: '古典音乐',
    background:
      '这首作品带有明确的古典音乐气质，但目前还没有匹配到可验证的谱源。Cosic 会先认真保留它，暂不补上一份不可靠的谱面。',
    innerWeather:
      '可以先把注意力放在乐句的呼吸、和声的明暗，以及演奏者怎样处理力度。即使缺少完整史料，音乐本身仍然会留下清晰的情绪线索。',
    listeningGuide:
      '建议从主旋律第一次出现的方式听起：它是直接展开，还是先绕开重心？随后留意伴奏织体如何改变空间感。',
    emotionalThesis:
      '这首曲子的入口可以很小：先慢下来，听一个音色变化怎样牵出后面的句子。',
    sources: ['Local deterministic classical fallback']
  };
};
