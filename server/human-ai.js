import {runBotStep,BOT_IDS,HUMAN_ID} from './tutorial-ai.js';

const memory=new Map();
const moodFor=(bot)=>MOODS[bot.id]||{
  name:bot.name,style:bot.role==='king'?'autoritaire':'opportuniste',
  phrases:{think:['Voyons…','Je réfléchis.','Hmm…'],good:['Je joue.','On verra.','Ça me paraît bien.'],pressure:bot.role==='king'?['Je protège la couronne.','Je surveille l’or.']:['Je garde un œil sur le Roi.','Je garde mes options ouvertes.']}
};
const MOODS={
  'tutorial-2':{name:'Armand',style:'calme',phrases:{think:['Hmm…','Je réfléchis.','Pas si vite…'],good:['Ça me semble correct.','Je prends le risque.','On va voir.'],pressure:['La cour devient intéressante.','Je garde un œil sur les richesses.'] }},
  'tutorial-3':{name:'Béatrice',style:'opportuniste',phrases:{think:['Voyons…','Ça mérite réflexion.','Intéressant.'],good:['Je tente ça.','Ça peut payer.','Je change de plan.'],pressure:['Je ne vous fais pas encore confiance.','Tout le monde cache quelque chose.']}},
  'tutorial-4':{name:'Charles',style:'prudent',phrases:{think:['Attendez…','Je vérifie mes options.','Doucement.'],good:['Je préfère assurer.','On joue proprement.','Je prends cette option.'],pressure:['Je surveille le Roi.','Les écarts d’or commencent à compter.']}}
};

const pick=a=>a[Math.floor(Math.random()*a.length)];
const remember=(id)=>{if(!memory.has(id))memory.set(id,{moves:0,lastChat:0,lastRound:0});return memory.get(id)};
const say=(game,bot,text)=>{
  const m=remember(bot.id);const now=Date.now();
  if(now-m.lastChat<4200)return false;
  game.chat=game.chat||[];
  game.chat.push({id:`ai-${bot.id}-${now}-${Math.random()}`,playerId:bot.id,name:bot.name,text,ts:now});
  game.chat=game.chat.slice(-100);m.lastChat=now;return true;
};

function contextLine(game,bot){
  const king=game.players.find(p=>p.role==='king');
  const richer=game.players.filter(p=>p.id!==bot.id&&p.gold>bot.gold).length;
  if(bot.role==='king'&&richer)return pick(['Je vais surveiller l’or.', 'Je dois garder la couronne sous contrôle.','Pas question de laisser l’écart se creuser.']);
  if(bot.role==='noble'&&king&&bot.gold>king.gold)return pick(['La couronne est à portée.','Le Roi ferait bien de regarder son trésor.','Je suis plutôt bien placé.']);
  return pick(moodFor(bot).phrases.pressure||['Je garde mes options ouvertes.']);
}

export async function runHumanBotStep(game){
  if(game.phase==='kingReveal'||game.phase==='gameover')return false;
  const current=game.players.find(p=>p.id===game.currentPlayerId);
  const botSet=game?._botIds||BOT_IDS;
  const human=game?._humanId||HUMAN_ID;
  const bot=current&&botSet.has(current.id)?current:null;
  const pending=game.pending;
  const acting=bot|| (pending&&[pending.actorId,pending.targetId,pending.lowerId,pending.higherId,pending.rollPlayerId,pending.loneId].some(id=>botSet.has(id)));
  const actingId=bot?.id||[pending?.actorId,pending?.targetId,pending?.lowerId,pending?.higherId,pending?.rollPlayerId,pending?.loneId].find(id=>botSet.has(id));
  const actor=actingId?game.players.find(p=>p.id===actingId):null;
  if(actor){
    const m=remember(actor.id);
    // Realistic hesitation: short pauses before decisions, with occasional longer thinking.
    const delay=420+Math.floor(Math.random()*760)+(Math.random()<0.12?900:0);
    if(m.moves===0||Math.random()<0.34)say(game,actor,pick(moodFor(actor).phrases.think||['Je réfléchis…']));
    await new Promise(resolve=>setTimeout(resolve,delay));
  }
  const acted=await runBotStep(game);
  if(acted&&bot){
    const m=remember(bot.id);m.moves++;
    if(Math.random()<0.32)say(game,bot,pick(moodFor(bot).phrases.good||['Je joue.']));
    if(Math.random()<0.14)say(game,bot,contextLine(game,bot));
  }
  return acted;
}

export {BOT_IDS,HUMAN_ID};
