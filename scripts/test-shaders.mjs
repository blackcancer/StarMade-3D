import { setStarMadeShaderSources } from '../src/shaders/sources.js';
import { readShaderCorpus } from './shader-corpus.mjs';
setStarMadeShaderSources(readShaderCorpus());
