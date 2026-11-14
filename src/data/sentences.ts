// 「読み解く」モードの例文。すべてこのゲームのために書いたもので、過去問の文ではない。
// 段階は構文と文の入り組み方で決めている。選択肢の1つ目が正しい言い換え（出すときに並べ替える）。

export interface Sentence {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** 使っている構文 */
  tag: string;
  text: string;
  /** [正しい言い換え, 誤り, 誤り] */
  options: [string, string, string];
  /** 答えたあとに見せる、構造の説明 */
  note: string;
}

export const LEVEL_NAME = ['', '基本の修飾', '句で広げる', '節を組み合わせる', '特殊構文', '圧縮と省略', '京大型の長い一文'];

export const SENTENCES: Sentence[] = [
  // ---- 1: 基本の修飾 ----
  {
    level: 1,
    tag: '関係代名詞',
    text: 'The book that my teacher recommended last week turned out to be far more difficult than I had expected.',
    options: [
      'The recommended book was harder than the writer had expected.',
      "The teacher's book was easier than expected.",
      'The writer recommended a difficult book to the teacher.',
    ],
    note: 'that my teacher recommended last week が The book を説明する。主語が長いときは、まず述語動詞 turned out を見つける。',
  },
  {
    level: 1,
    tag: '間接疑問',
    text: 'Scientists have long wondered why some birds travel thousands of kilometers every year.',
    options: [
      "The reason for the birds' long journeys has puzzled scientists for a long time.",
      'Scientists know exactly why the birds travel.',
      'Some scientists travel thousands of kilometers to see birds.',
    ],
    note: 'why 以下が wondered の目的語。疑問詞のあとは「主語 + 動詞」の語順になる。',
  },
  {
    level: 1,
    tag: '不定詞・形式主語',
    text: 'To understand a foreign culture, it is not enough simply to learn its language.',
    options: [
      'Learning the language alone does not make you understand a culture.',
      'Learning a language is enough to understand a culture.',
      'You cannot learn a language without understanding its culture.',
    ],
    note: '文頭の To understand … は目的（〜するには）。it は後ろの to learn its language を指す。',
  },
  {
    level: 1,
    tag: '受動態 + 関係代名詞',
    text: 'The village was almost completely destroyed by a flood that nobody had predicted.',
    options: [
      'An unexpected flood ruined most of the village.',
      'People had predicted the flood but could not stop it.',
      'Nobody in the village was hurt by the flood.',
    ],
    note: 'that nobody had predicted が a flood を説明する。had predicted は destroyed より前のこと。',
  },
  {
    level: 1,
    tag: 'what 節が主語',
    text: 'What surprised the researchers most was how quickly the children learned the new rules.',
    options: [
      "The children's speed of learning amazed the researchers.",
      'The researchers quickly taught the children new rules.',
      "The children were surprised by the researchers' rules.",
    ],
    note: 'What surprised the researchers most までが主語（研究者を最も驚かせたこと）。was のあとの how 節が補語。',
  },
  {
    level: 1,
    tag: '関係代名詞 + when 節',
    text: 'People who read a lot when they are young tend to find writing easier later in life.',
    options: [
      'Reading a lot early in life often makes writing easier afterwards.',
      'People who write a lot find reading easier.',
      'Young people find writing easier than old people do.',
    ],
    note: 'who read a lot when they are young が People を説明する。述語動詞は tend。',
  },
  {
    level: 1,
    tag: 'not A but B',
    text: 'The experiment failed not because the idea was wrong but because the equipment was too old.',
    options: [
      'Old equipment, rather than a bad idea, caused the failure.',
      'The idea was wrong, so the experiment failed.',
      'The experiment failed because of both the idea and the equipment.',
    ],
    note: 'not because A but because B は「A だからではなく B だから」。否定されるのは A のほう。',
  },
  {
    level: 1,
    tag: 'so … that',
    text: 'He was so absorbed in his work that he did not notice the room getting dark.',
    options: [
      'His concentration kept him from noticing the darkness.',
      'He stopped working because the room became dark.',
      'He worked in the dark so that nobody would notice him.',
    ],
    note: 'so … that は「とても…なので〜」。notice + 目的語 + -ing は「〜が…しているのに気づく」。',
  },

  // ---- 2: 句で広げる ----
  {
    level: 2,
    tag: '過去分詞の後置修飾',
    text: 'The theory proposed by a young physicist in 1905 changed the way we think about time.',
    options: [
      "A young physicist's 1905 theory altered our view of time.",
      'A young physicist changed his theory about time in 1905.',
      "The theory was proposed to change the physicist's way of thinking.",
    ],
    note: 'proposed は過去分詞で The theory を後ろから説明する。述語動詞は changed。-ed が2つ並ぶときは、どちらが述語かを見分ける。',
  },
  {
    level: 2,
    tag: '形式主語 it … that',
    text: 'It is often said that the best way to learn something is to teach it to someone else.',
    options: [
      'Many people say that teaching others is the best way to learn.',
      'The best teachers are those who learn from others.',
      'It is best to learn something before someone else teaches it.',
    ],
    note: 'It は that 以下を指す。that 節の中は the best way … is to teach …（主語 + is + 補語）。',
  },
  {
    level: 2,
    tag: '分詞構文',
    text: 'Walking along the river, she came across an old friend she had not seen for years.',
    options: [
      'During a riverside walk she met by chance a friend she had long lost touch with.',
      'She walked along the river in order to meet an old friend.',
      'Her old friend had been walking along the river for years.',
    ],
    note: 'Walking along the river は「川沿いを歩いているときに」。friend のあとに関係代名詞が省略されている。',
  },
  {
    level: 2,
    tag: '同格の that',
    text: 'The fact that the two languages share many words does not mean that they have a common origin.',
    options: [
      'Shared vocabulary does not prove that the languages come from the same source.',
      'The two languages have a common origin because they share words.',
      'The two languages do not share many words.',
    ],
    note: '1つ目の that 節は The fact の中身（同格）。述語動詞は does not mean。2つ目の that 節は mean の目的語。',
  },
  {
    level: 2,
    tag: '過去分詞の後置修飾 + without -ing',
    text: 'Children raised in bilingual homes often switch between languages without being aware of it.',
    options: [
      'Children from two-language homes frequently change languages unconsciously.',
      'Bilingual children are aware of every language switch they make.',
      'Parents in bilingual homes switch languages to raise their children.',
    ],
    note: 'raised in bilingual homes が Children を説明する。述語動詞は switch。it は「言語を切り替えていること」。',
  },
  {
    level: 2,
    tag: 'the 比較級, the 比較級',
    text: 'The more carefully you observe nature, the more questions you will find yourself asking.',
    options: [
      'Closer observation of nature leads to more questions.',
      'Careful observers of nature have fewer questions.',
      'If you ask more questions, nature becomes easier to observe.',
    ],
    note: '「〜すればするほど、ますます…」。find oneself -ing は「気づくと〜している」。',
  },
  {
    level: 2,
    tag: '完了形の分詞構文 + 形式目的語',
    text: 'Having never lived abroad, he found it hard to imagine how lonely a foreigner might feel.',
    options: [
      "Because he had no experience of living overseas, a foreigner's loneliness was difficult for him to picture.",
      'He felt lonely because he had never lived abroad.',
      'He imagined that foreigners never feel lonely.',
    ],
    note: 'Having never lived は理由（一度も住んだことがなかったので）。found it hard to … の it は to imagine 以下。',
  },
  {
    level: 2,
    tag: '同格の that + 非制限の関係詞',
    text: 'There is no evidence that the medicine, which has been used for decades, causes any serious harm.',
    options: [
      'Nothing shows that the long-used medicine is seriously harmful.',
      'The medicine has caused serious harm for decades.',
      'There is evidence that the medicine has not been used for decades.',
    ],
    note: 'that 節は evidence の中身。コンマにはさまれた which … は補足なので、いったん飛ばして the medicine … causes をつなぐ。',
  },

  // ---- 3: 節を組み合わせる ----
  {
    level: 3,
    tag: '無生物主語',
    text: 'A closer look at the data reveals that the two groups differ far less than was first reported.',
    options: [
      'If you examine the data carefully, the difference between the groups is smaller than the early report said.',
      'The first report looked at the data more closely.',
      'The two groups differ more than the data first showed.',
    ],
    note: '主語 A closer look at the data は「データをよく見ると」と条件のように読む。than のあとは主語が省略されている。',
  },
  {
    level: 3,
    tag: '前置詞 + 関係代名詞',
    text: 'The speed with which the rumor spread shows how little people check what they read.',
    options: [
      'The rumor spread fast, which shows that people rarely verify what they read.',
      'People checked the rumor quickly, so it did not spread.',
      'The rumor spread slowly because people read little.',
    ],
    note: 'with which the rumor spread が The speed を説明する（the rumor spread with the speed）。述語動詞は shows。',
  },
  {
    level: 3,
    tag: 'not A but B + whether 節',
    text: 'What matters in science is not who makes a discovery but whether it can be confirmed by others.',
    options: [
      'In science, confirmation by others counts for more than the identity of the discoverer.',
      'In science, the discoverer matters more than the confirmation.',
      'Scientists do not care whether a discovery can be confirmed.',
    ],
    note: 'What matters in science が主語。is のあとが not A but B で、A は who 節、B は whether 節。',
  },
  {
    level: 3,
    tag: '過去分詞の分詞構文',
    text: 'Seen from a distance, the mountain looks gentle, but those who have climbed it know better.',
    options: [
      'The mountain seems easy from afar, yet people who have climbed it know that it is not.',
      'Climbers think the mountain is gentler than it looks.',
      'The mountain looks dangerous from a distance.',
    ],
    note: 'Seen from a distance は「遠くから見ると」。know better は「そうではないと知っている」。',
  },
  {
    level: 3,
    tag: '形式目的語 it + for … to',
    text: 'Technology has made it possible for a single person to reach an audience that once required a whole newspaper.',
    options: [
      'Thanks to technology, one individual can now reach as many people as a newspaper used to.',
      'Newspapers now need technology to reach a single person.',
      'A whole newspaper is still required to reach a large audience.',
    ],
    note: 'made it possible の it は for a single person to reach … 。for のあとが to 不定詞の意味上の主語。',
  },
  {
    level: 3,
    tag: '名詞構文 + most of whom',
    text: 'Her refusal to accept the prize puzzled the committee, most of whom had assumed she would be delighted.',
    options: [
      'Most committee members expected her to be pleased, so they were confused when she turned the prize down.',
      'The committee refused to give her the prize, which delighted her.',
      'Most of the committee were delighted that she refused the prize.',
    ],
    note: 'Her refusal to accept は She refused to accept を名詞にしたもの。most of whom の whom は the committee。',
  },
  {
    level: 3,
    tag: '譲歩の Whatever + where 節',
    text: 'Whatever its origin, the custom has survived for centuries in a region where little else has remained unchanged.',
    options: [
      'Regardless of where it came from, the custom has lasted for hundreds of years in a place where almost everything else has changed.',
      'The custom changed along with everything else in the region.',
      'Nobody follows the custom because its origin is unclear.',
    ],
    note: 'Whatever its origin (may be) は「起源が何であれ」。little else has remained unchanged は「ほかはほとんど変わってしまった」。',
  },
  {
    level: 3,
    tag: 'leave it to … to + whether 節',
    text: "The author leaves it to the reader to decide whether the hero's final choice was an act of courage or of fear.",
    options: [
      "The author does not say whether the hero's last decision was brave or cowardly.",
      'The author decides that the hero acted out of fear.',
      "The reader is told that the hero's choice was courageous.",
    ],
    note: 'leaves it to the reader to decide の it は to decide 以下。or of fear は or (an act) of fear の省略。',
  },

  // ---- 4: 特殊構文 ----
  {
    level: 4,
    tag: '強調構文 It was not until … that',
    text: 'It was not until the letters were published that the public learned how deeply the two writers had disliked each other.',
    options: [
      "People found out about the writers' mutual dislike only after the letters appeared.",
      'The public knew about the dislike before the letters were published.',
      'The two writers disliked each other until the letters were published.',
    ],
    note: 'It was not until A that B は「A して初めて B した」。',
  },
  {
    level: 4,
    tag: '倒置（Only after …）',
    text: 'Only after the experiment had been repeated several times did the team begin to trust the result.',
    options: [
      'The team did not trust the result until several repetitions had been done.',
      'The team trusted the result and then repeated the experiment.',
      'The team repeated the experiment only once before trusting it.',
    ],
    note: 'Only … が文頭に出ると、主節が疑問文の語順（did the team begin）になる。',
  },
  {
    level: 4,
    tag: 'no more … than',
    text: 'A whale is no more a fish than a horse is.',
    options: [
      'A whale is not a fish, just as a horse is not.',
      'A whale is more like a fish than a horse is.',
      'Both a whale and a horse are fish.',
    ],
    note: 'A is no more B than C is は「C が B でないのと同じく、A も B でない」。両方とも否定。',
  },
  {
    level: 4,
    tag: 'not so much A as B',
    text: "He is not so much a scholar as a collector of other people's ideas.",
    options: [
      "He is better described as someone who gathers others' ideas than as a scholar.",
      'He is a great scholar who also collects ideas.',
      'He is neither a scholar nor a collector.',
    ],
    note: 'not so much A as B は「A というよりむしろ B」。言いたいのは B のほう。',
  },
  {
    level: 4,
    tag: '仮定法過去完了の倒置',
    text: 'Had the bridge been inspected properly, the accident might never have happened.',
    options: [
      'The bridge was not properly inspected, and the accident happened.',
      'The bridge was inspected properly, but the accident still happened.',
      'The accident did not happen because the bridge was inspected.',
    ],
    note: 'Had the bridge been … は If the bridge had been … の if を省いて倒置した形。事実はその逆。',
  },
  {
    level: 4,
    tag: '倒置（Rarely …）',
    text: 'Rarely does a single invention transform daily life as thoroughly as the printing press did.',
    options: [
      'Few inventions have changed everyday life as completely as the printing press.',
      'The printing press rarely changed daily life.',
      'Many inventions have transformed life more than the printing press.',
    ],
    note: '否定の副詞 Rarely が文頭に出て does a single invention transform と倒置。did は transformed daily life の代わり。',
  },
  {
    level: 4,
    tag: '強調構文 It is … that + rather than',
    text: 'It is the questions we fail to ask, rather than the answers we get wrong, that hold back our understanding.',
    options: [
      'Unasked questions limit our understanding more than incorrect answers do.',
      'Wrong answers are what mainly hold back our understanding.',
      'We understand more when we avoid asking questions.',
    ],
    note: 'It is A that … の強調構文。A が長い（the questions … wrong）ので、that hold を見つけて枠をつかむ。',
  },
  {
    level: 4,
    tag: '倒置（So … that）',
    text: 'So gradual was the change that those who lived through it hardly noticed anything at all.',
    options: [
      'The change happened so slowly that people living at the time were barely aware of it.',
      'The change was sudden, and everyone noticed it.',
      'Few people lived through the gradual change.',
    ],
    note: 'The change was so gradual that … の So gradual が文頭に出た形。hardly は「ほとんど〜ない」。',
  },

  // ---- 5: 圧縮と省略 ----
  {
    level: 5,
    tag: '名詞構文 + 無生物主語',
    text: 'The failure of the reform to produce the promised results led many of its supporters to question its basic assumptions.',
    options: [
      'Because the reform did not deliver what was promised, many supporters began to doubt the ideas behind it.',
      'Supporters of the reform questioned those who failed to keep their promises.',
      'The reform produced the promised results, which its supporters then questioned.',
    ],
    note: 'The failure of the reform to produce … は The reform failed to produce … を名詞にしたもの。led A to do は「A に〜させた」。',
  },
  {
    level: 5,
    tag: '二重否定',
    text: 'No one who has seriously studied the period can fail to be struck by how rapidly attitudes changed.',
    options: [
      'Anyone who studies the period seriously will notice how fast attitudes changed.',
      'Serious students of the period fail to notice how attitudes changed.',
      'No one has seriously studied how attitudes changed in the period.',
    ],
    note: 'No one … can fail to は否定が2つで「だれでも必ず〜する」。',
  },
  {
    level: 5,
    tag: '譲歩の as + the 比較級',
    text: 'Strange as it may seem, the more information people are given, the less confident some of them become.',
    options: [
      'Although it sounds odd, extra information makes some people less sure of themselves.',
      'It is strange that information makes everyone more confident.',
      'People seem strange when they are given less information.',
    ],
    note: 'Strange as it may seem は Though it may seem strange と同じ（形容詞 + as + 主語 + 動詞）。',
  },
  {
    level: 5,
    tag: '長い挿入',
    text: 'The scientist, whose early work had been ignored and, in some cases, openly mocked, lived to see it become the foundation of a new field.',
    options: [
      'Her early work was once ignored or laughed at, but she survived to see it become the basis of a new field.',
      'The scientist ignored and mocked the early work that founded a new field.',
      'The scientist died before her mocked work became important.',
    ],
    note: 'コンマの間（whose … mocked）を飛ばすと The scientist lived to see it become … 。lived to see は「生きて〜を見届けた」。',
  },
  {
    level: 5,
    tag: '共通関係',
    text: 'We tend to condemn in others, and to excuse in ourselves, exactly the same kind of behavior.',
    options: [
      'We blame other people for behavior that we forgive in ourselves.',
      'We blame ourselves for what we forgive in others.',
      'We excuse both others and ourselves for the same behavior.',
    ],
    note: 'condemn と excuse の両方の目的語が、最後の exactly the same kind of behavior。目的語が後ろに回っている。',
  },
  {
    level: 5,
    tag: '省略',
    text: 'Few of the predictions made at the time, however confidently, have turned out to be even roughly correct.',
    options: [
      'Most predictions from that time, even the confident ones, have proved quite wrong.',
      'Predictions made confidently at the time were mostly correct.',
      'Few predictions were made confidently at the time.',
    ],
    note: 'however confidently のあとに (they were made) が省略されている。Few … correct は「正しかったものはほとんどない」。',
  },
  {
    level: 5,
    tag: 'That 節が主語',
    text: 'That language shapes thought is an idea easier to state than to prove.',
    options: [
      'It is simple to claim that language influences thinking, but hard to demonstrate it.',
      'It has been proved that language shapes thought.',
      'It is easier to prove than to say that language shapes thought.',
    ],
    note: '文頭の That は「〜ということ」。That language shapes thought までが主語で、述語動詞は is。',
  },
  {
    level: 5,
    tag: '比較（Nothing is more … than）+ 同格',
    text: 'Nothing is more damaging to a young researcher than the belief that every question worth asking has already been answered.',
    options: [
      'Believing that no good questions remain is the most harmful thing for a young researcher.',
      'Young researchers are damaged by asking questions that have already been answered.',
      'Nothing damages a young researcher who believes in asking questions.',
    ],
    note: 'Nothing is more A than B は「B がいちばん A だ」。that 以下は the belief の中身。worth asking が question を説明する。',
  },

  // ---- 6: 京大型の長い一文 ----
  {
    level: 6,
    tag: 'What 節主語 + not A but B + 挿入',
    text: 'What distinguishes a great teacher from a merely competent one is not the amount of knowledge she possesses but the ability to sense, often before the students themselves do, where their understanding is about to break down.',
    options: [
      'A great teacher stands out by anticipating where students will stop understanding, not by knowing more.',
      'A great teacher knows far more than a competent one and corrects students after they fail.',
      'Students usually sense their own difficulties before a great teacher does.',
    ],
    note: '骨組みは What distinguishes A from B is not X but Y。コンマの挿入を飛ばすと to sense where … 。do は sense の代わり。',
  },
  {
    level: 6,
    tag: 'Far from -ing + 同格的な言い直し',
    text: 'Far from being a neutral record of what happened, a history book is the product of countless decisions about what to include and what to leave out, decisions which the reader is rarely invited to examine.',
    options: [
      'A history book is not neutral: it results from many choices about what to put in and leave out, and readers seldom get to inspect those choices.',
      'History books neutrally record events and invite readers to examine them.',
      'Readers decide what a history book includes and leaves out.',
    ],
    note: 'Far from being … は「〜であるどころか」。最後の decisions which … は前の countless decisions の言い直し。',
  },
  {
    level: 6,
    tag: '仮定法の倒置 + 同格の that',
    text: 'Had early astronomers not been willing to record observations that contradicted the accepted view, it is doubtful whether the idea that the earth moves would ever have been taken seriously.',
    options: [
      'Because early astronomers recorded data that went against the accepted view, the idea of a moving earth came to be taken seriously.',
      'Early astronomers refused to record observations against the accepted view, so the idea of a moving earth was ignored.',
      'The accepted view was that the earth moves, and astronomers simply confirmed it.',
    ],
    note: 'Had … not been は If … had not been の倒置で、事実は「記録した」。the idea that the earth moves の that は同格。',
  },
  {
    level: 6,
    tag: 'not so much A as B + 挿入',
    text: 'The difficulty lies not so much in finding people who agree that the problem is serious as in persuading them to give up, even temporarily, the comforts that created it.',
    options: [
      'Finding people who think the problem is serious is easy enough; the hard part is getting them to give up the comforts that caused it.',
      'The main difficulty is finding anyone who thinks the problem is serious.',
      'People have already given up the comforts that created the problem.',
    ],
    note: 'lies not so much in A as in B は「難しさは A よりむしろ B にある」。give up の目的語は、挿入のあとの the comforts。',
  },
  {
    level: 6,
    tag: '強調構文（It is because … that）+ not A but B',
    text: 'It is precisely because memory does not store experience the way a camera stores images, but rebuilds it each time from fragments, that two honest witnesses can give incompatible accounts of the same event.',
    options: [
      'Memory reconstructs events from pieces rather than recording them exactly, which is why truthful witnesses may contradict each other.',
      'Witnesses contradict each other because at least one of them is lying.',
      'Memory stores experience exactly as a camera stores images.',
    ],
    note: 'It is because … that … の強調構文。because 節の中が does not store …, but rebuilds … 。後ろの that を見つけるまで because 節が続く。',
  },
  {
    level: 6,
    tag: 'No sooner … than + 挿入',
    text: 'No sooner had the new technique been shown to work in the laboratory than questions began to be raised about whether it could, or indeed should, be applied outside it.',
    options: [
      'As soon as the technique succeeded in the lab, people started asking whether it was possible, and right, to use it elsewhere.',
      'Questions about the technique were raised long before it worked in the laboratory.',
      'The technique was applied outside the laboratory as soon as it worked.',
    ],
    note: 'No sooner had A than B は「A するとすぐ B」。could, or indeed should, be applied は「使えるのか、そもそも使うべきなのか」。',
  },
  {
    level: 6,
    tag: '譲歩の However + only when',
    text: 'However persuasive an argument may appear when it is presented in isolation, its real strength can be judged only when it is set beside the strongest objection that can be made against it.',
    options: [
      'However convincing an argument looks alone, its true strength shows only when it is compared with the best objection to it.',
      'A persuasive argument needs no comparison with objections.',
      'Arguments presented in isolation are always weak.',
    ],
    note: 'However + 形容詞 + 主語 + may … は「どれほど〜でも」。主節は its real strength can be judged only when … 。',
  },
  {
    level: 6,
    tag: '同格の that + 挿入 + 関係詞 + 比較',
    text: 'The assumption that economic growth will, sooner or later, solve the very problems it creates rests on a confidence in human ingenuity which the historical record supports less firmly than its defenders suppose.',
    options: [
      'History gives weaker support than supporters think to the belief that growth will eventually fix the problems it causes.',
      'The historical record firmly proves that growth solves its own problems.',
      'Defenders of economic growth doubt human ingenuity.',
    ],
    note: '主語は The assumption that … creates まで、述語動詞は rests on。which 節は a confidence を説明し、supports の目的語が which。',
  },
];
