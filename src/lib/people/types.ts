export type PersonTuple = [id: string, name: string, aliases: string[], popularity: number];

export type PersonSource = 'local' | 'remote' | 'local+remote';

export type PersonResult = {
  id: string;
  name: string;
  aliases: string[];
  popularity: number;
  score: number;
  source: PersonSource;
};

export type PeopleManifest = {
  version: string;
  popularCount: number;
  shardStrategy: 'prefix';
  prefixLength: number;
  largeShardPrefixLength: number;
  largePrefixes: string[];
};
