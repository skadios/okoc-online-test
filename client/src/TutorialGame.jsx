import React,{useCallback,useEffect,useState} from 'react';
import {Game,I18N} from './main.jsx';

const API='/api/tutorial';

async function request(path,options={}){
  const r=await fetch(API+path,{...options,headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})}});
  const raw=await r.text();
  let data={};
  try{data=raw?JSON.parse(raw):{};}catch{throw new Error('Réponse du tutoriel invalide.');}
  if(!r.ok)throw new Error(data.error||`Erreur tutoriel HTTP ${r.status}.`);
  return data;
}

function Coach({guide,visible,setVisible,onRestart,t}){
  if(!visible||!guide)return null;
  return <aside className={`tutorial-coach tutorial-coach--${guide.tone||'rule'}`} aria-live="polite">
    <div className="tutorial-coach-top"><span>OKOC · {t.tutorial}</span><button onClick={()=>setVisible(false)} aria-label={t.lang==='fr'?'Masquer le tutoriel':'Hide tutorial'}>×</button></div>
    <div className="tutorial-coach-progress"><i style={{width:`${guide.progress||0}%`}}/></div>
    <strong>{guide.title}</strong>
    <p>{guide.body}</p>
    <div className="tutorial-coach-actions">
      <button onClick={()=>setVisible(false)}>{t.tutorialDone}</button>
      {guide.phase==='gameover'&&<button onClick={onRestart}>{t.restart}</button>}
    </div>
  </aside>;
}

export default function TutorialGame({lang='fr',goHome}){
  const t=I18N[lang]||I18N.fr;
  const [state,setState]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState(null);
  const [chat,setChat]=useState('');
  const [peek,setPeek]=useState(null);
  const [privateKnight,setPrivateKnight]=useState(null);
  const [tradeOffer,setTradeOffer]=useState(null);
  const [coachVisible,setCoachVisible]=useState(true);

  useEffect(()=>{
    const previous=localStorage.getItem('playerId');
    localStorage.setItem('playerId','tutorial-1');
    return()=>{
      if(previous===null)localStorage.removeItem('playerId');
      else localStorage.setItem('playerId',previous);
    };
  },[]);

  const apply=useCallback(data=>{
    if(!data?.state)throw new Error('Le tutoriel a répondu sans état de partie.');
    setState(data.state);
    setError('');
  },[]);

  const start=useCallback(async()=>{
    setLoading(true);setError('');setSelected(null);setPeek(null);setPrivateKnight(null);setTradeOffer(null);setCoachVisible(true);
    try{apply(await request('/start',{method:'POST',body:JSON.stringify({lang})}));}
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[apply,lang]);

  useEffect(()=>{start();},[start]);

  useEffect(()=>{
    if(!state)return;
    const id=setInterval(async()=>{
      try{apply(await request('/state'));}
      catch(e){if(!/No tutorial game/i.test(e.message))setError(e.message);}
    },500);
    return()=>clearInterval(id);
  },[state,apply]);

  const send=useCallback(async(message)=>{
    try{
      const data=await request('/action',{method:'POST',body:JSON.stringify({...{action:message}})});
      apply(data);
    }catch(e){setError(e.message);}
  },[apply]);

  const me=state?.players?.find(p=>p.id==='tutorial-1');
  if(loading&&!state)return <main className="page tutorial-loading"><section className="panel"><div className="eyebrow">OKOC ONLINE · TUTORIEL</div><h2>PRÉPARATION DE LA PARTIE</h2><p>Les trois bots locaux prennent place autour de la table…</p></section></main>;
  if(error&&!state)return <main className="page tutorial-loading"><section className="panel"><div className="eyebrow">OKOC ONLINE · TUTORIEL</div><h2>TUTORIEL INDISPONIBLE</h2><p>{error}</p><button onClick={start}>RÉESSAYER</button><button onClick={goHome}>← RETOUR</button></section></main>;

  return <main className="tutorial-host">
    {state&&<Game t={t} lang={lang} state={state} me={me} goHome={goHome} selected={selected} setSelected={setSelected} send={send} chat={chat} setChat={setChat} peek={peek} setPeek={setPeek} privateKnight={privateKnight} setPrivateKnight={setPrivateKnight} tradeOffer={tradeOffer} setTradeOffer={setTradeOffer}/>}
    <Coach guide={state?.tutorial} visible={coachVisible} setVisible={setCoachVisible} onRestart={start} t={{...t,lang}}/>
    {!coachVisible&&state?.tutorial&&<button className="tutorial-coach-reopen" onClick={()=>setCoachVisible(true)}>{lang==='fr'?'TUTORIEL · AFFICHER':'TUTORIAL · SHOW'}</button>}
    {error&&<button className="tutorial-error" onClick={()=>setError('')}>{error} ×</button>}
  </main>;
}
