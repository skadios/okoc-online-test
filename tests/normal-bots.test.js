import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createGame,publicState,tick,startRound,swapKing} from '../server/game-engine.js';
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


test('bots do not repeat a Council vote when their previous vote was false',async()=>{
  const players=[
    {id:'human-1',name:'Player'},
    {id:'bot-1',name:'Armand'},
    {id:'human-2',name:'Player 2'},
    {id:'bot-2',name:'Béatrice'}
  ];
  const game=createGame(players,()=>0.2);
  game._botIds=new Set(['bot-1','bot-2']);
  game._humanId='human-1';
  game.phase='playing';
  game.currentPlayerId='human-1';
  game.pending={
    type:'council',stage:'voting',actorId:'human-1',eligible:['bot-1','bot-2'],
    votes:{'bot-1':false},card:{id:'council',en:'Council Meeting',fr:'Réunion du conseil'}
  };
  const {action}=await import('../server/game-engine.js');
  // A false vote is still a submitted vote; the bot must move on to the next voter.
  assert.equal(await runBotStep(game),true);
  assert.equal(Object.hasOwn(game.pending.votes,'bot-1'),true);
  assert.equal(Object.hasOwn(game.pending.votes,'bot-2'),true);
});


test('crown exchange swaps physical seats and role-specific hands but preserves each player gold',()=>{
  const game=createGame([
    {id:'human-1',name:'Former King'},
    {id:'human-2',name:'Noble A'},
    {id:'bot-1',name:'Bot B'},
    {id:'bot-2',name:'Bot C'}
  ],()=>0.2);
  const oldKing=game.players.find(p=>p.role==='king');
  const newKing=game.players.find(p=>p.role==='noble');
  const oldKingGold=oldKing.gold=1370;
  const newKingGold=newKing.gold=420;
  const kingSeat=game.seatOrder.indexOf(oldKing.id);
  const nobleSeat=game.seatOrder.indexOf(newKing.id);
  const kingCard={id:'king-test',instanceId:'king-test-1',side:'king'};
  const nobleCard={id:'noble-test',instanceId:'noble-test-1',side:'noble'};
  oldKing.hand=[kingCard];
  newKing.hand=[nobleCard];

  swapKing(game,newKing.id);

  assert.equal(game.kingId,newKing.id);
  assert.equal(newKing.role,'king');
  assert.equal(oldKing.role,'noble');
  assert.equal(oldKing.gold,oldKingGold);
  assert.equal(newKing.gold,newKingGold);
  assert.equal(oldKing.hand[0],nobleCard);
  assert.equal(newKing.hand[0],kingCard);
  assert.equal(game.seatOrder.indexOf(newKing.id),kingSeat);
  assert.equal(game.seatOrder.indexOf(oldKing.id),nobleSeat);
  const state=publicState(game,newKing.id);
  assert.deepEqual(state.players.map(p=>p.id),game.seatOrder);
  assert.equal(state.players.find(p=>p.id===oldKing.id).gold,oldKingGold);
  assert.equal(state.players.find(p=>p.id===newKing.id).gold,newKingGold);
});


test('Sub Rosa revealed hand cards resolve directly when tapped',()=>{
  const source=fs.readFileSync(new URL('../client/src/main.jsx',import.meta.url),'utf8');
  assert.match(source,/onClick=\{\(\)=>send\(\{mode:'hand',cardInstanceId:c\.instanceId\}\)\}/);
  assert.doesNotMatch(source,/setPeekSelection\(c\.instanceId\)/);
  assert.doesNotMatch(source,/subrosa-confirm/);
});
