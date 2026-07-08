export type SeedRepresentative = {
  qid: string;
  label: string;
  description: string;
  fallbackStatus: string;
  entityKind: 'human' | 'account' | 'organization';
};

export const seedRepresentatives = [
  {
    qid: 'Q58008262',
    label: 'Louis Rossmann',
    description: 'American YouTuber and right-to-repair advocate',
    fallbackStatus: 'contacted, awaiting response',
    entityKind: 'human',
  },
  {
    qid: 'Q13423853',
    label: 'PewDiePie',
    description: 'Swedish YouTuber',
    fallbackStatus: '',
    entityKind: 'human',
  },
  {
    qid: 'Q70071434',
    label: 'Kitboga',
    description: 'American Twitch streamer and scambaiter',
    fallbackStatus: '',
    entityKind: 'human',
  },
  {
    qid: 'Q117818819',
    label: 'Scammer Payback',
    description: 'American scambaiting YouTube channel',
    fallbackStatus: '',
    entityKind: 'account',
  },
  {
    qid: 'Q111862397',
    label: 'Linus Tech Tips',
    description: 'Canadian technology YouTube channel',
    fallbackStatus: '',
    entityKind: 'account',
  },
  {
    qid: 'Q15994958',
    label: 'Marques Brownlee',
    description: 'American YouTuber and technology reviewer',
    fallbackStatus: '',
    entityKind: 'human',
  },
  {
    qid: 'Q21621919',
    label: 'Post Malone',
    description: 'American rapper, singer, songwriter, and record producer',
    fallbackStatus: '',
    entityKind: 'human',
  },
] satisfies SeedRepresentative[];

export const seedRepresentativeByQid = new Map(seedRepresentatives.map((rep) => [rep.qid, rep]));

export const isValidQid = (qid: string): boolean => /^Q[1-9]\d{0,11}$/.test(qid);
