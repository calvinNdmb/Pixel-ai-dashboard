/* Vendored from the user's own animation pack "Pixel OS — 3 thèmes, 52 animations" (version 2.1.0, src/pixel-themes.js).
   Changes for Pixel OS: the globals are renamed so they do not clash with ours (window.PixelThemes is window.Pixel52Themes, and it reads window.Pixel52);
   and draw() reads an optional options.look for « Son look » (web/look.js, through themes.js): look.eye may draw an eye its own
   way (true) or leave it to the pack, look.cheek a cheek, look.under and look.over what he wears, in the face's frame. Without
   it, nothing changes. Loaded by index.html and the lab before themes.js. */
/* Pixel OS — smooth Modern and Manga renderers. Original artwork in Canvas 2D. */
(function(scope){
  'use strict';
  const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
  const env=(p,a,b,c,d)=>ease((p-a)/(b-a))*(1-ease((p-c)/(d-c)));
  const sin=(p,n=1)=>Math.sin(TAU*p*n);
  function pose(id,seconds){
    const a=scope.Pixel52.animations.find(a=>a.id===id);
    if(!a)throw new RangeError('Unknown Pixel animation: '+id);
    if(!Number.isFinite(seconds))throw new TypeError('Time must be finite');
    const p=((seconds/a.duration)%1+1)%1,A=env(p,.10,.24,.68,.92);
    const blink=env(p,.74,.755,.767,.79);
    const s={id,p,A,x:0,y:2*sin(p),rot:0,gx:0,gy:0,sx:1,sy:1,lidL:1-blink*.97,lidR:1-blink*.97,eyeL:'open',eyeR:'open',mouth:'smile',mw:1,mh:1,blush:1,brow:0,energy:1};
    const eyes=k=>{s.eyeL=s.eyeR=k};
    switch(id){
      case 'content':s.mw=1+.12*Math.max(0,sin(p));s.sy=1+.025*sin(p,2);break;
      case 'curieux':s.gx=17*sin(p);s.gy=-6*Math.max(0,sin(p));s.rot=.075*sin(p);s.sx=1+.03*sin(p);break;
      case 'clin-oeil':s.lidR*=1-.98*A;s.rot=-.045*A;s.mw=1+.23*A;break;
      case 'salut':s.x=-10*A;s.rot=-.04*A;if(A>.8)eyes('happy');break;
      case 'rire':eyes('happy');s.mouth='laugh';s.y=-7*Math.abs(sin(p,4));s.sx=1+.06*sin(p,4);s.sy=1-.05*sin(p,4);s.mh=1+.18*sin(p,4);break;
      case 'surpris':s.sx=1+.19*A;s.sy=1+.22*A;s.mouth='o';s.mh=.45+.8*A;s.y=6*A;s.brow=.8*A;break;
      case 'timide':s.gx=-10*A;s.gy=5*A;s.rot=-.045*A;s.mw=.65;s.blush=1+1.1*A;s.lidL*=1-.13*A;s.lidR*=1-.13*A;break;
      case 'fier':eyes('happy');s.y=-9*A;s.rot=.02*sin(p);s.mw=1.2;break;
      case 'amoureux':eyes('heart');s.sy=1+.1*Math.max(0,sin(p,2));s.sx=1+.07*Math.max(0,sin(p,2));s.y=-3*sin(p,2);s.blush=1.4;break;
      case 'bisou':s.lidL*=1-.97*A;s.lidR*=1-.97*A;s.mouth=A>.3?'kiss':'smile';s.rot=-.04*A;s.blush=1.3;break;
      case 'etoiles':eyes('star');s.mouth='o';s.mh=.5;s.y=-4*Math.abs(sin(p,2));break;
      case 'triste':eyes('sad');s.mouth='frown';s.gy=5;s.blush=.3;s.brow=-.8;s.y=4;break;
      case 'boudeur':eyes('half');s.mouth='pout';s.gx=16*A;s.rot=.05*A;s.blush=1.4;break;
      case 'colere':eyes('angry');s.mouth='grit';s.x=3*sin(p,6)*A;s.brow=-1;s.blush=1.4;break;
      case 'panique':s.mouth='o';s.sx=1.12;s.sy=1.15;s.x=6*sin(p,7);s.gx=7*sin(p,3);s.brow=1;s.blush=.2;break;
      case 'confus':s.eyeL='half';s.rot=.10*sin(p);s.mouth='crooked';s.gx=5*sin(p);s.brow=.4;break;
      case 'reflechit':s.eyeL='half';s.gx=6+4*sin(p);s.gy=-10;s.mouth='flat';s.mw=.65;s.rot=.035*sin(p);break;
      case 'idee':s.gy=-5*A;s.y=-8*A;s.brow=A;s.mw=1+.2*A;break;
      case 'ecoute':s.rot=-.08*A;s.gx=-11*A;s.y=3*sin(p,2)*A;s.mw=.8;break;
      case 'parle':s.mouth='talk';s.mh=.35+.8*Math.abs(sin(p,7));s.mw=.7+.3*Math.abs(sin(p,3));s.y=2*sin(p,3);break;
      case 'chante':eyes('happy');s.mouth='o';s.mh=.6+.5*Math.abs(sin(p,3));s.rot=.06*sin(p,2);s.x=4*sin(p,2);break;
      case 'danse':eyes('happy');s.mouth='laugh';s.x=24*sin(p,2);s.y=-10*Math.abs(sin(p,4));s.rot=.10*sin(p,2);s.sx=1+.07*sin(p,4);s.sy=1-.07*sin(p,4);break;
      case 'code':eyes('half');s.gy=8;s.gx=10*sin(p,2);s.mouth='flat';s.mw=.65;s.y=-10;break;
      case 'recherche':s.eyeL='half';s.gx=22*sin(p);s.mouth='o';s.mh=.3;s.mw=.65;break;
      case 'chargement':s.gx=9*sin(p);s.gy=-4*Math.cos(TAU*p);s.mouth='flat';s.mw=.65;break;
      case 'succes':eyes('happy');s.y=-12*Math.sin(Math.PI*A);s.mw=1.2;break;
      case 'erreur':eyes('sad');s.mouth='frown';s.x=10*sin(p,4)*A;s.blush=.4;break;
      case 'notification':s.gx=13*A;s.gy=-8*A;s.sx=1+.05*A;s.brow=.3*A;break;
      case 'connexion':if(A>.6)eyes('happy');s.y=-4*A;break;
      case 'deconnexion':eyes('half');s.mouth='crooked';s.gx=14*sin(p,2);s.blush=.25;break;
      case 'mise-a-jour':s.lidL=s.lidR=p<.8?.03:1;s.mouth=p<.8?'flat':'smile';s.y=-8;break;
      case 'bug':s.x=p>.38&&p<.55?sin(p,20)*11:0;s.gx=p>.38&&p<.55?-8:0;s.mouth=p>.38&&p<.55?'crooked':'smile';break;
      case 'sommeil':case 'reve':eyes('closed');s.mouth='sleep';s.mh=.3+.12*sin(p);s.y=3*sin(p);s.blush=.65;break;
      case 'reveil':{const q=env(p,.05,.55,.77,.98);s.lidL=s.lidR=.04+.96*q;s.mouth=q>.7?'smile':'sleep';s.y=7*(1-q);s.mh=.5;break;}
      case 'baille':s.lidL*=1-.94*A;s.lidR*=1-.94*A;s.mouth='o';s.mh=.2+1.5*A;s.mw=.8;s.y=-3*A;break;
      case 'fatigue':s.lidL=s.lidR=.65-.6*A;s.mouth='sleep';s.mh=.25;s.rot=.06*A;s.y=9*A;break;
      case 'batterie-faible':eyes('half');s.mouth='flat';s.energy=.45;s.y=9+2*sin(p);s.blush=.3;break;
      case 'recharge':s.lidL=s.lidR=.3+.7*A;s.energy=.5+.5*A;s.y=4-7*A;break;
      case 'zen':eyes('closed');s.y=4*sin(p);s.mw=.8;break;
      case 'idle-respire':s.y=2.2*sin(p);s.sy=1+.018*sin(p);s.sx=1-.012*sin(p);break;
      case 'idle-cligne':{const b=Math.max(env(p,.26,.275,.285,.31),env(p,.62,.635,.645,.67),env(p,.69,.705,.715,.74));s.lidL=s.lidR=1-.98*b;s.sy=1+.025*sin(p);break;}
      case 'idle-regard':{const l=env(p,.14,.23,.36,.46),r=env(p,.54,.63,.76,.86);s.gx=16*(r-l);s.x=2*(r-l);break;}
      case 'idle-incline':{const q=env(p,.22,.4,.58,.79);s.rot=.07*q;s.gx=5*q;break;}
      case 'idle-sourit':{const q=env(p,.25,.4,.6,.78);s.mw=1+.35*q;s.blush=1+.3*q;s.lidL*=1-.12*q;s.lidR*=1-.12*q;s.y=-2*q;break;}
      case 'idle-haut':{const q=env(p,.22,.32,.58,.76);s.gx=7*q;s.gy=-13*q;s.rot=-.025*q;break;}
      case 'idle-bas':{const q=env(p,.25,.36,.57,.72);s.gy=11*q;s.y=3*q;s.lidL*=1-.15*q;s.lidR*=1-.15*q;break;}
      case 'idle-somnole':{const q=env(p,.2,.52,.64,.73);s.lidL=s.lidR=1-.97*q;s.y=9*q;s.rot=.06*q;s.mouth=q>.6?'sleep':'smile';s.mh=.3;s.sy=1+.1*env(p,.73,.76,.79,.86);break;}
      case 'idle-etire':{const q=env(p,.25,.43,.58,.77);s.y=-8*q;s.sy=1+.08*q;s.lidL*=1-.85*q;s.lidR*=1-.85*q;break;}
      case 'idle-gratouille':{const q=env(p,.25,.36,.63,.75);s.rot=-.04*q;s.gx=7*q;s.lidR*=1-.25*q;break;}
      case 'idle-luciole':{const q=env(p,.1,.2,.73,.88);s.gx=16*sin(p-.16)*q;s.gy=-9*q;break;}
      case 'idle-impatient':{const q=env(p,.22,.35,.65,.78);s.gx=-8*q;s.mouth=q>.7?'flat':'smile';s.mw=.8;break;}
    }
    return s;
  }
  function draw(canvas,id,time,options={}){
    const manga=options.theme==='manga',ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas 2D is required');
    let s=pose(id,time);
    if(options.transition&&time<.42){
      const from=pose(options.transition.id,options.transition.time),mix=ease(time/.42);
      for(const key of ['x','y','rot','gx','gy','sx','sy','lidL','lidR','mw','mh','blush','brow','energy'])s[key]=from[key]+(s[key]-from[key])*mix;
      if(mix<.5){s.eyeL=from.eyeL;s.eyeR=from.eyeR;s.mouth=from.mouth;}
    }
    const {p,A}=s,ink=manga?'#34213e':'#81fff3',pink=manga?'#ed8aab':'#ff97ad',accent=manga?'#b794e4':'#75f4e9',gold=manga?'#dfb05d':'#f4d395';
    ctx.save();ctx.setTransform(canvas.width/600,0,0,canvas.height/337.5,0,0);ctx.clearRect(0,0,600,337.5);ctx.lineCap='round';ctx.lineJoin='round';
    const oval=(x,y,rx,ry,fill,stroke=null,width=2)=>{ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}};
    const line=(x1,y1,x2,y2,color=ink,width=3)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()};
    const curve=(x1,y1,cx,cy,x2,y2,color=ink,width=3)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo(cx,cy,x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()};
    const round=(x,y,w,h,r,fill,stroke=null,width=2)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}};
    function heart(x,y,size,color=pink){ctx.save();ctx.translate(x,y);ctx.scale(size/20,size/20);ctx.beginPath();ctx.moveTo(0,6);ctx.bezierCurveTo(-28,-10,-12,-28,0,-13);ctx.bezierCurveTo(12,-28,28,-10,0,6);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore()}
    function star(x,y,r,color=gold,n=4){ctx.beginPath();for(let i=0;i<n*2;i++){const a=i*Math.PI/n-Math.PI/2,rr=i%2?r*.3:r;const xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}ctx.closePath();ctx.fillStyle=color;ctx.fill()}
    function ring(x,y,r,color=accent,from=0,to=TAU,width=3){ctx.beginPath();ctx.arc(x,y,r,from,to);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
    function note(x,y,color=accent){oval(x,y,5,3,color);line(x+4,y,x+4,y-19,color,2.5);line(x+4,y-19,x+14,y-16,color,3)}
    function hand(x,y,r=0){ctx.save();ctx.translate(x,y);ctx.rotate(r);round(-8,-6,16,18,8,accent,manga?ink:null,1.8);for(let i=0;i<3;i++)line(-5+i*5,-4,-5+i*5,-14+(i===1?-3:0),accent,4);ctx.restore()}
    function symbol(text,x,y,size=27,color=ink){ctx.save();ctx.font='600 '+size+'px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore()}
    if(!options.transparent){
      const bg=ctx.createLinearGradient(0,0,600,337.5);bg.addColorStop(0,manga?'#fffafa':'#000');bg.addColorStop(1,manga?'#faf1ff':'#000');ctx.fillStyle=bg;ctx.fillRect(0,0,600,337.5);
      if(manga){ctx.fillStyle='#d3b6de';ctx.globalAlpha=.15;for(let y=24;y<325;y+=12)for(let x=15;x<590;x+=12)if(x<58||x>542){ctx.beginPath();ctx.arc(x,y,.8,0,TAU);ctx.fill()}ctx.globalAlpha=1;}
    }
    ctx.save();ctx.translate(300+s.x,178+s.y);ctx.rotate(s.rot);ctx.translate(-300,-178);ctx.globalAlpha=s.energy;
    const L=options.look;   // « Son look »: its hooks, or nothing
    if(L&&L.under)L.under(ctx,s,manga);
    // Crisp digital blush for Modern; ink hatching for Manga.
    for(const x of [145,455]){
      if(L&&L.cheek&&L.cheek(ctx,x,s,manga))continue;
      if(manga){oval(x,221,23+3*s.blush,10+2*s.blush,'#f6c4d880');for(let i=0;i<3;i++)line(x-10+i*9,216,x-14+i*9,227,pink,1.8);}
      else {const bx=x<300?160:440;ctx.save();ctx.globalAlpha=.62*clamp(s.blush,0,1.3);round(bx-9,218,18+4*Math.max(0,s.blush-1),5,2.5,pink);ctx.restore();}
    }
    function eye(cx,kind,lid,side){
      ctx.save();ctx.translate(cx+s.gx*(manga?.18:.7),(manga?143:147)+s.gy*(manga?.2:.6));
      const rebound=p>.79?.10*Math.sin((p-.79)*TAU*7)*Math.exp(-(p-.79)*16):0;
      const buoy=.024*sin(p+(side<0?0:.05),2)+rebound;
      if(manga){ctx.scale(s.sx*(1+buoy),s.sy*(1-buoy));}
      else{
        const ends=id==='idle-cligne'?[.31,.67,.74]:[.79];
        let spring=0;for(const end of ends){const dt=p-end;if(dt>0&&dt<.2)spring+=.075*Math.sin(dt*TAU*8)*Math.exp(-dt*25);}
        const inquisitive=['curieux','confus','idle-incline','ecoute'].includes(id)?s.gx/22:0;
        ctx.translate(0,side*inquisitive*3);ctx.rotate(-side*inquisitive*.045);
        ctx.scale(s.sx*(1-spring*.65),s.sy*(1+spring+side*inquisitive*.05));
      }
      if(L&&L.eye&&L.eye(ctx,kind,lid,side,manga,{ink,s,p,id})){ctx.restore();return;}
      if(kind==='heart'){heart(0,13,manga?40:48,manga?'#e977a9':'#ff97ad');if(manga)oval(-9,-10,5,3,'#ffffffbf');ctx.restore();return;}
      if(kind==='star'){star(0,0,38,manga?'#c698f0':'#ffe49c',5);star(-6,-8,8,'#fff');ctx.restore();return;}
      if(kind==='closed'||kind==='happy'||lid<.11){
        const happy=kind==='happy',y=happy?3:11;
        curve(manga?-31:-36,y,0,happy?(manga?-32:-39):26,manga?31:36,y,ink,manga?4.3:10);
        if(manga){line(side*26,y+1,side*36,y-4,ink,2.4);line(side*19,y+4,side*27,y+9,ink,2.1);}
        ctx.restore();return;
      }
      ctx.scale(1,Math.max(.10,lid));
      if(manga){
        const eyePath=()=>{ctx.beginPath();ctx.moveTo(-43,0);ctx.bezierCurveTo(-39,-67,32,-68,43,-5);ctx.bezierCurveTo(48,51,-36,60,-43,0);ctx.closePath()};
        eyePath();ctx.fillStyle='#fff';ctx.fill();ctx.save();ctx.clip();
        const gx=s.gx*.55,gy=s.gy*.55;
        const iris=ctx.createLinearGradient(0,-49,0,47);iris.addColorStop(0,'#3f275e');iris.addColorStop(.38,'#8b5ac0');iris.addColorStop(.76,'#c38fe6');iris.addColorStop(1,'#f0c8f1');
        oval(gx,gy-1,34,49,iris,'#4b2c66',1.5);
        oval(gx,gy-8,17,32,'#34213f');
        ctx.globalAlpha=.35;for(let i=0;i<9;i++){const angle=Math.PI*.14+i*Math.PI*.09;line(gx+Math.cos(angle)*23,gy+8+Math.sin(angle)*28,gx+Math.cos(angle)*28,gy+8+Math.sin(angle)*35,'#fff5ff',1.2);}ctx.globalAlpha=s.energy;
        oval(gx-11,gy-25,10,14,'#fff');oval(gx+13,gy+19,6,8,'#ffffffee');star(gx+16,gy-14,5,'#fff');oval(gx-9,gy+32,4,2,'#ffeaff');
        ctx.restore();
        eyePath();ctx.strokeStyle=ink;ctx.lineWidth=2.2;ctx.stroke();
        ctx.beginPath();ctx.moveTo(-43,0);ctx.bezierCurveTo(-39,-67,32,-68,43,-5);ctx.lineWidth=5;ctx.stroke();
        line(side*38,-18,side*50,-30,ink,3);line(side*31,-35,side*40,-48,ink,2.8);
        if(['half','sad','angry'].includes(kind)){
          const slant=kind==='angry'?side*16:kind==='sad'?-side*12:0;
          ctx.save();eyePath();ctx.clip();ctx.beginPath();ctx.moveTo(-55,-70);ctx.lineTo(55,-70);ctx.lineTo(55,-3+slant);ctx.lineTo(-55,-3-slant);ctx.closePath();ctx.fillStyle='#fcf4fc';ctx.fill();ctx.restore();
          line(-42,-3-slant*.8,42,-3+slant*.8,ink,4.1);
        }
      }else{
        const grad=ctx.createLinearGradient(0,-52,0,52);grad.addColorStop(0,'#87fff4');grad.addColorStop(1,'#51eddf');
        const modernEye=()=>{ctx.beginPath();ctx.roundRect(-44,-52,88,104,[29,29,34,34]);};
        modernEye();ctx.fillStyle=grad;ctx.fill();
        if(['half','sad','angry'].includes(kind)){
          const slope=kind==='angry'?side*18:kind==='sad'?-side*15:0;
          ctx.save();modernEye();ctx.clip();ctx.beginPath();ctx.moveTo(-50,-62);ctx.lineTo(50,-62);ctx.lineTo(50,-11+slope);ctx.quadraticCurveTo(0,-5,-50,-11-slope);ctx.closePath();ctx.fillStyle='#000';ctx.fill();ctx.restore();
        }
      }
      ctx.restore();
    }
    eye(manga?205:218,s.eyeL,s.lidL,-1);eye(manga?395:382,s.eyeR,s.lidR,1);
    if(Math.abs(s.brow)>.1){
      const high=s.brow>0;for(const [x,side] of [[manga?205:218,-1],[manga?395:382,1]]){const slope=high?0:side*(id==='colere'?12:-9);curve(x-24,75-slope,x,high?62:73,x+24,75+slope,ink,manga?2.8:4);}
    }
    ctx.save();ctx.translate(300,manga?232:224);ctx.scale(s.mw,s.mh);
    const mw=manga?3:4.5;
    switch(s.mouth){
      case 'smile':if(!manga){curve(-15,-2,0,17,15,-2,ink,mw);break;}ctx.beginPath();ctx.moveTo(-17,-4);ctx.bezierCurveTo(-14,11,-3,12,0,3);ctx.bezierCurveTo(4,12,15,10,18,-4);ctx.strokeStyle=ink;ctx.lineWidth=mw;ctx.stroke();break;
      case 'frown':curve(-17,9,0,-13,17,9,ink,mw);break;
      case 'flat':line(-13,1,13,1,ink,mw);break;
      case 'crooked':ctx.beginPath();ctx.moveTo(-17,3);ctx.lineTo(-6,-3);ctx.lineTo(6,4);ctx.lineTo(17,-1);ctx.strokeStyle=ink;ctx.lineWidth=mw;ctx.stroke();break;
      case 'pout':curve(-15,4,0,-4,15,4,ink,mw);oval(0,9,7,3,manga?'#f5bdca':'#e98fa255');break;
      case 'kiss':curve(-7,-11,16,-7,0,0,ink,mw);curve(0,0,16,8,-7,12,ink,mw);break;
      case 'grit':round(-20,-9,40,18,6,manga?'#fff':'#d9fff1',ink,2);line(-11,0,11,0,manga?'#c9b3ce':'#71c5bc',1.2);break;
      case 'o':case 'sleep':case 'talk':oval(0,1,s.mouth==='sleep'?7:12,s.mouth==='talk'?14:16,manga?'#67415e':'#10323c',ink,2.5);if(s.mouth!=='sleep')oval(0,8,6,3,pink);break;
      case 'laugh':ctx.beginPath();ctx.moveTo(-22,-8);ctx.quadraticCurveTo(0,0,22,-8);ctx.bezierCurveTo(21,28,-21,28,-22,-8);ctx.fillStyle=manga?'#69445e':'#153441';ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=2.5;ctx.stroke();oval(0,13,12,5,pink);break;
    }
    ctx.restore();
    // Gesture props travel with Pixel, ambient props remain in screen coordinates.
    if(id==='salut'){const y=167-24*A;line(468,237,500,y+14,accent,7);hand(500+4*sin(p,4)*A,y,.25*sin(p,4)*A);}
    if(id==='danse'){line(135,208,103,175+22*sin(p,2),accent,7);line(465,208,497,175-22*sin(p,2),accent,7);}
    if(id==='baille'&&A>.3)hand(329,250,-.18);
    if(id==='reveil'&&p>.35&&p<.8){line(135,215,102,175,accent,6);line(465,215,498,175,accent,6);}
    if(id==='idle-etire'){const q=env(p,.25,.43,.58,.77);if(q>.05){line(135,220,110,220-70*q,accent,5);line(465,220,490,220-70*q,accent,5);}}
    if(id==='idle-gratouille'){const q=env(p,.25,.36,.63,.75);if(q>.1){line(481,257,486-q*24,252-q*27,accent,5);hand(486-q*24,246-q*29+3*sin(p,10)*q,-.2);}}
    if(L&&L.over)L.over(ctx,s,manga);
    ctx.restore();
    switch(id){
      case 'clin-oeil':if(A>.5)star(479,110,5+6*A,gold);break;
      case 'surpris':if(A>.3){symbol('!',494,99,30,gold);line(478,73,474,64,gold,3);}break;
      case 'fier':star(491,100+3*sin(p),16,gold,5);break;
      case 'amoureux':for(let i=0;i<3;i++){const q=(p+i/3)%1;ctx.globalAlpha=Math.sin(Math.PI*q)*.8;heart(90+i*205,270-q*210,9+4*q,pink);}ctx.globalAlpha=1;break;
      case 'bisou':if(p>.28&&p<.91){const q=(p-.28)/.63;ctx.globalAlpha=Math.sin(Math.PI*q);heart(331+q*159,222-q*95,12+12*q);ctx.globalAlpha=1;}break;
      case 'etoiles':[[95,93],[505,79],[125,258],[482,262]].forEach(([x,y],i)=>star(x,y,6+4*Math.max(0,sin(p+i*.2)),gold));break;
      case 'triste':{const q=p;ctx.globalAlpha=Math.sin(Math.PI*q);ctx.beginPath();ctx.moveTo(425,176+q*83);ctx.bezierCurveTo(404,204+q*83,445,204+q*83,425,176+q*83);ctx.fillStyle=manga?'#a8daf1':'#87dcee';ctx.fill();ctx.globalAlpha=1;break;}
      case 'boudeur':curve(264,271,303,289,336,272,accent,5);break;
      case 'colere':for(let i=0;i<2;i++){const q=(p+i*.5)%1;ctx.globalAlpha=1-q;curve(90+i*420,130-q*55,111+i*380,110-q*55,90+i*420,98-q*55,manga?'#c9acc9':'#89b6bd',3)}ctx.globalAlpha=1;if(manga){line(479,73,479,88,pink,3);line(485,82,494,82,pink,3);line(471,89,471,98,pink,3);line(480,95,490,95,pink,3);}break;
      case 'panique':oval(477,100+((p*2)%1)*66,5,10,'#8ccde9');symbol('!',105,90,27,gold);break;
      case 'confus':symbol('?',492,87+5*sin(p),32,manga?'#b58bd3':gold);break;
      case 'reflechit':for(let i=0;i<3;i++)oval(266+i*34,57,3+2*Math.max(0,sin(p-i*.16)),3+2*Math.max(0,sin(p-i*.16)),accent);break;
      case 'idee':oval(493,89,15,19,A>.4?gold:manga?'#eee1ef':'#43606b',ink,2);round(485,109,16,10,3,accent);if(A>.4){for(let i=0;i<5;i++){const a=Math.PI+i*Math.PI/4;line(493+Math.cos(a)*25,89+Math.sin(a)*25,493+Math.cos(a)*32,89+Math.sin(a)*32,gold,2.5)}}break;
      case 'ecoute':for(let i=0;i<3;i++){ctx.globalAlpha=.2+.7*((p+i/3)%1);ring(92,155,14+i*13,accent,-.9,.9,2.5)}ctx.globalAlpha=1;break;
      case 'parle':for(let i=0;i<7;i++){const h=3+9*Math.abs(sin(p+i*.17,3));round(250+i*16,295-h,5,h*2,2.5,accent)}break;
      case 'chante':for(let i=0;i<3;i++){const q=(p+i/3)%1;ctx.globalAlpha=Math.sin(Math.PI*q);note(80+i*220+8*sin(q),180-q*95,i%2?pink:gold)}ctx.globalAlpha=1;break;
      case 'danse':note(82,85+8*sin(p,2),gold);note(520,89-8*sin(p,2),pink);break;
      case 'code':round(187,273,226,31,8,manga?'#ded1ef':'#2f5662',ink,1.5);for(let i=0;i<15;i++)round(196+i*14,282,9,5,1.5,Math.floor(p*30)%15===i?gold:accent);line(216,253+4*sin(p,6),248,277,accent,5);line(381,253-4*sin(p,6),350,277,accent,5);symbol('‹ ›',88,87,23,accent);break;
      case 'recherche':{const x=300+137*sin(p);ring(x,198,31,gold,0,TAU,4);line(x+23,222,x+43,243,gold,6);if(p>.65&&p<.85)star(492,84,8);break;}
      case 'chargement':for(let i=0;i<8;i++){const a=TAU*(p+i/8);ctx.globalAlpha=1-i*.1;oval(300+Math.cos(a)*26,292+Math.sin(a)*9,2.5,2.5,accent)}ctx.globalAlpha=1;break;
      case 'succes':line(479,91,491,102,accent,4);line(491,102,515,76,accent,4);for(let i=0;i<14;i++){const q=(p+i*.047)%1;ctx.globalAlpha=Math.sin(Math.PI*q);round(45+i*38+8*sin(q+i),26+q*257,3,8,1,i%3===0?pink:i%3===1?gold:accent)}ctx.globalAlpha=1;break;
      case 'erreur':line(480,80,510,110,pink,4);line(510,80,480,110,pink,4);break;
      case 'notification':{const y=71+5*Math.abs(sin(p,3))*A;round(470,y,52,36,7,manga?'#fff8ef':'#365464',gold,2);line(475,y+5,496,y+20,gold,2);line(496,y+20,517,y+5,gold,2);oval(523,y,5,5,pink);break;}
      case 'connexion':case 'deconnexion':for(let i=0;i<3;i++){ctx.globalAlpha=id==='deconnexion'?.35:(p*4>i?1:.2);ring(496,109,11+i*12,accent,Math.PI*1.19,Math.PI*1.81,3)}ctx.globalAlpha=1;oval(496,109,3,3,accent);if(id==='deconnexion')line(470,70,521,117,pink,3);break;
      case 'mise-a-jour':round(196,282,208,15,7.5,manga?'#e8dcf1':'#335261');round(199,285,Math.max(6,202*Math.min(p/.8,1)),9,4.5,accent);break;
      case 'bug':if(p>.38&&p<.55){ctx.globalAlpha=.6;for(let i=0;i<5;i++)round(100+i*85,170+i%2*11,25+5*sin(p,18),3,1,i%2?pink:accent);ctx.globalAlpha=1;}break;
      case 'sommeil':case 'reve':for(let i=0;i<3;i++){const q=(p+i/3)%1;ctx.globalAlpha=Math.sin(Math.PI*q)*.65;symbol('z',460+q*65,182-q*121,13+10*q,accent)}ctx.globalAlpha=1;if(id==='reve'){oval(100,84,30,24,manga?'#fff':'#ffffff08',accent,1.5);oval(128,113,3,3,accent);star(86+p*24,80,11,gold,5);}break;
      case 'fatigue':symbol('z',492,98-5*sin(p),22,accent);break;
      case 'batterie-faible':case 'recharge':{const low=id==='batterie-faible';round(254,286,90,21,5,null,accent,2);round(344,291,5,11,2,accent);round(259,291,low?9:Math.max(7,A*80),11,2,low?gold:accent);if(!low){line(502,78,486,99,gold,4);line(486,99,502,99,gold,4);line(502,99,486,121,gold,4);}break;}
      case 'zen':curve(265,294,300,294-8*(sin(p)+1),335,294,accent,2);break;
      case 'idle-luciole':if(p>.1&&p<.87){const q=(p-.1)/.77;ctx.save();ctx.shadowColor=gold;ctx.shadowBlur=14;oval(70+q*460,72+24*sin(q),3,3,gold);ctx.restore();}break;
      case 'idle-impatient':{const q=env(p,.22,.35,.65,.78);if(q>.1)for(let i=0;i<3;i++)oval(434+i*13,282-Math.max(0,sin(p*5+i*.15))*q*5,4,5,accent);break;}
    }
    ctx.restore();
  }
  scope.Pixel52Themes={pose,draw,names:['retro','modern','manga']};
})(typeof window!=='undefined'?window:globalThis);
