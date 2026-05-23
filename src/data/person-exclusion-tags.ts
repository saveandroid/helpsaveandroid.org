export type PersonExclusionTag = {
  slug: string;
  label: string;
  publicReason: string;
};

export const personExclusionTags = [
  {
    slug: 'animal-harm-concerns',
    label: 'Animal Harm Concerns',
    publicReason: 'Animal Harm Concerns',
  },
  {
    slug: 'nuisance-streaming',
    label: 'Nuisance Streaming',
    publicReason: 'Nuisance Streaming',
  },
  {
    slug: 'harassment-content',
    label: 'Harassment Content',
    publicReason: 'Harassment Content',
  },
  {
    slug: 'doxxing-or-privacy-violations',
    label: 'Doxxing or Privacy Violations',
    publicReason: 'Doxxing or Privacy Violations',
  },
  {
    slug: 'stalking-or-targeted-harassment',
    label: 'Stalking or Targeted Harassment',
    publicReason: 'Stalking or Targeted Harassment',
  },
  {
    slug: 'non-consensual-sexual-content',
    label: 'Non-Consensual Sexual Content',
    publicReason: 'Non-Consensual Sexual Content',
  },
  {
    slug: 'sexualisation-of-minors',
    label: 'Sexualisation of Minors',
    publicReason: 'Sexualisation of Minors',
  },
  {
    slug: 'violent-threats',
    label: 'Violent Threats',
    publicReason: 'Violent Threats',
  },
  {
    slug: 'hate-or-dehumanisation',
    label: 'Hate or Dehumanisation',
    publicReason: 'Hate or Dehumanisation',
  },
  {
    slug: 'scam-or-fraud-promotion',
    label: 'Scam or Fraud Promotion',
    publicReason: 'Scam or Fraud Promotion',
  },
  {
    slug: 'gambling-promotion',
    label: 'Gambling Promotion',
    publicReason: 'Gambling Promotion',
  },
  {
    slug: 'exploitative-financial-content',
    label: 'Exploitative Financial Content',
    publicReason: 'Exploitative Financial Content',
  },
  {
    slug: 'medical-misinformation',
    label: 'Medical Misinformation',
    publicReason: 'Medical Misinformation',
  },
  {
    slug: 'self-harm-promotion',
    label: 'Self-Harm Promotion',
    publicReason: 'Self-Harm Promotion',
  },
  {
    slug: 'eating-disorder-promotion',
    label: 'Eating Disorder Promotion',
    publicReason: 'Eating Disorder Promotion',
  },
  {
    slug: 'drug-abuse-promotion',
    label: 'Drug Abuse Promotion',
    publicReason: 'Drug Abuse Promotion',
  },
  {
    slug: 'weapons-or-violence-promotion',
    label: 'Weapons or Violence Promotion',
    publicReason: 'Weapons or Violence Promotion',
  },
  {
    slug: 'shock-content',
    label: 'Shock Content',
    publicReason: 'Shock Content',
  },
  {
    slug: 'public-humiliation-content',
    label: 'Public Humiliation Content',
    publicReason: 'Public Humiliation Content',
  },
  {
    slug: 'revenge-content',
    label: 'Revenge Content',
    publicReason: 'Revenge Content',
  },
  {
    slug: 'ragebait-primary',
    label: 'Ragebait-Primary Content',
    publicReason: 'Ragebait-Primary Content',
  },
  {
    slug: 'serial-controversy-farming',
    label: 'Serial Controversy Farming',
    publicReason: 'Serial Controversy Farming',
  },
  {
    slug: 'impersonation',
    label: 'Impersonation',
    publicReason: 'Impersonation',
  },
  {
    slug: 'synthetic-persona',
    label: 'Synthetic Persona',
    publicReason: 'Synthetic Persona',
  },
  {
    slug: 'fictional-character',
    label: 'Fictional Character',
    publicReason: 'Fictional Character',
  },
  {
    slug: 'brand-or-organisation',
    label: 'Brand or Organisation',
    publicReason: 'Brand or Organisation',
  },
  {
    slug: 'private-person',
    label: 'Private Person',
    publicReason: 'Private Person',
  },
] satisfies PersonExclusionTag[];

export const personExclusionTagBySlug = new Map(personExclusionTags.map((tag) => [tag.slug, tag]));
