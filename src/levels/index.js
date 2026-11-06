import * as konbini from './konbini/world.js';
import * as konbiniStory from './konbini/story.js';
import * as ceda from './ceda/world.js';
import * as cedaStory from './ceda/story.js';
import * as cdmx from './cdmx/world.js';
import * as cdmxStory from './cdmx/story.js';

export const LEVELS = {
  konbini: { build: konbini.buildWorld, story: konbiniStory.runStory, clock: 23 * 60 + 40 },
  ceda: { build: ceda.buildWorld, story: cedaStory.runStory, clock: 4 * 60 + 10, characters: cedaStory.CHARACTERS },
  // Non-playable showcase: story.js drives the camera through SHOTS. `?shot=N` plays one shot.
  cdmx: { build: cdmx.buildWorld, story: cdmxStory.runStory, clock: 3 * 60, showcase: true },
};
