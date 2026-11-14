// 「粗読み」モードの文章。すべてこのゲームのために書いたもので、過去問の文章ではない。
// 段階は長さと抽象度で決めている（1: 短い / 2: 中くらい / 3: 京大型）。
// 選択肢はどれも1つ目が正解（出すときに並べ替える）。

export interface Passage {
  level: 1 | 2 | 3;
  /** 題材（答えたあとに見せる） */
  title: string;
  paragraphs: string[];
  /** 要旨の4択。why は、それぞれが正解・不正解である理由 */
  gist: { options: [string, string, string, string]; why: [string, string, string, string] };
  /** 文章の流れを問う3択 */
  check: { q: string; options: [string, string, string]; note: string };
  /** 日本語の要旨 */
  summary: string;
  /** 段落ごとの役割 */
  outline: string[];
}

export const PASSAGE_LEVEL = ['', '短い文章', '中くらいの文章', '京大型の文章'];

export const PASSAGES: Passage[] = [
  // ---- 1: 短い文章（2段落・140〜180語） ----
  {
    level: 1,
    title: '名前を忘れる理由',
    paragraphs: [
      "Most people have had the experience of being introduced to someone and forgetting the person's name within seconds. It is tempting to blame a poor memory, but the real cause is usually different. A name, unlike a job or a hobby, tells us almost nothing about its owner. Knowing that a woman is a pilot calls up images of airports, uniforms and distant cities, and each of these gives the memory something to hold on to. Knowing that she is called Karen calls up nothing at all.",
      'Memory works by connection. A new fact stays with us when it is tied to things we already know, and it slips away when it stands alone. This is why the common advice to repeat a name several times is less effective than it sounds. Repetition keeps the sound in the mind for a moment, but it builds no links. A better method is to invent a connection, however silly: to picture Karen carrying a carrot, for instance. The image is absurd, but it gives the name a place to live.',
    ],
    gist: {
      options: [
        'Names are easy to forget because they connect to nothing we know, so inventing a link works better than repeating them.',
        'Jobs such as pilot are easier to remember than hobbies because they call up many images.',
        'People who forget names have poor memories and should repeat each name several times.',
        'Human memory is unreliable, and nothing we learn stays with us unless it is repeated.',
      ],
      why: [
        '第1段落の原因（名前は何ともつながらない）と、第2段落の対策（つながりを作る）の両方を含む。',
        '細部のずれ。職業と趣味を比べてはいない。どちらも「名前と違って手がかりになる」側。',
        '逆。本文は「記憶力のせいではない」「繰り返しは思うほど効かない」と言っている。',
        '言い過ぎ。記憶全般が当てにならないとは言っていない。',
      ],
    },
    check: {
      q: 'Why does the writer mention the pilot?',
      options: [
        'To show that some facts bring many associations with them, while a name brings none.',
        'To show that people with unusual jobs are remembered longer than others.',
        'To give an example of a person whose name is difficult to pronounce.',
      ],
      note: 'pilot は「連想がたくさん出てくる情報」の例で、何も呼び起こさない Karen という名前と対比されている。',
    },
    summary: '名前を忘れるのは記憶力のせいではなく、名前がほかの知識とつながらないから。繰り返すより、こじつけでもつながりを作るほうが残る。',
    outline: ['現象と原因: 名前は持ち主について何も教えない（pilot と Karen の対比）', '一般化と対策: 記憶はつながりで働く。繰り返しより連想を作る'],
  },
  {
    level: 1,
    title: '都市の暑さと木',
    paragraphs: [
      "On a hot afternoon, the temperature in the center of a large city can be several degrees higher than in the countryside around it. Concrete and asphalt absorb the sun's heat during the day and release it slowly at night, so the city never fully cools. For years the standard answer to this problem has been air conditioning, yet air conditioners do not remove heat. They simply move it from the inside of a building to the street outside, making the city as a whole even warmer.",
      'Trees offer a different kind of solution. Their leaves block sunlight before it reaches the ground, and the water that evaporates from them cools the surrounding air. A street lined with mature trees can be noticeably cooler than a bare one a few blocks away. Trees, however, take decades to grow, and they are often the first thing to be cut down when a road is widened. A city that wants shade in thirty years has to protect its trees, and plant new ones, today.',
    ],
    gist: {
      options: [
        'Trees cool cities in a way air conditioning cannot, but because they grow slowly, cities must protect and plant them now.',
        'Air conditioning remains the most effective answer to the heat that concrete and asphalt produce.',
        'Cities are hotter than the countryside because concrete and asphalt release heat at night.',
        'Cities should stop widening roads and remove air conditioners in order to become cooler.',
      ],
      why: [
        '第2段落の主張（木という別の解決策）と、最後の文（だから今守り、植える）を押さえている。',
        '逆。エアコンは熱を外へ移すだけで、街全体をさらに暑くすると言っている。',
        '細部。第1段落の前半だけで、木の話が入っていない。',
        '言い過ぎ。道路の拡幅をやめろ、エアコンをなくせとは言っていない。',
      ],
    },
    check: {
      q: "What is the writer's criticism of air conditioning?",
      options: [
        'It only moves heat outdoors, which makes the city hotter overall.',
        'It uses too much electricity to be run at night.',
        'It cools buildings more slowly than trees cool streets.',
      ],
      note: 'yet air conditioners do not remove heat. They simply move it … の yet が批判の始まり。',
    },
    summary: '都市の暑さにエアコンで応じても、熱を外に移すだけで街は暑くなる。木は日差しを遮り空気を冷やすが、育つのに何十年もかかるので、今から守り植える必要がある。',
    outline: ['問題と従来の対策: 都市は冷めない。エアコンは熱を移すだけ', '別の解決策と条件: 木は冷やす。ただし育つのが遅いので今から'],
  },
  {
    level: 1,
    title: '退屈の効用',
    paragraphs: [
      "Boredom has a bad reputation. Parents rush to fill their children's empty hours with lessons and activities, and adults reach for their phones the moment a train is late. We treat an unoccupied mind as a problem to be solved as quickly as possible.",
      'Yet boredom may be doing something useful. When nothing outside demands our attention, the mind begins to wander, and a wandering mind is not an idle one. It returns to unfinished problems, imagines future situations and combines old ideas in new ways. Many people report that their best ideas arrive in the shower or on a long walk, precisely when they are doing nothing in particular. If every quiet moment is filled with a screen, these moments of unplanned thinking disappear. The cure for boredom, in other words, may cost us more than the boredom itself.',
    ],
    gist: {
      options: [
        'Boredom lets the mind wander productively, so constantly escaping it with screens may do more harm than good.',
        'Children today have too many lessons and activities, which leaves them bored and tired.',
        'The best ideas come only to people who take showers or long walks every day.',
        'Boredom is a problem of the modern mind that phones have finally solved.',
      ],
      why: [
        'Yet 以下の主張（退屈は役に立つ）と、最後の文（退屈の治療のほうが高くつく）を押さえている。',
        'ずれ。習い事は「空いた時間を埋めようとする」例で、子どもが疲れる話ではない。',
        '細部の言い過ぎ。シャワーや散歩は例で、only とは言っていない。',
        '逆。スマホで退屈を消すことを、筆者は損失と見ている。',
      ],
    },
    check: {
      q: "What does the writer mean by 'a wandering mind is not an idle one'?",
      options: [
        'Even when it seems to be doing nothing, the mind is working on problems and ideas.',
        'People who let their minds wander are usually avoiding work.',
        'The mind cannot wander unless the body is also moving.',
      ],
      note: '直後の It returns to unfinished problems, imagines …, combines … が言い換え。idle は「何もしていない」。',
    },
    summary: '退屈は悪者にされるが、退屈なとき心はさまよい、未解決の問題に戻ったり考えを組み合わせたりしている。静かな時間をすべて画面で埋めると、それが失われる。',
    outline: ['通念: 退屈はすぐ解消すべき問題とされている', '反論: 退屈は役に立つ。画面で埋めると失うものが大きい'],
  },
  {
    level: 1,
    title: '翻訳が運ぶもの',
    paragraphs: [
      "A translator's work is often imagined as a kind of exchange: a word in one language is taken out and the matching word in another is put in its place. If this were true, translation would be easy, and machines would have mastered it long ago. The difficulty is that words rarely match. The Japanese word 'natsukashii' can be translated as 'nostalgic,' but the English word suggests a slight sadness that the Japanese one need not contain.",
      "What a good translator carries across, then, is not words but effects. The question is not 'What does this word mean?' but 'What did this sentence do to its original readers, and how can the same thing be done to new ones?' Answering it sometimes requires changing a great deal: a joke may need a different subject, and a proverb may need to be replaced by another. A translation that is faithful to every word can therefore be unfaithful to the text as a whole.",
    ],
    gist: {
      options: [
        "Because words in different languages do not match, good translation reproduces a text's effect rather than its individual words.",
        "Machines cannot translate Japanese because words such as 'natsukashii' have no English meaning.",
        'A good translator changes as little as possible and stays faithful to every word.',
        'Jokes and proverbs are the most difficult parts of any language to learn.',
      ],
      why: [
        '第1段落（語は一致しない）と第2段落（運ぶのは語ではなく効果）をつないでいる。',
        '言い過ぎ。natsukashii は「ずれがある」例で、訳せないとは言っていない。',
        '逆。語に忠実な訳が、文章全体には不忠実になりうると言っている。',
        'ずれ。冗談とことわざは「大きく変える必要がある」例で、言語学習の話ではない。',
      ],
    },
    check: {
      q: "Why does the writer mention 'natsukashii'?",
      options: [
        'As an example of a word whose closest English equivalent carries a different shade of feeling.',
        'As an example of a word that English speakers have started to use.',
        'As an example of a word that even Japanese speakers find hard to explain.',
      ],
      note: 'words rarely match の具体例。nostalgic には、natsukashii に必ずしもない悲しさがある。',
    },
    summary: '翻訳は語の置き換えではない。言語が違えば語は一致しないので、よい翻訳者は語ではなく、文が読者に与える効果を運ぶ。そのために大きく変えることもある。',
    outline: ['通念と問題: 翻訳＝語の交換、ではない。語は一致しない（natsukashii）', '主張: 運ぶのは効果。語に忠実すぎると全体に不忠実になる'],
  },

  // ---- 2: 中くらいの文章（3段落・270語前後） ----
  {
    level: 2,
    title: '観察者は消えない',
    paragraphs: [
      'Anyone who studies wild animals faces an awkward problem: the animals know they are being watched. A researcher who walks into a forest to observe monkeys does not see monkeys behaving naturally. She sees monkeys behaving as monkeys do when a large, unfamiliar creature is standing nearby. They may hide, flee, or simply stop whatever they were doing. The more closely the scientist approaches her subject, the less her observations are worth.',
      'The traditional solution is patience. By appearing in the same place day after day, doing nothing threatening, a researcher can gradually persuade a group of animals to ignore her. This process may take months or even years, and it has produced some of the most valuable studies in the history of the field. It is usually described as a way of making the observer invisible.',
      'But is she invisible? Animals that have stopped fearing humans are, by definition, no longer the animals they were. They may wander closer to villages and roads, where they are more easily killed. Predators that would normally attack them may stay away from the human, so that the group enjoys a protection it would not otherwise have. Some researchers have even found that animals use the observer, placing themselves near her when a rival approaches. The scientist has not disappeared from the scene. She has become part of it, and the behavior she records is partly a response to her own presence. This does not mean such research is worthless. It means that its results describe animals living alongside a human, and that an honest report must say so.',
    ],
    gist: {
      options: [
        'Getting wild animals used to an observer does not remove her influence; she becomes part of what she studies, and reports should admit this.',
        'With enough patience, a researcher can become invisible to wild animals and record their natural behavior.',
        'Studying wild animals is harmful because it causes them to be killed near villages and roads.',
        'Research on wild animals is worthless because the animals always know that they are being watched.',
      ],
      why: [
        '第3段落の But is she invisible? 以下の主張と、最後の文（正直な報告はそう書くべき）を押さえている。',
        '逆。これは第2段落の通説で、第3段落がそれを疑っている。',
        '細部の言い過ぎ。村や道路の話は影響の一例で、研究が有害だという主張ではない。',
        '言い過ぎ。This does not mean such research is worthless と明言している。',
      ],
    },
    check: {
      q: 'What is the function of the third paragraph?',
      options: [
        'It questions the claim, described in the second paragraph, that the observer becomes invisible.',
        'It gives further examples of how patience produces valuable studies.',
        'It explains why monkeys are harder to observe than predators.',
      ],
      note: '第2段落の最後の invisible を、第3段落の冒頭 But is she invisible? が受けて、ひっくり返す。',
    },
    summary: '野生動物を観察すると動物は不自然にふるまう。慣れさせれば観察者は「見えなくなる」とされるが、人を恐れなくなった動物はもう元の動物ではない。観察者は場面の一部であり、報告はそれを認めるべきだ。',
    outline: ['問題: 動物は見られていると知っている', '通説: 根気よく慣れさせれば観察者は見えなくなる', '反論と結論: 観察者は消えず、場面の一部になる。無価値ではないが、正直に書くべき'],
  },
  {
    level: 2,
    title: '印刷とつづり',
    paragraphs: [
      'Before the invention of printing, there was no such thing as a spelling mistake in English. A writer in the fourteenth century spelled words as they sounded to him, and since people in different regions pronounced words differently, they wrote them differently too. The same word might appear in three forms on a single page, and nobody considered this a fault. Writing was a record of speech, and speech varied.',
      'Printing changed the situation, though not because printers cared about correctness. Their concern was commercial. A book printed in London had to be sold across the whole country, and a text full of local spellings would have seemed strange to most of its buyers. Printers therefore began to prefer certain forms over others, usually those of the capital, where they worked. As thousands of identical copies spread, readers grew used to seeing each word in one shape, and that shape came to seem the right one.',
      "The consequences went far beyond convenience. Once a single form was felt to be correct, every other form became an error, and the way a person spelled began to say something about that person's education. A difference that had once been merely regional was now a mark of social position. Meanwhile, pronunciation continued to change as it always had, while spelling, fixed on the printed page, stayed where it was. This is why modern English is full of letters that no one pronounces: they record the speech of people who died five hundred years ago. A technology introduced to sell books ended up deciding what counts as right and wrong in the language.",
    ],
    gist: {
      options: [
        'Printing fixed English spelling for commercial reasons, and this produced the idea of correct spelling, with social effects and a gap from pronunciation.',
        'Printers standardized English spelling because they wanted people to write correctly.',
        'Modern English has many silent letters because medieval writers spelled each word in three different ways.',
        'Before printing, English writers were poorly educated and made many spelling mistakes.',
      ],
      why: [
        '第2段落（商売上の理由で固定）と第3段落（正誤の観念・社会的な意味・発音とのずれ）を含む。',
        '逆。not because printers cared about correctness. Their concern was commercial.',
        '細部の取り違え。発音しない文字があるのは、つづりが固定され発音だけが変わったから。',
        '逆。印刷以前には「つづりの間違い」という考え自体がなかった。',
      ],
    },
    check: {
      q: 'According to the passage, why did printers prefer certain spellings?',
      options: [
        'They needed books to look familiar to buyers all over the country.',
        'They believed that London speech was more beautiful than regional speech.',
        'They were ordered to do so by schools and the government.',
      ],
      note: 'Their concern was commercial の説明が次の文。地方のつづりだらけの本は、大半の買い手に奇妙に見える。',
    },
    summary: '印刷以前の英語には正しいつづりがなかった。印刷業者が全国で売るためにつづりをそろえた結果、1つの形が「正しい」と感じられ、つづりが教養の印になり、変わり続ける発音とのずれも生まれた。',
    outline: ['以前: つづりは話し言葉の記録で、ばらばらでよかった', '変化の原因: 印刷業者が商売のために形をそろえた', '帰結: 正誤の観念、社会的な意味、発音とのずれ'],
  },
  {
    level: 2,
    title: '専門家の予測',
    paragraphs: [
      'Every January, newspapers invite experts to predict the year ahead: which party will win the election, where prices will go, which country will be in crisis. Every December, almost no one checks how those predictions turned out. When researchers have taken the trouble to check, following thousands of forecasts over many years, the results have been humbling. On questions more than a year or two in the future, the average expert performed little better than someone choosing answers at random.',
      'What makes this finding interesting is not that experts fail but which experts fail most. One might expect that the more a person knows about a subject, the better his forecasts will be. In fact, the worst records often belonged to specialists who explained everything by means of a single big idea. Because they were certain of their theory, they bent each new piece of evidence to fit it, and their confidence grew even as their accuracy did not. Those who did better tended to be less impressive in interviews. They drew on many small ideas instead of one large one, spoke in terms of probabilities, and changed their minds when the facts changed.',
      'Unfortunately, the qualities that make a forecaster accurate are not the qualities that make one famous. A television audience wants a clear story told with conviction, not a list of possibilities with percentages attached. The confident specialist is therefore invited back again and again, while the careful one is thought to be dull. We end up with a system that rewards the very habit of mind that produces bad predictions, and since nobody keeps score, there is nothing to correct it.',
    ],
    gist: {
      options: [
        'Confident experts with one big theory predict worse than cautious, flexible ones, yet the media reward confidence and no one checks the results.',
        'Experts cannot predict the future at all, so their knowledge of their subjects is useless.',
        'The more an expert knows about a subject, the more accurate and the more famous he becomes.',
        'Newspapers should stop publishing predictions every January because readers forget them by December.',
      ],
      why: [
        '第2段落（どの専門家が外すか）と第3段落（外す型のほうが報われる）を押さえている。',
        '言い過ぎ。柔軟な専門家は比較的よく当てている。知識が無駄だとは言っていない。',
        '逆。One might expect … In fact で、その予想を否定している。',
        '本文にない提案。筆者は仕組みを説明しているだけで、掲載をやめろとは言っていない。',
      ],
    },
    check: {
      q: 'What contrast is drawn in the second paragraph?',
      options: [
        'Between forecasters who rely on a single theory and those who use many ideas and revise their views.',
        'Between forecasts about elections and forecasts about prices.',
        'Between experts who appear on television and experts who write for newspapers.',
      ],
      note: 'specialists who explained everything by means of a single big idea と Those who did better の対比。',
    },
    summary: '専門家の長期予測はほとんど当たらない。特に外すのは1つの大きな理論で全部を説明する自信家で、当てるのは多くの考えを使い意見を変える人。だがメディアは自信家を好み、誰も成績をつけないので直らない。',
    outline: ['事実: 専門家の予測は、確かめるとほぼ当て推量と変わらない', '分析: 外すのは1つの理論に頼る人、当てるのは柔軟な人', '問題: 当たる資質と有名になる資質は別。仕組みが悪い予測を報いる'],
  },
  {
    level: 2,
    title: '時計が変えた時間',
    paragraphs: [
      'It is hard to imagine life without the clock, and harder still to realize that the clock changed not only how people organized their days but how they understood time itself. For most of history, time was not something separate from events. A farmer did not get up at five; he got up when it grew light. A task took as long as it took, and the day was long in summer and short in winter. Time was read from the world, not from a dial.',
      "The mechanical clock, which spread through European towns from the fourteenth century, quietly reversed this relationship. Hours became equal units that passed at the same speed whether anything happened in them or not. Once time could be counted in this way, it could also be owned, sold and wasted. Factory owners paid for their workers' hours and expected each of them to be filled. Being late, an idea that makes little sense when work starts at sunrise, became a moral failing.",
      "We are the heirs of this change, and we rarely notice it. When we say that we 'spend' or 'save' time, we speak as though it were money, a comparison that would have puzzled a medieval farmer. When we feel guilty for an afternoon in which we produced nothing, we are measuring our lives by a standard that a machine made possible. None of this means that the clock was a mistake; modern society could not function without it. But it is worth remembering that the pressure of the passing minute is not a law of nature. It is the result of an invention, and what was invented can at least be questioned.",
    ],
    gist: {
      options: [
        'By turning time into equal, countable units, the clock created our sense that time is a resource not to be wasted, which is an invention rather than a fact of nature.',
        'The mechanical clock was a mistake because it allowed factory owners to treat workers unfairly.',
        'Medieval farmers worked longer hours in summer than factory workers did in later centuries.',
        'People have always understood time as separate from events, and the clock merely made it easier to measure.',
      ],
      why: [
        '第2段落（時間が数えられる単位になった）と第3段落（その感覚は発明の結果で、自然法則ではない）を含む。',
        '逆。None of this means that the clock was a mistake と明言している。',
        '本文にない比較。夏は昼が長いと言っているだけ。',
        '逆。歴史の大半で、時間は出来事と切り離されていなかった。',
      ],
    },
    check: {
      q: "Why does the writer mention the expressions 'spend' and 'save' time?",
      options: [
        'To show that our everyday language treats time as a countable possession.',
        'To show that medieval farmers were careful with money.',
        'To show that time has become more expensive since the fourteenth century.',
      ],
      note: 'we speak as though it were money が答え。時計以後の時間観が、ふだんの言葉に染みこんでいる証拠として出している。',
    },
    summary: '時計は1日の組み立て方だけでなく、時間の捉え方を変えた。時間は出来事から切り離された等しい単位になり、所有し、売り、無駄にできるものになった。時間に追われる感覚は自然法則ではなく発明の結果だ。',
    outline: ['以前: 時間は世界から読み取るもので、出来事と一体だった', '変化: 時計が時間を等しい単位にし、数え、売れるものにした', '現在と結論: その感覚は言葉にも表れる。発明の結果なのだから問い直せる'],
  },

  // ---- 3: 京大型の文章（6段落・600語前後） ----
  {
    level: 3,
    title: '地図としての科学モデル',
    paragraphs: [
      'A map of a subway system is, in an obvious sense, false. The lines on it are straight where the real tunnels curve; stations that are far apart are drawn close together, and the river, if it appears at all, is a pale blue band with no resemblance to the actual one. Yet no traveler has ever complained of being deceived. The map leaves out almost everything about the city, and it is useful precisely because it does. A map that included every street, building and tree would be as large and as confusing as the city itself.',
      "Scientific models are best understood in the same way. When physicists treat a gas as a collection of tiny balls bouncing off one another, they know perfectly well that molecules are not balls. When economists describe a market in which every buyer has complete information and acts only in his own interest, they are aware that no such market has ever existed. These simplifications are not errors waiting to be corrected. They are deliberate choices about what to ignore, made so that what remains can be seen clearly and calculated with. To ask whether such a model is 'true' is, in most cases, to ask the wrong question. The right question is what it is good for.",
      'This view is sometimes thought to weaken the authority of science, as if admitting that models are simplified meant admitting that they are merely opinions. The opposite is the case. A subway map can be tested: follow it, and you either arrive at your station or you do not. A model, likewise, earns its place by making predictions that can fail. What separates a good model from a bad one is not that it contains no simplifications but that its simplifications do not matter for the purpose at hand. The picture of bouncing balls predicts the pressure of a gas with great accuracy; it would be useless for explaining why some gases burn.',
      'The practice of working scientists confirms this. Engineers who build bridges still rely on the mechanics of Newton, although physicists have known for a century that those laws fail at very high speeds and on very small scales. Nobody regards this as a scandal. A bridge is neither very fast nor very small, and within the range that matters to its builders, the older and simpler picture gives answers that cannot be distinguished from those of its more accurate successors. To replace it would be to gain nothing and to lose a great deal of convenience. Usefulness, in other words, is not a polite name for a lower standard; it is the standard that scientists actually apply.',
      'The real danger lies elsewhere, in forgetting that a model has a purpose at all. A map made for subway passengers will mislead anyone who tries to use it for a walk, for the distances it shows have nothing to do with distances on the ground. In the same way, a model built to answer one kind of question is easily carried over to questions it was never designed for, and the people who carry it are often not the people who built it. The assumption that buyers are perfectly informed may do little harm in a study of how prices respond to supply. Applied to the design of a pension system, where the whole problem is that people do not understand their choices, it can do a great deal.',
      'None of this is an argument for distrusting models, without which modern science would be impossible. It is an argument for reading them as we read maps: with gratitude for what they show, and with a clear memory of what they were drawn to leave out.',
    ],
    gist: {
      options: [
        'Scientific models, like maps, are useful because they simplify; they should be judged by their purpose, and the danger lies in applying them beyond it.',
        'Scientific models contain many errors, which scientists are gradually correcting in order to describe reality as it truly is.',
        'Because scientific models are simplified, they are no more reliable than opinions and should be distrusted.',
        'Economic models are less accurate than physical ones because buyers never have complete information.',
      ],
      why: [
        '第2段落（単純化は意図した選択）、第3・4段落（目的に照らして評価）、第5段落（目的外への流用が危険）を1文にまとめている。',
        '逆。These simplifications are not errors waiting to be corrected.',
        '逆。第3段落で The opposite is the case、最終段落で「不信の勧めではない」と否定している。',
        '細部。物理と経済は同じ扱いの例で、どちらが正確かは比べていない。',
      ],
    },
    check: {
      q: 'What is the main point of the fifth paragraph?',
      options: [
        'A model can mislead when it is used for a question it was not built to answer.',
        'Subway maps should also show the real distances between stations.',
        'Economists should stop assuming that buyers are well informed.',
      ],
      note: 'The real danger lies elsewhere, in forgetting that a model has a purpose が段落の主題文。地図の例も年金の例も、それを支えている。',
    },
    summary: '地下鉄の路線図は事実を省くから役に立つ。科学のモデルも同じで、単純化は誤りではなく意図した選択であり、真か偽かではなく何の役に立つかで評価される。危険なのは、ある目的のために作ったモデルを別の問いに持ち込むことだ。',
    outline: [
      '導入の比喩: 路線図は「偽」だが、省くからこそ役立つ',
      '主張: モデルも同じ。単純化は意図した選択。問うべきは「何の役に立つか」',
      '予想される反論への答え: 権威は弱まらない。予測が外れうることで試される',
      '裏づけ: 橋の設計はニュートン力学で足りる。有用性こそ実際の基準',
      '本当の危険: 目的を忘れ、別の問いに流用すること（年金の例）',
      '結論: モデルは地図のように読め。示すものに感謝し、省いたものを覚えておく',
    ],
  },
  {
    level: 3,
    title: '記憶は記録ではない',
    paragraphs: [
      'We commonly speak of memory as though it were a storehouse. Experiences are placed inside, kept for a longer or shorter time, and taken out again when needed; forgetting is what happens when an item is lost or the door will not open. The image is so natural that it is difficult to think about memory without it. It is also, according to a century of psychological research, deeply misleading.',
      "Remembering turns out to be less like fetching a book from a shelf than like retelling a story one has heard. Each time we recall an event, we rebuild it from fragments: a few images, a general sense of what happened, and a large amount of knowledge about how such events usually go. The gaps are filled in so smoothly that we cannot tell the original pieces from the repairs. In a well-known kind of experiment, people who watched a film of a car accident were later asked how fast the cars were going when they 'smashed into' each other, while others were asked the same question with the word 'hit.' Those who heard the stronger word not only gave higher speeds; a week later, many of them remembered seeing broken glass, although the film had shown none.",
      "Nor is the process limited to the laboratory. Many adults possess a vivid memory from early childhood that, on investigation, turns out to match a family photograph rather than anything they could have seen with their own eyes: they 'remember' the scene from the position of the camera, with themselves in the picture. The story has been told so often, and the photograph looked at so many times, that the retelling has taken the place of the experience. Each act of recall, it seems, does not simply read a memory but writes it again, and what is stored afterward is the latest version, not the first.",
      "What is striking about such findings is that the false memories do not feel false. One might hope that confidence would serve as a guide, that the memories we are surest of would be the most accurate. Unfortunately, the feeling of certainty is produced by the same process that produces the memory, and it attaches itself to invented details as readily as to real ones. A witness who says 'I will never forget that face' is reporting sincerely on the strength of an impression, not on its origin.",
      "It would be easy to conclude that memory is simply a faulty instrument, and for the purposes of a courtroom it often is. But this judgment assumes that the purpose of memory is to preserve the past, and there is reason to doubt that assumption. A creature gains nothing from an exact record of last year's events for its own sake. What it needs is the ability to act well in a present that resembles the past only in part, and for this, a flexible summary that can be recombined to meet new situations is far more valuable than a perfect recording. Seen in this light, the very features that make memory an unreliable witness, its readiness to generalize, to fill gaps and to update old impressions with new information, are the features that make it useful. The same system that lets us imagine a future we have never seen lets us remember a past that never quite happened.",
      "We are left with an uncomfortable but necessary distinction. To trust memory as a tool for living is reasonable; we could not get through a day otherwise. To trust it as a record, especially where another person's fate depends on the details, is to ask of it something it was never built to provide.",
    ],
    gist: {
      options: [
        'Memory rebuilds the past rather than storing it, which makes it unreliable as a record but well suited to guiding action in new situations.',
        'Memory works like a storehouse, and forgetting occurs when stored experiences are lost or cannot be reached.',
        'Witnesses often lie in court because the wording of a question changes what they want to say.',
        'Since the memories we feel most certain about are the most accurate, confidence is the best guide to the truth.',
      ],
      why: [
        '第2・3段落（再構成）、第5段落（柔軟さこそ役に立つ）、最終段落（道具としては信頼、記録としては別）をまとめている。',
        '逆。これは第1段落で deeply misleading とされる通念。',
        'ずれ。証人は嘘をついているのではなく、誠実に（sincerely）誤っている。',
        '逆。確信の感覚は、作られた細部にも同じように付くと言っている。',
      ],
    },
    check: {
      q: 'How does the fifth paragraph relate to the earlier ones?',
      options: [
        'It reinterprets the weaknesses described earlier as the cost of a system built for flexibility.',
        'It presents new experiments showing that memory is more accurate than the earlier paragraphs suggested.',
        'It argues that courts should stop listening to witnesses altogether.',
      ],
      note: 'It would be easy to conclude … But this judgment assumes … で向きが変わる。前の段落の「欠点」を、柔軟さという長所の裏面として読み直している。',
    },
    summary: '記憶は倉庫ではなく、思い出すたびに断片から組み立て直される。偽の記憶も本物と同じ確信を伴う。だが記憶の目的は過去の保存ではなく、今うまく行動することであり、柔軟さはそのためにある。道具としては信頼でき、記録としては信頼できない。',
    outline: [
      '通念とその否定: 記憶＝倉庫という像は誤解を招く',
      '実態: 思い出すことは再構成。質問の言葉で記憶が変わる実験',
      '日常の例: 写真や語り直しが体験に置き換わる。思い出すたびに書き直される',
      '厄介な点: 偽の記憶も偽と感じられない。確信は当てにならない',
      '転換: 記憶の目的は保存ではない。欠点に見える柔軟さが役に立つ',
      '結論: 生きる道具としては信頼し、記録としては信頼しすぎない',
    ],
  },
  {
    level: 3,
    title: '情報の豊かさ、注意の貧しさ',
    paragraphs: [
      'For most of human history, information was scarce. Books were copied by hand and owned by the few; news traveled at the speed of a horse; a scholar might cross a continent to consult a single manuscript. Under such conditions it was natural to assume that more information would always be better, and that the chief obstacle to understanding was the difficulty of getting hold of facts. Our institutions of learning, from the library to the encyclopedia, were built on that assumption.',
      'The assumption no longer holds, and the reason was stated with remarkable clarity long before the internet existed. Information, an economist observed in the 1970s, consumes something: the attention of the person who receives it. A wealth of information therefore creates a poverty of attention. What is scarce today is not the fact but the hour in which to consider it, and whatever is scarce becomes the object of competition.',
      'Much of what is troubling about our present situation follows from this simple reversal. The companies that supply us with free news, entertainment and conversation are not in the business of selling information to us. They are in the business of selling our attention to others, and they have every reason to capture as much of it as they can. The methods that capture attention most reliably are, unfortunately, not those that inform. A calm and accurate report must compete with a rumor designed to provoke anger, and the rumor is read first. No one need intend this result. It is enough that each message is tested against millions of readers and that the ones which hold the eye longest are shown again.',
      'The effects are visible in the smallest details of daily life. A person who sits down to read a difficult chapter finds that the same device which holds the chapter also holds a hundred invitations to do something easier, each designed by people whose income depends on its being accepted. To blame the reader for weakness of will is to miss the point. The contest is not between a reader and a book, as it was for earlier generations, but between a single individual and an industry that studies, with enormous resources, exactly how such individuals can be distracted. That the individual often loses is hardly surprising. What is surprising is that we continue to describe the outcome as a personal failing rather than as the predictable result of an arrangement.',
      'It is tempting to respond by demanding better information: more careful journalism, quicker correction of falsehoods, clearer labels on doubtful claims. These are worthy aims, but they treat the old problem rather than the new one. If attention is the limiting resource, then adding even excellent material to the flood does little good, since it must still fight for the same few minutes. The skill that the situation calls for is not the finding of information, at which we have become extraordinarily efficient, but the refusing of it: deciding in advance what deserves to be considered, and protecting the time in which to consider it.',
      "Such a skill cuts against habits formed in an age of scarcity. We still feel that to ignore available information is a kind of negligence, and that a well-informed person is one who has seen the most. A reader of the eighteenth century, with access to perhaps a few dozen books, was educated by reading them again and again. It is at least worth asking whether that reader's attention, concentrated on so little, did not sometimes achieve an understanding that our own, divided among so much, cannot.",
    ],
    gist: {
      options: [
        'Now that information is abundant and attention scarce, the essential skill is no longer finding information but choosing what to ignore.',
        'The spread of false rumors can be stopped only by more careful journalism and quicker correction of mistakes.',
        'Companies that provide free services deliberately spread rumors in order to make their users angry.',
        'People in the eighteenth century understood more than we do because they owned fewer books.',
      ],
      why: [
        '第2段落の逆転（情報が豊か → 注意が乏しい）と、第5段落の結論（必要なのは情報を断る技能）を押さえている。',
        '逆。それは they treat the old problem rather than the new one とされる対応。',
        '言い過ぎ。No one need intend this result（誰も意図しなくてもそうなる）と言っている。',
        '言い過ぎ。最後は It is at least worth asking whether … という問いかけで、断定していない。',
      ],
    },
    check: {
      q: "Why does the writer regard 'demanding better information' as insufficient?",
      options: [
        'Because even excellent material must compete for the same limited attention.',
        'Because careful journalism costs more than free news services can afford.',
        'Because readers no longer trust corrections and labels.',
      ],
      note: 'If attention is the limiting resource, then adding even excellent material to the flood does little good が理由。',
    },
    summary: '昔は情報が乏しく、多いほど良いと考えられた。今は情報が豊かで、乏しいのは注意のほうだ。注意を奪い合う仕組みでは、正確な報道より怒りを誘う噂が先に読まれる。必要なのは良い情報を足すことではなく、何を読まないかを決める技能である。',
    outline: [
      '過去の前提: 情報は乏しく、多いほど良い',
      '逆転: 情報は注意を消費する。乏しいのは注意',
      '現状の説明: 企業は注意を売る。注意を引くものと役立つものは別',
      '個人の水準: 気が散るのは意志の弱さではなく、仕組みの当然の結果',
      'よくある対応への反論と主張: 良い情報を足しても足りない。必要なのは断る技能',
      '含み: 乏しさの時代の習慣が邪魔をする。集中した読書への問いかけ',
    ],
  },
  {
    level: 3,
    title: '分かっているつもり',
    paragraphs: [
      'Ask people whether they understand how a zipper works, and most will say that they do. Ask them to explain it, step by step, and something curious happens. After a few hesitant sentences about teeth and a sliding part, the explanation runs out, and when they are asked once more to rate their understanding, the rating falls sharply. The experiment has been repeated with bicycles, toilets and locks, always with the same outcome. People believe that they understand the ordinary objects around them far better than they do, and they discover the gap only when they are made to put their knowledge into words.',
      "Why should we be so mistaken about the contents of our own minds? Part of the answer is that familiarity is easily confused with understanding. We have used zippers thousands of times without difficulty, and the ease of use passes itself off as knowledge of the mechanism. A deeper part of the answer is that, for nearly everything we rely on, the understanding does exist; it simply exists in someone else's head. No single person knows how to make a pencil, let alone a telephone. Human beings succeed not because each of us knows a great deal but because we are extraordinarily good at depending on what others know, and we do this so automatically that we fail to notice where our own knowledge ends and the community's begins.",
      'This division of labor is among the greatest achievements of our species, and nothing in what follows should be taken as a complaint against it. A doctor need not understand how her instruments are manufactured, and the engineer who makes them need not understand medicine. Each can go further in one direction because the others can be trusted in theirs. The price of the arrangement is only that our sense of what we personally know becomes unreliable. Surrounded by knowledge that is always available when needed, we come to feel that it is ours.',
      'In daily life the confusion is harmless and even efficient; a person who refused to use any device he could not explain would accomplish very little. The trouble begins when the same illusion extends from objects to public questions. People hold firm opinions about tax policy or energy supply, subjects at least as complicated as a zipper, and their confidence rests on the same borrowed foundation. They sense that the reasoning exists somewhere, among those who share their view, and they mistake that sense for a grasp of the reasoning itself.',
      'A further experiment suggests what might be done. When people with strong political opinions were asked to list the reasons for their position, their opinions grew, if anything, stronger. Reasons are easy to produce, and producing them feels like proof. But when they were asked instead to explain, in detail, how the policy they favored would actually bring about its effects, the result was different. As with the zipper, the explanations ran out; and those who had struggled to give one afterward described their views in more moderate terms. Justifying their views had hardened them, whereas explaining how things work had made them less certain.',
      "The lesson is not that everyone should become an expert on everything, which is impossible, nor that opinions should be held only by those who can defend them fully. It is that the feeling of understanding is a poor measure of understanding, and that the quickest way to test it is neither to consult one's confidence nor to list one's reasons, but to attempt, honestly and in detail, to explain.",
    ],
    gist: {
      options: [
        "We overestimate our own understanding because we rely on others' knowledge without noticing, and trying to explain in detail is the best way to expose the gap.",
        'People should not hold opinions on public questions unless they can fully explain the policies involved.',
        "Listing the reasons for one's political position is an effective way of becoming more moderate.",
        'Ordinary objects such as zippers and bicycles are too complicated for anyone except experts to use properly.',
      ],
      why: [
        '第1段落（分かっているつもり）、第2段落（他人の知識に頼っている）、第5・6段落（説明してみることが試金石）を含む。',
        '逆。最終段落で nor that opinions should be held only by those who can defend them fully と否定している。',
        '逆。理由を挙げると意見はむしろ強まった。穏やかになったのは、仕組みを説明させたとき。',
        'ずれ。使うことは問題なくできる。できないのは仕組みの説明。',
      ],
    },
    check: {
      q: 'What is the difference between the two tasks described in the fifth paragraph?',
      options: [
        'Giving reasons strengthened opinions, while explaining how a policy works weakened them.',
        'Giving reasons took longer than explaining how a policy works.',
        'Explaining a policy was easy for people with strong opinions but hard for everyone else.',
      ],
      note: '段落の最後の文 Justifying their views had hardened them, whereas explaining … had made them less certain が要約になっている。',
    },
    summary: '人は身近な物の仕組みを分かっているつもりでいるが、説明させるとできない。知識の大半は他人の頭にあり、その境目に気づかないからだ。同じ錯覚は政治的意見にも及ぶ。理由を挙げると意見は固まるが、仕組みを説明しようとすると穏やかになる。理解の感覚は当てにならず、説明してみるのが一番の試験だ。',
    outline: [
      '現象: ファスナーの仕組みを説明させると、理解の自己評価が下がる',
      '原因: 慣れと理解の混同。知識は共同体にあり、境目に気づかない',
      '評価: この分業は人類の強み。代償は、自分の知識の感覚が当てにならなくなること',
      '問題の拡大: 同じ錯覚が政策への意見にも及ぶ',
      '手がかりとなる実験: 理由を挙げると強まり、仕組みを説明すると弱まる',
      '結論: 理解の感覚は当てにならない。試すには説明してみること',
    ],
  },
];
