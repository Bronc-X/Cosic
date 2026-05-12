import type {
  ClassicalScorePriority,
  ClassicalScoreRole,
  ClassicalScoreSource,
  ClassicalWorkNote,
  ScoreInstrument
} from '../contracts/bridge';

export interface ClassicalCatalogEntry {
  id: string;
  composer: string;
  composerAliases: string[];
  workTitle: string;
  workAliases: string[];
  catalogNumbers: string[];
  note: ClassicalWorkNote;
  scores: ClassicalScoreSource[];
}

const IMSLP_NOTE = 'Public domain or IMSLP-hosted score source; regional copyright status may vary.';

const isDirectScorePage = (value: string) => /\.(?:pdf|png|jpe?g|webp|svg)(?:[?#].*)?$/i.test(value.trim());

const scoreSource = (
  instrument: ScoreInstrument,
  role: ClassicalScoreRole,
  priority: ClassicalScorePriority,
  title: string,
  sourceUrl: string,
  options: {
    pages?: string[];
    sourceLabel?: string;
    licenseLabel?: string;
  } = {}
): ClassicalScoreSource => ({
  instrument,
  role,
  priority,
  title,
  format: 'pdf',
  pages: (options.pages ?? []).filter(isDirectScorePage),
  sourceLabel: options.sourceLabel ?? 'IMSLP',
  sourceUrl,
  licenseLabel: options.licenseLabel ?? IMSLP_NOTE
});

const note = (
  composer: string,
  workTitle: string,
  period: string,
  background: string,
  innerWeather: string,
  listeningGuide: string,
  emotionalThesis: string,
  sources: string[]
): ClassicalWorkNote => ({
  composer,
  workTitle,
  period,
  background,
  innerWeather,
  listeningGuide,
  emotionalThesis,
  sources
});

const genericPianoPoem = (
  composer: string,
  workTitle: string,
  period: string,
  sourceLabel: string
): ClassicalWorkNote =>
  note(
    composer,
    workTitle,
    period,
    `这首作品把一段私人时间收进清楚的形式里。谱面像一封没有寄出的信：音符很克制，情绪却没有躲开。`,
    `它的心境通常混着快乐、忧伤和清醒。左手或低声部托住时间，右手或旋律声部慢慢把话说出来，像在暗处给一盏灯留位置。`,
    `读谱时可以先看主题第一次出现的位置，再看它每一次回来时被怎样改变。真正值得停留的，往往是那些看似很小的和声转弯、停顿和呼吸。`,
    `它传递的是一种温柔的秩序感：世界未必变得轻松，但人可以把混乱暂时安放成一条可以继续走下去的线。`,
    [sourceLabel]
  );

const imslpWorkPage = (slug: string) => `https://imslp.org/wiki/${slug}`;

export const classicalCatalog: ClassicalCatalogEntry[] = [
  {
    id: 'chopin-nocturne-op9-no2',
    composer: 'Frederic Chopin',
    composerAliases: ['Frédéric Chopin', 'Fryderyk Chopin', 'Chopin', '肖邦', '弗里德里克 肖邦'],
    workTitle: 'Nocturne No. 2 in E-flat major',
    workAliases: [
      'Nocturne No. 2',
      'Nocturne in E Flat Major',
      'Nocturne in E-flat major',
      'Nocturne Op. 9 No. 2',
      'Nocturne Op.9 No.2',
      'E Flat Major',
      'E-flat Major',
      '降E大调夜曲',
      '夜曲第二首'
    ],
    catalogNumbers: ['Op. 9 No. 2', 'Op.9 No.2', 'Op. 9, No. 2', 'Op.9, No.2'],
    note: note(
      'Frederic Chopin',
      'Nocturne No. 2 in E-flat major, Op. 9 No. 2',
      'Romantic',
      '这首夜曲写在肖邦二十岁出头、刚离开波兰并逐渐在巴黎站稳脚跟的时期。旋律像一段被反复修饰的告白，越温柔，越显出离乡者对亲密与归属的渴望。',
      '肖邦在这里的心境很微妙：悲伤和明亮都被压低，只剩一种把不安包进礼貌里的清醒。左手像夜晚稳定的呼吸，右手则不断绕回同一句话。',
      '看钢琴谱时，可以先注意左手分解和弦怎样像摇篮一样维持时间，再看右手装饰音如何让旋律每次回归都带着新的犹豫。小提琴改编只是可选的歌唱性侧影，原谱才是它的家。',
      '它写的是人在异乡仍愿意保留柔软。世界不会因一段旋律改变，肖邦却把旋律写得足够体面、足够温存。',
      ['Wikimedia Commons / IMSLP first-edition scan', 'IMSLP Nocturnes listings']
    ),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Kistner first-edition piano score',
        'https://commons.wikimedia.org/wiki/File:Chopin_Nocturnes_Op_9_Kistner_First_Edition_1832.pdf',
        {
          pages: ['https://upload.wikimedia.org/wikipedia/commons/6/6b/Chopin_Nocturnes_Op_9_Kistner_First_Edition_1832.pdf'],
          sourceLabel: 'Wikimedia Commons / IMSLP'
        }
      ),
      scoreSource(
        'violin',
        'arrangement',
        'optional',
        'Violin and piano arrangement listing',
        imslpWorkPage('Nocturnes_(Chopin,_Fr%C3%A9d%C3%A9ric)')
      )
    ]
  },
  {
    id: 'chopin-nocturnes',
    composer: 'Frederic Chopin',
    composerAliases: ['Frédéric Chopin', 'Fryderyk Chopin', 'Chopin', '肖邦'],
    workTitle: 'Nocturnes',
    workAliases: [
      'Nocturne',
      'Nocturnes',
      'The Chopin Collection: The Nocturnes',
      '夜曲',
      '肖邦夜曲',
      'Nocturne No. 1',
      'Nocturne No. 3',
      'Nocturne No. 4',
      'Nocturne No. 5',
      'Nocturne No. 6',
      'Nocturne No. 7',
      'Nocturne No. 8',
      'Nocturne No. 9',
      'Nocturne No. 10',
      'Nocturne No. 11',
      'Nocturne No. 12',
      'Nocturne No. 13',
      'Nocturne No. 14',
      'Nocturne No. 15',
      'Nocturne No. 16',
      'Nocturne No. 17',
      'Nocturne No. 18',
      'Nocturne No. 19',
      'B Flat Minor',
      'B Major',
      'F Major',
      'F Sharp Major',
      'G Minor',
      'C Sharp Minor',
      'D Flat Major',
      'A Flat Major',
      'C Minor',
      'F-Sharp Minor',
      'F Minor',
      'E Minor'
    ],
    catalogNumbers: [
      'Op. 9 No. 1',
      'Op. 9 No. 3',
      'Op. 15 No. 1',
      'Op. 15 No. 2',
      'Op. 15 No. 3',
      'Op. 27 No. 1',
      'Op. 27 No. 2',
      'Op. 32 No. 1',
      'Op. 32 No. 2',
      'Op. 37 No. 1',
      'Op. 37 No. 2',
      'Op. 48 No. 1',
      'Op. 48 No. 2',
      'Op. 55 No. 1',
      'Op. 55 No. 2',
      'Op. 62 No. 1',
      'Op. 62 No. 2',
      'Op. 72 No. 1'
    ],
    note: genericPianoPoem(
      'Frederic Chopin',
      'Nocturnes',
      'Romantic',
      'IMSLP Nocturnes public-domain listings'
    ),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Public-domain Chopin Nocturnes score listing',
        imslpWorkPage('Nocturnes_(Chopin,_Fr%C3%A9d%C3%A9ric)')
      )
    ]
  },
  {
    id: 'bach-well-tempered-clavier-book-1',
    composer: 'Johann Sebastian Bach',
    composerAliases: ['J. S. Bach', 'Bach', 'Johann Sebastian Bach', '巴赫', '约翰 塞巴斯蒂安 巴赫'],
    workTitle: 'The Well-Tempered Clavier, Book I',
    workAliases: [
      'Well-Tempered Clavier I',
      'Well Tempered Clavier I',
      'The Well-Tempered Clavier I',
      'Das Wohltemperierte Klavier I',
      'Prelude',
      'Fugue',
      '平均律',
      '十二平均律',
      '十二平均律第一册',
      '巴赫平均律'
    ],
    catalogNumbers: Array.from({ length: 24 }, (_item, index) => String(846 + index)).flatMap((number) => [
      `BWV ${number}`,
      `BWV${number}`
    ]),
    note: note(
      'Johann Sebastian Bach',
      'The Well-Tempered Clavier, Book I, BWV 846-869',
      'Baroque',
      '这套前奏曲与赋格像一座为键盘写成的城市。巴赫在每一个调里搭出一种精神秩序：有的像清晨的窗，有的像严谨的拱门，有的像人在暗处仍保持步伐。',
      '它的心境来自长久工作的安静。巴赫把情绪藏进结构里，于是喜悦、忧虑、祈祷和清醒都不需要大声说话。',
      '读谱时可以把每首看成两种时间：前奏曲常常像身体的呼吸，赋格则像思想如何被一层层接住。主题进入的次序，就是音乐在空间里点灯的方式。',
      '它传递的是一种深沉的信任：混乱可以被聆听，复杂可以被整理，人的内心也可以在严格形式里找到自由。',
      ['IMSLP Well-Tempered Clavier listings']
    ),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Book I public-domain score listing',
        imslpWorkPage('The_Well-Tempered_Clavier_I,_BWV_846-869_(Bach,_Johann_Sebastian)')
      )
    ]
  },
  {
    id: 'bach-air-bwv-1068',
    composer: 'Johann Sebastian Bach',
    composerAliases: ['Bach', 'J. S. Bach', 'Johann Sebastian Bach', '巴赫', '约翰 塞巴斯蒂安 巴赫'],
    workTitle: 'Air from Orchestral Suite No. 3',
    workAliases: ['Air', 'Air on the G String', 'Orchestral Suite No. 3', 'G String', 'G弦之歌', 'G弦上的咏叹调'],
    catalogNumbers: ['BWV 1068', '1068'],
    note: note(
      'Johann Sebastian Bach',
      'Air from Orchestral Suite No. 3, BWV 1068',
      'Baroque',
      '这段旋律原本属于巴赫第三管弦乐组曲的慢乐章，后来被小提琴与钢琴改编反复带回人们身边。它的真实背景不在传奇里，而在巴赫那种近乎建筑学的耐心中。',
      '这里的心境并不炽烈，更像一个人把激动放低，把悲悯放稳。巴赫常让情感藏在秩序里，于是听者会感到一种奇妙的温柔。',
      '先听低声部怎样缓慢行走，再听上方旋律如何几乎不抬高音量却持续发光。小提琴版本适合看长线条，钢琴版本适合看和声的台阶。',
      '它传递一种成熟的停留。人并不总能解决命运，但可以把内心的波纹整理成一条还能继续前行的线。',
      ['IMSLP BWV 1068 listings']
    ),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Orchestral suite full-score listing',
        imslpWorkPage('Orchestral_Suite_No.3_in_D_major,_BWV_1068_(Bach,_Johann_Sebastian)')
      ),
      scoreSource(
        'violin',
        'arrangement',
        'optional',
        'Violin and piano arrangement listing',
        imslpWorkPage('Orchestral_Suite_No.3_in_D_major,_BWV_1068_(Bach,_Johann_Sebastian)')
      ),
      scoreSource(
        'piano',
        'arrangement',
        'optional',
        'Piano transcription listing',
        imslpWorkPage('Orchestral_Suite_No.3_in_D_major,_BWV_1068_(Bach,_Johann_Sebastian)')
      )
    ]
  },
  {
    id: 'beethoven-moonlight-op27-no2',
    composer: 'Ludwig van Beethoven',
    composerAliases: ['Beethoven', 'Ludwig van Beethoven', '贝多芬', '路德维希 范 贝多芬'],
    workTitle: 'Piano Sonata No. 14',
    workAliases: ['Moonlight Sonata', 'Piano Sonata No.14', 'Mondscheinsonate', '月光奏鸣曲'],
    catalogNumbers: ['Op. 27 No. 2', 'Op.27 No.2'],
    note: note(
      'Ludwig van Beethoven',
      'Piano Sonata No. 14 in C-sharp minor, Op. 27 No. 2',
      'Classical to early Romantic',
      '这首奏鸣曲写在贝多芬逐渐意识到听力危机的年代附近。“月光”来自后人的想象，更可靠的入口，是作品本身打破传统奏鸣曲开场方式：不先宣告，而先低声进入。',
      '它的心境像一封没有寄出的信。右手的分解和弦反复触摸同一处伤口；旋律压得很低，好像说得太响就会失去最后的尊严。',
      '钢琴谱里最值得看的是三连音如何持续铺底，旋律如何在这片流动中缓慢浮现。不要急着等高潮，第一乐章真正的力量就在克制。',
      '它传递的是人在孤独中仍然保持形式的努力。悲伤没有被戏剧化，而是被放进时间里，成为一种清醒的陪伴。',
      ['IMSLP Op. 27 No. 2 listings']
    ),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Original piano sonata score listing',
        imslpWorkPage('Piano_Sonata_No.14,_Op.27_No.2_(Beethoven,_Ludwig_van)')
      )
    ]
  },
  {
    id: 'debussy-clair-de-lune',
    composer: 'Claude Debussy',
    composerAliases: ['Debussy', 'Claude Debussy', '德彪西', '克洛德 德彪西'],
    workTitle: 'Clair de lune',
    workAliases: ['Suite bergamasque', 'Clair de lune', '月光', '月光曲', '亚麻色头发的少女'],
    catalogNumbers: ['L. 75', 'CD 82'],
    note: note(
      'Claude Debussy',
      'Clair de lune from Suite bergamasque',
      'Impressionist',
      '《月光》来自德彪西的《贝加莫组曲》。它与其说是在描写月亮，不如说是在描写月光落到记忆表面的方式。和声像雾一样移动，边界并不消失，只是变得柔软。',
      '这首曲子的心境有一种晚来的温柔：不急于命名幸福，也不急于解释忧伤。它像一个人安静下来，看见往事并不只剩疼痛。',
      '钢琴谱里可以看踏板感和琶音如何制造漂浮感。旋律常常绕开直线，在光线里转身，像水面上被风轻轻推开的倒影。',
      '它传递的感情是“世界没有回答我，但我仍愿意凝视”。这种凝视让孤独变得澄明，也让温柔不再显得软弱。',
      ['IMSLP Suite bergamasque listings']
    ),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Original piano score listing',
        imslpWorkPage('Suite_bergamasque_(Debussy,_Claude)')
      )
    ]
  },
  {
    id: 'mozart-eine-kleine-nachtmusik-k525',
    composer: 'Wolfgang Amadeus Mozart',
    composerAliases: ['Mozart', 'Wolfgang Amadeus Mozart', '莫扎特', '沃尔夫冈 阿马德乌斯 莫扎特'],
    workTitle: 'Eine kleine Nachtmusik',
    workAliases: ['Serenade No. 13', 'Eine kleine Nachtmusik', '小夜曲', '弦乐小夜曲'],
    catalogNumbers: ['K. 525', 'K525'],
    note: note(
      'Wolfgang Amadeus Mozart',
      'Serenade No. 13 in G major, K. 525',
      'Classical',
      '这首小夜曲写于莫扎特维也纳时期，表面明朗，结构却异常精确。它像一盏被擦亮的灯，把社交、夜晚和私人愉悦都放进清晰的古典比例里。',
      '莫扎特在这里把复杂心事暂时收进优雅秩序。那种轻盈并不否认阴影，只是选择用明亮的步伐从阴影旁边经过。',
      '小提琴声部适合看主题怎样被清楚地提出、回答、再展开；钢琴改编则能看到和声骨架如何让每一次转身都显得自然。',
      '它传递的是明亮并不浅薄。真正的轻盈需要很深的控制，像一个人在夜色里仍然愿意保持礼貌、速度和笑意。',
      ['IMSLP K. 525 listings']
    ),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'String serenade full-score listing',
        imslpWorkPage('Eine_kleine_Nachtmusik,_K.525_(Mozart,_Wolfgang_Amadeus)')
      ),
      scoreSource(
        'piano',
        'arrangement',
        'optional',
        'Piano arrangement listing',
        imslpWorkPage('Eine_kleine_Nachtmusik,_K.525_(Mozart,_Wolfgang_Amadeus)')
      )
    ]
  },
  {
    id: 'vivaldi-spring-rv269',
    composer: 'Antonio Vivaldi',
    composerAliases: ['Vivaldi', 'Antonio Vivaldi', '维瓦尔第', '安东尼奥 维瓦尔第'],
    workTitle: 'The Four Seasons: Spring',
    workAliases: ['Spring', 'La primavera', 'The Four Seasons', 'Four Seasons', '四季 春', '春'],
    catalogNumbers: ['RV 269', 'Op. 8 No. 1'],
    note: note(
      'Antonio Vivaldi',
      'Violin Concerto in E major, RV 269, La primavera',
      'Baroque',
      '《春》属于维瓦尔第《四季》小提琴协奏曲组，是巴洛克标题音乐最鲜明的入口之一。它把鸟鸣、溪水、雷声和舞蹈都写进弦乐语言里。',
      '维瓦尔第的心境在这里明亮而敏捷，像推开窗的一瞬间。欢喜有身体感，带着流动、回声和答复。',
      '小提琴谱里可以看独奏声部如何模仿鸟鸣与闪电，乐队如何像土地一样托住这些跃动。钢琴缩谱则适合观察主题如何被压缩成清晰的和声骨架。',
      '它传递的是复苏：春天让世界再次给出开始的可能。',
      ['IMSLP Le quattro stagioni listings']
    ),
    scores: [
      scoreSource(
        'violin',
        'original',
        'preferred',
        'Violin concerto score listing',
        imslpWorkPage('Le_quattro_stagioni,_Op.8_(Vivaldi,_Antonio)')
      ),
      scoreSource(
        'piano',
        'reduction',
        'optional',
        'Piano reduction listing',
        imslpWorkPage('Le_quattro_stagioni,_Op.8_(Vivaldi,_Antonio)')
      )
    ]
  },
  {
    id: 'beethoven-violin-concerto-op61',
    composer: 'Ludwig van Beethoven',
    composerAliases: ['Beethoven', 'Ludwig van Beethoven', '贝多芬'],
    workTitle: 'Violin Concerto in D major',
    workAliases: ['Violin Concerto', 'Violin Concerto in D', '小提琴协奏曲', 'D大调小提琴协奏曲'],
    catalogNumbers: ['Op. 61', 'Op.61'],
    note: note(
      'Ludwig van Beethoven',
      'Violin Concerto in D major, Op. 61',
      'Classical to early Romantic',
      '这首协奏曲带着耐心展开的信任。乐队先给出朴素的脉搏，小提琴慢慢进入，把世界一点点说亮。',
      '贝多芬在这里的心境有一种宽阔的温柔。它不急着证明力量，而是把力量放进长线条、等待和回应里。',
      '读谱时先看定音鼓式的开头动机如何贯穿全曲，再看独奏小提琴怎样在高处保持克制。难处不只在音符多，也在怎样让光不刺眼。',
      '它传递的是成熟的勇气：面对命运时，仍然保持明亮、耐心和完整的呼吸。',
      ['IMSLP Op. 61 listings']
    ),
    scores: [
      scoreSource(
        'violin',
        'original',
        'preferred',
        'Violin concerto full score and parts listing',
        imslpWorkPage('Violin_Concerto,_Op.61_(Beethoven,_Ludwig_van)')
      )
    ]
  },
  {
    id: 'mendelssohn-violin-concerto-op64',
    composer: 'Felix Mendelssohn',
    composerAliases: ['Mendelssohn', 'Felix Mendelssohn', '门德尔松'],
    workTitle: 'Violin Concerto in E minor',
    workAliases: ['Violin Concerto', 'Violin Concerto in E Minor', 'E minor violin concerto', '小提琴协奏曲', 'e小调小提琴协奏曲'],
    catalogNumbers: ['Op. 64', 'Op.64'],
    note: note(
      'Felix Mendelssohn',
      'Violin Concerto in E minor, Op. 64',
      'Romantic',
      '门德尔松这首协奏曲从第一秒就让小提琴说话，像把迟到很久的心事直接放到空气里。它精致、清澈，却并不轻薄。',
      '这里的心境像年轻人已经懂得忧伤，但仍愿意相信优雅。旋律流动得很自然，背后却有极严密的结构在托住。',
      '读谱时注意第一乐章独奏如何几乎不等待铺垫就进入，以及华彩乐段怎样被嵌进乐章内部。这种设计让情绪像一条没有断开的河。',
      '它传递的是清澈的热情：人可以敏感，却不必破碎；可以急切，却仍然保持形式的光泽。',
      ['IMSLP Op. 64 listings']
    ),
    scores: [
      scoreSource(
        'violin',
        'original',
        'preferred',
        'Violin concerto score listing',
        imslpWorkPage('Violin_Concerto,_Op.64_(Mendelssohn,_Felix)')
      )
    ]
  },
  {
    id: 'tchaikovsky-violin-concerto-op35',
    composer: 'Pyotr Ilyich Tchaikovsky',
    composerAliases: ['Tchaikovsky', 'Pyotr Ilyich Tchaikovsky', '柴可夫斯基', '柴可夫斯基Tchaikovsky'],
    workTitle: 'Violin Concerto in D major',
    workAliases: ['Violin Concerto', 'Violin Concerto in D', '小提琴协奏曲', 'D大调小提琴协奏曲'],
    catalogNumbers: ['Op. 35', 'Op.35', 'TH 59'],
    note: note(
      'Pyotr Ilyich Tchaikovsky',
      'Violin Concerto in D major, Op. 35',
      'Romantic',
      '这首协奏曲写在柴可夫斯基生命中既脆弱又重新发光的阶段。它像从阴影里突然打开的窗，旋律带着俄罗斯式的宽阔，也带着近乎危险的坦白。',
      '它的心境不平稳，却一直渴望奔跑。小提琴在高处歌唱时，热情几乎藏不住。',
      '读谱时可以看第一乐章主题怎样越唱越开阔，第二乐章怎样把伤感收成亲密的低语，终乐章又如何用舞蹈感把生命推回地面。',
      '它传递的是复活后的热烈：痛苦没有消失，但身体重新记起了速度、色彩和向前的冲动。',
      ['IMSLP Op. 35 listings']
    ),
    scores: [
      scoreSource(
        'violin',
        'original',
        'preferred',
        'Violin concerto score listing',
        imslpWorkPage('Violin_Concerto,_Op.35_(Tchaikovsky,_Pyotr)')
      )
    ]
  },
  {
    id: 'brahms-violin-concerto-op77',
    composer: 'Johannes Brahms',
    composerAliases: ['Brahms', 'Johannes Brahms', '勃拉姆斯'],
    workTitle: 'Violin Concerto in D major',
    workAliases: ['Violin Concerto', 'Violin Concerto in D Major', '小提琴协奏曲', 'D大调小提琴协奏曲'],
    catalogNumbers: ['Op. 77', 'Op.77'],
    note: note(
      'Johannes Brahms',
      'Violin Concerto in D major, Op. 77',
      'Romantic',
      '勃拉姆斯的协奏曲让小提琴和乐队共同承担一座很重、很温暖的建筑。',
      '它的心境深沉而诚实。情感不急着外露，却在每一次和声转身里留下重量，像一个人把爱说得很慢，因为每个字都是真的。',
      '读谱时注意独奏与乐队如何彼此交托，尤其第一乐章的长线条怎样保持呼吸。这里的难，不只在技巧，也在气质。',
      '它传递的是厚重的信任：亲密会经过复杂、迟疑和沉默，最后仍然愿意回应。',
      ['IMSLP Op. 77 listings']
    ),
    scores: [
      scoreSource(
        'violin',
        'original',
        'preferred',
        'Violin concerto score listing',
        imslpWorkPage('Violin_Concerto,_Op.77_(Brahms,_Johannes)')
      )
    ]
  },
  {
    id: 'bach-goldberg-variations-bwv988',
    composer: 'Johann Sebastian Bach',
    composerAliases: ['J. S. Bach', 'Bach', 'Johann Sebastian Bach', '巴赫'],
    workTitle: 'Goldberg Variations',
    workAliases: ['Goldberg Variations', 'Goldberg-Variationen', 'Goldberg', '哥德堡变奏曲', '哥德堡'],
    catalogNumbers: ['BWV 988', '988'],
    note: note(
      'Johann Sebastian Bach',
      'Goldberg Variations, BWV 988',
      'Baroque',
      '《哥德堡变奏曲》像一座夜里仍然亮着灯的房子。一个咏叹调被三十次重新观看，同一条低音之上长出许多种人生。',
      '巴赫的心境在这里宁静而辽阔。他把复杂想法放进秩序，让不安可以坐下来。',
      '读谱时先看 Aria 的低音骨架，再看每三首一组的卡农如何逐渐升高。变奏不断回到主题，也不断发现主题还没有说完。',
      '它传递的是耐心的哲学：人并不需要每次都重新开始，有时只要回到同一条线，换一种光照它。',
      ['IMSLP BWV 988 listings']
    ),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Keyboard score',
        imslpWorkPage('Goldberg_Variations,_BWV_988_(Bach,_Johann_Sebastian)'),
        {
          pages: ['https://vmirror.imslp.org/files/imglnks/usimg/4/49/IMSLP229423-PMLP02982-js-bach-goldberg-variations.pdf']
        }
      )
    ]
  },
  {
    id: 'schubert-standchen-d957',
    composer: 'Franz Schubert',
    composerAliases: ['Schubert', 'Franz Schubert', '舒伯特'],
    workTitle: 'Ständchen from Schwanengesang',
    workAliases: ['Ständchen', 'Standchen', 'Serenade', 'Schwanengesang', '小夜曲'],
    catalogNumbers: ['D. 957', 'D957'],
    note: genericPianoPoem('Franz Schubert', 'Ständchen from Schwanengesang, D. 957', 'Romantic', 'IMSLP D.957 listings'),
    scores: [
      scoreSource(
        'voice',
        'original',
        'preferred',
        'Song score listing',
        imslpWorkPage('Schwanengesang,_D.957_(Schubert,_Franz)')
      ),
      scoreSource(
        'violin',
        'arrangement',
        'optional',
        'Violin arrangement PDF',
        imslpWorkPage('Schwanengesang,_D.957_(Schubert,_Franz)'),
        {
          pages: ['https://s9.imslp.org/files/imglnks/usimg/4/48/IMSLP604440-PMLP2204-Staendchen-trio-score.pdf']
        }
      )
    ]
  },
  {
    id: 'strauss-also-sprach-zarathustra-op30',
    composer: 'Richard Strauss',
    composerAliases: ['Richard Strauss', 'Strauss, Richard', '理查德 施特劳斯'],
    workTitle: 'Also sprach Zarathustra',
    workAliases: ['Also sprach Zarathustra', 'Thus Spoke Zarathustra', 'Zarathustra', '查拉图斯特拉如是说'],
    catalogNumbers: ['Op. 30', 'Op.30', 'TrV 176'],
    note: note(
      'Richard Strauss',
      'Also sprach Zarathustra, Op. 30, TrV 176',
      'Late Romantic',
      '这部音诗从日出的巨大和弦开始，随后把人的目光推向宇宙、知识和孤独。',
      '它的心境宏大，却带着不安。铜管像把天空推开，低音像地面仍在震动；人在其中既渺小，又无法放弃追问。',
      '读总谱时可以看开头 C-G-C 的自然音列怎样建立宇宙感，再看不同段落如何用配器制造哲学辩论般的光影。',
      '它传递的是仰望时的震动：人不一定得到答案，但会在追问中被重新塑形。',
      ['IMSLP Op.30 listings']
    ),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Full score',
        imslpWorkPage('Also_sprach_Zarathustra,_Op.30_(Strauss,_Richard)'),
        {
          pages: ['https://s9.imslp.org/files/imglnks/usimg/e/e4/IMSLP903365-PMLP12187-Also_Sprach_Zarathustra.pdf']
        }
      )
    ]
  },
  {
    id: 'schumann-kinderszenen-op15',
    composer: 'Robert Schumann',
    composerAliases: ['Schumann', 'Robert Schumann', '舒曼'],
    workTitle: 'Kinderszenen',
    workAliases: ['Kinderszenen', 'Scenes from Childhood', 'Träumerei', 'Traumerei', '梦幻曲', '童年情景'],
    catalogNumbers: ['Op. 15', 'Op.15'],
    note: genericPianoPoem('Robert Schumann', 'Kinderszenen, Op. 15', 'Romantic', 'IMSLP Op.15 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano cycle score listing',
        imslpWorkPage('Kinderszenen,_Op.15_(Schumann,_Robert)')
      )
    ]
  },
  {
    id: 'tchaikovsky-seasons-june-barcarolle',
    composer: 'Pyotr Ilyich Tchaikovsky',
    composerAliases: ['Tchaikovsky', 'Pyotr Ilyich Tchaikovsky', '柴可夫斯基'],
    workTitle: 'The Seasons: June, Barcarolle',
    workAliases: ['The Seasons', 'Les saisons', 'June', 'Barcarolle', 'June: Barcarolle', '六月 船歌', '船歌'],
    catalogNumbers: ['Op. 37a', 'Op. 37b', 'Op.37a', 'Op.37b', 'TH 135'],
    note: genericPianoPoem('Pyotr Ilyich Tchaikovsky', 'The Seasons: June, Barcarolle', 'Romantic', 'IMSLP The Seasons listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Original piano cycle listing',
        imslpWorkPage('The_Seasons,_Op.37a_(Tchaikovsky,_Pyotr)')
      )
    ]
  },
  {
    id: 'dvorak-symphony-9-op95',
    composer: 'Antonin Dvorak',
    composerAliases: ['Antonín Dvořák', 'Antonin Dvorak', 'Dvořák', 'Dvorak', '德沃夏克'],
    workTitle: 'Symphony No. 9 From the New World',
    workAliases: ['Symphony No.9', 'Symphony No. 9', 'From the New World', 'New World Symphony', '自新大陆', '新世界交响曲'],
    catalogNumbers: ['Op. 95', 'Op.95', 'B. 178'],
    note: note(
      'Antonin Dvorak',
      'Symphony No. 9 in E minor, Op. 95, From the New World',
      'Romantic',
      '《自新大陆》写在德沃夏克旅居美国期间。陌生土地、故乡记忆和新的节奏在同一个胸腔里回响。',
      '它的心境宽广而思乡。铜管和弦乐有开阔的地平线，木管旋律却常常像人在夜里想起故乡。',
      '读总谱时看主题如何在不同声部间迁移，尤其终乐章怎样把前面乐章的记忆重新召回。',
      '它传递的是离开之后的完整：人走得越远，越会发现心里仍有一条回声的路。',
      ['IMSLP Op.95 listings']
    ),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Full score listing',
        imslpWorkPage('Symphony_No.9,_Op.95_(Dvo%C5%99%C3%A1k,_Anton%C3%ADn)')
      )
    ]
  },
  {
    id: 'pachelbel-canon-p37',
    composer: 'Johann Pachelbel',
    composerAliases: ['Pachelbel', 'Johann Pachelbel', '帕赫贝尔'],
    workTitle: 'Canon and Gigue in D major',
    workAliases: ['Canon in D', 'Canon', 'Pachelbel Canon', '卡农', 'D大调卡农'],
    catalogNumbers: ['P. 37', 'P37'],
    note: genericPianoPoem('Johann Pachelbel', 'Canon and Gigue in D major, P. 37', 'Baroque', 'IMSLP P.37 listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Canon full score listing',
        imslpWorkPage('Canon_and_Gigue_in_D_major,_P.37_(Pachelbel,_Johann)')
      )
    ]
  },
  {
    id: 'elgar-salut-damour-op12',
    composer: 'Edward Elgar',
    composerAliases: ['Elgar', 'Edward Elgar', '埃尔加'],
    workTitle: "Salut d'amour",
    workAliases: ["Salut D'amour", "Salut d'amour", "Salut d’Amour", 'Love’s Greeting', 'Liebesgruss', '爱的礼赞', '爱之礼赞'],
    catalogNumbers: ['Op. 12', 'Op.12'],
    note: genericPianoPoem('Edward Elgar', "Salut d'amour, Op. 12", 'Romantic', 'IMSLP Op.12 listings'),
    scores: [
      scoreSource(
        'violin',
        'original',
        'preferred',
        'Violin and piano score',
        imslpWorkPage('Salut_d%27amour,_Op.12_(Elgar,_Edward)'),
        {
          pages: ["https://s9.imslp.org/files/imglnks/usimg/1/11/IMSLP558533-PMLP03415-Elgar_Salut_d'Amour_vn_%26_pno_in_E_Score.pdf"]
        }
      )
    ]
  },
  {
    id: 'satie-gymnopedie-no1',
    composer: 'Erik Satie',
    composerAliases: ['Satie', 'Erik Satie', '萨蒂'],
    workTitle: 'Gymnopedie No. 1',
    workAliases: ['Gymnopedie', 'Gymnopédie', 'Gymnopedies 1', 'Gymnopédie No. 1', '吉诺佩蒂', '裸体歌舞'],
    catalogNumbers: ['No. 1', 'No.1'],
    note: genericPianoPoem('Erik Satie', 'Gymnopedie No. 1', 'Modern / French minimal clarity', 'IMSLP Gymnopedies listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano score',
        imslpWorkPage('Gymnop%C3%A9dies_(Satie,_Erik)'),
        {
          pages: ['https://s9.imslp.org/files/imglnks/usimg/6/62/IMSLP454372-PMLP04215-Gymnopedie_No.1.pdf']
        }
      )
    ]
  },
  {
    id: 'liszt-liebestraum-no3',
    composer: 'Franz Liszt',
    composerAliases: ['Liszt', 'Franz Liszt', '李斯特'],
    workTitle: 'Liebestraum No. 3',
    workAliases: ['Liebestraum', 'Liebesträume', '爱之梦'],
    catalogNumbers: ['S. 541', 'S541', 'No. 3', 'No.3'],
    note: genericPianoPoem('Franz Liszt', 'Liebestraum No. 3, S. 541/3', 'Romantic', 'IMSLP S.541 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano score listing',
        imslpWorkPage('Liebestr%C3%A4ume,_S.541_(Liszt,_Franz)')
      )
    ]
  },
  {
    id: 'beethoven-pathetique-op13',
    composer: 'Ludwig van Beethoven',
    composerAliases: ['Beethoven', 'Ludwig van Beethoven', '贝多芬'],
    workTitle: 'Piano Sonata No. 8 Pathetique',
    workAliases: ['Pathétique', 'Pathetique', 'Piano Sonata No.8', 'Piano Sonata No. 8', '悲怆奏鸣曲'],
    catalogNumbers: ['Op. 13', 'Op.13'],
    note: genericPianoPoem('Ludwig van Beethoven', 'Piano Sonata No. 8 in C minor, Op. 13, Pathetique', 'Classical to early Romantic', 'IMSLP Op.13 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'First-edition piano sonata score',
        imslpWorkPage('Piano_Sonata_No.8,_Op.13_(Beethoven,_Ludwig_van)'),
        {
          pages: ['https://vmirror.imslp.org/files/imglnks/usimg/c/c1/IMSLP50958-PMLP01410-Op.13.pdf']
        }
      )
    ]
  },
  {
    id: 'beethoven-fur-elise-woo59',
    composer: 'Ludwig van Beethoven',
    composerAliases: ['Beethoven', 'Ludwig van Beethoven', '贝多芬'],
    workTitle: 'Fur Elise',
    workAliases: ['Für Elise', 'Fur Elise', 'Bagatelle in A minor', '致艾丽丝', '致爱丽丝'],
    catalogNumbers: ['WoO 59', 'WoO59'],
    note: genericPianoPoem('Ludwig van Beethoven', 'Bagatelle in A minor, WoO 59, Fur Elise', 'Classical to early Romantic', 'IMSLP WoO 59 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano score listing',
        imslpWorkPage('F%C3%BCr_Elise,_WoO_59_(Beethoven,_Ludwig_van)')
      )
    ]
  },
  {
    id: 'brahms-hungarian-dance-no5',
    composer: 'Johannes Brahms',
    composerAliases: ['Brahms', 'Johannes Brahms', '勃拉姆斯'],
    workTitle: 'Hungarian Dance No. 5',
    workAliases: ['Hungarian Dance No.5', 'Hungarian Dance No. 5', '匈牙利舞曲第五号', '匈牙利舞曲'],
    catalogNumbers: ['WoO 1 No.5', 'WoO 1 No. 5'],
    note: genericPianoPoem('Johannes Brahms', 'Hungarian Dance No. 5', 'Romantic', 'IMSLP Hungarian Dances listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Orchestral score',
        imslpWorkPage('Hungarian_Dances,_WoO_1_(Brahms,_Johannes)'),
        {
          pages: ['https://s9.imslp.org/files/imglnks/usimg/2/2f/IMSLP319798-PMLP16016-Hungarian_Dance_No_5_Score.pdf']
        }
      )
    ]
  },
  {
    id: 'johann-strauss-blue-danube-op314',
    composer: 'Johann Strauss II',
    composerAliases: ['Johann Strauss', 'Strauss Jr.', 'Johann Strauss II', '小约翰 施特劳斯'],
    workTitle: 'The Blue Danube',
    workAliases: ['An der schönen blauen Donau', 'Blue Danube', '蓝色多瑙河', '蓝色多瑙河圆舞曲'],
    catalogNumbers: ['Op. 314', 'Op.314'],
    note: genericPianoPoem('Johann Strauss II', 'The Blue Danube, Op. 314', 'Romantic / Viennese waltz', 'IMSLP Op.314 listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Waltz full score listing',
        imslpWorkPage('The_Blue_Danube_(Strauss_Jr.,_Johann)')
      )
    ]
  },
  {
    id: 'grieg-peer-gynt-morning-mood-op46',
    composer: 'Edvard Grieg',
    composerAliases: ['Grieg', 'Edvard Grieg', '格里格'],
    workTitle: 'Peer Gynt Suite No. 1: Morning Mood',
    workAliases: ['Peer Gynt', 'Morning Mood', 'Morning', '晨景', '清晨'],
    catalogNumbers: ['Op. 46', 'Op.46'],
    note: genericPianoPoem('Edvard Grieg', 'Peer Gynt Suite No. 1: Morning Mood, Op. 46', 'Romantic', 'IMSLP Op.46 listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Peer Gynt Suite No. 1 listing',
        imslpWorkPage('Peer_Gynt_Suite_No.1_Op.46_(Grieg,_Edvard)')
      )
    ]
  },
  {
    id: 'tchaikovsky-nutcracker-suite-op71a',
    composer: 'Pyotr Ilyich Tchaikovsky',
    composerAliases: ['Tchaikovsky', 'Pyotr Ilyich Tchaikovsky', '柴可夫斯基'],
    workTitle: 'The Nutcracker Suite',
    workAliases: ['Nutcracker Suite', 'The Nutcracker', '胡桃夹子', '胡桃匣子'],
    catalogNumbers: ['Op. 71a', 'Op.71a', 'TH 35'],
    note: genericPianoPoem('Pyotr Ilyich Tchaikovsky', 'The Nutcracker Suite, Op. 71a', 'Romantic', 'IMSLP Op.71a listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Suite full score',
        imslpWorkPage('The_Nutcracker_(suite),_Op.71a_(Tchaikovsky,_Pyotr)'),
        {
          pages: ['https://vmirror.imslp.org/files/imglnks/usimg/8/83/IMSLP263374-PMLP03607-The_Nutcracker_Suite.pdf']
        }
      )
    ]
  },
  {
    id: 'dvorak-humoresque-op101-no7',
    composer: 'Antonin Dvorak',
    composerAliases: ['Antonín Dvořák', 'Antonin Dvorak', 'Dvořák', 'Dvorak', '德沃夏克'],
    workTitle: 'Humoresque No. 7',
    workAliases: ['Humoresque', 'Humoresques', 'Poco lento e grazioso', '幽默曲'],
    catalogNumbers: ['Op. 101', 'Op.101', 'B. 187', 'No. 7', 'No.7'],
    note: genericPianoPoem('Antonin Dvorak', 'Humoresque No. 7, Op. 101', 'Romantic', 'IMSLP Op.101 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano score listing',
        imslpWorkPage('8_Humoresques,_Op.101_(Dvo%C5%99%C3%A1k,_Anton%C3%ADn)')
      )
    ]
  },
  {
    id: 'boccherini-minuet-g275',
    composer: 'Luigi Boccherini',
    composerAliases: ['Boccherini', 'Luigi Boccherini', '鲍凯里尼'],
    workTitle: 'String Quintet in E major: Minuet',
    workAliases: ['Boccherini - Minuet', 'Minuet', 'Menuet', '小步舞曲'],
    catalogNumbers: ['G. 275', 'G275', 'Op. 11 No. 5', 'Op.11 No.5'],
    note: genericPianoPoem('Luigi Boccherini', 'String Quintet in E major, G. 275: Minuet', 'Classical', 'IMSLP G.275 listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'String quintet score listing',
        imslpWorkPage('String_Quintet_in_E_major,_G.275_(Boccherini,_Luigi)')
      )
    ]
  },
  {
    id: 'petzold-minuet-bwv-anh114',
    composer: 'Christian Petzold',
    composerAliases: ['Petzold', 'Christian Petzold', 'Johann Sebastian Bach', 'Bach', '巴赫', '佩措尔德'],
    workTitle: 'Minuet in G major',
    workAliases: ['Minuet in G', 'Minuet in G Major', 'D大调小步舞曲', 'G大调小步舞曲', '小步舞曲', 'Menuet D major', 'Menuet'],
    catalogNumbers: ['BWV Anh. 114', 'BWV Anh 114', 'Anh. 114'],
    note: note(
      'Christian Petzold',
      'Minuet in G major, BWV Anh. 114',
      'Baroque',
      '这首小步舞曲长期被归在巴赫的家庭笔记本里，后来更可靠地指向佩措尔德。它的魅力不在宏大，而在一小段家庭音乐怎样保存了日常的端正与微笑。',
      '它的心境像干净桌面上的烛光：简单、礼貌、不过分解释，却让人知道生活仍有可被整理的节拍。',
      '读谱时看左右手如何用最少的材料保持舞步，尤其乐句结束处的小停顿，像一次很轻的点头。',
      '它传递的是小形式里的安稳。有些美不需要巨大，只要准时、清楚、温和地出现。',
      ['IMSLP / Anna Magdalena Bach notebook references']
    ),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Notebook score reference',
        imslpWorkPage('Minuet_in_G_major,_BWV_Anh.114_(Petzold,_Christian)')
      )
    ]
  },
  {
    id: 'beethoven-minuet-woo10-no2',
    composer: 'Ludwig van Beethoven',
    composerAliases: ['Beethoven', 'Ludwig van Beethoven', '贝多芬'],
    workTitle: 'Minuet in G major',
    workAliases: ['Minuet in G', 'Minuet in G Major', 'Minuet', '小步舞曲', 'G大调小步舞曲'],
    catalogNumbers: ['WoO 10 No. 2', 'WoO 10', 'WoO10'],
    note: genericPianoPoem('Ludwig van Beethoven', 'Minuet in G major, WoO 10 No. 2', 'Classical', 'IMSLP WoO 10 listings'),
    scores: [
      scoreSource(
        'piano',
        'reduction',
        'preferred',
        'Piano arrangement source listing',
        imslpWorkPage('6_Minuets,_WoO_10_(Beethoven,_Ludwig_van)')
      )
    ]
  },
  {
    id: 'offenbach-orpheus-overture',
    composer: 'Jacques Offenbach',
    composerAliases: ['Offenbach', 'Jacques Offenbach', '奥芬巴赫'],
    workTitle: 'Orpheus in the Underworld Overture',
    workAliases: ['Orpheus in the Underworld', 'Orphée aux enfers', 'Orpheus', '地狱中的奥菲欧'],
    catalogNumbers: [],
    note: genericPianoPoem('Jacques Offenbach', 'Orpheus in the Underworld Overture', 'Romantic / operetta', 'IMSLP Orphée aux enfers listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Overture full score',
        imslpWorkPage('Orph%C3%A9e_aux_enfers_(Offenbach,_Jacques)'),
        {
          pages: ['https://vmirror.imslp.org/files/imglnks/usimg/b/be/IMSLP170833-PMLP24816-Offenbach_Orpheus_Overture_Full_Score.pdf']
        }
      )
    ]
  },
  {
    id: 'mozart-piano-sonata-k331',
    composer: 'Wolfgang Amadeus Mozart',
    composerAliases: ['Mozart', 'Wolfgang Amadeus Mozart', '莫扎特'],
    workTitle: 'Piano Sonata No. 11',
    workAliases: ['Piano Sonata No.11', 'Piano Sonata No. 11', 'Alla Turca', 'Turkish March', '土耳其进行曲'],
    catalogNumbers: ['K. 331', 'K331'],
    note: genericPianoPoem('Wolfgang Amadeus Mozart', 'Piano Sonata No. 11 in A major, K. 331', 'Classical', 'IMSLP K.331 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano sonata score listing',
        imslpWorkPage('Piano_Sonata_No.11_in_A_major,_K.331/300i_(Mozart,_Wolfgang_Amadeus)')
      )
    ]
  },
  {
    id: 'mozart-piano-sonata-k330',
    composer: 'Wolfgang Amadeus Mozart',
    composerAliases: ['Mozart', 'Wolfgang Amadeus Mozart', '莫扎特'],
    workTitle: 'Piano Sonata No. 10',
    workAliases: ['Piano Sonata No.10', 'Piano Sonata No. 10'],
    catalogNumbers: ['K. 330', 'K330'],
    note: genericPianoPoem('Wolfgang Amadeus Mozart', 'Piano Sonata No. 10 in C major, K. 330', 'Classical', 'IMSLP K.330 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano sonata score listing',
        imslpWorkPage('Piano_Sonata_No.10_in_C_major,_K.330/300h_(Mozart,_Wolfgang_Amadeus)')
      )
    ]
  },
  {
    id: 'mozart-piano-sonata-k545',
    composer: 'Wolfgang Amadeus Mozart',
    composerAliases: ['Mozart', 'Wolfgang Amadeus Mozart', '莫扎特'],
    workTitle: 'Piano Sonata No. 16 Sonata facile',
    workAliases: ['Piano Sonata No.16', 'Piano Sonata No. 16', 'Sonata facile', 'Sonata Facile'],
    catalogNumbers: ['K. 545', 'K545'],
    note: genericPianoPoem('Wolfgang Amadeus Mozart', 'Piano Sonata No. 16 in C major, K. 545', 'Classical', 'IMSLP K.545 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano sonata score listing',
        imslpWorkPage('Piano_Sonata_No.16_in_C_major,_K.545_(Mozart,_Wolfgang_Amadeus)')
      )
    ]
  },
  {
    id: 'mozart-magic-flute-queen-aria',
    composer: 'Wolfgang Amadeus Mozart',
    composerAliases: ['Mozart', 'Wolfgang Amadeus Mozart', '莫扎特'],
    workTitle: 'The Magic Flute: Queen of the Night aria',
    workAliases: ['The Magic Flute', 'Queen of the Night', 'Aria N° 14', '魔笛', '夜后咏叹调'],
    catalogNumbers: ['K. 620', 'K620'],
    note: genericPianoPoem('Wolfgang Amadeus Mozart', 'The Magic Flute, K. 620: Queen of the Night aria', 'Classical', 'IMSLP K.620 listings'),
    scores: [
      scoreSource(
        'voice',
        'original',
        'preferred',
        'Opera vocal/full score listing',
        imslpWorkPage('Die_Zauberfl%C3%B6te,_K.620_(Mozart,_Wolfgang_Amadeus)')
      )
    ]
  },
  {
    id: 'bach-jesu-joy-bwv147',
    composer: 'Johann Sebastian Bach',
    composerAliases: ['J. S. Bach', 'Bach', 'Johann Sebastian Bach', '巴赫'],
    workTitle: "Jesu, Joy of Man's Desiring",
    workAliases: ['Jesu, Joy of Man', 'Jesus bleibet meine Freude', 'Herz und Mund und Tat und Leben', '主耶稣是我心所慕'],
    catalogNumbers: ['BWV 147', '147'],
    note: genericPianoPoem('Johann Sebastian Bach', "Jesu, Joy of Man's Desiring, BWV 147", 'Baroque', 'IMSLP BWV 147 listings'),
    scores: [
      scoreSource(
        'voice',
        'original',
        'preferred',
        'Cantata score listing',
        imslpWorkPage('Herz_und_Mund_und_Tat_und_Leben,_BWV_147_(Bach,_Johann_Sebastian)')
      )
    ]
  },
  {
    id: 'bach-cello-suite-1-bwv1007',
    composer: 'Johann Sebastian Bach',
    composerAliases: ['J. S. Bach', 'Bach', 'Johann Sebastian Bach', '巴赫'],
    workTitle: 'Cello Suite No. 1',
    workAliases: ['Cello Suite No. 1', 'Unaccompanied Cello Suite No. 1', 'Cello Suite No.1', '大提琴无伴奏组曲'],
    catalogNumbers: ['BWV 1007', '1007'],
    note: genericPianoPoem('Johann Sebastian Bach', 'Cello Suite No. 1 in G major, BWV 1007', 'Baroque', 'IMSLP BWV 1007 listings'),
    scores: [
      scoreSource(
        'unknown',
        'original',
        'preferred',
        'Cello suite score listing',
        imslpWorkPage('Cello_Suite_No.1_in_G_major,_BWV_1007_(Bach,_Johann_Sebastian)')
      )
    ]
  },
  {
    id: 'rachmaninoff-paganini-rhapsody-op43',
    composer: 'Sergei Rachmaninoff',
    composerAliases: ['Rachmaninoff', 'Rachmaninov', 'Sergei Rachmaninoff', '拉赫玛尼诺夫'],
    workTitle: 'Rhapsody on a Theme of Paganini',
    workAliases: ['Rhapsody On A Theme Of Paganini', 'Paganini Rhapsody', '帕格尼尼主题狂想曲'],
    catalogNumbers: ['Op. 43', 'Op.43'],
    note: genericPianoPoem('Sergei Rachmaninoff', 'Rhapsody on a Theme of Paganini, Op. 43', 'Late Romantic', 'IMSLP Op.43 listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Full score listing, non-PD in the United States',
        imslpWorkPage('Rhapsody_on_a_Theme_of_Paganini,_Op.43_(Rachmaninoff,_Sergei)'),
        {
          licenseLabel: 'Public domain in Canada/EU; probably not public domain in the United States'
        }
      )
    ]
  },
  {
    id: 'rachmaninoff-prelude-op3-no2',
    composer: 'Sergei Rachmaninoff',
    composerAliases: ['Rachmaninoff', 'Rachmaninov', 'Sergei Rachmaninoff', '拉赫玛尼诺夫'],
    workTitle: 'Prelude in C-sharp minor',
    workAliases: ['Prelude in C-Sharp Minor', 'Prelude in C sharp minor', '升c小调前奏曲'],
    catalogNumbers: ['Op. 3 No. 2', 'Op.3 No.2'],
    note: genericPianoPoem('Sergei Rachmaninoff', 'Prelude in C-sharp minor, Op. 3 No. 2', 'Late Romantic', 'IMSLP Op.3 listings'),
    scores: [
      scoreSource(
        'piano',
        'original',
        'preferred',
        'Piano score listing',
        imslpWorkPage('Morceaux_de_fantaisie,_Op.3_(Rachmaninoff,_Sergei)')
      )
    ]
  },
  {
    id: 'tchaikovsky-symphony-6-op74',
    composer: 'Pyotr Ilyich Tchaikovsky',
    composerAliases: ['Tchaikovsky', 'Pyotr Ilyich Tchaikovsky', '柴可夫斯基'],
    workTitle: 'Symphony No. 6 Pathetique',
    workAliases: ['Symphony No. 6', 'Pathétique', 'Pathetique', '悲怆交响曲'],
    catalogNumbers: ['Op. 74', 'Op.74', 'TH 30'],
    note: genericPianoPoem('Pyotr Ilyich Tchaikovsky', 'Symphony No. 6 in B minor, Op. 74, Pathetique', 'Romantic', 'IMSLP Op.74 listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Full score listing',
        imslpWorkPage('Symphony_No.6,_Op.74_(Tchaikovsky,_Pyotr)')
      )
    ]
  },
  {
    id: 'elgar-pomp-and-circumstance-op39-no1',
    composer: 'Edward Elgar',
    composerAliases: ['Elgar', 'Edward Elgar', '埃尔加'],
    workTitle: 'Pomp and Circumstance March No. 1',
    workAliases: ['Pomp and Circumstance', '威风堂堂进行曲', '威风堂堂'],
    catalogNumbers: ['Op. 39 No. 1', 'Op.39 No.1'],
    note: genericPianoPoem('Edward Elgar', 'Pomp and Circumstance March No. 1, Op. 39', 'Late Romantic', 'IMSLP Op.39 listings'),
    scores: [
      scoreSource(
        'orchestra',
        'authoritative_full_score',
        'preferred',
        'Full score listing',
        imslpWorkPage('Pomp_and_Circumstance_Marches,_Op.39_(Elgar,_Edward)')
      )
    ]
  }
];
