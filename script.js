/* ====== STAR SHADERS ====== */
const STAR_VS = `
attribute float size;
attribute float twinkle;
attribute vec3  vcolor;
uniform  float  time;
varying  vec3   vc;
varying  float  vAlpha;
void main(){
  vc = vcolor;
  float t = sin(time*0.8 + twinkle)*0.4 + 0.6;
  vAlpha = t;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * (400.0 / -mv.z);   // перспективное затухание
  gl_Position  = projectionMatrix * mv;
}`;


const STAR_FS = `
precision mediump float;
varying vec3  vc;
varying float vAlpha;
void main(){
  vec2  uv  = gl_PointCoord - 0.5;
  float d   = length(uv);
  float halo= smoothstep(0.5,0.0,d);
  gl_FragColor = vec4(vc * halo, vAlpha * halo);
}`;

/*  script.js  v3 “Beyond Infinity”  */
let scene, camera, renderer, composer;
let orbitControls, flyControls, usingFly = false;
let starField, currentDimension = null;
let ui = document.getElementById('controls');

init();
animate();

/* ---------- INIT ---------- */
function init() {
  scene   = new THREE.Scene();

  /* камеры */
  camera  = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, .1, 1e6);
  camera.position.set(0, 800, 2500);

  renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 3.15;
  document.getElementById('container').appendChild(renderer.domElement);

  /* post-processing (Composer уже собрали) */
  composer = new THREE.EffectComposer(renderer);
  composer.addPass( new THREE.RenderPass(scene,camera) );
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),1.6,.45,.83);
  composer.addPass(bloom);

  /* свет */
  scene.add(new THREE.AmbientLight(0x404040,30));
  const dir = new THREE.DirectionalLight(0xffffff,3.5);
  dir.position.set(5,12,8); scene.add(dir);

  /* Controls */
  orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping=true; orbitControls.dampingFactor=.02;
  orbitControls.minPolarAngle = 0;             // свободный полный оборот
  orbitControls.maxPolarAngle = Math.PI;

  flyControls = new THREE.FlyControls(camera, renderer.domElement);
  flyControls.movementSpeed = 1;
  flyControls.rollSpeed = Math.PI/2;
  flyControls.dragToLook = true;
  flyControls.enabled = false;

  createStars(200000, 200000);

  /* UI bindings */
  document.getElementById('generateBtn1').addEventListener('click',()=>loadDimension(generateRingOfChaos));
  document.getElementById('generateBtn2').addEventListener('click',()=>loadDimension(generateStellarVortex));
  document.getElementById('generateBtn3').addEventListener('click',()=>loadDimension(generateTesseract));
  document.getElementById('generateBtn4').addEventListener('click',()=>loadDimension(generatePulsar));
  document.getElementById('generateBtn5').addEventListener('click',()=>loadDimension(generateBlackHole));
  document.getElementById('generateBtn6').addEventListener('click',()=>loadDimension(generateInfinityWeb));
  document.getElementById('clearBtn').addEventListener('click', clearDimension);

  addEventListener('resize', onResize);
  addEventListener('keydown', onKey);

      /* === MUSIC  ===================================================== */
    const audioEl = document.getElementById('bgMusic');
    audioEl.volume = 0.7;        // стартовая громкость

    /* нужен контекст, чтобы WebAudio видел элемент */
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const track    = audioCtx.createMediaElementSource(audioEl);
    const gainNode = audioCtx.createGain();
    track.connect(gainNode).connect(audioCtx.destination);

    /* play / pause кнопка  ------------------------------------------ */
    const musicBtn = document.createElement('button');
    musicBtn.id    = 'musicBtn';
    musicBtn.textContent = '♪';
    musicBtn.style.cssText =
      'position:fixed;top:20px;right:20px;z-index:20;padding:8px 14px;' +
      'border:0;border-radius:8px;background:rgba(255,255,255,.15);' +
      'color:#fff;font-size:20px;cursor:pointer;backdrop-filter:blur(6px);';
    document.body.appendChild(musicBtn);

    let musicPlaying = false;
    musicBtn.onclick = async () =>{
      if(!musicPlaying){
        await audioCtx.resume();   // Chrome: нужно после user-gesture
        audioEl.play();
        musicBtn.textContent = '❚❚';  // pause icon
        musicPlaying = true;
      }else{
        audioEl.pause();
        musicBtn.textContent = '♪';
        musicPlaying = false;
      }
    };

    /* колёсиком на кнопке — громкость -------------------------------- */
    musicBtn.addEventListener('wheel', e=>{
      e.preventDefault();
      const v = THREE.MathUtils.clamp(audioEl.volume - e.deltaY*0.001, 0, 1);
      audioEl.volume = v;
      gainNode.gain.value = v;              // синхронизируем
    });
}

/* ---------- STARS ---------- (как прежде, число/радиус ↑) */
/* ----------  STARS  ---------- */
function createStars(count, radius) {
  if (starField) {
    starField.geometry.dispose();
    scene.remove(starField);
  }

  const pos  = new Float32Array(count * 3);
  const col  = new Float32Array(count * 3);
  const tmpC = new THREE.Color();

  for (let i = 0; i < count; i++) {
    /* равномерная точка внутри сферы */
    const r = radius * Math.cbrt(Math.random());
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi   = Math.acos(3 * v - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    pos.set([x, y, z], i * 3);

    /* лёгкая цветовая разбивка, чтобы мерцание смотрелось круто */
    tmpC.setHSL(0.55 + 0.1 * Math.random(), 0.6, 0.6 + 0.4 * Math.random());
    col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color',    new THREE.BufferAttribute(col, 3));

  const m = new THREE.PointsMaterial({
    size: 2.5,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true
  });

  starField = new THREE.Points(g, m);
  starField.rotation.order = 'YXZ';           // красивый «звёздный вихрь»
  scene.add(starField);
}

//////////////////////////////////////////////////////////////
//  DIMENSION #1  – Ring of Chaos  (из v2, параметры немного ↑)
//////////////////////////////////////////////////////////////
/* ----------  RING OF CHAOS  ---------- */
function generateRingOfChaos(targetGroup) {
  /* параметры можно крутить — это «сид» безграничных миров */
  const SEED                = Math.random() * 1e9;
  const NUM_CLUSTERS        = 18;            // «островов»
  const OBJECTS_PER_CLUSTER = 400;
  const RING_RADIUS         = 6500;
  const CLUSTER_SPREAD      = 15100;

  const baseGeometries = [
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.IcosahedronGeometry(0.8, 0),
    new THREE.TorusGeometry(0.8, 0.25, 8, 16)
  ];

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0.4, flatShading: true
  });

  /* собираем инстансы по каждой геометрии */
  const instancedMeshes = baseGeometries.map(
    g => new THREE.InstancedMesh(g, material,
          NUM_CLUSTERS * OBJECTS_PER_CLUSTER)
  );
  const color = new THREE.Color();
  const tmpM  = new THREE.Matrix4();
  const quat  = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos   = new THREE.Vector3();

  const random = mulberry32(SEED); // детерминированный RNG

  /* главный цикл по «островам» */
  let counter = Array(instancedMeshes.length).fill(0);

  for (let c = 0; c < NUM_CLUSTERS; c++) {
    const baseAngle = (c / NUM_CLUSTERS) * Math.PI * 2;
    const angle = baseAngle + (random() - 0.5) * 0.2;
    const radius = RING_RADIUS + (random() - 0.5) * CLUSTER_SPREAD;
    const center = new THREE.Vector3(
      Math.cos(angle) * radius,
      (random() - 0.5) * CLUSTER_SPREAD * 0.4,
      Math.sin(angle) * radius
    );

    const baseColor = new THREE.Color().setHSL(
      c / NUM_CLUSTERS, 0.7 + random() * 0.3, 0.55 + random() * 0.25
    );

    for (let i = 0; i < OBJECTS_PER_CLUSTER; i++) {
      /* выбираем геометрию */
      const gId   = Math.floor(random() * baseGeometries.length);
      const mesh  = instancedMeshes[gId];
      const id    = counter[gId]++;

      /* позиция внутри кластера */
      pos.copy(center).add(new THREE.Vector3(
        (random() - 0.5) * CLUSTER_SPREAD,
        (random() - 0.5) * CLUSTER_SPREAD,
        (random() - 0.5) * CLUSTER_SPREAD
      ));

      /* случайный размер и ориентация */
      scale.setScalar(8 + random() * 140);
      quat.setFromEuler(new THREE.Euler(
        random() * Math.PI * 2,
        random() * Math.PI * 2,
        random() * Math.PI * 2
      ));

      tmpM.compose(pos, quat, scale);
      mesh.setMatrixAt(id, tmpM);

      color.copy(baseColor).offsetHSL(
        (random() - 0.5) * 0.05,
        (random() - 0.5) * 0.12,
        (random() - 0.5) * 0.12
      );
      mesh.setColorAt(id, color);
    }
  }

  /* финализируем и добавляем в сцену */
  instancedMeshes.forEach(m => {
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate  = true;
    targetGroup.add(m);
  });
}

//////////////////////////////////////////////////////////////
//  DIMENSION #2 – Stellar Vortex v4  (ATOM CORE)
//////////////////////////////////////////////////////////////
function generateStellarVortex(group){
  /* ─────  Глобальные параметры  ───── */
  const GAL_ARMS   = 6;         // больших рукавов
  const PTS_ARM    = 60000;
  const CORE_SPIR  = 15;         // мини-спиралей-“электронов”
  const CORE_PTS   = 1200;      // точек на каждую мини-спираль
  const SCALE_GAL  = 1600;
  const SCALE_CORE = 420;
  const A = 0.55, B = 0.19;     // r = A·e^(Bθ)

  /* предварительно считаем размер буфера */
  const TOTAL = GAL_ARMS*PTS_ARM + CORE_SPIR*CORE_PTS;
  const pos  = new Float32Array(TOTAL*3);
  const col  = new Float32Array(TOTAL*3);
  const size = new Float32Array(TOTAL);

  const c = new THREE.Color();
  let idx = 0;

  /* ──────────────────────────────────
     1.  Внешние рукава
     ────────────────────────────────── */
  for(let arm=0; arm<GAL_ARMS; arm++){
    for(let i=0; i<PTS_ARM; i++, idx++){
      const t  = i / PTS_ARM;
      const θ  = t*Math.PI*10 + arm*Math.PI;   // 8 оборотов
      const r  = A*Math.exp(B*θ);

      let x = r*Math.cos(θ)*SCALE_GAL;
      let z = r*Math.sin(θ)*SCALE_GAL;
      let y = Math.sin(θ*1.8)*800*Math.random();

      /* небольшой шум */
      x += (Math.random()-0.5)*110;
      y += (Math.random()-0.5)*80;
      z += (Math.random()-0.5)*110;

      pos.set([x,y,z], idx*3);

      /* голубой → фиолетовый градиент */
      c.setHSL(0.58+0.25*t,1,0.55+0.1*t);
      col.set([c.r,c.g,c.b], idx*3);

      size[idx] = 3.5 + 3.5*Math.random()*(1-t)+1.5*Math.random();
    }
  }

  /* ──────────────────────────────────
     2.  «Атомное» ядро – 5 мини-спиралей
     ────────────────────────────────── */
  for(let s=0; s<CORE_SPIR; s++){
    const rot = s * (Math.PI*2/CORE_SPIR);          // 0°,72°…
    for(let i=0;i<CORE_PTS;i++,idx++){
      const t = i/CORE_PTS;                         // 0..1
      const θ = t * Math.PI * 6;                    // 3 оборота
      const r = t * SCALE_CORE;                     // линейное радиальное
      let x = Math.cos(θ)*r;
      let z = Math.sin(θ)*r;
      const y = (Math.random()-0.5)*80;             // лёгкая толщина

      /* поворачиваем спираль вокруг Y */
      const rx = x*Math.cos(rot) - z*Math.sin(rot);
      const rz = x*Math.sin(rot) + z*Math.cos(rot);

      pos.set([rx, y, rz], idx*3);

      /* разные цвета: радуга по спиралям */
      c.setHSL((s/CORE_SPIR)+0.05*Math.sin(t*6), 0.85, 0.65);
      col.set([c.r,c.g,c.b], idx*3);

      size[idx] = 6 + 8*(1-t)          // ближе к центру крупнее
                  + 2*Math.random();
    }
  }

  /* ──────────────────────────────────
     3.  Шейдерные материалы
     ────────────────────────────────── */
  const VERT = `
    attribute float size; attribute vec3 vcolor;
    uniform float time; varying vec3 vc;
    void main(){
      vc = vcolor;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      float puls = 0.9 + 0.1*sin(time*0.6 + position.x*0.003);
      gl_PointSize = size * puls * (420. / -mv.z);
      gl_Position  = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision mediump float; varying vec3 vc;
    void main(){
      vec2 p = gl_PointCoord - 0.5;
      float a = smoothstep(0.5,0.0,length(p));
      gl_FragColor = vec4(vc*a, a);
    }`;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('vcolor',   new THREE.BufferAttribute(col,3));
  geo.setAttribute('size',     new THREE.BufferAttribute(size,1));

  const mat = new THREE.ShaderMaterial({
    uniforms:{time:{value:0}},
    vertexShader:VERT, fragmentShader:FRAG,
    transparent:true, depthWrite:false,
    blending:THREE.AdditiveBlending
  });

  const vortex = new THREE.Points(geo, mat);
  group.add(vortex);

  /* ──────────────────────────────────
     4.  Корона-glow
     ────────────────────────────────── */
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map:createRadialGradientTexture('#aee5ff','#00000000'),
    blending:THREE.AdditiveBlending, opacity:0.18,
    depthWrite:false, depthTest:false
  }));
  glow.scale.set(SCALE_CORE*7, SCALE_CORE*7, 1);
  group.add(glow);

  /* ──────────────────────────────────
     5.  Анимация
     ────────────────────────────────── */
  group.userData.anim = (dt)=>{
    const t = performance.now()*0.001;
    mat.uniforms.time.value = t;

    /* внешняя галактика медленно */
    group.rotation.y += 0.00035;
        /* мини-спирали «вращаются навстречу» */
    vortex.rotation.y += 0;
    vortex.rotation.z += 0;

  };

  focusCameraOn(group, 2.6);
}

/* ===== helper: radial texture ===== */
function createRadialGradientTexture(inner, outer){
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(
      size/2, size/2, 2,
      size/2, size/2, size/2
  );
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,size,size);
  return new THREE.CanvasTexture(canvas);
}

//////////////////////////////////////////////////////////////
//  LOAD / CLEAR / ANIMATE
//////////////////////////////////////////////////////////////
function clearDimension(){
  if(!currentDimension)return;
  currentDimension.traverse(o=>{
    if(o.isMesh){o.geometry.dispose(); if(o.material) o.material.dispose();}
  });
  scene.remove(currentDimension); currentDimension=null;
}

function loadDimension(genFn){
  clearDimension();
  currentDimension = new THREE.Group();
  scene.add(currentDimension);
  genFn(currentDimension);
  resetCamera();
}

function animate(ts){
  requestAnimationFrame(animate);

  orbitControls.update();
  if(usingFly) flyControls.update(0.0025);

  starField.rotation.y+=0.00009;
  if(currentDimension){currentDimension.rotation.y+=0.00009;
    const a=currentDimension.userData.anim; if(a) a(ts);
  }
  composer.render();
}

//////////////////////////////////////////////////////////////
//  HELPERS
//////////////////////////////////////////////////////////////
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}

function resetCamera(){
    camera.position.set(0,800,2500);
    orbitControls.target.set(0,0,0);
}
/* Фокусируем камеру на объекте, сохраняя поле зрения */

function onKey(e){
  switch(e.code){
    case 'KeyH':
        ui.classList.toggle('hiddenUI');
        document.getElementById('key-hint').classList.toggle('hiddenUI');
        break;

    case 'KeyF': toggleControls();break;
    case 'Digit1': loadDimension(generateRingOfChaos);break;
    case 'Digit2': loadDimension(generateStellarVortex);break;
    case 'KeyC': clearDimension();break;
    case 'Digit3': loadDimension(generateTesseract);break;
    case 'Digit4': loadDimension(generatePulsar);break;
    case 'Digit5': loadDimension(generateBlackHole); break;
    case 'Digit6': loadDimension(generateInfinityWeb); break;
    case 'KeyR': if(e.shiftKey) resetCamera();break;
  }
}

function toggleControls(){
  usingFly=!usingFly;
  orbitControls.enabled=!usingFly;
  flyControls.enabled=usingFly;
}
/* — градиент-кольцо для грав. линзы — */
function createRingTexture(inner, outer){
  const size=256, cv=document.createElement('canvas');
  cv.width=cv.height=size; const ctx=cv.getContext('2d');
  const grd=ctx.createRadialGradient(size/2,size/2, size*0.30,
                                     size/2,size/2, size*0.50);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  ctx.fillStyle=grd; ctx.fillRect(0,0,size,size);
  return new THREE.CanvasTexture(cv);
}

/* — узкий полупрозрачный конус джета — */
function addJet(parent, up=true, h=8000, r=260){
  const geo=new THREE.ConeGeometry(r,h,32,1,true);
  geo.translate(0, -h/2, 0);
  const mat=new THREE.MeshBasicMaterial({
    color:0x88ccff, transparent:true, opacity:0.45,
    blending:THREE.AdditiveBlending,
    depthWrite:false, depthTest:false, side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(geo,mat);
  if(up) mesh.rotation.x=Math.PI;
  parent.add(mesh);
}

//////////////////////////////////////////////////////////////
//  DIMENSION #3 – 4D-Tesseract  (fixed & upgraded)
//////////////////////////////////////////////////////////////
function generateTesseract(group){
  /* ---------- вершинные данные ---------- */
  const verts4D = [];
  for(let i=0;i<16;i++){
    verts4D.push([
      (i&1)? 1:-1,
      (i&2)? 1:-1,
      (i&4)? 1:-1,
      (i&8)? 1:-1
    ]);
  }

  const edges = [];
  for(let a=0;a<16;a++) for(let b=a+1;b<16;b++){
    let diff=0;
    for(let k=0;k<4;k++) diff += (verts4D[a][k]!==verts4D[b][k]);
    if(diff===1) edges.push([a,b]);
  }

  /* ---------- буферная геометрия ---------- */
  const posAry = new Float32Array(edges.length*2*3);
  const colAry = new Float32Array(edges.length*2*3);
  const gCol   = new THREE.Color();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posAry,3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colAry,3));

  /* «неоновый» материал (LineBasic + bloom-свечение) */
  const mat = new THREE.LineBasicMaterial({
    vertexColors:true,
    transparent:true,
    opacity:0.9
  });

  const mesh = new THREE.LineSegments(geo, mat);
  group.add(mesh);

  /* ---------- анимация ---------- */
  group.userData.anim = (ts)=>{
    const t = ts*0.0004;
    const wDist = 4 + Math.sin(t*0.8);          // 3 … 5  (безопасно > |w|)
    let i=0;

    edges.forEach((e,idx)=>{
      [0,1].forEach((end)=>{
        const v4   = verts4D[e[end]];
        const rot  = rotate4D(v4,  t, t*0.6);   // плавное двойное вращение
        const v3   = project4Dto3D(rot, wDist);
        posAry.set(v3.toArray(), i*3);

        /* радуга по рёбрам */
        gCol.setHSL(idx/edges.length, 1.0, 0.58);
        colAry.set([gCol.r,gCol.g,gCol.b], i*3);
        i++;
      });
    });

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate    = true;

    mesh.rotation.y += 0.0012;                 // медленное глобальное вращение
  };

  /* кинематографичный вынос камеры */
  focusCameraOn(group, 2.2);
}

//////////////////////////////////////////////////////////////
//  DIMENSION #4 – Pulsar v2 (soft cones, smooth pulse)
//////////////////////////////////////////////////////////////
function generatePulsar(group){
  /* ===== базовые размеры ===== */
  const STAR_R   = 250;            // радиус нейтронной звезды
  const CONE_H   = 1600000;           // высота конуса-луча
  const CONE_R   = 138000;            // радиус раскрытия конуса
  const DISK_IN  = 900;
  const DISK_OUT = 2600;
  const DISK_PTS = 48000;
  const FIELD_ARC= 20;              // количество «магнитных» дуг

  /* ---------- ядро ---------- */
  const starMat = new THREE.MeshBasicMaterial({
    color:0x9fd0ff,
    emissive:0xffffff,
    emissiveIntensity:1.2
  });
  const star = new THREE.Mesh(
    new THREE.SphereGeometry(STAR_R, 32, 32), starMat);
  group.add(star);

  /* слабый glow-sprite */
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map:createRadialGradientTexture('#bfe0ff','#0000'),
    color:0xffffff, opacity:0.14, blending:THREE.AdditiveBlending,
    depthWrite:false, depthTest:false, transparent:true
  }));
  glow.scale.set(STAR_R*7, STAR_R*7, 1);
  group.add(glow);

  /* ---------- МЯГКИЕ КОНУСЫ-ЛУЧИ ---------- */
  const coneGeo = new THREE.ConeGeometry(CONE_R, CONE_H, 32, 1, true);
  coneGeo.translate(0, -CONE_H/2, 0);         // ставим опорой к звезде
  const coneMat = new THREE.MeshBasicMaterial({
    color:0xaad4ff,
    transparent:true,
    opacity:0.55,
    blending:THREE.AdditiveBlending,
    depthWrite:false, depthTest:false,
    side:THREE.DoubleSide
  });
  // верхний
  const coneUp = new THREE.Mesh(coneGeo, coneMat.clone());
  coneUp.rotation.x = Math.PI;                 // смотрит вверх
  // нижний
  const coneDn = new THREE.Mesh(coneGeo, coneMat.clone());
  group.add(coneUp, coneDn);

  /* ---------- аккреционный диск (точки) ---------- */
  const diskBuf  = new Float32Array(DISK_PTS*3);
  const diskCol  = new Float32Array(DISK_PTS*3);
  const diskSize = new Float32Array(DISK_PTS);
  const col = new THREE.Color();
  for(let i=0;i<DISK_PTS;i++){
    const r = THREE.MathUtils.lerp(DISK_IN, DISK_OUT, Math.pow(Math.random(),1.4));
    const a = Math.random()*Math.PI*2;
    const x = Math.cos(a)*r;
    const z = Math.sin(a)*r;
    const y = (Math.random()-0.5)*40;        // тонкий
    diskBuf.set([x,y,z], i*3);

    col.setHSL(0.58+0.05*Math.random(), .9, 0.58);
    diskCol.set([col.r,col.g,col.b], i*3);
    diskSize[i] = 2.8 + 2.5*Math.random();
  }
  const diskGeo = new THREE.BufferGeometry();
  diskGeo.setAttribute('position', new THREE.BufferAttribute(diskBuf,3));
  diskGeo.setAttribute('vcolor',   new THREE.BufferAttribute(diskCol,3));
  diskGeo.setAttribute('size',     new THREE.BufferAttribute(diskSize,1));

  const VERT = `
    attribute float size; attribute vec3 vcolor;
    uniform float time; varying vec3 vc;
    void main(){
      vc = vcolor;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      float puls = 0.92 + 0.08*sin(time*1.8 + position.x*0.003);
      gl_PointSize = size * puls * (380.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    precision mediump float; varying vec3 vc;
    void main(){
      vec2 p = gl_PointCoord - 0.5;
      float d = length(p);
      float a = smoothstep(0.5,0.0,d);
      gl_FragColor = vec4(vc*a, a);
    }`;
  const diskMat = new THREE.ShaderMaterial({
    uniforms:{time:{value:0}},
    vertexShader:VERT, fragmentShader:FRAG,
    transparent:true, depthWrite:false,
    blending:THREE.AdditiveBlending
  });
  const disk = new THREE.Points(diskGeo, diskMat);
  group.add(disk);

  /* ---------- магнитные дуги (поле) ---------- */
  for(let i=0;i<FIELD_ARC;i++){
    const arc = createMagneticArc(i/FIELD_ARC);
    group.add(arc);
  }

  /* ---------- анимация ---------- */
  const spinSpeed = 0.032;   // рад/кадр
  let t = 0;
  group.userData.anim = (dt)=>{
    t += dt;
    // плавная пульсация (без резкого строба)
    const e = 1.15 + 0.25*Math.sin(t*0.002);
    starMat.emissiveIntensity = e;
    coneMat.opacity = 0.45 + 0.2*Math.sin(t*0.002);

    // вращение: звезда, конусы, диск, дуги
    group.rotation.y += spinSpeed;
    disk.rotation.y  -= spinSpeed*0.25;

    diskMat.uniforms.time.value = performance.now()*0.001;
  };

  focusCameraOn(group, 4);
}

/* ===== helper: дуги магнитного поля (тонкие линии) ===== */
function createMagneticArc(offset){
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,  0,  DISK_OUT*1.2),
    new THREE.Vector3(0,  STAR_R*5, 0),
    new THREE.Vector3(0, -STAR_R*5, 0),
    new THREE.Vector3(0,  0, -DISK_OUT*1.2)
  ]);
  const pts = curve.getPoints(80);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color().setHSL(0.55+offset*0.1, 1, 0.6),
    transparent:true, opacity:0.55
  });
  const line = new THREE.Line(geo, mat);
  line.rotation.y = offset*Math.PI*2;
  return line;
}

/****************************************************************
  DIMENSION #5 – Spiral Flower Nebula v7
           • 4-D breath       • Mouse highlight
****************************************************************/
function generateBlackHole(group){

  /* ====  параметры  ==== */
  const BUNDLES        = 16;
  const SPIRALS_IN_B   = 14;
  const PTS_PER_S      = 2600;
  const R_MAX          = 80000;
  const RADIAL_K       = 0.22;
  const WAVE_H         = 9600;
  const CORE_GLOW_R    = 900;

  /* ---------- центральный glow ---------- */
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('#73d0ff','#00102000'),
    blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0.6, depthWrite:false, depthTest:false
  }));
  core.scale.setScalar(CORE_GLOW_R*2);
  group.add(core);

  /* ---------- буферы ---------- */
  const TOTAL = BUNDLES * SPIRALS_IN_B * PTS_PER_S;
  const pos   = new Float32Array(TOTAL*3);
  const col   = new Float32Array(TOTAL*3);
  const size  = new Float32Array(TOTAL);
  const tmpC  = new THREE.Color();

  let ptr = 0;

  for(let b=0;b<BUNDLES;b++){
    const bundleAng = b/BUNDLES * Math.PI*2;

    for(let s=0;s<SPIRALS_IN_B;s++){
      const phase   = s/SPIRALS_IN_B * Math.PI*2;
      const twist   = (0.6+0.4*Math.random()) * (Math.random()<.5?-1:1);
      const hueBase = 0.55 + 0.1*Math.random();

      for(let i=0;i<PTS_PER_S;i++){
        const t  = i/(PTS_PER_S-1);
        const θ  = t*Math.PI*10 + phase;
        const r3 = Math.exp(RADIAL_K*θ);
        const r  = r3 * (R_MAX/Math.exp(RADIAL_K*Math.PI*10));

        /* ---- 4-D координата w и персп. проекция ---- */
        const w   = Math.sin(θ*1.7) * R_MAX*0.22;
        const proj= 1.0/(1.0 + w/(R_MAX*0.22));   // 4D→3D

        const x = Math.cos(θ+bundleAng)*r*proj;
        const z = Math.sin(θ+bundleAng)*r*proj;
        const y = Math.sin(θ*twist)*WAVE_H*(1-t);

        pos[ptr*3  ] = x;
        pos[ptr*3+1] = y;
        pos[ptr*3+2] = z;

        /* динамический hue-shift во времени (обновляем в анимации) */
        tmpC.setHSL(hueBase + 0.2*t , 1 , 0.55+0.15*(1-t));
        col.set([tmpC.r,tmpC.g,tmpC.b], ptr*3);

        size[ptr] = 10 + 8*(1-t);
        ptr++;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col,3));
  geo.setAttribute('size',     new THREE.BufferAttribute(size,1));

  const mat = makePointShader();        // уже есть в проекте
  const cloud = new THREE.Points(geo, mat);
  group.add(cloud);

  /* ---------- индексы подсвеченных точек ---------- */
  const highlight = new Set();                // store indices
  const restoreAfter = 1000;                  // ms

  /* ---------- анимация ---------- */
  group.userData.anim = ()=>{
    const t = performance.now()*0.001;
    const hueShift = (t*0.02)%1.0;
    mat.uniforms.time.value = t;

    /* вращения */
    group.rotation.y += 0.00045;
    cloud.rotation.y += 0.0013;
    cloud.rotation.z += 0.0006;

    /* прокручиваем цветовой сдвиг по HSL */
    const colAttr = geo.attributes.color;
    for(let i of highlight){ /* оставляем подсвеченные как есть */}
    for(let i=0;i<colAttr.count;i+=20){       // sparse обновление
      const h = ((col[i*3]+hueShift)%1);
      tmpC.setHSL(h,1,0.5);
      colAttr.setXYZ(i,tmpC.r,tmpC.g,tmpC.b);
    }
    colAttr.needsUpdate=true;
    core.material.rotation = t*0.4;
  };

  /* expose geometry for raycaster */
  cloud.userData.type = 'nebulaCloud';
  cloud.userData.highlightSet = highlight;

  focusCameraOn(group,3.2);
}

/* =====  Mouse-raycaster  (вставить один раз после init) ===== */
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointermove', e=>{
  mouse.x = (e.clientX/innerWidth)*2-1;
  mouse.y = -1 * (e.clientY/innerHeight)*2+1;
});
window.addEventListener('pointerdown', highlightPoint);



/* ===== helper: мягкий спрайт-glow ===== */
function makeGlowTexture(inner, outer){
  const s=256, cv=document.createElement('canvas');
  cv.width=cv.height=s; const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(s/2,s/2,1, s/2,s/2,s/2);
  g.addColorStop(0,inner); g.addColorStop(1,outer);
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
  return new THREE.CanvasTexture(cv);
}

/* ===== helpers (если нет) ===== */
function createNoiseTexture(){
  const s=256,cv=document.createElement('canvas');
  cv.width=cv.height=s;const ctx=cv.getContext('2d');
  const id=ctx.createImageData(s,s);
  for(let i=0;i<s*s;i++){
    const v=Math.random()*255;
    id.data.set([v,v,v,255],i*4);
  }
  ctx.putImageData(id,0,0);
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
function createRingTexture(inner,outer){
  const sz=256,cv=document.createElement('canvas');
  cv.width=cv.height=sz;const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(sz/2,sz/2,sz*0.32,sz/2,sz/2,sz*0.5);
  g.addColorStop(0,inner);g.addColorStop(1,outer);
  ctx.fillStyle=g;ctx.fillRect(0,0,sz,sz);
  return new THREE.CanvasTexture(cv);
}
/****************************************************************
  DIMENSION #6 – Infinity Web v2  (3-D figure-8 point clouds)
****************************************************************/
function generateInfinityWeb(group){

  /*  параметры  */
  const CURVES        = 18;          // количество восьмёрок / Лиссажу
  const PTS_PER_CURVE = 26000;         // точек на кривой
  const BASE_R        = 17800;        // общий размах
  const AMP_Y         = 9000;         // «волна» по Y
  const SIZE_MIN      = 9, SIZE_MAX = 74;
  const GLOW_R        = 900;

  /* ------------- генерация буферов ------------- */
  const pos = new Float32Array(CURVES * PTS_PER_CURVE * 3);
  const col = new Float32Array(CURVES * PTS_PER_CURVE * 3);
  const siz = new Float32Array(CURVES * PTS_PER_CURVE);
  const tmpC = new THREE.Color();
  let ptr = 0;

  for (let n=0; n<CURVES; n++){
    const is8 = Math.random() < 0.6;          // чаще восьмёрка
    const ax  = 1 + Math.floor(Math.random()*3);
    const ay  = is8 ? ax*2 : 1 + Math.floor(Math.random()*3);
    const phi = Math.random()*Math.PI*2;

    /* случайный 3-D поворот всей кривой */
    const quat = new THREE.Quaternion()
       .setFromEuler(new THREE.Euler(
         Math.random()*Math.PI,
         Math.random()*Math.PI,
         Math.random()*Math.PI
       ));

    for (let i=0;i<PTS_PER_CURVE;i++){
      const t = i/(PTS_PER_CURVE-1);
      const θ = t*Math.PI*2;
      let x,z;

      if(is8){
        const r = BASE_R*Math.sin(2*θ);
        x = r*Math.cos(θ);
        z = r*Math.sin(θ);
      }else{
        x = BASE_R*Math.sin(ax*θ+phi);
        z = BASE_R*Math.sin(ay*θ);
      }
      const y = Math.sin(θ*2+phi)*AMP_Y*(0.3+0.7*t);

      /* применяем глобальный поворот */
      const v = new THREE.Vector3(x,y,z).applyQuaternion(quat);

      pos[ptr*3  ] = v.x;
      pos[ptr*3+1] = v.y;
      pos[ptr*3+2] = v.z;

      /* фиолетово-розовый градиент по t */
      tmpC.setHSL(0.78 - 0.05*t, 1.0, 0.55 + 0.15*(1-t));
      col.set([tmpC.r,tmpC.g,tmpC.b], ptr*3);

      siz[ptr] = THREE.MathUtils.lerp(SIZE_MIN,SIZE_MAX, 1-t);
      ptr++;
    }
  }

  /* ------------- geometry / material ------------- */
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col,3));
  geo.setAttribute('size',     new THREE.BufferAttribute(siz,1));

  const mat = makePointShader();

  const cloud = new THREE.Points(geo, mat);
  group.add(cloud);

  /* ------------- central glow sprite ------------- */
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('#d172ff','#10002000'),
    blending:THREE.AdditiveBlending,
    transparent:true, depthWrite:false, depthTest:false,
    opacity:0.85
  }));
  glow.scale.set(GLOW_R*2,GLOW_R*2,1);
  group.add(glow);

  /* ------------- «лазерный» вихрь ------------- */
  const cylGeo = new THREE.CylinderGeometry(40,40, BASE_R*2.3, 8,1,true);
  const cylMat = new THREE.MeshBasicMaterial({
    color:0xff66ff, transparent:true, opacity:0.55,
    blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
    depthWrite:false
  });


  /* ------------- анимация ------------- */
  group.userData.anim = ()=>{
    const t = performance.now()*0.001;
    cloud.rotation.y += 0.0008;
    cloud.rotation.z += 0.0003;
    mat.uniforms.time.value = t;
  };

  focusCameraOn(group, 2.8);
}

/* ===== point-shader (общий, добавить один раз) ===== */
function makePointShader(){
  return new THREE.ShaderMaterial({
    uniforms:{time:{value:0}},
    vertexShader:`
      attribute float size; attribute vec3 color;
      varying vec3 vCol; varying float vAlpha;
      uniform float time;
      void main(){
        vCol = color;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        float puls = 0.85 + 0.15*sin(time*0.8 + position.x*0.002);
        vAlpha = puls;
        gl_PointSize = size * (400.0 / -mv.z);
        gl_Position  = projectionMatrix * mv;
      }`,
    fragmentShader:`
      precision mediump float;
      varying vec3  vCol; varying float vAlpha;
      void main(){
        vec2 uv = gl_PointCoord - 0.5;
        float d  = length(uv);
        float a  = smoothstep(0.45,0.0,d) * vAlpha * 2.6;
        gl_FragColor = vec4(vCol*a, a);
      }`,
    transparent:true, depthWrite:false,
    blending:THREE.AdditiveBlending
  });
}
/* === один раз добавьте, если ещё нет (использовался в ядре) === */
function makeGlowTexture(inner, outer){
  const s=256,cv=document.createElement('canvas');
  cv.width=cv.height=s;const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(s/2,s/2,2, s/2,s/2,s/2);
  g.addColorStop(0,inner); g.addColorStop(1,outer);
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
  return new THREE.CanvasTexture(cv);
}

/* --- 4D utils (обновлены) --------------------------------*/
function project4Dto3D(v4, wDist){
  const EPS = 1e-4;
  const d   = Math.max(wDist - v4[3], EPS);    // защита от 0
  return new THREE.Vector3(v4[0]/d, v4[1]/d, v4[2]/d).multiplyScalar(900);
}

function rotate4D(v4, t1, t2){
  /* вращение в плоскостях (x,w) и (y,z) */
  const [x,y,z,w] = v4;
  const sx =  x*Math.cos(t1) - w*Math.sin(t1);
  const sw =  x*Math.sin(t1) + w*Math.cos(t1);
  const sy =  y*Math.cos(t2) - z*Math.sin(t2);
  const sz =  y*Math.sin(t2) + z*Math.cos(t2);
  return [sx, sy, sz, sw];
}

/* --- focusCameraOn (если ещё не вставил) ------------------*/
function focusCameraOn(object, padding = 1.8){
  const box    = new THREE.Box3().setFromObject(object);
  const size   = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x,size.y,size.z);
  const fovRad = camera.fov * Math.PI/180;
  let   dist   = (maxDim/2)/Math.tan(fovRad/2)*padding;

  camera.position.set(center.x, center.y, center.z + dist);
  camera.lookAt(center);
  orbitControls.target.copy(center);
  orbitControls.update();
}
//////////////////////////////////////////////////////////////
//  RNG и пр. (оставляем mulberry32 + другие утилиты)
//////////////////////////////////////////////////////////////
/* --- детерминированный RNG (Mulberry32) --- */
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

