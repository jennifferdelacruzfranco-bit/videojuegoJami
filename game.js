// AVENTURA PIXEL: plataformas 2D con física, colisiones y audio Web Audio.
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const $ = id => document.getElementById(id);
  const screens = ['startScreen','instructionsScreen','pauseScreen','endScreen'];
  const keys = Object.create(null);

  // Audio sintetizado: no necesita archivos externos. El navegador requiere interacción
  // del usuario antes de permitir reproducir sonido.
  let audioCtx = null, muted = false, musicTimer = null, musicStep = 0;
  function audioReady() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function tone(freq, duration=.12, type='square', volume=.035, delay=0) {
    if (muted) return;
    audioReady();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + delay + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + delay); osc.stop(audioCtx.currentTime + delay + duration);
  }
  const sfx = {
    jump(){ tone(390,.09); tone(590,.13,'square',.025,.07); },
    coin(){ tone(880,.08,'sine',.05); tone(1320,.16,'sine',.04,.08); },
    stomp(){ tone(150,.12,'triangle',.06); },
    hit(){ tone(110,.25,'sawtooth',.05); },
    block(){ tone(260,.07,'square',.04); tone(420,.08,'square',.03,.07); },
    win(){ [523,659,784,1047].forEach((f,i)=>tone(f,.2,'triangle',.045,i*.14)); },
    lose(){ [440,370,294,220].forEach((f,i)=>tone(f,.22,'triangle',.04,i*.18)); }
  };
  function startMusic() {
    if (musicTimer || muted) return;
    audioReady();
    const notes = [392,494,587,494,440,523,659,523,392,494,587,784,659,587,494,440];
    musicTimer = setInterval(() => {
      if (state !== 'playing' || muted) return;
      tone(notes[musicStep++ % notes.length],.11,'triangle',.012);
    }, 210);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
  $('soundBtn').onclick = () => {
    muted = !muted; $('soundBtn').textContent = muted ? '🔇 Silencio' : '🔊 Sonido';
    if (muted) stopMusic(); else if (state === 'playing') startMusic();
  };

  let state = 'menu', score = 0, coins = 0, lives = 3, level = 1, camera = 0;
  let player, platforms, blocks, coinItems, enemies, particles, goal, worldWidth;
  const gravity = .58;
  const levelData = [
    {width:2600, holes:[[600,120],[1330,145],[2020,130]], platforms:[[350,390,150],[850,345,150],[1110,410,140],[1530,365,180],[1850,320,150]], pipes:[[500,440,65,100],[1030,440,70,100],[1710,440,70,100]], enemyX:[430,920,1580,1920], coinX:[280,370,880,930,1170,1570,1620,1900,2200]},
    {width:3100, holes:[[720,130],[1510,150],[2400,150]], platforms:[[400,370,160],[900,320,150],[1200,390,160],[1700,340,180],[2050,300,170],[2650,365,160]], pipes:[[570,440,70,100],[1100,440,70,100],[1900,440,75,100],[2500,440,75,100]], enemyX:[480,990,1370,1810,2160,2760], coinX:[300,420,930,970,1240,1740,1790,2110,2700,2820]},
    {width:3500, holes:[[800,140],[1600,160],[2600,150]], platforms:[[420,360,170],[970,310,170],[1300,380,170],[1800,330,190],[2250,290,180],[2800,350,180],[3150,310,150]], pipes:[[620,440,75,100],[1190,440,75,100],[2070,440,75,100],[2940,440,75,100]], enemyX:[500,1050,1450,1880,2340,2880,3220], coinX:[300,450,1000,1040,1350,1840,1900,2300,2860,3210,3320]}
  ];

  function hideScreens() { screens.forEach(id => $(id).classList.add('hidden')); }
  function showScreen(id) { hideScreens(); $(id).classList.remove('hidden'); }
  function makeLevel() {
    const d = levelData[level-1]; worldWidth = d.width; camera = 0;
    player = {x:70,y:300,w:32,h:42,vx:0,vy:0,onGround:false,face:1,invuln:0,dead:false,anim:0};
    platforms = [{x:0,y:440,w:worldWidth,h:100,type:'ground'}];
    // Separar el suelo para crear pozos reales.
    platforms = [];
    let cursor = 0;
    d.holes.forEach(([x,w]) => { if (x>cursor) platforms.push({x:cursor,y:440,w:x-cursor,h:100,type:'ground'}); cursor=x+w; });
    if (cursor<worldWidth) platforms.push({x:cursor,y:440,w:worldWidth-cursor,h:100,type:'ground'});
    d.platforms.forEach(([x,y,w])=>platforms.push({x,y,w,h:18,type:'ledge'}));
    d.pipes.forEach(([x,y,w,h])=>platforms.push({x,y,w,h,type:'pipe'}));
    blocks = [320,780,1240,1660,2180].map((x,i)=>({x,y:i%2?280:330,w:38,h:38,used:false}));
    coinItems = d.coinX.map((x,i)=>({x,y: i%3===0?365:(i%3===1?300:390),r:10,taken:false,phase:i}));
    enemies = d.enemyX.map((x,i)=>({x,y:406,w:30,h:30,vx:i%2?1.25:-1.25,alive:true,min:x-85,max:x+85}));
    particles = []; goal = {x:worldWidth-120,y:230,w:18,h:210};
    updateHud();
  }
  function updateHud() {
    $('score').textContent=String(score).padStart(6,'0');
    $('coins').textContent=String(coins).padStart(2,'0');
    $('lives').textContent=lives; $('level').textContent=level;
  }
  function startGame() {
    audioReady(); score=0; coins=0; lives=3; level=1; makeLevel();
    state='playing'; hideScreens(); startMusic(); lastTime=performance.now(); requestAnimationFrame(loop);
  }
  $('playBtn').onclick=startGame;
  $('instructionsBtn').onclick=()=>showScreen('instructionsScreen');
  $('backBtn').onclick=()=>showScreen('startScreen');
  $('restartBtn').onclick=startGame;
  $('resumeBtn').onclick=()=>{state='playing';hideScreens();startMusic();lastTime=performance.now();requestAnimationFrame(loop);};

  function pause() {
    if(state==='playing'){state='paused';stopMusic();showScreen('pauseScreen');}
    else if(state==='paused'){state='playing';hideScreens();startMusic();lastTime=performance.now();requestAnimationFrame(loop);}
  }
  window.addEventListener('keydown',e=>{
    if(['ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)) e.preventDefault();
    keys[e.code]=true;
    if(e.code==='KeyP') pause();
    if(state==='menu' && e.code==='Enter') startGame();
  });
  window.addEventListener('keyup',e=>keys[e.code]=false);
  document.querySelectorAll('.touch-controls button').forEach(btn=>{
    const code=btn.dataset.key;
    const down=e=>{e.preventDefault();keys[code]=true;};
    const up=e=>{e.preventDefault();keys[code]=false;};
    btn.addEventListener('pointerdown',down); btn.addEventListener('pointerup',up);
    btn.addEventListener('pointerleave',up); btn.addEventListener('pointercancel',up);
  });

  function rects(a,b){return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;}
  function burst(x,y,color,n=8){
    for(let i=0;i<n;i++) particles.push({x,y,vx:(Math.random()-.5)*5,vy:-Math.random()*4-1,life:35,color});
  }
  function hurt() {
    if(player.invuln>0) return;
    lives--; updateHud(); sfx.hit(); player.invuln=100; player.vy=-7; player.vx=-player.face*4;
    if(lives<=0) { state='ended';stopMusic();sfx.lose();$('endTitle').textContent='¡GAME OVER!';$('endMessage').textContent='Puntuación final: '+score;showScreen('endScreen'); }
  }
  function update(dt) {
    const p=player, step=Math.min(dt/16.67,2);
    p.anim+=step; if(p.invuln>0)p.invuln-=step;
    const left=keys.ArrowLeft, right=keys.ArrowRight, running=keys.ShiftLeft||keys.ShiftRight;
    const speed=running?5.2:3.4;
    p.vx=0; if(left){p.vx=-speed;p.face=-1;} if(right){p.vx=speed;p.face=1;}
    if(keys.Space && p.onGround){p.vy=keys.Space? -11.7:-10.5;p.onGround=false;sfx.jump();}
    else if(keys.Space && p.vy< -3) p.vy-=.18*step; // salto variable
    p.vy+=gravity*step; if(p.vy>13)p.vy=13;

    // Movimiento horizontal y colisiones laterales.
    p.x+=p.vx*step;
    for(const plat of platforms) if(rects(p,plat)){
      if(p.vx>0)p.x=plat.x-p.w; else if(p.vx<0)p.x=plat.x+plat.w;
    }
    for(const b of blocks) if(rects(p,b)){
      if(p.vx>0)p.x=b.x-p.w; else if(p.vx<0)p.x=b.x+b.w;
    }
    // Movimiento vertical: aterrizaje y golpe de bloques desde abajo.
    const oldY=p.y; p.y+=p.vy*step; p.onGround=false;
    for(const plat of platforms) if(rects(p,plat)){
      if(p.vy>=0 && oldY+p.h<=plat.y+8){p.y=plat.y-p.h;p.vy=0;p.onGround=true;}
      else if(p.vy<0 && oldY>=plat.y+plat.h-5){p.y=plat.y+plat.h;p.vy=0;}
    }
    for(const b of blocks) if(rects(p,b)){
      if(p.vy<0 && oldY>=b.y+b.h-5){p.y=b.y+b.h;p.vy=0;
        if(!b.used){b.used=true;coins++;score+=100;updateHud();sfx.block();burst(b.x+19,b.y,'#ffd34e',7);}
      } else if(p.vy>=0 && oldY+p.h<=b.y+8){p.y=b.y-p.h;p.vy=0;p.onGround=true;}
    }
    p.x=Math.max(0,Math.min(worldWidth-p.w,p.x));
    // Caer en un pozo.
    if(p.y>H+70){hurt();p.y=250;p.x=Math.max(30,p.x-80);p.vy=0;}
    // Monedas.
    coinItems.forEach(c=>{if(!c.taken && rects(p,{x:c.x-9,y:c.y-12,w:18,h:24})){
      c.taken=true;coins++;score+=50;updateHud();sfx.coin();burst(c.x,c.y,'#ffe16b',6);
    }});
    // Enemigos: pisarlos los elimina; tocarlos de lado hace daño.
    enemies.forEach(e=>{
      if(!e.alive)return;
      e.x+=e.vx*step;if(e.x<e.min||e.x>e.max)e.vx*=-1;
      if(rects(p,e)){
        if(p.vy>1 && oldY+p.h<e.y+15){e.alive=false;p.vy=-8;score+=200;updateHud();sfx.stomp();burst(e.x+15,e.y,'#a8e06b',10);}
        else hurt();
      }
    });
    // Meta / bandera.
    if(p.x+p.w>goal.x){score+=500;updateHud();stopMusic();
      if(level<3){level++;makeLevel();sfx.win();}
      else {state='ended';sfx.win();$('endTitle').textContent='¡VICTORIA!';$('endMessage').textContent='Completaste los 3 niveles con '+score+' puntos.';showScreen('endScreen');}
    }
    particles.forEach(a=>{a.x+=a.vx*step;a.y+=a.vy*step;a.vy+=.15*step;a.life-=step;});
    particles=particles.filter(a=>a.life>0);
    camera=Math.max(0,Math.min(worldWidth-W,p.x-W*.38));
  }

  function drawCloud(x,y,s=1){
    ctx.fillStyle='rgba(255,255,255,.9)';ctx.beginPath();
    ctx.arc(x,y,18*s,0,Math.PI*2);ctx.arc(x+20*s,y-10*s,23*s,0,Math.PI*2);
    ctx.arc(x+45*s,y,18*s,0,Math.PI*2);ctx.fill();
  }
  function draw() {
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#66d3f4');sky.addColorStop(1,'#d5f6ff');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // Montañas en capas.
    for(let i=0;i<9;i++){
      const x=((i*360-camera*.22)%(W+400))-100;
      ctx.fillStyle=i%2?'#75c98b':'#55b77c';ctx.beginPath();ctx.moveTo(x,440);ctx.lineTo(x+150,205+(i%3)*25);ctx.lineTo(x+320,440);ctx.fill();
    }
    for(let i=0;i<7;i++)drawCloud(((i*230-camera*.35)%(W+180))-80,75+(i%3)*55,.8+(i%2)*.25);
    ctx.save();ctx.translate(-camera,0);
    // Árboles decorativos.
    for(let x=140;x<worldWidth;x+=430){ctx.fillStyle='#8a552d';ctx.fillRect(x,375,20,65);ctx.fillStyle='#218b58';ctx.beginPath();ctx.arc(x+10,365,34,0,7);ctx.fill();}
    // Plataformas y suelo.
    platforms.forEach(pl=>{
      if(pl.type==='ground'){ctx.fillStyle='#a96a3d';ctx.fillRect(pl.x,pl.y,pl.w,pl.h);ctx.fillStyle='#4caf50';ctx.fillRect(pl.x,pl.y,pl.w,12);
        ctx.fillStyle='#d18a51';for(let x=pl.x+12;x<pl.x+pl.w;x+=48)ctx.fillRect(x,pl.y+30,20,5);
      } else if(pl.type==='pipe'){
        ctx.fillStyle='#16834b';ctx.fillRect(pl.x+7,pl.y+10,pl.w-14,pl.h-10);ctx.fillStyle='#35c96b';ctx.fillRect(pl.x,pl.y,pl.w,18);
        ctx.fillStyle='#74ed8f';ctx.fillRect(pl.x+8,pl.y+3,9,10);
      } else {ctx.fillStyle='#8b572f';ctx.fillRect(pl.x,pl.y,pl.w,pl.h);ctx.fillStyle='#59c653';ctx.fillRect(pl.x,pl.y,pl.w,6);}
    });
    // Bloques golpeables.
    blocks.forEach(b=>{ctx.fillStyle=b.used?'#a6a08b':'#e89b36';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle='#814b25';ctx.lineWidth=4;ctx.strokeRect(b.x,b.y,b.w,b.h);
      ctx.fillStyle=b.used?'#777':'#ffe08a';ctx.font='bold 25px sans-serif';ctx.fillText(b.used?'·':'?',b.x+12,b.y+28);});
    // Monedas animadas.
    coinItems.forEach(c=>{if(c.taken)return;const squash=Math.abs(Math.sin(performance.now()/180+c.phase))*.35;
      ctx.save();ctx.translate(c.x,c.y);ctx.scale(.65+squash,1);ctx.fillStyle='#ffbd22';ctx.beginPath();ctx.ellipse(0,0,9,13,0,0,7);ctx.fill();
      ctx.strokeStyle='#fff08a';ctx.lineWidth=3;ctx.stroke();ctx.restore();});
    // Enemigos.
    enemies.forEach(e=>{if(!e.alive)return;ctx.fillStyle='#8a4d39';ctx.beginPath();ctx.roundRect(e.x,e.y+5,e.w,e.h-5,10);ctx.fill();
      ctx.fillStyle='white';ctx.fillRect(e.x+6,e.y+10,6,7);ctx.fillRect(e.x+19,e.y+10,6,7);ctx.fillStyle='#172b3c';ctx.fillRect(e.x+9,e.y+12,3,4);ctx.fillRect(e.x+22,e.y+12,3,4);
      ctx.fillStyle='#56352d';ctx.fillRect(e.x+4,e.y+27,9,4);ctx.fillRect(e.x+19,e.y+27,9,4);});
    // Bandera final.
    ctx.fillStyle='#e9eee8';ctx.fillRect(goal.x,goal.y,7,210);ctx.fillStyle='#ff595e';ctx.beginPath();ctx.moveTo(goal.x+7,goal.y+5);ctx.lineTo(goal.x+72,goal.y+27);ctx.lineTo(goal.x+7,goal.y+50);ctx.fill();
    // Jugador pixelado original.
    if(!(player.invuln>0 && Math.floor(performance.now()/90)%2===0)){
      const p=player,x=p.x,y=p.y;
      ctx.fillStyle='#713e2e';ctx.fillRect(x+5,y+2,23,8);ctx.fillRect(x+2,y+8,28,6);
      ctx.fillStyle='#ffbd80';ctx.fillRect(x+8,y+12,17,13);ctx.fillStyle='#172b3c';ctx.fillRect(x+(p.face>0?20:10),y+15,4,5);
      ctx.fillStyle='#2877d4';ctx.fillRect(x+5,y+25,23,12);ctx.fillStyle='#f2c34e';ctx.fillRect(x+3,y+26,5,9);
      ctx.fillStyle='#633b2a';const walk=p.onGround&&Math.abs(p.vx)>.1&&Math.floor(p.anim/4)%2;
      ctx.fillRect(x+6,y+36,9,6);ctx.fillRect(x+(walk?17:19),y+36,10,6);
    }
    particles.forEach(a=>{ctx.globalAlpha=Math.max(0,a.life/35);ctx.fillStyle=a.color;ctx.fillRect(a.x,a.y,5,5);ctx.globalAlpha=1;});
    ctx.restore();
    // Indicador de avance.
    ctx.fillStyle='rgba(15,44,65,.55)';ctx.fillRect(15,15,130,8);ctx.fillStyle='#ffe16b';ctx.fillRect(15,15,130*Math.min(1,player.x/worldWidth),8);
  }

  let lastTime=0, raf=null;
  function loop(now) {
    if(state!=='playing')return;
    const dt=Math.min(now-lastTime,34);lastTime=now;
    update(dt);draw();
    if(state==='playing')raf=requestAnimationFrame(loop);
  }
  // Dibujo de bienvenida mientras el juego está en el menú.
  makeLevel(); draw();
  window.addEventListener('blur',()=>{if(state==='playing')pause();});
})();