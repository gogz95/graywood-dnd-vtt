// src/lib/data/srdBackgrounds.ts
// Standard 5e SRD Background Mechanics & Trait Tables

export interface SrdBackground {
  name: string;
  description: string;
  skillProficiencies: [string, string];
  toolOrLanguageProficiencies: string[];
  startingEquipment: string[];
  feature: {
    name: string;
    description: string;
  };
}

export const SRD_BACKGROUNDS: Record<string, SrdBackground> = {
  Acolyte: {
    name: 'Acolyte',
    description: 'You have spent your life in the service of a temple to a specific god or pantheon of gods. You act as an intermediary between the realm of the holy and the mortal world.',
    skillProficiencies: ['Insight', 'Religion'],
    toolOrLanguageProficiencies: ['Two languages of your choice'],
    startingEquipment: [
      'Holy symbol (a gift to you when you entered the priesthood)',
      'Prayer book or prayer wheel',
      '5 sticks of incense',
      'Vestments',
      'Set of common clothes',
      'Pouch containing 15 gp'
    ],
    feature: {
      name: 'Shelter of the Faithful',
      description: 'As an acolyte, you command the respect of those who share your faith, and you can perform the religious ceremonies of your deity. You and your adventuring companions can expect to receive free healing and care at a temple, shrine, or other established presence of your faith.'
    }
  },
  Criminal: {
    name: 'Criminal',
    description: 'You are an experienced criminal with a history of breaking the law. You have spent plenty of time among other criminals and still have contacts within the criminal underworld.',
    skillProficiencies: ['Deception', 'Stealth'],
    toolOrLanguageProficiencies: ["Thieves' tools", 'One type of gaming set'],
    startingEquipment: [
      'A crowbar',
      'A set of dark common clothes including a hood',
      'Pouch containing 15 gp'
    ],
    feature: {
      name: 'Criminal Contact',
      description: 'You have a reliable and trustworthy contact who acts as your liaison to a network of other criminals. You know how to get messages to and from your contact, even over great distances.'
    }
  },
  'Folk Hero': {
    name: 'Folk Hero',
    description: 'You come from a humble social rank, but you are destined for so much more. Already the people of your home village regard you as their champion.',
    skillProficiencies: ['Animal Handling', 'Survival'],
    toolOrLanguageProficiencies: ["One type of artisan's tools", 'Vehicles (land)'],
    startingEquipment: [
      "A set of artisan's tools (one of your choice)",
      'A shovel',
      'An iron pot',
      'A set of common clothes',
      'Pouch containing 10 gp'
    ],
    feature: {
      name: 'Rustic Hospitality',
      description: 'Since you come from the ranks of the common folk, you fit in among them with ease. You can find a place to hide, rest, or recuperate among other commoners, unless you have shown yourself to be a danger to them.'
    }
  },
  Noble: {
    name: 'Noble',
    description: 'You understand wealth, power, and privilege. You carry a noble title, and your family owns land, collects taxes, and wields significant political influence.',
    skillProficiencies: ['History', 'Persuasion'],
    toolOrLanguageProficiencies: ['One type of gaming set', 'One language of your choice'],
    startingEquipment: [
      'A set of fine clothes',
      'A signet ring',
      'A scroll of pedigree',
      'Purse containing 25 gp'
    ],
    feature: {
      name: 'Position of Privilege',
      description: 'Thanks to your noble birth, people are inclined to think the best of you. You are welcome in high society, and people assume you have the right to be wherever you are. Commoners make every effort to accommodate you.'
    }
  },
  Sage: {
    name: 'Sage',
    description: 'You spent years learning the lore of the multiverse. You scoured manuscripts, studied scrolls, and listened to the greatest experts on the subjects that interest you.',
    skillProficiencies: ['Arcana', 'History'],
    toolOrLanguageProficiencies: ['Two languages of your choice'],
    startingEquipment: [
      'A bottle of black ink',
      'A quill',
      'A small knife',
      'A letter from a dead colleague posing a question you have not yet been able to answer',
      'A set of common clothes',
      'Pouch containing 10 gp'
    ],
    feature: {
      name: 'Researcher',
      description: 'When you attempt to learn or recall a piece of lore, if you do not know that information, you often know where and from whom you can obtain it. Unearthing the deepest secrets might require a considerable quest.'
    }
  },
  Soldier: {
    name: 'Soldier',
    description: 'War has been your life for as long as you can remember. You trained as a youth, studied the use of weapons and armor, and learned basic survival techniques.',
    skillProficiencies: ['Athletics', 'Intimidation'],
    toolOrLanguageProficiencies: ['One type of gaming set', 'Vehicles (land)'],
    startingEquipment: [
      'An insignia of rank',
      'A trophy taken from a fallen enemy (a dagger, broken blade, or piece of banner)',
      'A set of bone dice or a deck of cards',
      'A set of common clothes',
      'Pouch containing 10 gp'
    ],
    feature: {
      name: 'Military Rank',
      description: 'You have a military rank from your career as a soldier. Soldiers loyal to your former military organization still recognize your authority and influence, and they defer to you if they are of a lower rank.'
    }
  }
};

export const SRD_BACKGROUND_NAMES = Object.keys(SRD_BACKGROUNDS);
