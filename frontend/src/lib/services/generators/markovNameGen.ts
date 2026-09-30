// src/lib/services/generators/markovNameGen.ts
// N-gram Markov Chain Phonetic Name Generator for Fantasy Cultures

export type CultureKey = 'common' | 'human' | 'elven' | 'dwarven' | 'draconic' | 'orcish';

export interface MarkovModel {
  order: number;
  transitions: Map<string, string[]>;
  starts: string[];
}

export const CORPORA: Record<string, string[]> = {
  common: [
    'Arthur', 'Alden', 'Beric', 'Brandon', 'Caleb', 'Cedric', 'Corbin', 'Daniel',
    'Donald', 'Dustin', 'Edgar', 'Edmund', 'Eldon', 'Gareth', 'George', 'Gerald',
    'Godwin', 'Gregory', 'Harold', 'Henry', 'Jack', 'Julian', 'Lucas', 'Marcus',
    'Martin', 'Oliver', 'Oswald', 'Peter', 'Raymond', 'Richard', 'Robert', 'Roger',
    'Ronald', 'Samuel', 'Simon', 'Thomas', 'Tristan', 'Walter', 'Warren', 'William',
    'Adelaide', 'Beatrice', 'Clara', 'Eleanor', 'Genevieve', 'Hannah', 'Isolde',
    'Lucia', 'Marian', 'Rowena', 'Victoria', 'Wilhelmina'
  ],
  human: [
    'Arthur', 'Alden', 'Beric', 'Brandon', 'Caleb', 'Cedric', 'Corbin', 'Daniel',
    'Donald', 'Dustin', 'Edgar', 'Edmund', 'Eldon', 'Gareth', 'George', 'Gerald',
    'Godwin', 'Gregory', 'Harold', 'Henry', 'Jack', 'Julian', 'Lucas', 'Marcus',
    'Martin', 'Oliver', 'Oswald', 'Peter', 'Raymond', 'Richard', 'Robert', 'Roger',
    'Ronald', 'Samuel', 'Simon', 'Thomas', 'Tristan', 'Walter', 'Warren', 'William',
    'Adelaide', 'Beatrice', 'Clara', 'Eleanor', 'Genevieve', 'Hannah', 'Isolde',
    'Lucia', 'Marian', 'Rowena', 'Victoria', 'Wilhelmina'
  ],
  elven: [
    'Aelion', 'Aerin', 'Aladriel', 'Amastacia', 'Arahael', 'Araleth', 'Caelynn',
    'Celeborn', 'Coronal', 'Eladriel', 'Elandor', 'Elasor', 'Elenion', 'Faenor',
    'Faelar', 'Fhaorn', 'Galathil', 'Glorfindel', 'Ilphrin', 'Ilyrana', 'Kaelen',
    'Laurelin', 'Legolas', 'Lindir', 'Lothiriel', 'Mithrandir', 'Quelanna', 'Riel',
    'Sariel', 'Silvanus', 'Sylas', 'Thalion', 'Theodred', 'Valandil', 'Vanyar',
    'Yavanna', 'Elynwe', 'Silvyr', 'Miriath', 'Alarielle', 'Galadriel'
  ],
  dwarven: [
    'Balin', 'Bardin', 'Bofur', 'Bombur', 'Dain', 'Dori', 'Dwalin', 'Fundin',
    'Gimli', 'Gloin', 'Groth', 'Grungni', 'Harbek', 'Hjalmar', 'Kazador', 'Khelgar',
    'Kildrak', 'Morgran', 'Oin', 'Orsik', 'Rorik', 'Runil', 'Skalf', 'Snorri',
    'Thorek', 'Thorin', 'Thrain', 'Thror', 'Torbek', 'Ulfgar', 'Ungrim', 'Varok',
    'Vondal', 'Brakka', 'Durgar', 'Kragna', 'Morga', 'Thrund'
  ],
  draconic: [
    'Arveiaturace', 'Balagos', 'Brazazem', 'Claugiyliamatar', 'Dalvash', 'Dauthuz',
    'Garyx', 'Heskan', 'Ignacus', 'Karkaron', 'Medrash', 'Nadarr', 'Othokent',
    'Patrin', 'Rhogar', 'Shamash', 'Shedinn', 'Tarhun', 'Torinn', 'Valignat',
    'Vermithrax', 'Voraghan', 'Vrakhis', 'Xarlok', 'Zalyros', 'Kriv', 'Ghesh',
    'Balandar', 'Varanth', 'Drakhan', 'Ignis', 'Zulkor'
  ],
  orcish: [
    'Azog', 'Bolg', 'Borgan', 'Dench', 'Feng', 'Ghash', 'Gorbag', 'Grishnakh',
    'Grok', 'Gruumsh', 'Hokan', 'Karg', 'Kragthor', 'Lurtz', 'Mog', 'Morgrum',
    'Nazgash', 'Olag', 'Ront', 'Shagrat', 'Shump', 'Thokk', 'Ugarth', 'Ugluk',
    'Varg', 'Wrosh', 'Yaghar', 'Zarg', 'Zog', 'Gorgul', 'Brak', 'Kruel'
  ]
};

const START_TOKEN = '^';
const END_TOKEN = '$';

export class MarkovNameGenerator {
  private models = new Map<string, MarkovModel>();
  private defaultOrder: number;

  constructor(order = 2) {
    this.defaultOrder = order;
    this.trainBuiltinCorpora();
  }

  private trainBuiltinCorpora(): void {
    for (const [culture, words] of Object.entries(CORPORA)) {
      this.models.set(culture.toLowerCase(), this.trainModel(words, this.defaultOrder));
    }
  }

  public trainModel(words: string[], order = 2): MarkovModel {
    const transitions = new Map<string, string[]>();
    const starts: string[] = [];

    for (const rawWord of words) {
      const word = rawWord.trim().toLowerCase();
      if (!word) continue;

      const padded = START_TOKEN.repeat(order) + word + END_TOKEN;
      const initialGram = padded.slice(0, order);
      if (!starts.includes(initialGram)) {
        starts.push(initialGram);
      }

      for (let i = 0; i <= padded.length - order - 1; i++) {
        const gram = padded.slice(i, i + order);
        const nextChar = padded[i + order];
        const existing = transitions.get(gram) || [];
        existing.push(nextChar);
        transitions.set(gram, existing);
      }
    }

    return { order, transitions, starts };
  }

  public generateName(
    culture = 'common',
    minLen = 4,
    maxLen = 12,
    seedRng?: () => number
  ): string {
    const rng = seedRng || Math.random;
    const normalizedKey = (culture || 'common').toLowerCase().trim();
    const model = this.models.get(normalizedKey) || this.models.get('common');

    if (!model || model.transitions.size === 0) {
      return this.titleCase(culture || 'Traveler');
    }

    const { order, transitions, starts } = model;
    const maxAttempts = 80;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let currentGram = starts[Math.floor(rng() * starts.length)];
      let result = '';

      for (let step = 0; step < maxLen + 10; step++) {
        const nextChars = transitions.get(currentGram);
        if (!nextChars || nextChars.length === 0) break;

        const nextChar = nextChars[Math.floor(rng() * nextChars.length)];
        if (nextChar === END_TOKEN) break;

        result += nextChar;
        currentGram = (currentGram + nextChar).slice(-order);
      }

      const cleaned = result.replace(/[^a-zA-Z]/g, '');
      if (cleaned.length >= minLen && cleaned.length <= maxLen) {
        return this.titleCase(cleaned);
      }
    }

    // Fallback: pick a random item from corpus if generator produced out-of-bound string
    const corpusList = CORPORA[normalizedKey] || CORPORA.common;
    const fallback = corpusList[Math.floor(rng() * corpusList.length)];
    return this.titleCase(fallback);
  }

  private titleCase(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
}

// Global default singleton
export const markovNameEngine = new MarkovNameGenerator(2);

export function generateName(
  culture = 'common',
  minLen = 4,
  maxLen = 12,
  seedRng?: () => number
): string {
  return markovNameEngine.generateName(culture, minLen, maxLen, seedRng);
}
