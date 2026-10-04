import {action, playerById, tick} from './game-engine.js';
import {CARD_MAP} from '../shared/cards.js';

const BOT_IDS=new Set(['tutorial-2','tutorial-3','tutorial-4']);
const humanId(game)='tutorial-1';
const getBotIds=game=>game?game._botIds||BOT_IDS:BOT_IDS;
const isBot=(game,id)=>getBotIds(game).has(id);
const humanId=game=>game?game._humanId||HUMAN_ID:HUMAN_ID;
const SAFE_EFFECTS=new Set([
  'bad_blood','beggars','divine','helping_king','hindsight','icarus','indebted',
  'isolation','loyalty','shadow_deal','subsidies','unprotected','wrath',
  'eye_for_eye','bend_knee','helping_noble','anchor','loyal_dog','debt_collector',
  'royal_parrot','shifting_tides','kings_eye','we_ride','tithe','sub_rosa','scout'
]);
const COMPLEX_EFFECTS=new Set([
  'actors','betrayal','betray_king','council','black_plague','mad_king',
  'snakes','scapegoat','peoples_champion','suppress_rebellion'
]);

const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const bots=game=>game.players.filter(p=>isBot(game,p.id));
const nobles=game=>game.players.filter(p=>p.role==='noble');
const botNobles=game=>nobles(game).filter(p=>isBot(game,p.id));
const randomOf=(items,rng=gameRandom)=>items.length?items[Math.floor(rng()*items.length)]:null;
const gameRandom=()=>Math.random();

function rankedTargets(game,bot,kind='any'){
  let pool=game.players.filter(p=>p.id!==bot.id);
  if(kind==='noble')pool=pool.filter(p=>p.role==='noble');
  if(kind==='bot')pool=pool.filter(p=>isBot(game,p.id));
  if(kind==='botNoble')pool=pool.filter(p=>isBot(game,p.id)&&p.role==='noble');
  if(!pool.length)return [];
  return [...pool].sort((a,b)=>{
    const score=x=>{
      let s=0;
      if(x.role==='king')s+=kind==='noble'?-10:10;
      s+=x.gold;
      if(x.id===humanId(game))s+=80;
      if(x.id===bot.id)s-=10000;
      return s;
    };
    return score(b)-score(a);
  });
}

function chooseTarget(game,bot,kind='any'){
  const pool=rankedTargets(game,bot,kind);
  if(!pool.length)return null;
  // Mostly sensible, occasionally imperfect: the bots should feel human rather than optimal.
  if(pool.some(p=>p.id===humanId(game))&&Math.random()<0.22)return pool.find(p=>p.id===humanId(game));
  if(pool.length>1 && Math.random()<0.25)return pool[Math.floor(Math.random()*Math.min(3,pool.length))];
  return pool[0];
}

function payloadForCard(game,bot,card){
  const nobleTarget=()=>chooseTarget(game,bot,'botNoble')||chooseTarget(game,bot,'noble')||chooseTarget(game,bot,'bot')||chooseTarget(game,bot);
  const anyTarget=()=>chooseTarget(game,bot,'bot')||chooseTarget(game,bot);
  switch(card.effect){
    case'bad_blood':{
      const ns=botNobles(game).filter(p=>p.id!==bot.id).sort((a,b)=>b.gold-a.gold);
      const a=ns[0]||nobleTarget(); const b=ns.find(x=>x.id!==a?.id)||ns[1]||nobleTarget();
      return a&&b&&a.id!==b.id?{targetId:a.id,target2Id:b.id}:null;
    }
    case'allies': { const target=nobleTarget(); return target?{targetId:target.id}:null; }
    case'betrayal':
    case'hindsight':
    case'indebted':
    case'tithe':
    case'grudge':
    case'loyalty':
    case'bend_knee':
    case'loyal_dog':
    case'debt_collector':
    case'royal_parrot':
    case'sub_rosa':
    case'scout':
    case'eye_for_eye':
    case'wrath':
    case'anchor':
    case'shifting_tides':
    case'kings_eye':
    case'we_ride':
    case'shadow_deal':
    case'meat':
      break;
    default:return {};
  }
  if(card.effect==='anchor'){
    const a=anyTarget();const b=rankedTargets(game,bot,'bot').find(x=>x.id!==a?.id)||rankedTargets(game,bot,'any').find(x=>x.id!==a?.id);
    return a&&b?{targetId:a.id,target2Id:b.id}:null;
  }
  if(card.effect==='shifting_tides'||card.effect==='we_ride'){
    const a=chooseTarget(game,bot,'botNoble')||chooseTarget(game,bot,'noble');
    const b=rankedTargets(game,bot,'botNoble').find(x=>x.id!==a?.id)||rankedTargets(game,bot,'noble').find(x=>x.id!==a?.id);
    return a&&b?{targetId:a.id,target2Id:b.id}:null;
  }
  if(card.effect==='loyal_dog'){const target=anyTarget();return target?{targetId:target.id,amount:Math.random()<0.65?100:200}:null;}
  if(card.effect==='shadow_deal'){const target=anyTarget();return target?{targetId:target.id,amount:Math.random()<0.7?100:200}:null;}
  if(card.effect==='royal_parrot'){const target=anyTarget();return target?{targetId:target.id,phrase:'Je respecte la couronne.'}:null;}
  if(card.effect==='loyalty'){const target=anyTarget();return target?{targetId:target.id,mode:'choose'}:null;}
  if(card.effect==='wrath'){const target=chooseTarget(game,bot,'noble')||chooseTarget(game,bot,'bot')||chooseTarget(game,bot);return target?{targetId:target.id,mode:Math.random()<0.2?'bank':'noble'}:null;}
  if(card.effect==='meat')return chooseTarget(game,bot,'botNoble')?{targetId:chooseTarget(game,bot,'botNoble').id}:null;
  const target=nobleTarget();
  return target?{targetId:target.id}:null;
}

function scoreCard(game,bot,card){
  if(card.side!==bot.role)return -999;
  if(card.id==='royal-bomb'||card.effect==='knight')return -10;
  if(!SAFE_EFFECTS.has(card.effect))return -40;
  if(card.lastRoundOnly && game.round!==4)return -999;
  if(card.lastRounds && game.round<3)return -999;
  if(card.minRound && game.round<card.minRound)return -999;
  if(card.requiresGoldAtMost && bot.gold>card.requiresGoldAtMost)return -999;
  let score=20+Math.random()*12;
  if(bot.role==='king'){
    if(['loyal_dog','kings_eye','shifting_tides','anchor','bad_blood','helping_king'].includes(card.effect))score+=12;
    if(bot.gold<700 && ['beggars','subsidies','shadow_deal'].includes(card.effect))score+=10;
  }else{
    if(['shadow_deal','subsidies','bad_blood','hindsight','scout','kings_eye','loyalty'].includes(card.effect))score+=10;
    if(bot.gold<500 && ['beggars','subsidies','shadow_deal'].includes(card.effect))score+=10;
    if(game.round>=3 && ['divine','scout'].includes(card.effect))score+=8;
  }
  // Avoid repeatedly creating the same effect when one is already active.
  if(card.effect==='bad_blood' && bot.effects.some(e=>e.type==='bad_blood'&&e.active))score-=18;
  if(card.effect==='kings_eye' && bot.effects.some(e=>e.type==='kings_eye'))score-=15;
  return score;
}

function chooseCard(game,bot){
  const playable=bot.hand.filter(c=>{
    if(c.side!==bot.role)return false;
    if(c.id==='royal-bomb')return false;
    if(c.effect==='knight')return false;
    if(c.lastRoundOnly&&game.round!==4)return false;
    if(c.lastRounds&&game.round<3)return false;
    if(c.minRound&&game.round<c.minRound)return false;
    if(c.requiresGoldAtMost&&bot.gold>c.requiresGoldAtMost)return false;
    return true;
  });
  const ranked=playable.map(c=>({c,s:scoreCard(game,bot,c)})).sort((a,b)=>b.s-a.s);
  return ranked[0]?.c||null;
}

function actorCanResolveWithoutHuman(game,q){
  if(!q)return true;
  if(q.type==='actorsThank'||q.type==='council'||q.type==='betrayalSupport'||q.type==='betrayKing'||q.type==='champion'||q.type==='snakes'||q.type==='scapegoat'||q.type==='madKingRoll'||q.type==='blackPlague')return false;
  const ids=[];
  // Some pending actions are specifically resolved by the selected target,
  // so a human card-player does not block the bot's response.
  if(q.type==='subRosa' && q.actorId)ids.push(q.actorId);
  if(q.targetId && q.type!=='subRosa')ids.push(q.targetId);
  if(q.rollPlayerId)ids.push(q.rollPlayerId);
  if(q.rollPlayers)ids.push(...q.rollPlayers);
  if(q.currentVoterId)ids.push(q.currentVoterId);
  if(q.aId)ids.push(q.aId);
  if(q.bId)ids.push(q.bId);
  if(q.lowerId)ids.push(q.lowerId);
  if(q.higherId)ids.push(q.higherId);
  return ids.every(id=>id!==humanId(game));
}

function respondPending(game){
  const q=game.pending;
  if(!q)return false;

  // We Ride Together has a strict two-stage sequence. Resolve it explicitly
  // here so a tutorial game can never stop after the two bot rolls.
  if(q.type==='weRide'){
    if(q.stage==='rolling'){
      const humanParticipant=q.aId===humanId(game)||q.bId===humanId(game);
      const missing=[q.aId,q.bId].find(id=>q.rolls?.[id]==null);
      if(missing===humanId(game) || (humanParticipant && !missing))return false;
      if(missing && isBot(game,missing)){
        try{
          action(game,missing,{type:'decision',payload:{roll:true},actionId:`tutorial-we-ride-${Date.now()}-${Math.random()}`});
          return true;
        }catch(error){
          console.error('[OKOC TUTORIAL AI] We Ride bot roll failed',error);
          return false;
        }
      }
      return false;
    }
    if(q.stage==='lowerChoice'){
      if(!isBot(game,q.lowerId))return false;
      try{
        action(game,q.lowerId,{type:'decision',payload:{choice:Math.random()<0.58?'full':'split'},actionId:`tutorial-we-ride-choice-${Date.now()}-${Math.random()}`});
        return true;
      }catch(error){
        console.error('[OKOC TUTORIAL AI] We Ride lower choice failed',error);
        return false;
      }
    }
    if(q.stage==='higherChoice'){
      if(!isBot(game,q.higherId))return false;
      try{
        action(game,q.higherId,{type:'decision',payload:{accept:Math.random()<0.52},actionId:`tutorial-we-ride-answer-${Date.now()}-${Math.random()}`});
        return true;
      }catch(error){
        console.error('[OKOC TUTORIAL AI] We Ride higher choice failed',error);
        return false;
      }
    }
    return false;
  }

  // Resolve multi-player decisions progressively. Bots may act even when the
  // human is one of the participants; only the human's own response should block.
  if(q.type==='actorsThank'){
    const missingBot=game.players.find(p=>isBot(game,p.id)&&!(q.acks||{})[p.id]);
    if(missingBot){action(game,missingBot.id,{type:'decision',payload:{},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
    if(isBot(game,q.actorId)&&Object.keys(q.acks||{}).length>=game.players.length){
      const target=chooseTarget(game,playerById(game,q.actorId),'any');
      if(target){action(game,q.actorId,{type:'decision',payload:{targetId:target.id},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
    }
    return false;
  }
  if(q.type==='betrayalSupport'){
    const missing=q.eligible?.find(id=>isBot(game,id)&&!q.supports.some(x=>x.playerId===id));
    if(missing){action(game,missing,{type:'decision',payload:{support:Math.random()<0.62},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
    return false;
  }
  if(q.type==='betrayKing'){
    const missing=q.eligible?.find(id=>isBot(game,id)&&!q.supports.some(x=>x.playerId===id));
    if(missing){action(game,missing,{type:'decision',payload:{support:Math.random()<0.55},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
    if(q.awaitRoll&&isBot(game,q.rollPlayerId)){
      action(game,q.rollPlayerId,{type:'decision',payload:{roll:true},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;
    }
    return false;
  }
  if(q.type==='council'){
    if(q.stage==='voting'){
      const missing=q.eligible?.find(id=>isBot(game,id)&&!(q.votes||{})[id]);
      if(missing){action(game,missing,{type:'decision',payload:{vote:Math.random()<0.6},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
      return false;
    }
    if(q.stage==='praise'&&isBot(game,q.actorId)){
      action(game,q.actorId,{type:'decision',payload:{ackPraise:true},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;
    }
    return false;
  }
  if(q.type==='snakes'){
    const missing=q.eligible?.find(id=>isBot(game,id)&&!(q.votes||{})[id]);
    if(missing){action(game,missing,{type:'decision',payload:{vote:Math.random()<0.5},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
    return false;
  }
  if(q.type==='champion'){
    if(q.stage==='rolling'){
      const missing=q.rollPlayers?.find(id=>isBot(game,id)&&q.rolls?.[id]==null);
      if(missing){action(game,missing,{type:'decision',payload:{roll:true},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
      return false;
    }
    const missing=q.eligible?.find(id=>isBot(game,id)&&!(q.votes||{})[id]);
    if(missing){action(game,missing,{type:'decision',payload:{vote:Math.random()<0.65},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
    return false;
  }
  if(q.type==='madKingRoll'){
    const missing=q.rollPlayers?.find(id=>isBot(game,id)&&q.rolls?.[id]==null);
    if(missing){action(game,missing,{type:'decision',payload:{roll:true},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
    return false;
  }
  if(q.type==='blackPlague'){
    if(q.stage==='pairing'){
      const botId=q.unpairedIds?.find(id=>isBot(game,id));
      if(botId){
        const partner=q.unpairedIds.find(id=>id!==botId&&isBot(game,id))||q.unpairedIds.find(id=>id!==botId);
        if(partner){action(game,botId,{type:'decision',payload:{partnerId:partner},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
      }
      return false;
    }
    if(q.stage==='rollingPairs'){
      const missing=q.pairs?.flat().find(id=>isBot(game,id)&&q.rolls?.[id]==null);
      if(missing){action(game,missing,{type:'decision',payload:{roll:true},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
      return false;
    }
    if(q.stage==='loneRolling'&&isBot(game,q.loneId)){
      action(game,q.loneId,{type:'decision',payload:{roll:true},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;
    }
    return false;
  }
  if(q.type==='scapegoat'){
    if(q.stage==='rolling'&&isBot(game,q.rollPlayerId)){
      action(game,q.rollPlayerId,{type:'decision',payload:{roll:true},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;
    }
    if(q.currentVoterId&&isBot(game,q.currentVoterId)){
      const voter=playerById(game,q.currentVoterId);
      const target=chooseTarget(game,voter,'noble');
      if(target){action(game,voter.id,{type:'decision',payload:{targetId:target.id},actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
    }
    return false;
  }

  if(!actorCanResolveWithoutHuman(game,q))return false;
  let pid=null,payload=null;
  switch(q.type){
    case'allies': pid=q.targetId; payload={choice:playerById(game,pid)?.gold<700?'gain100':'lose200'};break;
    case'grudge': pid=q.targetId; payload={accept:Math.random()<0.55,payerId:chooseTarget(game,playerById(game,q.targetId),'noble')?.id};break;
    case'loyaltyPledge': pid=q.targetId; payload={ack:true};break;
    case'loyalty': pid=q.targetId; payload={choice:Math.random()<0.7?'payActor':'forceKing'};break;
    case'tithe': { pid=q.targetId; const chooser=playerById(game,pid); const payer=rankedTargets(game,chooser,'noble').find(x=>x.id!==q.actorId); payload=payer?{payerId:payer.id}:null; break; }
    case'bendKnee': pid=q.targetId; payload={accept:playerById(game,pid)?.gold<300||Math.random()<0.65};break;
    case'anchor': pid=q.targetId; payload={choice:playerById(game,pid)?.gold>900?'lose100ToOther':'lose200'};break;
    case'debtCollector': pid=q.targetId; payload={targetId:chooseTarget(game,playerById(game,pid),'noble')?.id};break;
    case'loyalDog': pid=q.targetId; payload={ack:true};break;
    case'royalParrot': pid=q.targetId; payload={accept:playerById(game,pid)?.gold>150};break;
    case'subRosa':
      pid=q.actorId;
      if(!q.mode){payload={mode:'hand'};break;}
      if(q.awaitRoll){payload={roll:true};break;}
      if(q.roll!=null&&q.roll>=4&&q.mode==='hand'){
        const target=playerById(game,q.targetId);const discard=target?.hand?.[target.hand.length-1];
        payload=discard?{cardInstanceId:discard.instanceId}:null;
      }else if(q.roll!=null&&q.roll>=4&&q.mode==='knight'){
        payload={cardInstanceId:null};
      }else payload={};
      break;
    case'meatRoll':
      pid=q.rollPlayers.find(id=>isBot(game,id)&&q.rolls[id]==null);payload={roll:true};break;
    case'weRide':
      if(q.stage==='rolling'){pid=[q.aId,q.bId].find(id=>isBot(game,id)&&q.rolls[id]==null);payload={roll:true};}
      else if(q.stage==='lowerChoice'){pid=q.lowerId;payload={choice:Math.random()<0.55?'full':'split'};}
      else if(q.stage==='higherChoice'){pid=q.higherId;payload={accept:Math.random()<0.5};}
      break;
    case'suppressRebellion':
      pid=q.rollPlayerId;payload={roll:true};break;
    default:return false;
  }
  if(!pid||!playerById(game,pid))return false;
  action(game,pid,{type:'decision',payload,actionId:`tutorial-${Date.now()}-${Math.random()}`});
  return true;
}

export async function runBotStep(game){
  tick(game);
  if(game.phase==='kingReveal'||game.phase==='gameover')return false;
  if(game.pending){
    if(respondPending(game))return true;
    return false;
  }
  if(game.phase==='negotiation')return false;
  const bot=playerById(game,game.currentPlayerId);
  if(!bot||!isBot(game,bot.id))return false;
  const card=chooseCard(game,bot);
  if(card){
    const payload=payloadForCard(game,bot,card);
    try{
      if(card.effect==='knight'){
        const target=chooseTarget(game,bot,'noble');
        if(target){action(game,bot.id,{type:'placeKnight',instanceId:card.instanceId,targetId:target.id,actionId:`tutorial-${Date.now()}-${Math.random()}`});return true;}
      }else if(payload!==null){
        action(game,bot.id,{type:'playCard',instanceId:card.instanceId,payload,actionId:`tutorial-${Date.now()}-${Math.random()}`});
        return true;
      }
    }catch{}
  }
  const target=chooseTarget(game,bot,'noble')||chooseTarget(game,bot);
  const fallback=bot.hand.find(c=>c.side===bot.role);
  if(fallback&&target){
    try{
      action(game,bot.id,{type:'placeKnight',instanceId:fallback.instanceId,targetId:target.id,actionId:`tutorial-${Date.now()}-${Math.random()}`});
      return true;
    }catch{}
  }
  return false;
}

export {BOT_IDS,humanId(game)};