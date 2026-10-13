import * as konbini from './konbini/world.js';
import * as konbiniStory from './konbini/story.js';
import * as ceda from './ceda/world.js';
import * as cedaStory from './ceda/story.js';

export const LEVELS = {
  konbini: { build: konbini.buildWorld, story: konbiniStory.runStory, clock: 23 * 60 + 40 },
  ceda: { build: ceda.buildWorld, story: cedaStory.runStory, clock: 4 * 60 + 10, characters: cedaStory.CHARACTERS },
};
