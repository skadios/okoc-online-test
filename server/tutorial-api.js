import crypto from 'node:crypto';
import {createGame, action, publicState, playerById, tick, drawToMinimum} from './game-engine.js';
import {runHumanBotStep, BOT_IDS, HUMAN_ID} from './human-ai.js';

let tutorialGame=null;
let aiBusy=false;
let aiTimer=null;
let tutorialGeneration=0;
let tutorialLang='fr';

const makePlayers=()=>[
  {id:HUMAN_ID,name:'Vous',connected:true},
  {id:'tutorial-2',name:'Armand',connected:true},
  {id:'tutorial-3',name:'Béatrice',connected:true},
  {id:'tutorial-4',name:'Charles',connected:true}
];

function normalizeTutorialHands(){
  if(!tutorialGame)return;
  for(const player of tutorialGame.players){
    while(player.hand.length>8){
      const excess=player.hand.pop();
      if(excess)tutorialGame.discard.push(excess);
    }
    if(player.hand.length<8)drawToMinimum(tutorialGame,player);
  }
}

function guide(game){
  const human=playerById(game,HUMAN_ID);
  const fr=tutorialLang==='fr';
  const king=game.players.find(p=>p.role==='king');
  const q=game.pending;
  let title=fr?'BIENVENUE DANS LE TUTORIEL':'WELCOME TO THE TUTORIAL';
  let body=fr?'Vous allez apprendre en jouant. Les trois autres joueurs sont des bots locaux : aucune API d’IA ni aucun coût externe.':'You will learn by playing. The other three players are local bots: no external AI API or external cost.';
  let tone='intro';
  if(game.phase==='kingReveal'){
    title=fr?'1 · QUI SERA ROI ?':'1 · WHO WILL BE KING?';
    body=fr?'Le serveur tire le Roi au sort. Le Roi commence avec 1000 or ; chaque Noble commence avec 600 or. Vous recevrez aussi 8 cartes.':'The server randomly selects the King. The King starts with 1000 gold, each Noble with 600, and you receive 8 cards.';
    tone='rule';
  }else if(game.phase==='playing'){
    if(game.round===1){
      title=game.currentPlayerId===HUMAN_ID?'2 · À VOUS DE JOUER':'2 · OBSERVEZ LA COUR';
      body=game.currentPlayerId===HUMAN_ID
        ? (fr?'C’est votre tour. À 4 joueurs, un Noble joue 2 cartes et le Roi joue aussi 2 cartes. Lisez le texte de vos cartes, choisissez une cible si nécessaire, puis jouez.':'It is your turn. In a 4-player game, a Noble plays 2 cards and the King also plays 2. Read your cards, choose a target when needed, then play.')
        : (fr?`${playerById(game,game.currentPlayerId)?.name||'Un joueur'} joue. Observez la carte, sa cible et la conséquence : c’est le déroulement normal d’un tour.`:`${playerById(game,game.currentPlayerId)?.name||'A player'} is acting. Watch the card, target and consequence: this is a normal turn.`);
      tone='play';
    }else if(game.round===2){
      title=fr?'3 · LA COURONNE PEUT CHANGER DE TÊTE':'3 · THE CROWN CAN CHANGE HANDS';
      body=human?.role==='king'
        ? (fr?'Gardez un œil sur votre or : si un Noble possède strictement plus que le Roi, il prend la couronne.':'Watch your gold: if a Noble has strictly more than the King, they take the crown.')
        : (fr?'En tant que Noble, dépasser strictement l’or du Roi vous fait devenir Roi automatiquement. Le changement de rôle est immédiat.':'As a Noble, having strictly more gold than the King makes you King automatically. The role change is immediate.');
      tone='rule';
    }else if(game.round===3){
      title=fr?'4 · NÉGOCIATION':'4 · NEGOTIATION';
      body=fr?'Après les rounds 1 à 3, tout le monde peut échanger des cartes et transférer de l’or. La négociation dure au maximum 2 minutes et peut se terminer plus tôt si tout le monde passe.':'After rounds 1–3, everyone can trade cards and transfer gold. Negotiation lasts at most 2 minutes and can end earlier when everyone passes.';
      tone='negotiation';
    }else{
      title=fr?'5 · DERNIER ROUND':'5 · FINAL ROUND';
      body=fr?'Le quatrième round est décisif. Il n’y a pas de nouvelle négociation après celui-ci : la partie se termine avec le Roi en place.':'Round four is decisive. There is no new negotiation after it: the game ends with the current King.';
      tone='rule';
    }
  }else if(game.phase==='negotiation'){
    title=fr?'4 · NÉGOCIEZ AVEC LA COUR':'4 · NEGOTIATE WITH THE COURT';
    body=fr?'Pendant cette phase, observez les richesses, les rôles et les cartes visibles. Vous pouvez donner de l’or, proposer des cartes et gérer certaines cartes spéciales. Les bots négocient aussi progressivement.':'During this phase, watch gold, roles and visible cards. You can give gold, offer cards and manage certain special cards. Bots also negotiate progressively.';
    tone='negotiation';
  }else if(game.phase==='gameover'){
    title=fr?'6 · PARTIE TERMINÉE':'6 · GAME OVER';
    body=fr?`Le tutoriel est terminé. ${king?.name||'Le Roi'} est Roi après le quatrième round. Vous pouvez relancer un tutoriel depuis le menu.`:`The tutorial is complete. ${king?.name||'The King'} is King after round four. You can restart from the menu.`;
    tone='finish';
  }
  if(q&&q.actorId!==HUMAN_ID){
    const actor=playerById(game,q.actorId);
    title=fr?'DÉCISION EN COURS':'DECISION IN PROGRESS';
    body=fr?`${actor?.name||'Un bot'} résout une carte. Regardez la zone de décision et les dés : le serveur attend la réponse correcte avant de poursuivre.`:`${actor?.name||'A bot'} is resolving a card. Watch the decision area and dice: the server waits for the correct response before continuing.`;
    tone='action';
  }
  return {title,body,tone,round:game.round,phase:game.phase,progress:Math.min(100,Math.round(((game.round-1)*25)+(game.phase==='gameover'?25:0)))};
}

function response(){
  if(!tutorialGame)return null;
  tick(tutorialGame);
  normalizeTutorialHands();
  const state=publicState(tutorialGame,HUMAN_ID);
  return {state:{...state,room:{code:'TUTO',name:tutorialLang==='fr'?'TUTORIEL · 4 JOUEURS':'TUTORIAL · 4 PLAYERS',public:false,max:4,lang:tutorialLang},tutorial:guide(tutorialGame)}};
}

function scheduleBots(){
  if(aiTimer)clearTimeout(aiTimer);
  const generation=tutorialGeneration;
  aiTimer=setTimeout(async()=>{
    if(generation!==tutorialGeneration||!tutorialGame)return;
    if(aiBusy)return scheduleBots();
    aiBusy=true;
    try{
      const acted=await runHumanBotStep(tutorialGame);
      tick(tutorialGame);
      normalizeTutorialHands();
      const delay=acted?(800+Math.floor(Math.random()*1100)):650;
      if(tutorialGame.phase==='negotiation')scheduleNegotiationBots();
      else scheduleBotsWithDelay(delay);
    }catch(e){
      console.error('[OKOC TUTORIAL AI]',e);
      scheduleBotsWithDelay(1400);
    }finally{aiBusy=false;}
  },500);
}
function scheduleBotsWithDelay(delay){if(aiTimer)clearTimeout(aiTimer);const generation=tutorialGeneration;aiTimer=setTimeout(()=>{if(generation===tutorialGeneration)scheduleBots()},delay);}
function scheduleNegotiationBots(){
  if(aiTimer)clearTimeout(aiTimer);
  const generation=tutorialGeneration;
  aiTimer=setTimeout(()=>{
    if(generation!==tutorialGeneration||!tutorialGame)return;
    if(tutorialGame.phase!=='negotiation')return scheduleBots();
    const bot=bots().find(p=>BOT_IDS.has(p.id)&&p.gold>=100);
    const target=bot?playerById(tutorialGame,'tutorial-1'):null;
    if(bot&&target&&Math.random()<0.65){
      try{action(tutorialGame,bot.id,{type:'negotiateGold',targetId:target.id,amount:100,actionId:`tutorial-neg-${Date.now()}-${Math.random()}`});}catch{}
    }
    tutorialGame.negotiation.earlyVotes=tutorialGame.negotiation.earlyVotes||{};
    for(const id of BOT_IDS)tutorialGame.negotiation.earlyVotes[id]=true;
    scheduleNegotiationBots();
  },2200);
}
function bots(){return tutorialGame?Array.from(tutorialGame.players):[];}

export function mountTutorialApi(app){
  app.post('/api/tutorial/start',(req,res)=>{
    try{
      tutorialGeneration++;
      tutorialLang=['fr','en'].includes(req.body?.lang)?req.body.lang:'fr';
      if(aiTimer)clearTimeout(aiTimer);
      tutorialGame=createGame(makePlayers(),Math.random);
      normalizeTutorialHands();
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
      normalizeTutorialHands();
      scheduleBots();
      res.json(response());
    }catch(e){res.status(400).json({error:e?.message||'Invalid tutorial action'});}
  });
  app.get('/api/tutorial/health',(_,res)=>res.json({ok:true,active:!!tutorialGame,bots:3,free:true}));
}
