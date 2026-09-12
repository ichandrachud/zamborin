/* Karrots — art check and the invisibility detector.
 *
 * Writes a self-contained page that, for every sprite:
 *   · renders it before and after the strokes were stripped, at the sizes it
 *     is really seen at;
 *   · measures its tight box from PAINTED ALPHA, not getBBox(). getBBox() is
 *     the obvious call and the wrong one: it counts `fill:none` paths, which
 *     paint nothing and sit anywhere on the artboard;
 *   · hides each formerly-stroked element in turn and diffs the pixels. An
 *     element that changes nothing when hidden is INVISIBLE — a white shape
 *     that was only ever held by its black edge — and needs a value fill.
 *
 * NULL TEST, and it runs first: hiding nothing must diff 0 px, and hiding
 * every kv element at once must diff a lot. A detector that cannot fail is
 * worth nothing, and in this studio a failing check is usually the check.
 *
 * Run: node karrots/tune-art.mjs [outfile.html]
 * Then: copy the two JSON blocks into art/bbox.json and art/invisible.json
 *       and re-run build-sprites.mjs.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { build, CAST } from './build-sprites.mjs';

const SRC = join(homedir(), 'Library/Mobile Documents/com~apple~CloudDocs',
            'Claude Projects/Zamborin/source-assets/karrots/2014-vector');
const ART = new URL('./art/', import.meta.url).pathname;
const OUT = process.argv[2] || new URL('./tune-art-check.html', import.meta.url).pathname;

const vbOf = s => (s.match(/viewBox="([^"]*)"/)?.[1] || '0 0 100 100').split(/[\s,]+/).map(Number);

// The page needs the stripped-but-not-yet-repaired SVG, so it measures what the
// strip did rather than what a previous repair already fixed.
const sprites = Object.entries(CAST).map(([name, file]) => {
  const raw = build(name, file, {});                 // no repairs applied
  const wasFillNone = {};
  const src = readFileSync(join(SRC, file), 'utf8');
  // Which kv indices were `fill:none` before? Re-derive from the tagged output:
  // the tag order is document order, so walk the same regex.
  let i = 0;
  const css = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('');
  const strokeClasses = new Set();
  const fillNoneClasses = new Set();
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const has = p => new RegExp('(^|;)\\s*' + p + '\\s*:').test(body);
    for (const s of sel.split(',')) {
      const t = s.trim(); if (!t.startsWith('.')) continue;
      if (has('stroke')) strokeClasses.add(t.slice(1));
      if (/(^|;)\s*fill\s*:\s*none/.test(body)) fillNoneClasses.add(t.slice(1));
    }
  }
  for (const [, cls] of src.matchAll(/class="(st\d+)"/g)) {
    if (strokeClasses.has(cls)) wasFillNone[i++] = fillNoneClasses.has(cls);
  }
  return {
    name,
    before: 'data:image/svg+xml;base64,' + Buffer.from(src, 'utf8').toString('base64'),
    stripped: raw.svg, kvCount: raw.kvCount, wasFillNone,
    // What build-sprites.mjs last wrote: strokes gone AND the value fills put
    // back. This is the column that decides whether the repair worked.
    repaired: existsSync(join(ART, name + '.svg'))
      ? readFileSync(join(ART, name + '.svg'), 'utf8') : raw.svg,
    vb: vbOf(raw.svg),
    /* THE BOX IS MEASURED ON A WIDER BOARD THAN THE ART WAS DRAWN ON.
       Painted alpha was the right idea and it was being read off a render the
       browser had ALREADY clipped to the source viewBox, so the measured box
       could never be bigger than the artboard however far the drawing ran past
       it. Fifteen of the twenty four sprites run past it, the two penguins by
       eighty three and eighty two units, which is the flat cut across their
       wings. Widen the board first, then measure, then crop to what was
       found. */
    wide: (() => {
      const [vx, vy, vw, vh] = vbOf(raw.svg);
      const pad = Math.max(vw, vh) * 0.6;
      const box = [vx - pad, vy - pad, vw + pad * 2, vh + pad * 2];
      const svg = raw.svg.replace(/<svg\b[^>]*>/, tag => tag
        .replace(/viewBox="[^"]*"/, 'viewBox="' + box.join(' ') + '"')
        .replace(/\s(width|height)="[^"]*"/g, ''));
      return { svg, vb: box };
    })(),
  };
});

writeFileSync(OUT, `<!doctype html><meta charset="utf-8"><title>Karrots art check</title>
<style>
 body{background:#0E1726;color:#fff;font:14px Inter,system-ui,sans-serif;margin:0;padding:24px}
 h1{font-size:20px;margin:0 0 4px} h2{font-size:16px;margin:28px 0 8px}
 p{color:#8E9CB5;margin:0 0 20px;max-width:78ch;line-height:1.55}
 table{border-collapse:collapse;width:100%}
 th{text-align:left;color:#8E9CB5;font-weight:600;padding:8px;border-bottom:1px solid #1F2D4A;font-size:13px}
 td{padding:10px 8px;border-bottom:1px solid #1F2D4A;vertical-align:middle}
 .name{font:600 13px ui-monospace,monospace;color:#C5CFE0;white-space:nowrap}
 .cell{display:flex;align-items:center;justify-content:center;border-radius:4px;margin:0 auto}
 .onTile{background:#5E9440} .onHole{background:#0E1726}
 .num{font:600 12px ui-monospace,monospace;color:#FFD23F}
 .bad{color:#FF6B5C} .ok{color:#5DD39E}
 pre{background:#131F36;padding:16px;border-radius:8px;overflow:auto;font-size:12px;color:#C5CFE0;max-height:320px}
 code{color:#5DD39E;font-size:12px}
</style>
<h1>Karrots &mdash; the cast with its black cut-lines removed</h1>
<p>Left is the 2014 file. Right is the same art with every stroke stripped, per the owner's
ruling of 2026-09-06 and DESIGN-SYSTEM.md &sect;6. <b>Invisible</b> counts the elements that
used to carry a stroke and now change nothing at all when hidden &mdash; a white shape held
only by its black edge. Those are what &sect;6 means by defining an edge with value, and they
are listed for <code>art/invisible.json</code>.</p>
<h2>Null test</h2>
<pre id="null">running…</pre>
<table><thead><tr><th>sprite</th><th>before</th><th>after</th><th>repaired</th><th>repaired, on a tile</th><th>56 in a cell</th><th>invisible elements</th><th>tight box</th></tr></thead><tbody id="rows"></tbody></table>
<h2>art/bbox.json</h2><pre id="bbox"></pre>
<h2>art/invisible.json</h2><pre id="inv"></pre>
<script>
const SPRITES = ${JSON.stringify(sprites)};
const R = 480;
const uri = s => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
function load(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});}
function raster(img, vb, res){
  /* 'res' exists because the wide board is 2.2x the artboard, and rendering it
     into the same 480 square drops the sprite to under half its pixel density.
     Measured that way four sprites came back SMALLER on a bigger board, which
     is impossible: their faint antialiased edges had fallen under the alpha
     floor. Give the wide board proportionally more pixels and the box is the
     same measurement, just of more of the drawing. */
  const N = res || R;
  const c=document.createElement('canvas'); c.width=c.height=N;
  const g=c.getContext('2d',{willReadFrequently:true});
  const [vx,vy,vw,vh]=vb, s=Math.min(N/vw,N/vh), dw=vw*s, dh=vh*s, dx=(N-dw)/2, dy=(N-dh)/2;
  g.drawImage(img,dx,dy,dw,dh);
  return {data:g.getImageData(0,0,N,N).data, s, dx, dy, vx, vy, N};
}
function tightBox(r){
  const N=r.N||R, d=r.data; let x0=N,y0=N,x1=-1,y1=-1;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++) if(d[(y*N+x)*4+3]>8){
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  if(x1<0) return null;
  return { x:+(r.vx+(x0-r.dx)/r.s).toFixed(2), y:+(r.vy+(y0-r.dy)/r.s).toFixed(2),
           w:+((x1-x0+1)/r.s).toFixed(2),      h:+((y1-y0+1)/r.s).toFixed(2) };
}
// Pixels that differ by more than a rounding wobble in any channel.
function diffPx(a,b){ let n=0; for(let i=0;i<a.length;i+=4){
  if(Math.abs(a[i]-b[i])>6||Math.abs(a[i+1]-b[i+1])>6||Math.abs(a[i+2]-b[i+2])>6||Math.abs(a[i+3]-b[i+3])>6) n++; } return n; }
const hide = (svg, sel) => svg.replace('</style>', sel+'{display:none}</style>');

(async()=>{
  const bbox={}, inv={}, rows=document.getElementById('rows'); let nullLines=[];
  for(const sp of SPRITES){
    const base = raster(await load(uri(sp.stripped)), sp.vb);
    /* The box comes off the WIDE board; the diffs below stay on the normal one,
       because what they compare is one element against another at the same
       scale and the crop plays no part in that. */
    const wr = Math.min(2400, Math.ceil(R * Math.max(sp.wide.vb[2], sp.wide.vb[3])
                                          / Math.max(sp.vb[2], sp.vb[3])));
    const wide = raster(await load(uri(sp.wide.svg)), sp.wide.vb, wr);
    bbox[sp.name] = tightBox(wide);

    // NULL TEST on the first three sprites: hiding nothing must be 0, hiding
    // every tagged element must be large. If either fails, the harness is
    // measuring the harness.
    if(nullLines.length < 3 && sp.kvCount > 0){
      const same = diffPx(base.data, raster(await load(uri(hide(sp.stripped,'.nothing-at-all'))), sp.vb).data);
      const all  = sp.kvCount ? diffPx(base.data, raster(await load(uri(hide(sp.stripped,
                     [...Array(sp.kvCount).keys()].map(i=>'.kv'+i).join(',')))), sp.vb).data) : 0;
      nullLines.push(sp.name.padEnd(14)+' hide nothing -> '+String(same).padStart(6)+' px'+
        (same===0?'  OK':'  FAIL')+'   |   hide all '+sp.kvCount+' tagged -> '+String(all).padStart(6)+' px'+
        (all>200?'  OK':'  FAIL'));
    }

    const gone=[];
    for(let k=0;k<sp.kvCount;k++){
      const d = diffPx(base.data, raster(await load(uri(hide(sp.stripped,'.kv'+k))), sp.vb).data);
      if(d <= 20) gone.push({kv:k, diff:d, wasFillNone: !!sp.wasFillNone[k]});
    }
    if(gone.length) inv[sp.name]=gone;

    const fit=(u,h)=>'<img src="'+u+'" style="max-height:'+h+'px;max-width:'+(h*1.5)+'px">';
    const after = uri(sp.stripped), rep = uri(sp.repaired);
    rows.insertAdjacentHTML('beforeend',
      '<tr><td class="name">'+sp.name+'</td>'+
      '<td><div class="cell onHole" style="width:124px;height:124px">'+fit(sp.before,116)+'</div></td>'+
      '<td><div class="cell onHole" style="width:124px;height:124px">'+fit(after,116)+'</div></td>'+
      '<td><div class="cell onHole" style="width:124px;height:124px">'+fit(rep,116)+'</div></td>'+
      '<td><div class="cell onTile" style="width:124px;height:124px">'+fit(rep,116)+'</div></td>'+
      '<td><div class="cell onTile" style="width:56px;height:56px">'+fit(rep,50)+'</div></td>'+
      '<td class="num '+(gone.length?'bad':'ok')+'">'+(gone.length? gone.length+' of '+sp.kvCount+
        ' &mdash; '+gone.map(g=>'kv'+g.kv+(g.wasFillNone?'(line)':'')).join(', ') : 'none of '+sp.kvCount)+'</td>'+
      '<td class="num">'+(bbox[sp.name]?JSON.stringify(bbox[sp.name]):'EMPTY')+'</td></tr>');
  }
  document.getElementById('null').textContent = nullLines.join('\\n');
  document.getElementById('bbox').textContent = JSON.stringify(bbox);
  document.getElementById('inv').textContent  = JSON.stringify(inv);
  document.title='ready';
})();
</script>`);
console.log('wrote ' + OUT);
