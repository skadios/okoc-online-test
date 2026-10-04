import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createGame,publicState,tick,startRound} from '../server/game-engine.js';
import {runBotStep} from '../server/tutorial-ai.js';

test('normal 4-player room with 1 human and 3 bots reaches playable game state',()=>{
  const players=[
    {id:'bot-1',name:'Armand',connected:true},
    {id:'human-1',name:'Player',connected:true},
    {id:'bot-2',name:'Béatrice',connected:true},
    {id:'bot-3',name:'Charles',connected:true}
  ];
  const game=createGame(players,()=>0.01);
  game._botIds=new Set(['bot-1','bot-2','bot-3']);
  game._humanId='human-1';
  game.kingReveal=null;
  startRound(game);

  assert.equal(game.players.length,4);
  assert.equal(game.players.filter(p=>game._botIds.has(p.id)).length,3);
  assert.equal(game.currentPlayerId,'bot-1');
  assert.ok(game.players.every(p=>p.hand.length===8));

  assert.doesNotThrow(()=>tick(game));
  assert.doesNotThrow(()=>runBotStep(game));
  const state=publicState(game,'human-1');
  assert.equal(state.players.length,4);
  assert.equal(state.hand.length,8);
  assert.ok(state.currentPlayerId);
});

test('frontend imports every React hook it calls',()=>{
  const source=fs.readFileSync(new URL('../client/src/main.jsx',import.meta.url),'utf8');
  const importLine=source.split('\n').find(line=>line.startsWith("import React,{"));
  assert.ok(importLine,'React hook import line is missing.');
  for(const hook of ['useCallback','useEffect','useMemo','useRef','useState']){
    assert.match(importLine,new RegExp('\\b'+hook+'\\b'),`Missing React hook import: ${hook}`);
  }
});
