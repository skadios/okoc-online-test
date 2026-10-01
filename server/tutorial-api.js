import crypto from 'node:crypto';
import {createGame, action, publicState, playerById, tick} from './game-engine.js';
import {runBotStep, BOT_IDS, HUMAN_ID} from './tutorial-ai.js';

let tutorialGame=null;
let aiBusy=false;
let aiTimer=null;
let tutorialGeneration=0;

const makePlayers=()=>[
  {id:HUMAN_ID,name:'Vous',connected:true},
  {id:'tutorial-2',name:'Armand',connected:true},
  {id:'tutorial-3',name:'Béatrice',connected:true},
  {id:'tutorial-4',name:'Charles',connected:true}
];

function guide(game){
  const human=playerById(game,HUMAN_ID);
  const king=game.players.find(p=>p.role==='king');
  const q=game.pending;
  let title='BIENVENUE DANS LE TUTORIEL';
  let body='Vous allez apprendre en jouant. Les trois autres joueurs sont des bots locaux : aucune API d’IA ni aucun coût externe.';
  let tone='intro';
  if(game.phase==='kingReveal'){
    title='1 · QUI SERA ROI ?';
    body='Le serveur tire le Roi au sort. Le Roi commence avec 1000 or ; chaque Noble commence avec 600 or. Vous recevrez aussi 8 cartes.';
    tone='rule';
  }else if(game.phase==='playing'){
    if(game.round===1){
      title=game.currentPlayerId===HUMAN_ID?'2 · À VOUS DE JOUER':'2 · OBSERVEZ LA COUR';
      body=game.currentPlayerId===HUMAN_ID
        ? `C’est votre tour. À 4 joueurs, un Noble joue 2 cartes et le Roi joue aussi 2 cartes. Lisez le texte de vos cartes, choisissez une cible si nécessaire, puis jouez.`
        : `${playerById(game,game.currentPlayerId)?.name||'Un joueur'} joue. Observez la carte, sa cible et la conséquence : c’est le déroulement normal d’un tour.`;
      tone='play';
    }else if(game.round===2){
      title='3 · LA COURONNE PEUT CHANGER DE TÊTE';
      body=human?.role==='king'
        ? 'Gardez un œil sur votre or : si un Noble possède strictement plus que le Roi, il prend la couronne.'
        : 'En tant que Noble, dépasser strictement l’or du Roi vous fait devenir Roi automatiquement. Le changement de rôle est immédiat.';
      tone='rule';
    }else if(game.round===3){
      title='4 · NÉGOCIATION';
      body='Après les rounds 1 à 3, tout le monde peut échanger des cartes et transférer de l’or. La négociation dure au maximum 2 minutes et peut se terminer plus tôt si tout le monde passe.';
      tone='negotiation';
    }else{
      title='5 · DERNIER ROUND';
      body='Le quatrième round est décisif. Il n’y a pas de nouvelle négociation après celui-ci : la partie se termine avec le Roi en place.';
      tone='rule';
    }
  }else if(game.phase==='negotiation'){
    title='4 · NÉGOCIEZ AVEC LA COUR';
    body='Pendant cette phase, observez les richesses, les rôles et les cartes visibles. Vous pouvez donner de l’or, proposer des cartes et gérer certaines cartes spéciales. Les bots négocient aussi progressivement.';
    tone='negotiation';
  }else if(game.phase==='gameover'){
    title='6 · PARTIE TERMINÉE';
    body=`Le tutoriel est terminé. ${king?.name||'Le Roi'} est Roi après le quatrième round. Vous pouvez relancer un tutoriel depuis le menu.`;
    tone='finish';
  }
  if(q&&q.actorId!==HUMAN_ID){
    const actor=playerById(game,q.actorId);
    title='DÉCISION EN COURS';
    body=`${actor?.name||'Un bot'} résout une carte. Regardez la zone de décision et les dés : le serveur attend la réponse correcte avant de poursuivre.`;
    tone='action';
  }
  return {title,body,tone,round:game.round,phase:game.phase,progress:Math.min(100,Math.round(((game.round-1)*25)+(game.phase==='gameover'?25:0)))};
}

function response(){
  if(!tutorialGame)return null;
  tick(tutorialGame);
  const state=publicState(tutorialGame,HUMAN_ID);
  return {state:{...state,room:{code:'TUTO',name:'TUTORIEL · 4 JOUEURS',public:false,max:4,lang:'fr'},tutorial:guide(tutorialGame)}};
}

function scheduleBots(){
  if(aiTimer)clearTimeout(aiTimer);
  const generation=tutorialGeneration;
  aiTimer=setTimeout(async()=>{
    if(generation!==tutorialGeneration||!tutorialGame)return;
    if(aiBusy)return scheduleBots();
    aiBusy=true;
    try{
      const acted=await runBotStep(tutorialGame);
      tick(tutorialGame);
      // Human-speed rhythm: never chain bot actions instantly.
      const delay=acted?(900+Math.floor(Math.random()*900)):450;
      if(tutorialGame.phase==='negotiation'){
        scheduleNegotiationBots();
      }else scheduleBotsWithDelay(delay);
    }catch(e){
      console.error('[OKOC TUTORIAL AI]',e);
      scheduleBotsWithDelay(1200);
    }finally{aiBusy=false;}
  },450);
}
function scheduleBotsWithDelay(delay){if(aiTimer)clearTimeout(aiTimer);const generation=tutorialGeneration;aiTimer=setTimeout(()=>{if(generation===tutorialGeneration)scheduleBots()},delay);}
function scheduleNegotiationBots(){
  // Bots make occasional human-speed offers/transfers. The human can then end the phase.
  if(aiTimer)clearTimeout(aiTimer);
  const generation=tutorialGeneration;
  aiTimer=setTimeout(()=>{
    if(generation!==tutorialGeneration||!tutorialGame)return;
    if(tutorialGame.phase!=='negotiation')return scheduleBots();
    const bot=bots().find(p=>BOT_IDS.has(p.id)&&p.gold>=100);
    const target=bot?playerById(tutorialGame,'tutorial-1'):null;
    if(bot&&target&&Math.random()<0.65){
      try{action(tutorialGame,bot.id,{type:'negotiateGold',targetId:target.id,amount:100,actionId:`tutorial-neg-${Date.now()}`});}catch{}
    }
    // Every bot votes to move on; the human gets the final visible choice.
    tutorialGame.negotiation.earlyVotes=tutorialGame.negotiation.earlyVotes||{};
    for(const id of BOT_IDS)tutorialGame.negotiation.earlyVotes[id]=true;
    scheduleNegotiationBots();
  },2200);
}
function bots(){return tutorialGame?Array.from(tutorialGame.players):[];}

export function mountTutorialApi(app){
  app.post('/api/tutorial/start',(_,res)=>{
    try{
      tutorialGeneration++;
      if(aiTimer)clearTimeout(aiTimer);
      tutorialGame=createGame(makePlayers(),Math.random);
      scheduleBots();
      res.json(response());
    }catch(e){res.status(500).json({error:e?.message||'Tutorial start failed'});}
  });
  app.get('/api/tutorial/state',(_,res)=>{
    try{if(!tutorialGame) return res.status(404).json({error:'No tutorial game is running.'});res.json(response());}
    catch(e){res.status(500).json({error:e?.message||'Tutorial state failed'});}
  });
  app.post('/api/tutorial/action',(req,res)=>{
    try{
      if(!tutorialGame)throw new Error('No tutorial game is running.');
      const msg=req.body?.action||{};
      if(msg.type==='endNegotiation'){
        if(tutorialGame.phase!=='negotiation')throw new Error('Negotiation is not active.');
        tutorialGame.negotiation.earlyVotes=tutorialGame.negotiation.earlyVotes||{};
        tutorialGame.negotiation.earlyVotes[HUMAN_ID]=true;
        for(const id of BOT_IDS)tutorialGame.negotiation.earlyVotes[id]=true;
        tutorialGame.negotiation.endsAt=Date.now();
        tick(tutorialGame);
      }else{
        action(tutorialGame,HUMAN_ID,{...msg,actionId:String(msg.actionId||crypto.randomUUID())});
      }
      scheduleBots();
      res.json(response());
    }catch(e){res.status(400).json({error:e?.message||'Invalid tutorial action'});}
  });
  app.get('/api/tutorial/health',(_,res)=>res.json({ok:true,active:!!tutorialGame,bots:3,free:true}));
}