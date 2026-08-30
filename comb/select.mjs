#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('./gen.js');
const N = Number(process.env.N || 60);
function botRandom(level, rng) {
  const t=G.TUNE, occ=new Uint8Array(level.n), pm=new Uint8Array(level.queue.length);
  let placed=0;
  for(;;){ const all=[];
    for (const qi of G.visibleSlots(level,pm,t.traySize))
      for (const p of G.legalPlacements(level,level.queue[qi].shape,occ)) all.push({qi,p});
    if(!all.length) return placed===level.queue.length;
    const c=all[Math.floor(rng.float()*all.length)];
    for(const i of c.p.idx) occ[i]=1; pm[c.qi]=1; placed++;
    if(placed===level.queue.length) return true; }
}
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN;
const pc=x=>isFinite(x)?(x*100).toFixed(0).padStart(3)+'%':'  - ';
const pad=(s,n)=>String(s).padEnd(n);
console.log('  cells pool irr  sizes  pieces  BotR  BotG  first-try  BotC  pickups forced dist  ms');
for (const cells of [15,16,17,18,20,22,24,26,28,30,32])
 for (const pool of [4,6,9])
  for (const irr of [0.35,0.55]) {
    const sizes=[3,4];
    const tier={cells,spread:0,pool,sizes,varietyBias:0.24,irregularity:irr};
    const pcs=[],rr=[],gg=[],ft=[],cc=[],pk=[],fo=[],ds=[]; let fail=0;
    const t0=Date.now();
    for(let s=1;s<=N;s++){
      const lv=G.makeLevel(s*977+cells*13+pool*7+Math.round(irr*100),0,{tiers:[tier]});
      if(!lv){fail++;continue;}
      pcs.push(lv.queue.length); ds.push(lv.distinctShapes);
      const rng=G.makeRng(s*7+5); let ok=0;
      for(let i=0;i<120;i++) if(botRandom(lv,rng)) ok++;
      rr.push(ok/120);
      gg.push(G.botGreedy(lv).solved?1:0);
      ft.push(G.botConstrained(lv,{cap:0}).solved?1:0);
      const c=G.botConstrained(lv,{cap:4000});
      cc.push(c.solved?1:0);
      if(c.solved){pk.push(c.pickups); if(isFinite(c.forcedShare))fo.push(c.forcedShare);}
    }
    const ms=(Date.now()-t0)/N;
    console.log('  '+pad(cells,6)+pad(pool,5)+pad(irr,5)+pad(sizes.join('-'),7)+
      pad(mean(pcs).toFixed(1),8)+pad(pc(mean(rr)),6)+pad(pc(mean(gg)),6)+
      pad(pc(mean(ft)),11)+pad(pc(mean(cc)),6)+pad(mean(pk).toFixed(1),8)+
      pad(pc(mean(fo)),7)+pad(mean(ds).toFixed(1),6)+ms.toFixed(0));
  }
