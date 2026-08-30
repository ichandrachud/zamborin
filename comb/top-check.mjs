#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('./gen.js');
const pad=(s,n)=>String(s).padEnd(n);
const pc=x=>(x*100).toFixed(0)+'%';
console.log('  shipped levels, by band: how many undos does tightest-hole reasoning need?\n');
console.log('  band      pieces  first-try  BotC solves  median pk  90th pk  3-star  2-star');
for (const [a,b] of [[1,10],[11,25],[26,45],[46,65],[66,87],[88,100]]) {
  const pk=[]; let ft=0, cs=0, n=0, pcs=0;
  for(let i=a;i<=b;i++){
    const lv=G.shippedLevel(i); n++; pcs+=lv.queue.length;
    if(G.botConstrained(lv,{cap:0}).solved) ft++;
    const c=G.botConstrained(lv,{cap:4000});
    if(c.solved){cs++; pk.push(c.pickups);}
  }
  pk.sort((x,y)=>x-y);
  const med=pk.length?pk[Math.floor(pk.length/2)]:NaN;
  const p90=pk.length?pk[Math.floor(pk.length*0.9)]:NaN;
  const three=pk.filter(x=>x===0).length/Math.max(1,pk.length);
  const two=pk.filter(x=>x<=2).length/Math.max(1,pk.length);
  console.log('  '+pad(a+'-'+b,10)+pad((pcs/n).toFixed(1),8)+pad(pc(ft/n),11)+
    pad(pc(cs/n),13)+pad(med,11)+pad(p90,9)+pad(pc(three),8)+pc(two));
}
