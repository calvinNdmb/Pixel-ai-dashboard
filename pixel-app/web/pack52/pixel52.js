/* Vendored from the user's own animation pack "Pixel OS — 3 thèmes, 52 animations" (version 2.1.0, src/pixel.js).
   Changes for Pixel OS: the globals are renamed so they do not clash with ours (window.Pixel is window.Pixel52, and it calls window.Pixel52Themes);
   and frame(id, seconds, look) takes an optional third argument for « Son look » (web/look.js, through themes.js): look.eye
   may draw an eye its own way (true) or leave it to the pack, look.cheek recolours his cheeks, look.under and look.over draw
   what he wears in the frame's own pixels. Without it (draw(), create(), every caller of before), nothing changes.
   Loaded by index.html and the lab before themes.js. */
/* Pixel — 52 animations, including 18 idles. Canvas 2D, no dependency. */
(function (scope) {
  'use strict';
  const W = 96, H = 54, TAU = Math.PI * 2;
  const palette = ['#031009','#42ff84','#a4ffc2','#ff80ad','#eac27c','#74d6e8','#176542','#437052'];
  const animations = [
    ['content','Content','Idle',4,'Un petit sourire et un clignement tranquille.'],
    ['curieux','Curieux','Idle',5,'Il regarde autour de lui, puis penche la tête.'],
    ['clin-oeil',"Clin d’œil",'Humeurs',3,'Un clin d’œil avec une petite étincelle.'],
    ['salut','Coucou','Humeurs',4,'Il te salue avec sa petite main pixelisée.'],
    ['rire','Fou rire','Humeurs',3,'Les yeux plissés, il rit de tout son écran.'],
    ['surpris','Surpris','Humeurs',3,'Il recule, ouvre grand les yeux, puis se détend.'],
    ['timide','Timide','Humeurs',4,'Un regard de côté et des joues toutes roses.'],
    ['fier','Fier','Humeurs',4,'Le menton relevé, une étoile bien méritée.'],
    ['amoureux','Amoureux','Émotions',4,'Ses yeux deviennent des cœurs qui battent.'],
    ['bisou','Bisou','Émotions',4,'Il ferme les yeux et souffle un petit cœur.'],
    ['etoiles','Émerveillé','Émotions',4,'Des étoiles dans les yeux et des paillettes autour.'],
    ['triste','Triste','Émotions',5,'Un regard tombant, puis une petite larme.'],
    ['boudeur','Boudeur','Émotions',4,'Il se détourne, croise le regard et gonfle les joues.'],
    ['colere','En colère','Émotions',3,'Sourcils froncés et petite bouffée de vapeur.'],
    ['panique','Paniqué','Émotions',3,'Il tremble, transpire et cherche une solution.'],
    ['confus','Perplexe','Émotions',4,'Une inclinaison hésitante et un point d’interrogation.'],
    ['reflechit','Réfléchit','Idle',5,'Les yeux vers le haut, les idées font leur chemin.'],
    ['idee','Eurêka !','Activités',4,'Une pause… puis une ampoule s’allume.'],
    ['ecoute','À l’écoute','Activités',4,'Il se penche pour écouter et acquiesce doucement.'],
    ['parle','Bavarde','Activités',4,'Une bouche qui articule et des petits hochements.'],
    ['chante','Chante','Activités',4,'Des notes de musique et une mélodie imaginaire.'],
    ['danse','Danse','Activités',4,'Deux pas de côté, un rebond et des bras en rythme.'],
    ['code','Code','Activités',5,'Concentré, il tape sur son petit clavier.'],
    ['recherche','Cherche','Activités',5,'Une loupe balaie l’écran, puis il trouve un indice.'],
    ['chargement','Chargement','Système',4,'Il suit des yeux une petite comète circulaire.'],
    ['succes','Bravo !','Système',4,'Un sourire, une coche et une pluie de confettis.'],
    ['erreur','Oups…','Système',4,'Il remarque une erreur et secoue la tête.'],
    ['notification','Notification','Système',4,'Une enveloppe arrive et attire son attention.'],
    ['connexion','Connecté','Système',4,'Les ondes se propagent, le sourire revient.'],
    ['deconnexion','Hors ligne','Système',4,'Il cherche le signal et constate la coupure.'],
    ['mise-a-jour','Mise à jour','Système',5,'Une barre se remplit, puis il ouvre les yeux.'],
    ['bug','Petit bug','Système',4,'Ses pixels se décalent brièvement, puis se remettent.'],
    ['sommeil','Dodo','Repos',5,'Les paupières fermées, il respire avec ses petits Z.'],
    ['reveil','Réveil','Repos',5,'Il entrouvre les yeux, s’étire et sourit.'],
    ['baille','Bâillement','Idle',5,'Un long bâillement, puis un clignement fatigué.'],
    ['fatigue','Fatigué','Idle',4,'Il lutte contre le sommeil et sa tête tombe.'],
    ['batterie-faible','À plat','Repos',4,'Les yeux lourds, la batterie presque vide.'],
    ['recharge','Recharge','Repos',4,'L’énergie remonte et ses yeux retrouvent leur éclat.'],
    ['reve','Rêve','Repos',5,'Endormi, il rêve d’une petite étoile filante.'],
    ['zen','Zen','Idle',6,'Une respiration lente et des yeux sereins.'],
    ['idle-respire','Respiration','Idle',8,'Une respiration discrète, presque immobile.'],
    ['idle-cligne','Double blink','Idle',7,'Un clignement naturel, parfois suivi d’un deuxième.'],
    ['idle-regard','Coup d’œil','Idle',10,'Il observe à gauche, puis à droite, et revient vers toi.'],
    ['idle-incline','Petite inclinaison','Idle',8,'La tête légèrement penchée, il attend tranquillement.'],
    ['idle-sourit','Petit sourire','Idle',8,'Un sourire lui échappe, puis il retrouve son calme.'],
    ['idle-haut','Dans les nuages','Idle',9,'Il lève doucement les yeux, perdu dans ses pensées.'],
    ['idle-bas','Regard en bas','Idle',9,'Il regarde un instant sous son écran.'],
    ['idle-somnole','Micro-sieste','Idle',10,'Il pique du nez, se ressaisit, puis se réveille.'],
    ['idle-etire','Petit étirement','Idle',10,'Il s’étire lentement avant de retrouver sa pose.'],
    ['idle-gratouille','Gratouille','Idle',10,'Une petite démangeaison sur la joue.'],
    ['idle-luciole','La luciole','Idle',12,'Une luciole passe ; Pixel la suit des yeux.'],
    ['idle-impatient','Tapotement','Idle',10,'En attendant, il tapote doucement du bout des doigts.']
  ].map(([id,label,group,duration,description])=>({id,label,group,duration,description}));
  const frequentIdles=new Set(['content','idle-respire','idle-cligne','idle-regard','idle-incline','idle-sourit','idle-haut','idle-bas']);
  animations.forEach(a=>{if(a.group==='Idle')a.idleWeight=frequentIdles.has(a.id)?3:1;});
  const index = Object.fromEntries(animations.map(a=>[a.id,a]));
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
  const envelope=(p,a,b,c,d)=>smooth((p-a)/(b-a))*(1-smooth((p-c)/(d-c)));
  const wave=(p,n=1)=>Math.sin(TAU*p*n);
  const heart=['0110110','1111111','1111111','0111110','0011100','0001000'];
  const star=['0001000','0001000','0111110','1111111','0011100','0110110','0100010'];
  const hand=['01010','11111','11111','11111','01110','00100'];
  const question=['01110','10001','00001','00010','00100','00000','00100'];
  const note=['00111','00101','00101','00100','11100','11100'];
  const bulb=['0011100','0111110','1100011','1100011','0111110','0011100','0011100','0000000','0011100'];
  const check=['0000001','0000011','1000110','1101100','0111000','0010000'];
  function frame(id, seconds=0, look=null) {
    const animation=index[id];
    if (!animation) throw new RangeError('Unknown Pixel animation: '+id);
    if (!Number.isFinite(seconds)) throw new TypeError('Time must be finite');
    const p=((seconds/animation.duration)%1+1)%1;
    const buf=new Uint8Array(W*H);
    let ox=0,oy=0,tilt=0;
    function dot(x,y,c=1,transform=true) {
      if(transform){const u=x-48,v=y-28;x=48+u*Math.cos(tilt)-v*Math.sin(tilt)+ox;y=28+u*Math.sin(tilt)+v*Math.cos(tilt)+oy;}
      x=Math.round(x);y=Math.round(y);
      if(x>=0&&x<W&&y>=0&&y<H)buf[y*W+x]=c;
    }
    function rect(x,y,w,h,c=1,tr=true) {for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)dot(x+xx,y+yy,c,tr)}
    function line(x1,y1,x2,y2,c=1,width=1,tr=true) {
      const steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1),1)*2;
      for(let n=0;n<=steps;n++)rect(x1+(x2-x1)*n/steps,y1+(y2-y1)*n/steps,width,width,c,tr);
    }
    function ellipse(x,y,rx,ry,c=1,tr=true) {
      for(let yy=-Math.ceil(ry);yy<=Math.ceil(ry);yy++)for(let xx=-Math.ceil(rx);xx<=Math.ceil(rx);xx++)
        if(xx*xx/(rx*rx)+yy*yy/(ry*ry)<=1.05)dot(x+xx,y+yy,c,tr);
    }
    function sprite(pattern,x,y,c=1,scale=1,tr=false) {
      pattern.forEach((row,yy)=>[...row].forEach((v,xx)=>{if(v==='1')rect(x+xx*scale,y+yy*scale,scale,scale,c,tr)}));
    }
    function sparkle(x,y,size=2,c=4){line(x-size,y,x+size,y,c,1,false);line(x,y-size,x,y+size,c,1,false);}
    function ring(x,y,r,c=1,start=0,end=TAU,tr=false){for(let a=start;a<=end;a+=.06)dot(x+Math.cos(a)*r,y+Math.sin(a)*r,c,tr)}
    function eyebrow(x,left,angry=false){line(x-5,14+(angry?(left?-2:2):0),x+5,14+(angry?(left?2:-2):0),1,1)}
    let eyeL='open',eyeR='open',mouth='smile',ex=0,ey=0,rx=4.4,ry=5.7,blush=true,blushColor=3,color=1;
    let eyesY=23, mouthY=38, mouthW=4, mouthH=3;
    const blink=envelope(p,.74,.775,.795,.83);
    let lid=1-blink*.94;
    const action=envelope(p,.10,.23,.67,.92);
    oy=.55*wave(p);
    switch(id){
      case 'content':mouthW=4+Math.round(Math.max(0,wave(p))*1);break;
      case 'curieux':ex=3.5*wave(p);ey=-Math.max(0,wave(p))*1.4;tilt=.12*wave(p);rx=4+Math.max(0,wave(p))*.7;break;
      case 'clin-oeil':eyeR=action>.3?'closed':'open';tilt=-.07*action;mouthW=4+action*2;break;
      case 'salut':ox=-2*action;tilt=-.08*action;eyeL=eyeR=action>.65?'happy':'open';break;
      case 'rire':eyeL=eyeR='happy';mouth='laugh';oy=Math.abs(wave(p,4))*2-1;mouthH=3+Math.abs(wave(p,4))*2;break;
      case 'surpris':rx=4.4+action;ry=5.7+action*1.5;mouth=action>.3?'o':'smile';mouthH=2+action*2;oy=2*action;break;
      case 'timide':ex=-2.5*action;ey=1.5*action;tilt=-.08*action;mouthW=2;rx=3.8;break;
      case 'fier':eyeL=eyeR='happy';oy=-2*action;tilt=.035*wave(p);mouthW=5;break;
      case 'amoureux':eyeL=eyeR='heart';oy=-1.3*Math.max(0,wave(p,2));mouthW=3;break;
      case 'bisou':eyeL=eyeR=action>.5?'closed':'open';mouth=action>.4?'kiss':'smile';tilt=-.06*action;break;
      case 'etoiles':eyeL=eyeR='star';mouth='o';mouthH=2;oy=-Math.abs(wave(p,2));break;
      case 'triste':eyeL=eyeR='sad';mouth='frown';ey=1;oy=1+wave(p)*.5;blush=false;break;
      case 'boudeur':eyeL=eyeR='half';mouth='flat';ex=4*action;ox=2*action;tilt=.06*action;blushColor=4;break;
      case 'colere':eyeL=eyeR='angry';mouth='grit';ox=.75*wave(p,6)*action;blushColor=3;break;
      case 'panique':rx=5;ry=6;mouth='o';mouthH=3;ox=1.5*wave(p,7);ey=wave(p,3);blush=false;break;
      case 'confus':eyeL='half';ry=6.3;mouth='crooked';tilt=.13*wave(p);ex=wave(p)*1.5;break;
      case 'reflechit':eyeL='half';ex=1+wave(p);ey=-2;mouth='flat';tilt=.06*wave(p);mouthW=2;break;
      case 'idee':eyeL=eyeR=p<.22||p>.91?'half':'open';mouth=p>.22&&p<.91?'smile':'flat';oy=-2*action;ex=action;ey=-action;break;
      case 'ecoute':tilt=-.11*action;ex=-2*action;oy=wave(p,2)*action;mouthW=3;break;
      case 'parle':mouth='talk';mouthH=1+Math.abs(wave(p,7))*3;mouthW=2+Math.abs(wave(p,3))*2;oy=.8*wave(p,3);break;
      case 'chante':eyeL=eyeR='happy';mouth='o';mouthH=2+Math.abs(wave(p,3))*2;tilt=.08*wave(p,2);ox=wave(p,2);break;
      case 'danse':eyeL=eyeR='happy';mouth='laugh';ox=4*wave(p,2);oy=-2*Math.abs(wave(p,4));tilt=.10*wave(p,2);break;
      case 'code':eyeL=eyeR='half';ey=2;ex=2*wave(p,2);mouth='flat';mouthW=2;mouthY=35;oy=-2;break;
      case 'recherche':ex=5*wave(p);ey=-.8;eyeL='half';mouth='o';mouthH=1;mouthW=2;break;
      case 'chargement':ex=2*wave(p);ey=-Math.cos(TAU*p);mouth='flat';mouthW=2;break;
      case 'succes':eyeL=eyeR='happy';mouthW=5;oy=-3*Math.sin(Math.PI*action);break;
      case 'erreur':eyeL=eyeR='sad';mouth='frown';ox=2*wave(p,4)*action;blush=false;break;
      case 'notification':ex=3*action;ey=-2*action;rx=4.4+action*.5;mouthW=4;break;
      case 'connexion':eyeL=eyeR=action>.5?'happy':'open';mouth=action>.4?'smile':'flat';oy=-action;break;
      case 'deconnexion':eyeL=eyeR='half';mouth='crooked';ex=3*wave(p,2);blush=false;break;
      case 'mise-a-jour':eyeL=eyeR=p<.8?'closed':'happy';mouth=p<.8?'flat':'smile';mouthY=34;oy=-2;break;
      case 'bug':eyeL=eyeR='open';mouth=p>.4&&p<.55?'crooked':'smile';break;
      case 'sommeil':case 'reve':eyeL=eyeR='closed';mouth='sleep';mouthW=2;mouthH=1+Math.max(0,wave(p));oy=wave(p);break;
      case 'reveil':{const a=envelope(p,.05,.55,.77,.98);lid=.05+.95*a;mouth=a>.7?'smile':'sleep';ry=4.8+a;oy=2*(1-a);break;}
      case 'baille':eyeL=eyeR=action>.5?'closed':'half';mouth=action>.1?'o':'flat';mouthH=1+5*action;mouthW=2+action;oy=-action;break;
      case 'fatigue':eyeL=eyeR='half';lid=.25+.75*(1-action);mouth='sleep';mouthH=1;tilt=.09*action;oy=2*action;break;
      case 'batterie-faible':eyeL=eyeR='half';mouth='flat';color=6;oy=2+wave(p)*.5;blush=false;break;
      case 'recharge':lid=.25+.75*action;mouth=action>.6?'smile':'flat';color=action>.2?1:6;oy=1-action*2;break;
      case 'zen':eyeL=eyeR='closed';mouthW=3;oy=1.5*wave(p);tilt=0;break;
      case 'idle-respire':oy=.55*wave(p);ry=5.7+.18*wave(p);break;
      case 'idle-cligne':{const b1=envelope(p,.26,.275,.285,.31),b2=envelope(p,.62,.635,.645,.67),b3=envelope(p,.69,.705,.715,.74);lid=1-.95*Math.max(b1,b2,b3);oy=.3*wave(p);break;}
      case 'idle-regard':{const a=envelope(p,.14,.23,.36,.46),b=envelope(p,.54,.63,.76,.86);ex=-3*a+3*b;ey=-.3*(a+b);ox=-.4*a+.4*b;oy=.3*wave(p);break;}
      case 'idle-incline':{const a=envelope(p,.22,.4,.58,.79);tilt=.07*a;ex=a;oy=.3*wave(p);break;}
      case 'idle-sourit':{const a=envelope(p,.25,.4,.6,.78);mouthW=4+2*a;if(a>.9)eyeL=eyeR='happy';oy=-.45*a;break;}
      case 'idle-haut':{const a=envelope(p,.22,.32,.58,.76);ex=1.4*a;ey=-2.4*a;tilt=-.025*a;break;}
      case 'idle-bas':{const a=envelope(p,.25,.36,.57,.72);ey=2*a;oy=.7*a;lid*=1-.15*a;break;}
      case 'idle-somnole':{const a=envelope(p,.2,.52,.64,.71);lid=1-.97*a;oy=2*a;tilt=.06*a;mouth=a>.6?'sleep':'smile';mouthH=1;mouthW=a>.6?2:4;if(p>.72&&p<.78){ry=6.3;oy=-.5;}break;}
      case 'idle-etire':{const a=envelope(p,.25,.43,.58,.77);oy=-1.5*a;ry=5.7-.4*a;eyeL=eyeR=a>.8?'closed':'open';mouthW=4-a;break;}
      case 'idle-gratouille':{const a=envelope(p,.25,.36,.63,.75);tilt=-.04*a;ex=1.5*a;eyeR=a>.85?'half':'open';break;}
      case 'idle-luciole':{const a=envelope(p,.1,.2,.73,.88);ex=3*wave(p-.16)*a;ey=-1.5*a;tilt=.025*wave(p)*a;break;}
      case 'idle-impatient':{const a=envelope(p,.22,.35,.65,.78);ex=-1.5*a;mouth=a>.7?'flat':'smile';mouthW=a>.7?3:4;oy=.25*wave(p);break;}
    }
    const K=look&&{dot,rect,line,ellipse,sprite,pose:()=>({ox,oy,tilt})};   // « Son look »: what its hooks draw with, and how the head moves
    function drawEye(x,kind){
      x+=ex;const y=eyesY+ey;
      if(look&&look.eye&&look.eye(x,y,kind,rx,ry,lid,color,p,K))return;
      if(kind==='heart'){const s=1+(Math.max(0,wave(p,2))>.78?.15:0);sprite(heart,x-4*s,y-3*s,3,1,true);return;}
      if(kind==='star'){sprite(star,x-3,y-3,4,1,true);return;}
      if(kind==='happy'){line(x-4,y+1,x-2,y-2,color,2);line(x-2,y-2,x+2,y-2,color,2);line(x+2,y-2,x+4,y+1,color,2);return;}
      if(kind==='closed'){line(x-4,y,x-2,y+1,color);line(x-2,y+1,x+2,y+1,color);line(x+2,y+1,x+4,y,color);return;}
      const h=Math.max(.65,ry*lid);
      if(kind==='half'||kind==='sad'||kind==='angry'){
        for(let yy=-Math.ceil(h);yy<=Math.ceil(h);yy++)for(let xx=-Math.ceil(rx);xx<=Math.ceil(rx);xx++){
          const cut=kind==='angry'?(x<48?xx*.5:-xx*.5):kind==='sad'?(x<48?-xx*.35:xx*.35):-1.5;
          if(xx*xx/(rx*rx)+yy*yy/(h*h)<=1.05&&yy>=cut)dot(x+xx,y+yy,color);
        }
        if(kind==='sad')line(x-4,y-5+(x<48?1:-1),x+4,y-5+(x<48?-1:1),color);
      } else {ellipse(x,y,rx,h,color);if(lid>.65)rect(x-2,y-h+1,2,1,2);}
    }
    if(look&&look.under)look.under(K);
    drawEye(32,eyeL);drawEye(64,eyeR);
    if(look&&look.cheek)blushColor=look.cheek(blushColor);
    if(blush){rect(18,35,5,id==='timide'?2:1,blushColor);rect(74,35,5,id==='timide'?2:1,blushColor);}
    function smile(frown=false){const y=mouthY;line(48-mouthW,y+(frown?2:-2),48-mouthW+1,y+(frown?0:0),color,1);line(48-mouthW+1,y,48+mouthW-1,y,color,1);line(48+mouthW-1,y,48+mouthW,y+(frown?2:-2),color,1);}
    if(mouth==='smile')smile();
    if(mouth==='frown')smile(true);
    if(mouth==='flat')line(48-mouthW,mouthY,48+mouthW,mouthY,color);
    if(mouth==='crooked'){line(44,mouthY+1,47,mouthY-1,color);line(47,mouthY-1,51,mouthY+1,color);}
    if(['o','talk','sleep'].includes(mouth)){ellipse(48,mouthY,mouthW,mouthH,color);if(mouthH>1)ellipse(48,mouthY,Math.max(1,mouthW-1),Math.max(.6,mouthH-1),0);}
    if(mouth==='laugh'){ellipse(48,mouthY,5,mouthH,1);rect(43,mouthY-mouthH,11,2,0);rect(46,mouthY+1,5,1,3);}
    if(mouth==='grit'){rect(44,mouthY-2,9,3,1);line(45,mouthY-1,50,mouthY-1,0);}
    if(mouth==='kiss')sprite(['110','001','110','001','110'],47,mouthY-2,1,1,true);
    // Character-specific props; kept separate from face transforms for crisp motion.
    switch(id){
      case 'clin-oeil':if(action>.6)sparkle(77,17,1+Math.round(action*2));break;
      case 'salut':{const x=80+Math.round(wave(p,4)*2*action),y=24-Math.round(action*5);line(76,38,x+2,y+5,1,2,false);sprite(hand,x,y,1);break;}
      case 'surpris':if(action>.4){rect(78,13,2,6,4,false);rect(78,21,2,2,4,false);}break;
      case 'timide':if(action>.6){rect(17,33,6,3,3);rect(74,33,6,3,3);}break;
      case 'fier':sprite(star,77,15+Math.round(wave(p)),4);break;
      case 'amoureux':for(let i=0;i<3;i++){const q=(p+i/3)%1;sprite(heart,12+i*31,45-q*38,3,1,false);}break;
      case 'bisou':if(p>.28&&p<.9){const q=(p-.28)/.62;sprite(heart,55+q*24,32-q*18,3,q>.55?1:1,false);sparkle(72,16,1,3);}break;
      case 'etoiles':for(let i=0;i<4;i++)sparkle([17,79,23,72][i],[15,13,40,42][i],1+Math.round(Math.max(0,wave(p+i*.2))*2),4);break;
      case 'triste':{const q=(p*.9+.05)%1;ellipse(68,28+q*17,1,2,5);dot(68,26+q*17,5);break;}
      case 'boudeur':rect(18,34,6,3,3);rect(73,34,6,3,3);line(40,44,53,46,1,1,false);line(43,46,56,44,1,1,false);break;
      case 'colere':eyebrow(32,true,true);eyebrow(64,false,true);for(let i=0;i<2;i++){const q=(p+i*.5)%1;line(16+i*64,22-q*12,18+i*62,20-q*12,7,1,false);}break;
      case 'panique':{const q=(p*2)%1;ellipse(74,15+q*16,1,2,5,false);line(19,15,16,12,4,1,false);line(20,12,19,9,4,1,false);break;}
      case 'confus':sprite(question,78,10+wave(p)*2,4);break;
      case 'reflechit':for(let i=0;i<3;i++)ellipse(40+i*8,10,1,1,(p*3)%3>i?1:6,false);line(57,41,54,38,1,2);break;
      case 'idee':sprite(bulb,78,10,action>.4?4:6);if(action>.4){line(75,13,73,12,4,1,false);line(88,13,90,12,4,1,false);line(81,7,81,5,4,1,false);}break;
      case 'ecoute':for(let n=0;n<3;n++)if((p*4)%4>n)ring(13,25,3+n*3,6,-1,1);break;
      case 'parle':for(let i=0;i<5;i++){const h=1+Math.round(2*Math.abs(wave(p+i*.19,3)));rect(36+i*6,47-h,2,h*2,6,false);}break;
      case 'chante':for(let i=0;i<3;i++){const q=(p+i/3)%1;sprite(note,9+i*36+wave(q)*2,28-q*18,i%2?3:4);}break;
      case 'danse':line(21,32,15,27+4*wave(p,2),1,2);line(75,32,81,27-4*wave(p,2),1,2);sprite(note,8,12+wave(p,2),4);sprite(note,82,12-wave(p,2),3);break;
      case 'code':rect(29,44,39,7,6,false);rect(31,45,35,4,0,false);for(let i=0;i<11;i++)dot(32+i*3,46,i===Math.floor(p*22)%11?2:1,false);line(33,40+Math.round(wave(p,6)),39,44,1,2,false);line(62,40-Math.round(wave(p,6)),57,44,1,2,false);sprite(['10001','01010','00100','01010','10001'],11,12,6);break;
      case 'recherche':{const x=48+23*wave(p);ring(x,32,6,4);line(x+4,37,x+9,42,4,2,false);if(p>.65&&p<.85)sparkle(76,14,2);break;}
      case 'chargement':for(let i=0;i<8;i++){const a=TAU*(p+i/8);dot(48+Math.cos(a)*6,46+Math.sin(a)*3,i===0?2:i<3?1:6,false);}break;
      case 'succes':sprite(check,76,12,1);for(let i=0;i<9;i++){const q=(p+i*.067)%1;rect(10+i*9+wave(q+i)*2,5+q*40,1+(i%2),2,i%3===0?3:i%3===1?4:1,false);}break;
      case 'erreur':line(78,12,84,18,3,2,false);line(84,12,78,18,3,2,false);break;
      case 'notification':{const y=10+2*Math.abs(wave(p,3))*action;rect(76,y,13,9,4,false);rect(77,y+1,11,7,0,false);line(77,y+1,82,y+5,4,1,false);line(82,y+5,87,y+1,4,1,false);if(action>.5)dot(90,y-2,3,false);break;}
      case 'connexion':case 'deconnexion':{const off=id==='deconnexion';for(let i=0;i<3;i++)if(off||p*4>i)ring(81,19,3+i*3,off?6:1,Math.PI*1.15,Math.PI*1.85);dot(81,19,off?6:1,false);if(off)line(73,10,87,23,3,1,false);break;}
      case 'mise-a-jour':rect(29,44,38,4,6,false);rect(30,45,36,2,0,false);rect(30,45,Math.round(36*Math.min(p/.8,1)),2,1,false);if(p>.8)sprite(check,78,13,1);break;
      case 'sommeil':case 'reve':for(let i=0;i<3;i++){const q=(p+i/3)%1;const x=72+q*12,y=30-q*24;sprite(['111','001','010','100','111'],x,y,q<.7?6:1);}if(id==='reve'){ring(19,13,6,6);const q=p;sprite(star,8+q*16,10-q*5,4);line(8+q*16,13-q*5,4+q*16,15-q*5,6,1,false);}break;
      case 'reveil':if(p>.35&&p<.8){line(20,34,14,27,1,2);line(76,34,82,27,1,2);sparkle(81,12,2,4);}break;
      case 'baille':if(action>.35)sprite(hand,54,37,1,1,true);break;
      case 'fatigue':sprite(['111','001','010','100','111'],79,15-wave(p)*2,6);break;
      case 'batterie-faible':case 'recharge':{const low=id==='batterie-faible';rect(38,46,20,6,6,false);rect(39,47,18,4,0,false);rect(58,48,2,2,6,false);rect(40,48,low?2:Math.round(action*15+1),2,low?4:1,false);if(!low)sprite(['0011','0110','1111','0010','0100'],77,14,4);break;}
      case 'zen':{const q=(wave(p)+1)/2;for(let i=0;i<7;i++)dot(39+i*3,47-Math.round(q*Math.sin(i*Math.PI/6)*2),6,false);break;}
      case 'idle-etire':{const a=envelope(p,.25,.43,.58,.77);if(a>.05){line(20,37,16,38-16*a,1,1);line(76,37,80,38-16*a,1,1);}}break;
      case 'idle-gratouille':{const a=envelope(p,.25,.36,.63,.75);if(a>.1){const x=80-a*4,y=42-a*9;line(79,43,x,y+4,1,1,false);sprite(['101','111','111','010'],x-1,y+Math.round(wave(p,10)*a),1);}}break;
      case 'idle-luciole':if(p>.1&&p<.87){const q=(p-.1)/.77;const x=12+72*q,y=13+4*wave(q);dot(x,y,2,false);dot(x-1,y+1,6,false);dot(x+1,y-1,6,false);}break;
      case 'idle-impatient':{const a=envelope(p,.22,.35,.65,.78);if(a>.1)for(let i=0;i<3;i++)rect(70+i*3,45-Math.round(Math.max(0,wave(p*5+i*.15))*a),2,2,1,false);break;}
    }
    if(look&&look.over)look.over(K);
    if(id==='bug'&&p>.38&&p<.56){const copy=buf.slice();const displacement=Math.round(wave(p,14)*5);for(let y=19;y<27;y++)for(let x=0;x<W;x++){const sx=x+displacement;buf[y*W+x]=sx>=0&&sx<W?copy[y*W+sx]:0;}for(let n=0;n<8;n++)dot(15+n*9,30+(n%3),n%2?5:3,false);}
    return buf;
  }
  function draw(canvas,id,time,options={}){
    const theme=options.theme||'retro';
    if(theme!=='retro'){
      if(!['modern','manga'].includes(theme))throw new RangeError('Unknown Pixel theme: '+theme);
      if(!scope.Pixel52Themes)throw new Error('Load pixel-themes.js to use the '+theme+' theme');
      return scope.Pixel52Themes.draw(canvas,id,time,options);
    }
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D is required');
    const pixels=frame(id,time),s=canvas.width/W,sy=canvas.height/H,gap=options.grid===false?0:Math.max(.25,s*.10);
    ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!options.transparent){ctx.fillStyle=palette[0];ctx.fillRect(0,0,canvas.width,canvas.height);}
    for(let c=1;c<palette.length;c++){ctx.fillStyle=palette[c];for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(pixels[y*W+x]===c)ctx.fillRect(x*s,y*sy,s-gap,sy-gap);}
  }
  function create(canvas, options={}){
    options={...options};
    if(!['retro','modern','manga'].includes(options.theme||'retro'))throw new RangeError('Unknown Pixel theme: '+options.theme);
    let id=options.animation||'content';if(!index[id])throw new RangeError('Unknown Pixel animation: '+id);
    let time=0,playing=options.autoplay!==false,speed=options.speed===undefined?1:options.speed,last=0,raf=0,disposed=false,idling=options.idle===true;
    const idleList=animations.filter(a=>a.group==='Idle');
    if(idling)id='idle-respire';
    function nextIdle(){
      const candidates=idleList.filter(a=>a.id!==id);
      let pick=Math.random()*candidates.reduce((total,a)=>total+a.idleWeight,0);
      let next=candidates[candidates.length-1];
      for(const candidate of candidates){pick-=candidate.idleWeight;if(pick<0){next=candidate;break;}}
      options.transition={id,time};id=next.id;time=0;options.onAnimationChange?.(id);
    }
    let intersecting=true;
    if(!canvas.width||!canvas.height){canvas.width=768;canvas.height=432;}
    function loop(now){if(disposed)return;raf=requestAnimationFrame(loop);if(!last){last=now;return;}const delta=now-last;const minimum=1000/(options.fps||(options.theme&&options.theme!=='retro'?60:24));if(delta<minimum-1)return;last=now;if(playing&&intersecting&&!document.hidden){time+=Math.min(delta,100)/1000*speed;if(idling&&time>=index[id].duration)nextIdle();draw(canvas,id,time,options);}}
    const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(es=>{intersecting=es[0].isIntersecting;last=0;}):null;
    observer?.observe(canvas);draw(canvas,id,time,options);raf=requestAnimationFrame(loop);
    return {play(next){if(next!==undefined){if(!index[next])throw new RangeError('Unknown Pixel animation: '+next);options.transition={id,time};id=next;time=0;idling=false;}playing=true;draw(canvas,id,time,options);},startIdle(){options.transition={id,time};idling=true;id='idle-respire';time=0;playing=true;options.onAnimationChange?.(id);draw(canvas,id,time,options);},pause(){playing=false;},seek(t){if(!Number.isFinite(t))throw new TypeError('Time must be finite');time=t;options.transition=null;draw(canvas,id,time,options);},setSpeed(v){if(!Number.isFinite(v)||v<0)throw new RangeError('Speed must be non-negative');speed=v;},setTheme(theme){if(!['retro','modern','manga'].includes(theme))throw new RangeError('Unknown Pixel theme: '+theme);if(theme!=='retro'&&!scope.Pixel52Themes)throw new Error('Load pixel-themes.js first');options.theme=theme;draw(canvas,id,time,options);},get theme(){return options.theme||'retro';},get animation(){return id;},get time(){return time;},get playing(){return playing;},get idling(){return idling;},destroy(){disposed=true;cancelAnimationFrame(raf);observer?.disconnect();}};
  }
  const api={width:W,height:H,palette,animations,frame,draw,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.Pixel52=api;
})(typeof window!=='undefined'?window:globalThis);
