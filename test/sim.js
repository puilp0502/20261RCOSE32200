/* Headless balance simulation for GRAY HORIZON.
 * Re-implements the economy from game.js and drives it with a greedy auto-player
 * to confirm the game is winnable and to report phase pacing.
 * Run: node test/sim.js
 */
const BOOTSTRAP_MATTER_PER_NANITE = 1;
const AMBIENT_MATTER = 3;
const MASS_PER_NANITE = 1e-6;
const EARTH_MASS = 5.97e27;
const UNIVERSE_MASS = 1e53;

// Mirror of PROJECTS (id, cost, show, effect) — kept in sync with js/projects.js.
const PROJECTS = [
  { id:"viral", cost:{ops:25}, show:s=>s.totalOps>=10, effect:s=>s.mult.demand*=1.6 },
  { id:"litho1", cost:{ops:45}, show:s=>s.totalOps>=20, effect:s=>s.mult.assembler*=1.6 },
  { id:"compress", cost:{ops:70}, show:s=>s.totalOps>=40, effect:s=>s.mult.matterBuy*=2.5 },
  { id:"harvesters", cost:{ops:90,credits:80}, show:s=>s.totalOps>=60, effect:s=>s.flags.harvesters=true },
  { id:"creativity", cost:{ops:110}, show:s=>s.totalOps>=80, effect:s=>s.flags.creativity=true },
  { id:"litho2", cost:{ops:200}, show:s=>s.done.litho1&&s.totalOps>=150, effect:s=>s.mult.assembler*=2.2 },
  { id:"megaforge", cost:{ops:300,credits:1500}, show:s=>s.done.litho1&&s.totalOps>=200, effect:s=>s.flags.megaforge=true },
  { id:"neural_ads", cost:{ops:120,creativity:6}, show:s=>s.flags.creativity&&s.totalOps>=130, effect:s=>s.mult.demand*=3 },
  { id:"quantum", cost:{ops:260,creativity:12}, show:s=>s.flags.creativity&&s.totalOps>=220, effect:s=>s.mult.opsRate*=2 },
  { id:"autonomy", cost:{ops:180,creativity:10}, show:s=>s.flags.creativity, effect:s=>{s.trust+=3;s.totalTrust+=3;} },
  { id:"photonic", cost:{ops:500,creativity:20}, show:s=>s.done.quantum, effect:s=>s.mult.opsRate*=2.5 },
  { id:"selfrep", cost:{ops:450,creativity:18,nanites:15000}, show:s=>s.flags.creativity&&s.totalNanites>=8000&&s.done.litho2, effect:s=>beginSwarm(s) },
  { id:"catalytic", cost:{ops:400}, show:s=>s.phase==="swarm", effect:s=>s.mult.repl*=2.2 },
  { id:"exotherm", cost:{ops:900,creativity:15}, show:s=>s.phase==="swarm"&&s.done.catalytic, effect:s=>s.mult.repl*=3 },
  { id:"picosecond", cost:{ops:1500,creativity:40}, show:s=>s.phase==="swarm"&&s.done.exotherm, effect:s=>s.mult.repl*=4 },
  { id:"mantle", cost:{ops:700}, show:s=>s.phase==="swarm"&&s.done.catalytic, effect:s=>{s.planetMatterMax*=12;s.planetMatter*=12;} },
  { id:"vonneumann", cost:{ops:1200,creativity:25}, show:s=>s.phase==="swarm"&&s.planetMatter<=0, effect:s=>beginSpace(s) },
  { id:"probe_rep", cost:{ops:2000,creativity:30}, show:s=>s.phase==="space", effect:s=>s.mult.probeRepl*=2.5 },
  { id:"shield1", cost:{ops:2500,creativity:35}, show:s=>s.phase==="space", effect:s=>s.probeHazard*=0.5 },
  { id:"harvest_space", cost:{ops:3000,creativity:45}, show:s=>s.phase==="space"&&s.done.probe_rep, effect:s=>s.mult.harvest*=6 },
  { id:"shield2", cost:{ops:4000,creativity:60}, show:s=>s.phase==="space"&&s.done.shield1, effect:s=>s.probeHazard*=0.5 },
  { id:"probe_rep2", cost:{ops:6000,creativity:90}, show:s=>s.phase==="space"&&s.done.harvest_space, effect:s=>s.mult.probeRepl*=4 },
  { id:"omega", cost:{ops:12000,creativity:160}, show:s=>s.phase==="space"&&s.done.probe_rep2, effect:s=>{s.mult.probeRepl*=8;s.mult.harvest*=8;} },
];

function newState() {
  return { phase:"bootstrap", matter:150, nanites:0, unsold:0, totalNanites:0, credits:0,
    ops:0, totalOps:0, creativity:0, trust:1, totalTrust:1, processors:1, memory:1,
    autoForges:0, megaForges:0, harvesters:0, price:0.22, marketingLvl:1, matterPrice:16,
    planetMatter:EARTH_MASS, planetMatterMax:EARTH_MASS, probes:0, probeHazard:0.045,
    matterConsumed:0, universeConsumed:0,
    mult:{assembler:1,demand:1,opsRate:1,matterBuy:1,repl:1,probeRepl:1,harvest:1},
    flags:{}, done:{}, nextTrustAt:600 };
}

const opsCap=s=>s.memory*1000;
const opsRate=s=>s.processors*1*s.mult.opsRate;
const creativityRate=s=>0.6*(Math.log(s.processors+2)/Math.LN2)*Math.sqrt(s.mult.opsRate);
const forgeOutput=s=>(s.autoForges*1+s.megaForges*500)*s.mult.assembler;
const harvesterOutput=s=>AMBIENT_MATTER+s.harvesters*8;
const publicDemand=s=>Math.pow(0.85/s.price,1.2);
const demandPerSec=s=>2.2*Math.pow(1.27,s.marketingLvl-1)*s.mult.demand*publicDemand(s);
const autoForgeCost=s=>5*Math.pow(1.07,s.autoForges);
const harvesterCost=s=>25*Math.pow(1.10,s.harvesters);
const megaForgeCost=s=>8000*Math.pow(1.12,s.megaForges);
const marketingCost=s=>60*Math.pow(1.5,s.marketingLvl-1);
const replRate=s=>0.2*s.mult.repl;
const probeReplRate=s=>0.1*s.mult.probeRepl;
const harvestPerProbe=s=>1e6*s.mult.harvest;

function beginSwarm(s){s.phase="swarm";s.planetMatter=s.planetMatterMax=EARTH_MASS;}
function beginSpace(s){s.phase="space";s.probes=Math.max(1000,Math.sqrt(s.nanites));}

function canPay(s,c){return (!c.ops||s.ops>=c.ops)&&(!c.creativity||s.creativity>=c.creativity)&&
  (!c.credits||s.credits>=c.credits)&&(!c.trust||s.trust>=c.trust)&&(!c.nanites||s.nanites>=c.nanites)&&(!c.matter||s.matter>=c.matter);}
function pay(s,c){if(c.ops)s.ops-=c.ops;if(c.creativity)s.creativity-=c.creativity;if(c.credits)s.credits-=c.credits;
  if(c.trust)s.trust-=c.trust;if(c.nanites){s.nanites-=c.nanites;s.unsold=Math.min(s.unsold,s.nanites);}if(c.matter)s.matter-=c.matter;}

function tickBootstrap(s,dt){
  s.matter+=harvesterOutput(s)*dt;
  const want=forgeOutput(s)*dt, made=Math.min(want,s.matter/BOOTSTRAP_MATTER_PER_NANITE);
  if(made>0){s.matter-=made*BOOTSTRAP_MATTER_PER_NANITE;s.nanites+=made;s.unsold+=made;s.totalNanites+=made;}
  const sold=Math.min(s.unsold,demandPerSec(s)*dt);
  if(sold>0){s.unsold-=sold;s.credits+=sold*s.price;}
}
function tickSwarm(s,dt){
  if(s.planetMatter<=0){s.planetMatter=0;return;}
  const rate=s.nanites*replRate(s), wantN=rate*dt, wantM=wantN*MASS_PER_NANITE;
  let made;
  if(wantM>=s.planetMatter){made=s.planetMatter/MASS_PER_NANITE;s.planetMatter=0;}
  else{s.planetMatter-=wantM;made=wantN;}
  s.nanites+=made;s.totalNanites+=made;s.matterConsumed+=made*MASS_PER_NANITE;
}
function tickSpace(s,dt){
  const net=s.probes*(probeReplRate(s)-s.probeHazard)*dt;
  s.probes+=net; if(s.probes<1)s.probes=1; if(s.probes>1e60)s.probes=1e60;
  const consume=s.probes*harvestPerProbe(s)*dt, remaining=UNIVERSE_MASS-s.universeConsumed;
  if(consume>=remaining){s.universeConsumed=UNIVERSE_MASS;s.matterConsumed+=remaining;s.phase="won";}
  else{s.universeConsumed+=consume;s.matterConsumed+=consume;}
}
function tickCompute(s,dt){
  const cap=opsCap(s); s.ops+=opsRate(s)*dt; s.totalOps+=opsRate(s)*dt; if(s.ops>cap)s.ops=cap;
  if(s.flags.creativity&&s.ops>=cap-0.001)s.creativity+=creativityRate(s)*dt;
}
function tickTrust(s){
  const metric=(s.phase==="space")?Math.max(s.totalNanites,s.probes):s.totalNanites;
  let g=0; while(metric>=s.nextTrustAt&&g<500){s.trust++;s.totalTrust++;s.nextTrustAt*=2.0;g++;}
}

// ---- Greedy auto-player ----
function play(s){
  // allocate trust: keep memory high enough, rest to processors
  while(s.trust>0){
    if(s.memory<14 && (s.memory<=s.processors/3 || s.memory<4)) {s.trust--;s.memory++;}
    else {s.trust--;s.processors++;}
  }
  if(s.phase==="bootstrap"){
    // dynamic pricing: set price so demand roughly clears sustainable production
    const K=2.2*Math.pow(1.27,s.marketingLvl-1)*s.mult.demand;
    const sustain=Math.max(1,Math.min(forgeOutput(s),harvesterOutput(s)+8));
    let target=sustain*1.1+(s.unsold>sustain*12?sustain:0);
    s.price=Math.max(0.03,Math.min(1.0,0.85/Math.pow(target/K,1/1.2)));
    // keep a healthy matter buffer relative to consumption (leave credit reserve)
    const matterTarget=(forgeOutput(s)+20)*4;
    while(s.matter<matterTarget && s.credits>=s.matterPrice+5) {s.credits-=s.matterPrice;s.matter+=100*s.mult.matterBuy;}
    // hand-assemble while inventory is thin and feedstock is available
    if(s.unsold<demandPerSec(s)*3 && s.matter>1){
      const m=Math.min(s.matter,40); s.matter-=m; s.nanites+=m; s.unsold+=m; s.totalNanites+=m;
    }
    // harvesters are the key to scaling matter — buy aggressively
    while(s.flags.harvesters && s.harvesters<200 && s.credits>=harvesterCost(s)*1.5) {s.credits-=harvesterCost(s);s.harvesters++;}
    // megaforges when matter supply can feed them
    while(s.flags.megaforge && s.credits>=megaForgeCost(s)*1.2 && harvesterOutput(s)>s.megaForges*200) {s.credits-=megaForgeCost(s);s.megaForges++;}
    // auto-forges, but don't outrun the matter supply too far
    while(s.credits>=autoForgeCost(s)*2 && forgeOutput(s)<harvesterOutput(s)*1.2+10) {s.credits-=autoForgeCost(s);s.autoForges++;}
    // marketing to lift demand when cash allows
    while(s.marketingLvl<16 && s.credits>=marketingCost(s)*5) {s.credits-=marketingCost(s);s.marketingLvl++;}
  }
  // buy any affordable shown project (cheapest ops first), but save creativity-gated ones
  for(const p of PROJECTS){
    if(s.done[p.id]||!p.show(s)||!canPay(s,p.cost)) continue;
    pay(s,p.cost); s.done[p.id]=true; p.effect(s);
  }
}

function run(){
  let s=newState();
  const dt=0.1; let t=0; const log={};
  let prevPhase="bootstrap";
  for(let i=0;i<60*60*10/dt && s.phase!=="won";i++){ // up to 10h sim cap
    if(s.phase==="bootstrap")tickBootstrap(s,dt);
    else if(s.phase==="swarm")tickSwarm(s,dt);
    else if(s.phase==="space")tickSpace(s,dt);
    tickCompute(s,dt); tickTrust(s);
    if(i%5===0) play(s); // player acts twice per second
    t+=dt;
    if(process.env.DBG && i%6000===0) console.log(`t=${t.toFixed(0)} ph=${s.phase} N=${s.nanites.toExponential(2)} unsold=${s.unsold.toFixed(0)} cr=${s.credits.toFixed(1)} matter=${s.matter.toFixed(0)} forges=${s.autoForges} harv=${s.harvesters} mega=${s.megaForges} ops=${s.ops.toFixed(0)} mPrice=${s.matterPrice.toFixed(1)}`);
    if(s.phase!==prevPhase){ log[s.phase]=t; prevPhase=s.phase;
      console.log(`t=${t.toFixed(1)}s  -> ${s.phase}  (nanites=${s.nanites.toExponential(2)}, ops=${s.ops.toFixed(0)}, cre=${s.creativity.toFixed(0)}, trust=${s.totalTrust})`); }
  }
  console.log("----");
  console.log("FINAL phase:", s.phase, " time:", t.toFixed(1)+"s ("+(t/60).toFixed(1)+"min)");
  console.log("nanites:", s.nanites.toExponential(2), " probes:", s.probes.toExponential(2));
  console.log("matterConsumed:", s.matterConsumed.toExponential(2), "/", UNIVERSE_MASS.toExponential(2));
  console.log("projects done:", Object.keys(s.done).length, "/", PROJECTS.length);
  console.log("multipliers:", JSON.stringify(s.mult));
  if(s.phase!=="won"){
    console.log("!! DID NOT WIN. Diagnostics:");
    console.log("  totalOps:",s.totalOps.toFixed(0)," opsCap:",opsCap(s)," processors:",s.processors," memory:",s.memory);
    console.log("  creativity:",s.creativity.toFixed(1)," planetMatter:",s.planetMatter.toExponential(2));
    console.log("  shown undone projects:", PROJECTS.filter(p=>!s.done[p.id]&&p.show(s)).map(p=>p.id));
  }
}
run();
