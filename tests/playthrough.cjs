// Progress fixture: boosted HP/attack shortens combat; gameplay balance is unchanged.
module.exports = async function playthrough(p) {
await p.evaluate(()=>{OPT.sound=false;OPT.fast=true;startNew();});
async function drain(stop){for(let i=0;i<2500;i++){
const result=await p.evaluate(stop=>{
 if(mode===stop || mode==='end')return 'done';
 if(mode==='scene'){
  if(document.querySelector('[data-act="tcard"]')){closeTitleCard();return 'next';}
  if(SR.wait)return 'wait';
  if(SR.choosing){choose(0);return 'next';}
  if(SR.typing)SR.full();else advance();return 'next';
 }
 if(mode==='dungeon'){doStep();return 'next';}
 if(mode==='branch'){branch('a');return 'next';}
 if(mode==='meme'){memeSave(); const back=memeMenu.back;memeMenu.back=null;back();return 'next';}
 if(mode==='battle'){
  if(BT.busy){skipExec();return 'next';}
  const u=curU();const foe=alive(BT.B.enemies)[0];setCmd({k:'atk',t:foe.uid});return 'next';
 }
 if(mode==='won'){const cb=BT.cb;BT=null;cb();return 'next';}
 return mode;
},stop);
if(result==='done')return;
if(result==='wait'){await p.waitForTimeout(100);continue;}
if(result!=='next')throw Error('Unexpected mode '+result);
}throw Error('playthrough exceeded cap');}
await drain('area');
await p.evaluate(()=>{G.bonus.hp=200;G.bonus.atk=40;});
await p.evaluate(()=>talkNpc('meme'));await drain('meme');await p.evaluate(()=>{const back=memeMenu.back;memeMenu.back=null;back();});
for(const loc of ['forest','town','swamp','lake','hill','moon']){
 await p.evaluate(loc=>goLoc(loc),loc);await drain('area');
 if(loc==='town'){await p.evaluate(()=>talkNpc('mashu'));await drain('area');}
 if(loc==='swamp'){await p.evaluate(()=>talkNpc('yoru'));await drain('area');continue;}
 await p.evaluate(()=>{enterDungeon.ok=true;enterDungeon();});await drain(loc==='moon'?'end':'area');
 const state=await p.evaluate(()=>({mode,chap:chap(),party:G.party,valid:validSave(G)}));
 if(!state.valid)throw Error('Invalid native save after '+loc);
}
return await p.evaluate(()=>({cleared:G.cleared,saved:!!loadSave(),voice:G.flags.voice,toast:G.flags.toast}));
};
