#!/usr/bin/env node
/* The shipped tray holds EVERY remaining piece (owner's call 2026-08-28) but
   TUNE.traySize is still 3, which is what every bot and the whole gate reads.
   How far apart are the measured game and the real one? */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('./gen.js');
const T3 = G.TUNE, T99 = { ...G.TUNE, traySize: 99 };
function botRandom(level, rng, t) {
  const occ=new Uint8Array(level.n), pm=new Uint8Array(level.queue.length); let placed=0;
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
console.log('  band       pieces   Bot R          Bot G          first-try      Bot C');
console.log('                      win3   real    win3   real    win3   real    win3   real');
for (const [a,b] of [[1,10],[11,25],[26,45],[46,65],[66,87],[88,100]]) {
  const acc={r3:[],r9:[],g3:[],g9:[],f3:[],f9:[],c3:[],c9:[]}; let pcs=0,n=0;
  for(let i=a;i<=b;i++){
    const lv=G.shippedLevel(i); n++; pcs+=lv.queue.length;
    for (const [t,k] of [[T3,'3'],[T99,'9']]) {
      const rng=G.makeRng(i*7+5); let ok=0;
      for(let z=0;z<200;z++) if(botRandom(lv,rng,t)) ok++;
      acc['r'+k].push(ok/200);
      acc['g'+k].push(G.botGreedy(lv,t).solved?1:0);
      acc['f'+k].push(G.botConstrained(lv,{cap:0,tune:t}).solved?1:0);
      acc['c'+k].push(G.botConstrained(lv,{cap:4000,tune:t}).solved?1:0);
    }
  }
  console.log('  '+pad(a+'-'+b,11)+pad((pcs/n).toFixed(1),9)+
    pad(pc(mean(acc.r3)),7)+pad(pc(mean(acc.r9)),8)+
    pad(pc(mean(acc.g3)),7)+pad(pc(mean(acc.g9)),8)+
    pad(pc(mean(acc.f3)),7)+pad(pc(mean(acc.f9)),8)+
    pad(pc(mean(acc.c3)),7)+pc(mean(acc.c9)));
}
