const fs=require('fs');
const code=['data','engine','map','ai'].map(f=>fs.readFileSync(require('path').resolve(__dirname,'../src/'+f+'.js'),'utf8')).join('\n');
const run=new Function(code+'; return {Game,AI,DEF,TYPES};')();
const {Game,AI}=run;
function play(races,teams,seed,diffs){
  const g=new Game({seed,players:races.map((r,i)=>({race:r,team:teams[i],ai:true,diff:diffs?diffs[i]:1}))});
  const ais=g.players.map(p=>new AI(g,p.i));
  let t0=Date.now(), maxEnts=0, steps=0;
  while(g.over===-1 && g.t<1800){ for(const a of ais)a.step(0.05); g.step(0.05); steps++; maxEnts=Math.max(maxEnts,g.ents.length);
    if(steps%2400==0){ console.log(' t',Math.round(g.t), g.players.map(p=>p.race+':'+Math.floor(p.gold)+'g '+g.popInfo(p.i).used+'/'+g.popInfo(p.i).cap+' k'+p.kills+' heroes:'+Object.values(p.heroes).map(h=>h.id?'A':h.recruited?'D':'-').join('')).join(' | ')); }
    for(const e of g.ents){ if(!isFinite(e.x)||!isFinite(e.y)||!isFinite(e.hp)) throw new Error('NaN ent '+e.d.key); }
  }
  const snap=JSON.stringify(g.snapshot());
  console.log('RESULT',races.join('v'),'winner team',g.over,'time',Math.round(g.t),'s maxEnts',maxEnts,'ms',Date.now()-t0,'snapBytes',Buffer.byteLength(snap));
  return g;
}
const R=['hum','elf','dwf','orc'];
for(let i=0;i<4;i++)for(let j=0;j<4;j++) if(i<j) play([R[i],R[j]],[0,1],i*10+j+1);
for (const [a,b,sd] of [['und','des',31],['und','hum',32],['des','orc',33],['und','elf',34],['des','dwf',35]]) play([a,b],[0,1],sd);
play(R,[0,1,0,1],99);
play(R,[0,1,2,3],7);
{ const g=play(['hum','orc'],[0,1],5); console.log('outposts', JSON.stringify(g.outposts.map(o=>o.owner)), 'spell points', g.players.map(p=>p.pts+' lvl'+p.plvl+' spells:'+Object.keys(p.spells).join(','))); }
