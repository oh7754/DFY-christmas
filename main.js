// ===== three.js & GLTFLoader (importmap 버전) =====
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ★ postprocessing: DOF용 BokehPass만 사용 (Bloom X)
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";

// ===== Firebase CDN imports =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

console.log("🚀 dfy main.js loaded");

/* ============================================================================
 *  Firebase 기본 세팅
 * ==========================================================================*/
const firebaseConfig = {
  apiKey: "AIzaSyB_bZoaw6cvdrot7DEabrXsfyDYM-ZgaR0",
  authDomain: "dfy-christmas-tree-452d4.firebaseapp.com",
  projectId: "dfy-christmas-tree-452d4",
  storageBucket: "dfy-christmas-tree-452d4.firebasestorage.app",
  messagingSenderId: "424198884902",
  appId: "1:424198884902:web:cb6e92e8abe3299c5160e7",
  measurementId: "G-7TTVR9EM4E",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const imagesCol = collection(db, "treeImages");

// 🔴 회사 도메인 제한
const ALLOWED_DOMAIN = "dfy.co.kr";

/* ============================================================================
 *  DOM 요소
 * ==========================================================================*/

// 상단 UI
const topAccount = document.getElementById("topAccount");
const topInitial = document.getElementById("topInitial");
const topImage = document.getElementById("topImage");
const topEmail = document.getElementById("topEmail");
const topSub = document.getElementById("topSub");
const menuToggle = document.getElementById("menuToggle");

// 사이드 패널 & 모달
const sidePanel = document.getElementById("sidePanel");
const myWishList = document.getElementById("myWishList");
const openWishModalBtn = document.getElementById("openWishModal");
const wishModal = document.getElementById("wishModal");
const wishFileInput = document.getElementById("wishFileInput");
const wishNameInput = document.getElementById("wishNameInput");
const wishTextInput = document.getElementById("wishTextInput");
const wishCancelBtn = document.getElementById("wishCancelBtn");
const wishSubmitBtn = document.getElementById("wishSubmitBtn");

// 편지 패널
const wishPanel = document.getElementById("wishPanel");
const wishSenderEl = document.getElementById("wishSender");
const wishContentEl = document.getElementById("wishContent");
const wishCloseBtn = document.getElementById("wishCloseBtn");

/* ============================================================================
 *  상태
 * ==========================================================================*/

let currentUser = null;
let lastSnapshot = null;
const shownImageIds = new Set();

// 트리 이미지 mesh → 데이터 매핑 (클릭용)
const imageMeshes = [];
const meshToData = new Map();

// 🌲 가지에 매달린 카드 피직스용 (중력 펜듈럼)
// { hanger, axis, angle, vel, stiffness, damping }
const hangingObjects = [];

/* ============================================================================
 *  유틸 함수
 * ==========================================================================*/

function isAllowedDomain(email) {
  return email && email.endsWith("@" + ALLOWED_DOMAIN);
}

function makeInitialFromUser(user) {
  if (!user) return "?";
  if (user.displayName && user.displayName.length > 0) {
    return user.displayName[0];
  }
  if (user.email && user.email.length > 0) {
    return user.email[0].toUpperCase();
  }
  return "?";
}

function formatDate(ts) {
  if (!ts || !ts.toDate) return "";
  const d = ts.toDate();
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/* ============================================================================
 *  Auth 상태 감시
 * ==========================================================================*/

onAuthStateChanged(auth, async (user) => {
  if (user && !isAllowedDomain(user.email)) {
    alert("사내 구글 계정만 사용할 수 있습니다.");
    await signOut(auth).catch(() => {});
    currentUser = null;
  } else {
    currentUser = user || null;
  }

  if (currentUser) {
    const init = makeInitialFromUser(currentUser);
    topInitial.textContent = init;

    if (currentUser.photoURL) {
      topImage.src = currentUser.photoURL;
      topImage.classList.remove("hidden");
    } else {
      topImage.classList.add("hidden");
    }

    topEmail.textContent = currentUser.email || "알 수 없는 계정";
    topSub.textContent = "로그인 완료";
  } else {
    topInitial.textContent = "?";
    topImage.classList.add("hidden");
    topEmail.textContent = "로그인 필요";
    topSub.textContent = "사내 구글 계정만 사용 가능";
  }

  renderMyWishes();
});

/* ============================================================================
 *  상단 프로필 & 사이드 패널
 * ==========================================================================*/

function openPanel() {
  if (!sidePanel || !topAccount || !menuToggle) return;
  sidePanel.classList.add("open");
  topAccount.classList.remove("collapsed");
  topAccount.classList.add("expanded");
  menuToggle.classList.add("open");
}

function closePanel() {
  if (!sidePanel || !topAccount || !menuToggle) return;
  sidePanel.classList.remove("open");
  topAccount.classList.add("collapsed");
  topAccount.classList.remove("expanded");
  menuToggle.classList.remove("open");
}

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    if (!sidePanel) return;
    if (sidePanel.classList.contains("open")) {
      closePanel();
    } else {
      openPanel();
    }
  });
}

if (topAccount) {
  topAccount.addEventListener("click", async () => {
    if (!currentUser) {
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        console.error("로그인 실패", err);
        alert("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
      return;
    }
    if (!sidePanel.classList.contains("open")) {
      openPanel();
    }
  });
  topAccount.classList.add("collapsed");
}

/* ============================================================================
 *  소원 업로드 모달
 * ==========================================================================*/

function openWishModal() {
  if (!currentUser) {
    alert("먼저 사내 구글 계정으로 로그인 해주세요.");
    return;
  }
  wishModal.classList.remove("hidden");
}

function closeWishModal() {
  wishModal.classList.add("hidden");
  wishFileInput.value = "";
  wishTextInput.value = "";
}

openWishModalBtn.addEventListener("click", openWishModal);
wishCancelBtn.addEventListener("click", closeWishModal);

wishModal.addEventListener("click", (e) => {
  if (e.target === wishModal || e.target.classList.contains("modal-backdrop")) {
    closeWishModal();
  }
});

/* ============================================================================
 *  캔버스 텍스처 (글로우 / 눈 입자)
 * ==========================================================================*/

// 🔆 라이트 글로우용 캔버스 텍스처
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const grd = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  grd.addColorStop(0.0, "rgba(255,255,255,1)");
  grd.addColorStop(0.1, "rgba(255,255,255,0.1)");
  grd.addColorStop(0.5, "rgba(255,255,255,0)");

  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const glowTexture = createGlowTexture();

// ❄️ 눈 입자용 동그라미 텍스처
function createSnowParticleTexture(size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const r = size / 2;

  const grd = ctx.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0.0, "rgba(255,255,255,1)");
  grd.addColorStop(0.3, "rgba(255,255,255,0.9)");
  grd.addColorStop(1.0, "rgba(255,255,255,0)");

  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ============================================================================
 *  THREE.js 씬 / 렌더러 / 포스트프로세싱
 * ==========================================================================*/

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 6, 18);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000110);
document.body.appendChild(renderer.domElement);

// 🔧 포스트프로세싱
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bokehParams = {
  focus: 0.0,
  aperture: 0.0,
  maxblur: 0.0,
  width: window.innerWidth,
  height: window.innerHeight,
};
const bokehPass = new BokehPass(scene, camera, bokehParams);
composer.addPass(bokehPass);

// 트리 루트 그룹
const treeGroup = new THREE.Group();
scene.add(treeGroup);

/* ============================================================================
 *  바닥
 * ==========================================================================*/

const groundGeo = new THREE.CircleGeometry(18, 64);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x000110,
  metalness: 0.2,
  roughness: 0.9,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

/* ============================================================================
 *  조명
 * ==========================================================================*/

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x223355, 0.4);
hemiLight.position.set(0, 1, 0);
scene.add(hemiLight);

const spotLight = new THREE.SpotLight(
  0xffffff,
  4.0,
  60,
  Math.PI / 2.5,
  1.0,
  4.0
);
spotLight.castShadow = true;
spotLight.shadow.mapSize.set(1024, 1024);
spotLight.shadow.camera.near = 5;
spotLight.shadow.camera.far = 60;
spotLight.shadow.bias = -0.0001;
spotLight.shadow.normalBias = 0.01;
spotLight.position.set(0, 20, 0);
spotLight.target.position.set(0, 10, 0);
scene.add(spotLight);
scene.add(spotLight.target);

/* ============================================================================
 *  트리 & 레이어 셰이딩
 * ==========================================================================*/

const treeHeight = 9;
const treeRadius = 3.6;
const TREE_CENTER_Y = 0.75 + treeHeight / 2;

const tree = new THREE.Object3D();
tree.position.y = TREE_CENTER_Y;
treeGroup.add(tree);

const star = new THREE.Object3D();
star.position.y = TREE_CENTER_Y + treeHeight / 2 + 0.8;
treeGroup.add(star);

const treeLayerMaterials = {
  star: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 1,
    roughness: 0.4,
    emissive: 0xffb60c,
    emissiveIntensity: 0.4,
  }),
  foliage: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.2,
    roughness: 0.5,
  }),
  trunk: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.4,
    roughness: 0.7,
  }),
  other: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.3,
    roughness: 0.4,
  }),
};
window.treeLayerMaterials = treeLayerMaterials;

const loader = new GLTFLoader();
let treeModel = null;

loader.load(
  "source/christmas-tree.glb",
  (gltf) => {
    treeModel = gltf.scene;
    treeModel.position.set(0, 0, 0);
    treeModel.scale.set(0.7, 0.7, 0.7);
    treeGroup.add(treeModel);

    applyLayerShading(treeModel);
    createTreeBulbs();
  },
  undefined,
  (error) => {
    console.error("트리 모델 로드 실패:", error);
  }
);

function getLayerIdFromHierarchy(obj) {
  let node = obj;
  while (node) {
    if (node.name && node.name.match(/^\d{2}$/)) {
      return node.name;
    }
    node = node.parent;
  }
  return null;
}

function applyLayerShading(root) {
  const greenTop = new THREE.Color(0x003937);
  const greenBottom = new THREE.Color(0x3fac00);

  const brownTop = new THREE.Color(0x5f4000);
  const brownBottom = new THREE.Color(0x2b0800);

  const starColor = new THREE.Color(0xffb60c);

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;

    const layerId = getLayerIdFromHierarchy(obj);
    if (!layerId) return;

    let geo = obj.geometry.clone();
    geo = geo.toNonIndexed();

    const pos = geo.attributes.position;
    const vertexCount = pos.count;

    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const height = maxY - minY || 1;

    const colors = new Float32Array(vertexCount * 3);
    const color = new THREE.Color();

    for (let i = 0; i < vertexCount; i++) {
      const y = pos.getY(i);
      const tBottom = (y - minY) / height;

      if (layerId === "01") {
        color.copy(starColor);
      } else if (Number(layerId) >= 2 && Number(layerId) <= 7) {
        color.copy(greenBottom).lerp(greenTop, tBottom);
      } else if (layerId === "08") {
        color.copy(brownBottom).lerp(brownTop, tBottom);
      } else {
        color.set(0xffffff);
      }

      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    obj.geometry = geo;

    let matKey = "other";
    if (layerId === "01") {
      matKey = "star";
    } else if (Number(layerId) >= 2 && Number(layerId) <= 7) {
      matKey = "foliage";
    } else if (layerId === "08") {
      matKey = "trunk";
    }

    const mat = treeLayerMaterials[matKey];

    if (obj.material && obj.material.transparent) {
      mat.transparent = true;
      mat.opacity = obj.material.opacity;
    }

    obj.material = mat;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

/* ============================================================================
 *  트리 주변 도는 라이트들
 * ==========================================================================*/

const LIGHT_COUNT = 15;
const ORBIT_INNER_RADIUS = 5;
const ORBIT_OUTER_RADIUS = 9;

const lightSphereGeo = new THREE.SphereGeometry(0.02, 10, 10);
const movingLights = [];
const tmpColor = new THREE.Color();

for (let i = 0; i < LIGHT_COUNT; i++) {
  const hue = Math.random();
  tmpColor.setHSL(hue, 0.85, 0.6);

  const light = new THREE.PointLight(tmpColor.clone(), 2.0, 10);

  const radius = THREE.MathUtils.lerp(
    ORBIT_INNER_RADIUS,
    ORBIT_OUTER_RADIUS,
    Math.random()
  );
  const angle = Math.random() * Math.PI * 2;
  const height = 3.5 + Math.random() * 3.0;

  light.userData.radius = radius;
  light.userData.baseAngle = angle;
  light.userData.height = height;
  light.userData.speed = 0.4 + Math.random() * 0.4;
  light.userData.offset = Math.random() * Math.PI * 2;

  light.position.set(
    Math.cos(angle) * radius,
    height,
    Math.sin(angle) * radius
  );
  scene.add(light);

  const sphereMat = new THREE.MeshStandardMaterial({
    color: tmpColor.clone(),
    emissive: tmpColor.clone(),
    emissiveIntensity: 0.8,
    metalness: 0.0,
    roughness: 0.3,
    toneMapped: false,
  });
  const sphere = new THREE.Mesh(lightSphereGeo, sphereMat);
  sphere.position.copy(light.position);
  sphere.frustumCulled = false;
  scene.add(sphere);

  const glowMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: tmpColor.clone(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  const glow = new THREE.Sprite(glowMat);
  glow.position.copy(light.position);
  const glowSize = 0.9;
  glow.scale.set(glowSize, glowSize, 1);
  scene.add(glow);

  movingLights.push({ light, sphere, glow });
}

/* ============================================================================
 *  눈 파티클
 * ==========================================================================*/

const snowCount = 600;
const snowGeo = new THREE.BufferGeometry();
const snowPositions = new Float32Array(snowCount * 3);
for (let i = 0; i < snowCount; i++) {
  snowPositions[i * 3 + 0] = (Math.random() - 0.5) * 40;
  snowPositions[i * 3 + 1] = Math.random() * 20 + 2;
  snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
}
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));

const snowTexture = createSnowParticleTexture();
const snowMat = new THREE.PointsMaterial({
  map: snowTexture,
  color: 0xffffff,
  size: 0.14,
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  sizeAttenuation: true,
});
const snow = new THREE.Points(snowGeo, snowMat);
scene.add(snow);

/* ============================================================================
 *  트리에 이미지(소원 카드) 추가 - 중력 펜듈럼
 * ==========================================================================*/

function getRandomPositionOnTree() {
  const yMin = tree.position.y - treeHeight / 2 + 0.5;
  const yMax = tree.position.y + treeHeight / 2 - 0.5;
  const y = yMin + Math.random() * (yMax - yMin);
  const normalizedHeight =
    (y - (tree.position.y - treeHeight / 2)) / treeHeight;
  const radiusAtY = treeRadius * (1 - normalizedHeight) + 0.2;

  const angle = Math.random() * Math.PI * 2;
  const x = Math.cos(angle) * radiusAtY;
  const z = Math.sin(angle) * radiusAtY;

  return new THREE.Vector3(x, y, z);
}

function addImageToTree(docId, data) {
  const texLoader = new THREE.TextureLoader();
  texLoader.load(
    data.url,
    (texture) => {
      const aspect = texture.image.width / texture.image.height;
      const baseHeight = 1.0;
      const width = baseHeight * aspect;
      const height = baseHeight;

      const geo = new THREE.PlaneGeometry(width, height);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(geo, mat);

      const pos = getRandomPositionOnTree();

      const hanger = new THREE.Object3D();
      hanger.position.copy(pos);
      treeGroup.add(hanger);

      const hangLength = height * 0.5;
      plane.position.set(0, -hangLength, 0);
      hanger.add(plane);

      const worldPos = new THREE.Vector3();
      plane.getWorldPosition(worldPos);

      const lookTarget = new THREE.Vector3(0, worldPos.y, 0);
      plane.lookAt(lookTarget);
      plane.rotateY(Math.PI);

      imageMeshes.push(plane);
      meshToData.set(plane, { ...data, id: docId });

      const radial = new THREE.Vector3(pos.x, 0, pos.z).normalize();
      const swingAxis = radial.clone().normalize();

      hangingObjects.push({
        hanger,
        axis: swingAxis,
        angle: 0,
        vel: 0,
        stiffness: 40,
        damping: 5,
      });
    },
    undefined,
    (err) => console.error("텍스처 로드 오류", err)
  );
}

/* ============================================================================
 *  트리 표면 전구
 * ==========================================================================*/

const TREE_BULB_COUNT = 30;
const treeBulbs = [];

function createTreeBulbs() {
  for (let i = 0; i < TREE_BULB_COUNT; i++) {
    const hue = Math.random();
    const color = new THREE.Color();
    color.setHSL(hue, 1, 0.6);

    const mat = new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });

    const sprite = new THREE.Sprite(mat);

    const pos = getRandomPositionOnTree();
    const dirFromCenter = new THREE.Vector3(pos.x, 0, pos.z).normalize();
    pos.x += dirFromCenter.x * 0;
    pos.z += dirFromCenter.z * 0;

    sprite.position.copy(pos);

    const scale = 0.35 + Math.random() * 1.6;
    sprite.scale.set(scale, scale, 1);

    treeGroup.add(sprite);

    treeBulbs.push({
      sprite,
      flickerOffset: Math.random() * Math.PI * 2,
    });
  }
}

/* ============================================================================
 *  Firestore 실시간 구독
 * ==========================================================================*/

const q = query(imagesCol, orderBy("createdAt", "asc"));
onSnapshot(q, (snapshot) => {
  lastSnapshot = snapshot;

  snapshot.docs.forEach((docSnap) => {
    const id = docSnap.id;
    if (shownImageIds.has(id)) return;
    shownImageIds.add(id);

    const data = docSnap.data();
    if (data.url) addImageToTree(id, data);
  });

  renderMyWishes();
});

/* ============================================================================
 *  이미지 압축 & 업로드
 * ==========================================================================*/

function compressImage(file) {
  const MAX_WIDTH = 1920;
  const MAX_HEIGHT = 1920;
  const MAX_MB = 1.5;

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB <= MAX_MB) return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = reject;
    img.onerror = reject;

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      const widthRatio = MAX_WIDTH / width;
      const heightRatio = MAX_HEIGHT / height;
      const ratio = Math.min(widthRatio, heightRatio, 1);

      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("이미지 압축 실패"));
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.\w+$/, ".jpg"),
            { type: "image/jpeg" }
          );
          resolve(compressedFile);
        },
        "image/jpeg",
        0.8
      );
    };

    reader.readAsDataURL(file);
  });
}

async function uploadAndRegister(file) {
  if (!currentUser) {
    alert("먼저 로그인 해주세요!");
    return;
  }

  const processedFile = await compressImage(file);

  const filePath = `uploads/${currentUser.uid}/${Date.now()}_${processedFile.name}`;
  const storageRef = ref(storage, filePath);
  const snapshot = await uploadBytes(storageRef, processedFile);
  const downloadURL = await getDownloadURL(snapshot.ref);

  const wishName = (wishNameInput.value || "").trim();
  const wishText = (wishTextInput.value || "").trim();

  await addDoc(imagesCol, {
    url: downloadURL,
    path: filePath,
    ownerUid: currentUser.uid,
    ownerEmail: currentUser.email,
    originalName: processedFile.name,
    wishName,
    wishText,
    createdAt: serverTimestamp(),
  });
}

wishSubmitBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("먼저 로그인 해주세요.");
    return;
  }
  const file = wishFileInput.files[0];
  if (!file) {
    alert("이미지를 선택해 주세요.");
    return;
  }
  try {
    await uploadAndRegister(file);
    closeWishModal();
  } catch (err) {
    console.error("업로드 실패", err);
    alert("업로드 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
  }
});

/* ============================================================================
 *  내 소원 리스트 렌더링
 * ==========================================================================*/

function renderMyWishes() {
  if (!myWishList) return;
  myWishList.innerHTML = "";

  if (!currentUser) {
    myWishList.innerHTML =
      '<div class="wish-list-empty">로그인 후 내 소원을 볼 수 있습니다.</div>';
    return;
  }

  if (!lastSnapshot) {
    myWishList.innerHTML =
      '<div class="wish-list-empty">불러오는 중...</div>';
    return;
  }

  const myDocs = lastSnapshot.docs.filter(
    (docSnap) => docSnap.data().ownerUid === currentUser.uid
  );

  if (!myDocs.length) {
    myWishList.innerHTML =
      '<div class="wish-list-empty">아직 올린 소원이 없습니다.</div>';
    return;
  }

  myDocs
    .slice()
    .reverse()
    .forEach((docSnap) => {
      const data = docSnap.data();

      const row = document.createElement("div");
      row.className = "wish-row";

      const thumb = document.createElement("div");
      thumb.className = "wish-thumb";
      if (data.url) thumb.style.backgroundImage = `url(${data.url})`;

      const main = document.createElement("div");
      main.className = "wish-main";

      const textSpan = document.createElement("div");
      textSpan.className = "wish-text";
      const text =
        (data.wishText && data.wishText.trim()) ||
        "소원 내용이 비어 있어요.";
      textSpan.textContent = text;

      const dateSpan = document.createElement("div");
      dateSpan.className = "wish-date";
      dateSpan.textContent = formatDate(data.createdAt);

      main.appendChild(textSpan);
      main.appendChild(dateSpan);

      const delBtn = document.createElement("button");
      delBtn.className = "wish-delete";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () =>
        handleDeleteImage(docSnap.id, data)
      );

      row.appendChild(thumb);
      row.appendChild(main);
      row.appendChild(delBtn);

      myWishList.appendChild(row);
    });
}

async function handleDeleteImage(docId, data) {
  if (!currentUser || data.ownerUid !== currentUser.uid) {
    alert("내가 올린 소원만 삭제할 수 있습니다.");
    return;
  }

  const ok = confirm("정말 이 소원을 삭제할까요?");
  if (!ok) return;

  try {
    if (data.path) {
      const fileRef = ref(storage, data.path);
      await deleteObject(fileRef);
    }
    await deleteDoc(doc(imagesCol, docId));
  } catch (err) {
    console.error("삭제 실패", err);
    alert("삭제 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
  }
}

/* ============================================================================
 *  트리 이미지 클릭 → 편지 패널
 * ==========================================================================*/

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener("click", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  pointer.set(x, y);
  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObjects(imageMeshes, false);
  if (intersects.length === 0) return;

  const mesh = intersects[0].object;
  const data = meshToData.get(mesh);
  if (!data) return;

  showWishPanel(data);
});

function showWishPanel(data) {
  const sender =
    (data.wishName && data.wishName.trim()) ||
    data.ownerEmail ||
    "익명";

  const text =
    (data.wishText && data.wishText.trim()) ||
    "소원이 비어 있어요. 마음속으로 빌었나 봐요 ✨";

  wishSenderEl.textContent = sender;
  wishContentEl.textContent = text;
  wishPanel.classList.remove("hidden");
}

function closeWishPanel() {
  wishPanel.classList.add("hidden");
}

wishCloseBtn.addEventListener("click", closeWishPanel);

/* ============================================================================
 *  입력 상태 (마우스 / 터치 / 자이로)
 * ==========================================================================*/

// ▶ 드래그 상태
let isDragging = false;
let prevX = 0;
const dragRotateSpeed = 0.005; // 드래그 감도 (값 키우면 더 빨리 돈다)

// ▶ 카메라 패럴럭스 입력 (마우스 / 자이로 공용)
let mouseX = 0;
let mouseY = 0;
let gyroX = 0;
let gyroY = 0;
let useGyro = false; // true면 자이로값, false면 마우스값으로 패럴럭스

// ▶ 트리 회전(자동 회전 + 드래그 관성)
let baseRotationY = 0;
let spinVelocityY = 0;

// 🔧 자이로 기준점(중심 자세)용 변수
let gyroBaseBeta = 0;    // 앞뒤 기준값
let gyroBaseGamma = 0;   // 좌우 기준값
let gyroCalibrated = false; // 처음 기준이 세팅되었는지 여부

// ▶ 모바일 판별
const isMobile =
  "ontouchstart" in window ||
  (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

// 공용 드래그 시작
function beginDrag(clientX) {
  isDragging = true;
  prevX = clientX;
  spinVelocityY = 0; // 드래그 시작 시 관성 초기화
}

// 공용 드래그 이동
function moveDrag(clientX) {
  const deltaX = clientX - prevX;
  prevX = clientX;

  const deltaRot = deltaX * dragRotateSpeed;

  // 트리 Y축 회전
  treeGroup.rotation.y += deltaRot;
  baseRotationY = treeGroup.rotation.y;
  spinVelocityY = deltaRot;

  // 카드들에도 회전 관성 전달
  const impulse = deltaRot * 8.0;
  for (const ho of hangingObjects) {
    ho.vel += impulse;
  }
}

// ======================
//  데스크탑: 마우스
// ======================
renderer.domElement.addEventListener("mousedown", (event) => {
  beginDrag(event.clientX);
});

window.addEventListener("mouseup", () => {
  isDragging = false;
});

window.addEventListener("mousemove", (event) => {
  // ✅ 드래그 여부와 상관없이 항상 패럴럭스용 마우스 좌표 업데이트
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = (event.clientY / window.innerHeight) * 2 - 1;

  // 드래그 중일 때만 트리 회전 로직 실행
  if (isDragging) {
    moveDrag(event.clientX);
  }
});


// ======================
//  모바일: 터치
// ======================
renderer.domElement.addEventListener(
  "touchstart",
  (event) => {
    if (!isMobile) return;
    const touch = event.touches[0];
    if (!touch) return;
    beginDrag(touch.clientX);
  },
  { passive: true }
);

window.addEventListener(
  "touchmove",
  (event) => {
    if (!isMobile || !isDragging) return;
    const touch = event.touches[0];
    if (!touch) return;
    moveDrag(touch.clientX);
  },
  { passive: true }
);

window.addEventListener(
  "touchend",
  () => {
    if (!isMobile) return;
    isDragging = false;
  },
  { passive: true }
);

/* ============================================================================
 *  자이로(기울기 센서) 세팅
 * ==========================================================================*/

// 📌 자이로 입력 → 기준점이 서서히 따라오는 버전
function handleOrientation(event) {
  const { beta, gamma } = event; // beta: 앞/뒤, gamma: 좌/우
  if (beta == null || gamma == null) return;

  // 1) 처음 한 번: "지금 자세"를 기준으로 잡기
  if (!gyroCalibrated) {
    gyroBaseBeta = beta;
    gyroBaseGamma = gamma;
    gyroCalibrated = true;
    console.log("✅ Gyro first calibrate:", gyroBaseBeta, gyroBaseGamma);
  }

  // 2) 현재 값과 기준값의 차이
  let diffGamma = gamma - gyroBaseGamma; // 좌우
  let diffBeta  = beta  - gyroBaseBeta;  // 상하

  // 3) 기준값을 천천히 현재 값 쪽으로 따라오게 해서
  //    오래 들고 있으면 그 자세가 자연스럽게 중심이 되도록 만들기
  //
  //   neutralFollowStrength:
  //     0.01  근처  → 기준 거의 고정
  //     0.02~0.03 → 조금씩 손에 적응 (추천 시작값)
  //     0.05 이상 → 너무 빨리 따라와서 효과 줄어듦
  const neutralFollowStrength = 0.02;
  gyroBaseGamma += diffGamma * neutralFollowStrength;
  gyroBaseBeta  += diffBeta  * neutralFollowStrength;

  // 4) 업데이트된 기준 기준으로 다시 차이 계산
  diffGamma = gamma - gyroBaseGamma;
  diffBeta  = beta  - gyroBaseBeta;

  // 5) 감도 설정 (나누는 값이 작을수록 더 예민해짐)
  const nxRaw = THREE.MathUtils.clamp(diffGamma / 3, -1, 1); // 좌우
  const nyRaw = THREE.MathUtils.clamp(diffBeta  / 1, -1, 1); // 상하

  // 6) 원하는 방향(부호)로 뒤집기
  //   -nx, -ny로 하면 "폰 기울이는 방향과 반대로" 카메라가 움직이는 느낌
  //    (어색하면 여기 부호만 바꾸면 됨)
  const targetX = -nxRaw;
  const targetY = -nyRaw;

  // 7) 부드럽게 보간해서 튐 방지
  //    smooth: 0.1 → 조금 뻣뻣, 0.2~0.3 → 꽤 부드러움
  const smooth = 0.03;
  gyroX = gyroX * (1 - smooth) + targetX * smooth;
  gyroY = gyroY * (1 - smooth) + targetY * smooth;
}

// 📌 자이로 권한 요청 + 리스너 등록 버튼
function setupGyroButton() {
  const DOE = window.DeviceOrientationEvent;
  if (!DOE) {
    console.log("👉 이 브라우저는 DeviceOrientationEvent 를 지원하지 않음");
    return;
  }

  // 🔘 화면 왼쪽 위에 '기울여서 보기' 버튼 하나 띄우기
  const btn = document.createElement("button");
  btn.textContent = "📱 기울여서 보기";
  btn.style.position = "fixed";
  btn.style.top = "16px";
  btn.style.left = "16px";
  btn.style.zIndex = "9999";
  btn.style.padding = "8px 12px";
  btn.style.borderRadius = "20px";
  btn.style.border = "none";
  btn.style.fontSize = "12px";
  btn.style.background = "rgba(0,0,0,0.6)";
  btn.style.color = "#fff";
  btn.style.backdropFilter = "blur(10px)";
  btn.style.cursor = "pointer";
  document.body.appendChild(btn);

  btn.addEventListener("click", async () => {
    try {
      // 🧪 옛날 iOS 스타일: requestPermission 존재
      if (typeof DOE.requestPermission === "function") {
        const state = await DOE.requestPermission();
        console.log("gyro permission:", state);
        if (state !== "granted") {
          alert(
            "자이로 접근이 거부되었습니다.\n설정 > Safari > 모션 및 방향 접근을 확인해 주세요."
          );
          return;
        }
      }
      // ✅ 여기까지 왔으면 리스너 등록 + 자이로 사용 ON
      useGyro = true;
      window.addEventListener("deviceorientation", handleOrientation, true);

      btn.textContent = "📱 기울여서 보기 ON";
      btn.disabled = true;
      btn.style.opacity = "0.6";
    } catch (err) {
      console.error("gyro permission error", err);
      alert("자이로 권한 요청 중 오류가 발생했습니다. 콘솔을 확인해 주세요.");
    }
  });
}

// 모바일에서만 버튼 생성
if (isMobile) {
  setupGyroButton();
}



/* ============================================================================
 *  리사이즈 & 줌
 * ==========================================================================*/

renderer.domElement.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const zoomSpeed = 0.002;
    const delta = event.deltaY * zoomSpeed;
    const minDist = 8;
    const maxDist = 25;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const newPos = camera.position.clone().addScaledVector(dir, delta * 20);
    const distance = newPos.length();

    if (distance > minDist && distance < maxDist) {
      camera.position.copy(newPos);
    }
  },
  { passive: false }
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bokehPass.setSize(window.innerWidth, window.innerHeight);
});

/* ============================================================================
 *  애니메이션 루프
 * ==========================================================================*/

let lastTime = 0;

// 🔧 PC / 모바일 각각 다른 패럴럭스 설정
const PARALLAX_DESKTOP = {
  x: 12,   // 좌우 (PC)
  y: 6,    // 상하 (PC)
  follow: 0.05, // 카메라 따라가는 속도 (PC)
};

const PARALLAX_MOBILE = {
  x: 16,   // 좌우 (모바일) → 조금 더 과장
  y: 24,    // 상하 (모바일)
  follow: 1, // 모바일은 살짝 더 빠르게 따라가게
};


function animate(time) {
  requestAnimationFrame(animate);
  const delta = (time - lastTime) / 1000;
  lastTime = time;

  // 자동 회전 + 드래그 관성
  if (!isDragging) {
    const autoSpeed = 0.2;
    baseRotationY += autoSpeed * delta;
    baseRotationY += spinVelocityY;
    spinVelocityY *= 0.5;

    const targetXRot = 0;
    const targetYRot = baseRotationY;

    treeGroup.rotation.x += (targetXRot - treeGroup.rotation.x) * 0.1;
    treeGroup.rotation.y += (targetYRot - treeGroup.rotation.y) * 0.1;
  }

  // ▶ 입력 값을 자이로 or 마우스로 선택
  const inputX = useGyro ? gyroX : mouseX;
  const inputY = useGyro ? gyroY : mouseY;

  // ✅ 여기서 디바이스별 패럴럭스 설정 선택
  const p = isMobile ? PARALLAX_MOBILE : PARALLAX_DESKTOP;

  const baseCamY = 6;
  const targetCamX = inputX * -p.x;             // 좌우 세기
  const targetCamY = baseCamY + inputY * p.y;   // 상하 세기

  camera.position.x += (targetCamX - camera.position.x) * p.follow;
  camera.position.y += (targetCamY - camera.position.y) * p.follow;
  
  // 별 회전
  star.rotation.y -= delta * 2;

  // 라이트 궤도
  const t = time * 0.001;
  for (let i = 0; i < movingLights.length; i++) {
    const { light, sphere, glow } = movingLights[i];

    const radius = light.userData.radius;
    const baseAngle = light.userData.baseAngle;
    const height = light.userData.height;
    const speed = light.userData.speed;
    const offset = light.userData.offset;

    const angle = baseAngle + t * speed;

    light.position.x = Math.cos(angle) * radius;
    light.position.z = Math.sin(angle) * radius;
    light.position.y = height + Math.sin(t * 0.9 + offset) * 0.4;

    sphere.position.copy(light.position);
    glow.position.copy(light.position);
  }

  // 🌊 가지에 매달린 카드 스윙
  for (const ho of hangingObjects) {
    const k = ho.stiffness;
    const d = ho.damping;

    ho.vel += (-k * ho.angle) * delta;   // 복원력
    ho.vel -= ho.vel * d * delta;        // 마찰
    ho.angle += ho.vel * delta;          // 적분

    ho.hanger.quaternion.setFromAxisAngle(ho.axis, -ho.angle);
  }

  // 🌟 트리 표면 전구 깜빡임
  const t2 = time * 0.001;
  for (let i = 0; i < treeBulbs.length; i++) {
    const bulb = treeBulbs[i];
    const sprite = bulb.sprite;
    const pulse = 0.5 + 0.5 * Math.sin(t2 * 10.0 + bulb.flickerOffset);
    sprite.material.opacity = pulse;
  }

  // 눈 떨어지는 애니메이션
  const pos = snowGeo.attributes.position;
  for (let i = 0; i < snowCount; i++) {
    let y = pos.getY(i);
    y -= delta * (0.5 + Math.random() * 0.3);
    if (y < 0.5) {
      y = Math.random() * 20 + 5;
    }
    pos.setY(i, y);
  }
  pos.needsUpdate = true;

  camera.lookAt(0, tree.position.y, 0);
  composer.render();
}

animate(0);

/* ============================================================================
 *  scene export
 * ==========================================================================*/

window.exportScene = function () {
  const json = scene.toJSON();
  const str = JSON.stringify(json);
  const blob = new Blob([str], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "dfy-christmas-scene.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log("✅ scene JSON 내보내기 완료: dfy-christmas-scene.json");
};
