// ===== three.js & GLTFLoader (importmap 버전) =====
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
  setDoc,
  getDoc,
  runTransaction,
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
const wishNameField = document.querySelector(".wish-name-field");
const wishPrivacyToggle = document.getElementById("wishPrivacyToggle");

// 편지 패널
const wishPanel = document.getElementById("wishPanel");
const wishSenderEl = document.getElementById("wishSender");
const wishContentEl = document.getElementById("wishContent");
const wishCloseBtn = document.getElementById("wishCloseBtn");
const wishViewImageEl = document.getElementById("wishViewImage");
// 작성용/열람용 편지지
const wishLetter = document.querySelector(".wish-letter");
const wishViewLetter = document.querySelector(".wish-view-letter");

// ❤️ 좋아요 버튼 / 카운트
const wishLikeBtn = document.getElementById("wishLikeBtn");
const wishLikeCountEl = document.getElementById("wishLikeCount");

// 드롭존
const dropzone = document.getElementById("wishImageDropzone");
const dropPreview = dropzone
  ? dropzone.querySelector(".wish-image-preview")
  : null;

// 폴라로이드 프레임 / 토글 버튼
const polaroidFrameBtn = document.getElementById("polaroidFrameBtn");

// 작성 영역 안의 폴라로이드 이미지
const frameOverlayWrite = document.querySelector(
  "#wishDropzoneTransform .wish-image-frame"
);

// 보기(소원 패널) 안의 폴라로이드 이미지
const frameOverlayView = document.querySelector(
  "#wishViewImageTransform .wish-image-frame"
);


/* ============================================================================
 *  소원 이름 인풋: 폭 자동 리사이즈 + 익명 빗금 길이 연동
 * ==========================================================================*/

const wishNameSizer = document.createElement("span");
wishNameSizer.style.position = "fixed";
wishNameSizer.style.left = "-9999px";
wishNameSizer.style.top = "-9999px";
wishNameSizer.style.visibility = "hidden";
wishNameSizer.style.whiteSpace = "pre";
document.body.appendChild(wishNameSizer);

let wishNameMinWidth = 0;

function initWishNameMinWidth() {
  if (!wishNameInput) return;

  const style = getComputedStyle(wishNameInput);
  wishNameSizer.style.font = style.font;
  wishNameSizer.style.letterSpacing = style.letterSpacing;

  wishNameSizer.textContent = "가가가";
  wishNameMinWidth = wishNameSizer.getBoundingClientRect().width;
}

function updateAnonLineWidth() {
  if (!wishNameField || !wishNameInput) return;
  const w = wishNameInput.offsetWidth || 0;
  wishNameField.style.setProperty("--anon-line-width", w + "px");
}

function resizeWishNameInput() {
  if (!wishNameInput) return;

  const style = getComputedStyle(wishNameInput);
  wishNameSizer.style.font = style.font;
  wishNameSizer.style.letterSpacing = style.letterSpacing;

  let displayText;

  if (wishNameInput.value && wishNameInput.value.length > 0) {
    displayText = wishNameInput.value;
  } else {
    displayText = wishNameInput.placeholder || " ";
  }

  wishNameSizer.textContent = displayText;

  const width = wishNameSizer.getBoundingClientRect().width;
  const baseMin = wishNameMinWidth || width;
  const finalWidth = Math.max(width, baseMin);

  wishNameInput.style.width = finalWidth + "px";

  updateAnonLineWidth();
}

if (wishNameInput) {
  initWishNameMinWidth();
  resizeWishNameInput();
  wishNameInput.addEventListener("input", resizeWishNameInput);
}

/* ============================================================================
 *  상태
 * ==========================================================================*/

let currentUser = null;
let lastSnapshot = null;
const shownImageIds = new Set();

// 현재 열려 있는 소원 문서 id (좋아요/뷰용)
let currentOpenedWishId = null;

// 익명 여부 (토글 버튼으로 관리)
let isAnonymousState = false;

// 폴라로이드 프레임 사용 여부 (작성 시 기준)
let isPolaroidOn = true;


// 트리 이미지 mesh → 데이터 매핑 (클릭용)
const imageMeshes = [];
const meshToData = new Map();

// 가지에 매달린 카드 피직스용
const hangingObjects = [];

// 트리에 걸린 카드 위치들 (겹침 방지용)
const cardPositions = [];


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

// DB 데이터 기준 발신자 텍스트
function formatWishSender(data) {
  if (data.isAnonymous) return "비밀 소원";

  const raw = (data.wishName || "").trim();

  if (!raw) {
    return data.ownerEmail || "익명";
  }

  if (raw.endsWith("의 소원")) {
    return raw;
  }

  return `${raw}의 소원`;
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
 *  소원 작성 – 이미지 드롭존/클릭 업로드
 * ==========================================================================*/

if (dropzone) {
  dropzone.addEventListener("click", () => {
    if (!wishFileInput) return;
    wishFileInput.click();
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const dt = new DataTransfer();
    dt.items.add(file);
    wishFileInput.files = dt.files;

    setDropzoneFile(file);
  });
}

if (wishFileInput) {
  wishFileInput.addEventListener("change", () => {
    const file = wishFileInput.files[0];
    if (!file) return;
    setDropzoneFile(file);
  });
}

function setDropzoneFile(file) {
  if (!file || !dropPreview || !dropzone) return;

  const url = URL.createObjectURL(file);
  dropPreview.style.backgroundImage = `url(${url})`;
  dropzone.classList.add("has-image");
}

function updatePolaroidWriteUI() {
  // 작성 모달 안 프레임 숨기기 / 보이기
  if (frameOverlayWrite) {
    frameOverlayWrite.classList.toggle("frame-off", !isPolaroidOn);
  }

  // 버튼 텍스트도 상태에 따라 변경 (원하는 문구로 바꿔도 됨)
  if (polaroidFrameBtn) {
    polaroidFrameBtn.textContent = isPolaroidOn ? "프레임 끄기" : "프레임 켜기";
  }
}

if (polaroidFrameBtn) {
  polaroidFrameBtn.addEventListener("click", () => {
    isPolaroidOn = !isPolaroidOn;
    updatePolaroidWriteUI();
  });
}


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
 *  소원 업로드 모달 (열기 / 닫기 / 이름 자동완성 / 익명 스타일)
 * ==========================================================================*/

function setPrivacyUI(isAnonymous) {
  isAnonymousState = isAnonymous;

  if (!wishNameField) return;

  wishNameField.classList.toggle("is-anonymous", isAnonymous);

  if (wishPrivacyToggle) {
    wishPrivacyToggle.textContent = isAnonymous ? "별명공개" : "비밀소원";
  }

  updateAnonLineWidth();
}

if (wishPrivacyToggle && wishNameField) {
  wishPrivacyToggle.addEventListener("click", () => {
    setPrivacyUI(!isAnonymousState);
  });
}

function openWishModal() {
  if (!currentUser) {
    alert("먼저 사내 구글 계정으로 로그인 해주세요.");
    return;
  }

  const rawName =
    (currentUser.displayName && currentUser.displayName.trim()) ||
    (currentUser.email ? currentUser.email.split("@")[0] : "");

  if (wishNameInput) {
    wishNameInput.disabled = false;
    wishNameInput.classList.remove("wish-input-disabled");
    wishNameInput.value = rawName || "";
    resizeWishNameInput();
  }

  setPrivacyUI(false);

  // ✅ 새 소원 작성할 땐 기본으로 프레임 ON
  isPolaroidOn = false;
  updatePolaroidWriteUI();

  if (wishTextInput) wishTextInput.value = "";
  if (wishFileInput) wishFileInput.value = "";
  if (dropzone) dropzone.classList.remove("has-image");
  if (dropPreview) dropPreview.style.backgroundImage = "";


  if (wishModal) {
    wishModal.classList.remove("hidden");
  }

  if (wishLetter) {
    wishLetter.classList.remove("is-closing");
    requestAnimationFrame(() => {
      wishLetter.classList.add("is-open");
    });
  }
}

function closeWishModal() {
  if (!wishModal) return;

  const finishClose = () => {
    wishModal.classList.add("hidden");

    if (wishTextInput) wishTextInput.value = "";
    if (wishFileInput) wishFileInput.value = "";
    if (dropzone) dropzone.classList.remove("has-image");
    if (dropPreview) dropPreview.style.backgroundImage = "";

    if (wishLetter) {
      wishLetter.classList.remove("is-closing");
      wishLetter.classList.remove("is-open");
    }
  };

  if (!wishLetter) {
    finishClose();
    return;
  }

  wishLetter.classList.remove("is-open");
  wishLetter.classList.add("is-closing");

  const onTransitionEnd = (e) => {
    if (e.target !== wishLetter) return;
    wishLetter.removeEventListener("transitionend", onTransitionEnd);
    finishClose();
  };

  wishLetter.addEventListener("transitionend", onTransitionEnd);
}

if (openWishModalBtn) {
  openWishModalBtn.addEventListener("click", openWishModal);
}
if (wishCancelBtn) {
  wishCancelBtn.addEventListener("click", closeWishModal);
}
if (wishModal) {
  wishModal.addEventListener("click", (e) => {
    if (
      e.target === wishModal ||
      e.target.classList.contains("modal-backdrop")
    ) {
      closeWishModal();
    }
  });
}

/* ============================================================================
 *  캔버스 텍스처 (글로우 / 눈 입자)
 * ==========================================================================*/

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
 *  THREE.js 씬 / 렌더러 + 텍스처 로더 & 컬러맵
 * ==========================================================================*/

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  32,
  window.innerWidth / window.innerHeight,
  1,
  100
);
camera.position.set(0, 12, 24);

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

// 🔄 전역 텍스처 로더
const textureLoader = new THREE.TextureLoader();

// ▸ 트리 노말맵 / 눈 노말맵
const treeNormalMap = textureLoader.load(
  "source/christmas-tree_BumpNormals.png"
);

// ▸ 폴라로이드 프레임 텍스처 (트리용)
const polaroidTexture = textureLoader.load("source/polaroid.png");
polaroidTexture.colorSpace = THREE.SRGBColorSpace;
polaroidTexture.flipY = true;

const POLAROID_FRAME_SCALE = 1.56; // 카드보다 조금 크게
const polaroidFrameMaterial = new THREE.MeshBasicMaterial({
  map: polaroidTexture,
  transparent: true,
  side: THREE.DoubleSide,
});

treeNormalMap.colorSpace = THREE.NoColorSpace;
treeNormalMap.flipY = false;

const treeSnowNormalMap = textureLoader.load(
  "source/christmas-tree_snow_BumpNormals.png"
);
treeSnowNormalMap.colorSpace = THREE.NoColorSpace;
treeSnowNormalMap.flipY = false;

// ▸ 월드 컬러맵
const worldColorMap = textureLoader.load("source/world_Color.png");
worldColorMap.colorSpace = THREE.SRGBColorSpace;
worldColorMap.flipY = false;

// ▸ 월드 범프맵
const worldBumpMap = textureLoader.load("source/world_Bump.png");
worldBumpMap.colorSpace = THREE.NoColorSpace;
worldBumpMap.flipY = false;

/* ============================================================================
 *  바닥 (World)
 * ==========================================================================*/

let worldModel = null;

// POST 레이어 메쉬들 & hover 상태
const postMeshes = [];
let hoveredPost = null;

function setPostHoverTarget(mesh, isHover) {
  if (!mesh) return;
  if (!mesh.userData) mesh.userData = {};
  mesh.userData.hoverTarget = isHover ? 1 : 0;
}

const worldLoader = new GLTFLoader();
worldLoader.load(
  "source/world.gltf",
  (gltf) => {
    worldModel = gltf.scene;
    worldModel.position.set(0, 0, 0);
    worldModel.scale.set(0.8, 0.8, 0.8);

    applyWorldTextures(worldModel);

    scene.add(worldModel);
    console.log("✅ world.glb 로드 완료 (컬러맵)");
  },
  undefined,
  (error) => {
    console.error("world.glb 로드 실패:", error);
  }
);

// 월드 안에서 이름에 "POST"가 들어가는 오브젝트인지 검사
function isPostMesh(obj) {
  let node = obj;
  while (node) {
    const name = (node.name || "").toLowerCase();
    if (name === "post" || name.includes("post")) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

// world.gltf 메쉬들에 컬러맵/범프 적용 + POST 전용 설정
function applyWorldTextures(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;

    // 🔶 POST 레이어
    if (isPostMesh(obj)) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xE8D9C5, // 원하는 기본 색
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0xE8D9C5,
        emissiveIntensity: 0.3,
      });

      obj.material = mat;
      obj.castShadow = true;
      obj.receiveShadow = true;

      obj.userData.basePosition = obj.position.clone();
      obj.userData.hoverState = 0;
      obj.userData.hoverTarget = 0;

      postMeshes.push(obj);
      return;
    }

    // 🌍 나머지 월드
    const mat = new THREE.MeshStandardMaterial({
      map: worldColorMap,
      bumpMap: worldBumpMap,
      bumpScale: 0.08,
      metalness: 0.5,
      roughness: 1.0,
    });

    obj.material = mat;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

/* ============================================================================
 *  조명 (환경광 + 메인 스포트라이트 + 보조)
 * ==========================================================================*/

const hemiLight = new THREE.HemisphereLight(
  0xffffff,
  0x0045cf,
  0.2
);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const spotLight = new THREE.SpotLight(
  0xffe7e9,
  1,
  50,
  Math.PI / 8,
  1,
  3
);
spotLight.castShadow = true;
spotLight.shadow.mapSize.set(1024, 1024);
spotLight.shadow.camera.near = 5;
spotLight.shadow.camera.far = 60;
spotLight.shadow.bias = -0.0001;
spotLight.shadow.normalBias = 0.01;
spotLight.position.set(0, 15, 0);
spotLight.target.position.set(0, 0, 0);
scene.add(spotLight);
scene.add(spotLight.target);

const spotLight2 = new THREE.SpotLight(
  0xffe7e9,
  2,             // ← 여긴 그냥 두고
  50,
  Math.PI / 14,
  1,
  3
);
spotLight2.castShadow = true;
spotLight2.shadow.mapSize.set(512, 512);
spotLight2.shadow.camera.near = 5;
spotLight2.shadow.camera.far = 60;
spotLight2.shadow.bias = -0.0001;
spotLight2.shadow.normalBias = 0.01;
spotLight2.position.set(-6, 18, 4);
spotLight2.target.position.set(-6, 0, 4);
scene.add(spotLight2);
scene.add(spotLight2.target);

// 🔹 기본은 어둡게 시작
spotLight2.intensity = 0.5;

// 포인트 라이트 (POST 근처)
const postLight = new THREE.PointLight(0xffea94, 1, 10);
postLight.castShadow = false;
postLight.position.set(-7, 4, 2.8);
scene.add(postLight);

// 🔹 기본 세기는 살짝만
postLight.intensity = 0.3;

// 라이트 위치 표시용 구체
const postLightMarkerGeo = new THREE.SphereGeometry(0.2, 16, 16);
const postLightMarkerMat = new THREE.MeshBasicMaterial({
  color: 0xffea94,
});
const postLightMarker = new THREE.Mesh(
  postLightMarkerGeo,
  postLightMarkerMat
);
postLight.add(postLightMarker);
postLightMarker.position.set(0, 0, 0);

/* ============================================================================
 *  트리 & 레이어 셰이딩 (Star / Tree / Trunk / Snow)
 * ==========================================================================*/

const treeHeight = 8.4;
const treeRadius = 3.6;
const TREE_CENTER_Y =1.7 + treeHeight / 2;

// 굳이 window에 올릴 필요 없이 그냥 로컬 그룹 하나 생성
const treeGroup = new THREE.Group();
scene.add(treeGroup);

const tree = new THREE.Object3D();
tree.position.y = TREE_CENTER_Y;
treeGroup.add(tree);

const star = new THREE.Object3D();
star.position.y = TREE_CENTER_Y + treeHeight / 2 + 0.8;
treeGroup.add(star);


// 디버그용 소원 영역 콘
const SHOW_WISH_CONE = false;
if (SHOW_WISH_CONE) {
  const coneGeom = new THREE.ConeGeometry(treeRadius, treeHeight, 32, 1, true);
  const coneEdges = new THREE.EdgesGeometry(coneGeom);
  const coneLines = new THREE.LineSegments(
    coneEdges,
    new THREE.LineBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 10,
    })
  );

  const wishConeHelper = new THREE.Object3D();
  wishConeHelper.position.y = TREE_CENTER_Y;
  wishConeHelper.add(coneLines);
  treeGroup.add(wishConeHelper);
}

// 레이어별 머티리얼
const treeLayerMaterials = {
  star: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 1,
    roughness: 0.4,
    emissive: 0xffb60c,
    emissiveIntensity: 0.2,
    bumpMap: treeNormalMap,
    bumpScale: 0.1,
  }),
  foliage: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.3,
    roughness: 0.5,
    bumpMap: treeNormalMap,
    bumpScale: 0.05,
  }),
  trunk: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.4,
    roughness: 0.7,
    bumpMap: treeNormalMap,
    bumpScale: 0.04,
  }),
  snow: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.1,
    roughness: 0.8,
    bumpMap: treeSnowNormalMap,
    bumpScale: 0.08,
  }),
  other: new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.3,
    roughness: 0.4,
    bumpMap: treeNormalMap,
    bumpScale: 0.05,
  }),
};
window.treeLayerMaterials = treeLayerMaterials;

const loader = new GLTFLoader();
let treeModel = null;

loader.load(
  "source/christmas-tree.gltf",
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
    const name = (node.name || "").toLowerCase();
    if (name === "star") return "Star";
    if (name === "tree") return "Tree";
    if (name === "trunk") return "Trunk";
    if (name === "snow") return "Snow";
    node = node.parent;
  }
  return null;
}

// 버텍스 컬러 그라디언트 + 레이어 컬러
function applyLayerShading(root) {
  const greenTop = new THREE.Color(0x003937);
  const greenBottom = new THREE.Color(0x3fac00);

  const brownTop = new THREE.Color(0x5f4000);
  const brownBottom = new THREE.Color(0x2b0800);

  const snowTop = new THREE.Color(0xffffff);
  const snowBottom = new THREE.Color(0xdbeafe);

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

      if (layerId === "Star") {
        color.copy(starColor);
      } else if (layerId === "Tree") {
        color.copy(greenBottom).lerp(greenTop, tBottom);
      } else if (layerId === "Trunk") {
        color.copy(brownBottom).lerp(brownTop, tBottom);
      } else if (layerId === "Snow") {
        color.copy(snowBottom).lerp(snowTop, tBottom);
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
    if (layerId === "Star") matKey = "star";
    else if (layerId === "Tree") matKey = "foliage";
    else if (layerId === "Trunk") matKey = "trunk";
    else if (layerId === "Snow") matKey = "snow";

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
 *  트리 주변 도는 라이트들 (현재 0)
 * ==========================================================================*/

const LIGHT_COUNT = 10;
const ORBIT_INNER_RADIUS = 4;
const ORBIT_OUTER_RADIUS = 9;

const lightSphereGeo = new THREE.SphereGeometry(0.02, 10, 10);
const movingLights = [];
const tmpColor = new THREE.Color();

for (let i = 0; i < LIGHT_COUNT; i++) {
  const hue = Math.random();
  tmpColor.setHSL(hue, 1, 0.6);

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
    emissiveIntensity: 0.5,
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

const snowCount = 500;
const snowGeo = new THREE.BufferGeometry();
const snowPositions = new Float32Array(snowCount * 3);
// ❗ 각 눈 파티클마다 떨어지는 속도 따로 저장
const snowVelocities = new Float32Array(snowCount);

for (let i = 0; i < snowCount; i++) {
  const i3 = i * 3;
  snowPositions[i3]     = (Math.random() - 0.5) * 40; // x
  snowPositions[i3 + 1] = Math.random() * 20 + 2;     // y
  snowPositions[i3 + 2] = (Math.random() - 0.5) * 40; // z

  // 0.5 ~ 0.8 사이 아무 값
  snowVelocities[i] = 0.5 + Math.random() * 0.3;
}
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));

const snowTexture = createSnowParticleTexture();
const snowMat = new THREE.PointsMaterial({
  map: snowTexture,
  color: 0xffffff,
  size: 0.2,
  opacity:0.7,
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
  const maxAttempts = 25;    // 최대 시도 횟수
  const minDist = 1.6;       // 카드끼리 최소 거리

  // 트리 바닥 / 꼭대기 기준
  const yBottom = tree.position.y - treeHeight / 2;
  const yTop    = tree.position.y + treeHeight / 2;

  // 🔹 높이 비율 범위 (0 = 바닥, 1 = 꼭대기)
  const minN = 0.1;   // 바닥에서 ~% 위
  const maxN = 0.78;  // 꼭대기 바로 아래

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // [minN, maxN] 사이에서 랜덤 높이 비율 선택
    const t = minN + Math.random() * (maxN - minN);
    const y = yBottom + treeHeight * t;

    // 높이에 따른 원뿔 반지름 (위로 갈수록 가늘어짐)
    const radiusAtY = treeRadius * (1 - t) + 0.2;

    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * radiusAtY;
    const z = Math.sin(angle) * radiusAtY;

    const candidate = new THREE.Vector3(x, y, z);

    // 🔹 이미 있는 카드들과 거리 체크
    let ok = true;
    for (const p of cardPositions) {
      if (candidate.distanceToSquared(p) < minDist * minDist) {
        ok = false;
        break;
      }
    }

    if (ok || attempt === maxAttempts - 1) {
      return candidate;
    }
  }
}



function addImageToTree(docId, data) {
  textureLoader.load(
    data.url,
    (texture) => {
      // 1. 이미지 원본 비율
      const imgW = texture.image.width || 1;
      const imgH = texture.image.height || 1;
      const imgAspect = imgW / imgH;

      // 2. 우리가 만들 카드 프레임은 정사각형이라고 가정 (1:1)
      const planeAspect = 1; // 정사각형

      // 3. geometry도 정사각형으로 (폴라로이드 프레임과 맞추기용)
      const size = 1;              // 기본 한 변 길이
      const geo = new THREE.PlaneGeometry(size, size);

      // 4. CSS의 background-size: cover + center 와 같은 효과
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;

      texture.repeat.set(1, 1);
      texture.offset.set(0, 0);

      if (imgAspect > planeAspect) {
        // 가로가 더 긴 이미지 → 좌/우를 잘라냄
        const scaleX = planeAspect / imgAspect;   // 0~1
        texture.repeat.set(scaleX, 1);
        texture.offset.set((1 - scaleX) * 0.5, 0); // 중앙 정렬
      } else if (imgAspect < planeAspect) {
        // 세로가 더 긴 이미지 → 위/아래를 잘라냄
        const scaleY = imgAspect / planeAspect;   // 0~1
        texture.repeat.set(1, scaleY);
        texture.offset.set(0, (1 - scaleY) * 0.5); // 중앙 정렬
      }
      texture.needsUpdate = true;

      // 5. 머티리얼 & 메쉬 생성
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.renderOrder = 1; // (폴라로이드 프레임이 2)

      const pos = getRandomPositionOnTree();
      cardPositions.push(pos);           // 🔹 겹침 방지용으로 위치 저장

      const hanger = new THREE.Object3D();
      hanger.position.copy(pos);
      treeGroup.add(hanger);

      plane.userData.cardPos = pos;

      // ✅ 카드 그룹 (이미지 + 폴라로이드 프레임 묶어서 회전)
      const cardGroup = new THREE.Object3D();
      const hangLength = size * 0.5;
      cardGroup.position.set(0, -hangLength, 0);
      hanger.add(cardGroup);

      cardGroup.add(plane);

      // ✅ 이 소원이 폴라로이드를 쓴 경우에만 프레임 추가
      const useFrame = data.usePolaroidFrame !== false;
      if (useFrame && polaroidFrameMaterial) {
        const frameGeo = new THREE.PlaneGeometry(
          size * POLAROID_FRAME_SCALE,
          size * POLAROID_FRAME_SCALE
        );
        const frameMesh = new THREE.Mesh(frameGeo, polaroidFrameMaterial);
        frameMesh.position.set(0, -0.1, 0.01); // 이미지보다 살짝 앞
        frameMesh.renderOrder = 2;          // ✅ 프레임은 항상 이미지보다 위에
        cardGroup.add(frameMesh);
      }

      const worldPos = new THREE.Vector3();
      cardGroup.getWorldPosition(worldPos);

      const lookTarget = new THREE.Vector3(0, worldPos.y, 0);
      cardGroup.lookAt(lookTarget);
      cardGroup.rotateY(Math.PI);

      const swingAxis = new THREE.Vector3(pos.x, 0, pos.z).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const tiltAxis = new THREE.Vector3()
        .crossVectors(swingAxis, up)
        .normalize();
      const tiltAngle = THREE.MathUtils.degToRad(15);
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(
        tiltAxis,
        tiltAngle
      );
      cardGroup.applyQuaternion(tiltQ);

      // 클릭/레이캐스트는 여전히 이미지 메쉬 기준
      imageMeshes.push(plane);
      meshToData.set(plane, { ...data, id: docId });

      const ho = {
        id: docId,
        hanger,
        axis: swingAxis,
        angle: 0,
        vel: 0,
        stiffness: 100,
        damping: 8,
        // 🔹 스케일 애니메이션
        scale: 0,
        targetScale: 1,
        toRemove: false,
      };

      hangingObjects.push(ho);
      plane.userData.ho = ho;

      // 처음에는 스케일 0에서 시작 → 애니메이션으로 커짐
      ho.hanger.scale.setScalar(0);
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

  snapshot.docChanges().forEach((change) => {
    const docSnap = change.doc;
    const id = docSnap.id;
    const data = docSnap.data();

    if (change.type === "added") {
      if (shownImageIds.has(id)) return;
      shownImageIds.add(id);
      if (data.url) addImageToTree(id, data);
    } else if (change.type === "removed") {
      // 🔹 Firestore에서 삭제되면 트리 카드도 천천히 사라지게
      startRemoveCard(id);
    } else if (change.type === "modified") {
      // 지금은 텍스트/좋아요만 바뀌니 3D카드는 그대로 둬도 OK
    }
  });

  renderMyWishes();
});

// 🔹 삭제된 카드 → 스케일 0으로 줄어들게 마킹
function startRemoveCard(docId) {
  for (const plane of imageMeshes) {
    const data = meshToData.get(plane);
    if (!data || data.id !== docId) continue;

    const ho = plane.userData?.ho;
    if (ho) {
      ho.toRemove = true;
      ho.targetScale = 0;
    }
  }
}

// 🔹 실제로 트리/배열에서 제거
function cleanupCardById(docId) {
  for (let i = imageMeshes.length - 1; i >= 0; i--) {
    const mesh = imageMeshes[i];
    const data = meshToData.get(mesh);
    if (!data || data.id !== docId) continue;

    const pos = mesh.userData?.cardPos;
    if (pos) {
      const idx = cardPositions.indexOf(pos);
      if (idx !== -1) cardPositions.splice(idx, 1);
    }

    meshToData.delete(mesh);
    imageMeshes.splice(i, 1);
  }

  shownImageIds.delete(docId);
}



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

  const isAnonymous = isAnonymousState;
  const rawWishName = (wishNameInput?.value || "").trim();
  const wishText = (wishTextInput?.value || "").trim();

  await addDoc(imagesCol, {
    url: downloadURL,
    path: filePath,
    ownerUid: currentUser.uid,
    ownerEmail: currentUser.email,
    originalName: processedFile.name,
    wishName: isAnonymous ? "비밀 소원" : rawWishName,
    wishText,
    isAnonymous,
    usePolaroidFrame: isPolaroidOn,  // ✅ 프레임 사용 여부 저장
    createdAt: serverTimestamp(),
  });


}

if (wishSubmitBtn) {
  wishSubmitBtn.addEventListener("click", async () => {
    if (!currentUser) {
      alert("먼저 로그인 해주세요.");
      return;
    }
    const file = wishFileInput?.files[0];
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
}

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

      const likeInline = document.createElement("div");
      likeInline.className = "wish-like-inline";
      const likeCount = data.likesCount || 0;
      likeInline.textContent = `♥ ${likeCount.toString()}`;

      main.appendChild(textSpan);
      main.appendChild(dateSpan);
      main.appendChild(likeInline);

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
 *  트리 이미지 클릭 / POST 클릭 → 편지 패널 / 소원추가
 * ==========================================================================*/

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// POST hover 감지
renderer.domElement.addEventListener("mousemove", (event) => {
  if (!postMeshes.length) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObjects(postMeshes, true);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (hoveredPost !== hit) {
      if (hoveredPost) setPostHoverTarget(hoveredPost, false);
      hoveredPost = hit;
      setPostHoverTarget(hoveredPost, true);
    }
  } else {
    if (hoveredPost) {
      setPostHoverTarget(hoveredPost, false);
      hoveredPost = null;
    }
  }
});

// 클릭 처리: 1) POST 클릭 → 소원추가 모달  2) 트리 카드 클릭 → 편지 패널
renderer.domElement.addEventListener("click", (event) => {
  // 🔹 방금 전까지 드래그를 크게 했던 경우 → 클릭 처리 무시
  if (dragDistance > DRAG_CLICK_THRESHOLD) {
    dragDistance = 0; // 다음 클릭을 위해 초기화
    return;
  }
  dragDistance = 0; // 정상 클릭이면 그냥 리셋

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  pointer.set(x, y);
  raycaster.setFromCamera(pointer, camera);

  // 1️⃣ POST 클릭 체크
  const postHit = raycaster.intersectObjects(postMeshes, true);
  if (postHit.length > 0) {
    openWishModal();
    return;
  }

  // 2️⃣ 이미지(소원 카드) 클릭
  const intersects = raycaster.intersectObjects(imageMeshes, false);
  if (intersects.length === 0) return;

  const mesh = intersects[0].object;
  const data = meshToData.get(mesh);
  if (!data) return;

  showWishPanel(data);
});


function showWishPanel(data) {
  const sender = formatWishSender(data);

  const text =
    (data.wishText && data.wishText.trim()) ||
    "소원이 비어 있어요. 마음속으로 빌었나 봐요 ✨";

  if (wishSenderEl) wishSenderEl.textContent = sender;
  if (wishContentEl) wishContentEl.textContent = text;

  if (wishViewImageEl) {
    if (data.url) {
      wishViewImageEl.style.backgroundImage = `url(${data.url})`;
    } else {
      wishViewImageEl.style.backgroundImage = "none";
    }
  }

  // ✅ 이 소원에 프레임을 썼는지 여부 (기본값: true)
  const useFrame = data.usePolaroidFrame !== false;
  if (frameOverlayView) {
    frameOverlayView.classList.toggle("frame-off", !useFrame);
  }

  currentOpenedWishId = data.id || null;
  refreshLikeUI().catch((e) => console.error("refreshLikeUI error", e));

  if (wishPanel) {
    wishPanel.classList.remove("hidden");
  }

  if (wishViewLetter) {
    wishViewLetter.classList.remove("is-closing");
    requestAnimationFrame(() => {
      wishViewLetter.classList.add("is-open");
    });
  }
}


function closeWishPanelPanelOnly() {
  if (!wishPanel) return;

  const finishClose = () => {
    wishPanel.classList.add("hidden");
    if (wishViewLetter) {
      wishViewLetter.classList.remove("is-closing");
      wishViewLetter.classList.remove("is-open");
    }
  };

  if (!wishViewLetter) {
    finishClose();
    return;
  }

  wishViewLetter.classList.remove("is-open");
  wishViewLetter.classList.add("is-closing");

  const onTransitionEnd = (e) => {
    if (e.target !== wishViewLetter) return;
    wishViewLetter.removeEventListener("transitionend", onTransitionEnd);
    finishClose();
  };

  wishViewLetter.addEventListener("transitionend", onTransitionEnd);
}

if (wishCloseBtn) {
  wishCloseBtn.addEventListener("click", closeWishPanelPanelOnly);
}

/* ============================================================================
 *  좋아요 UI & 토글
 * ==========================================================================*/

async function refreshLikeUI() {
  if (!currentOpenedWishId || !wishLikeBtn || !wishLikeCountEl) return;

  const imgRef = doc(db, "treeImages", currentOpenedWishId);
  const imgSnap = await getDoc(imgRef);
  if (!imgSnap.exists()) return;

  const data = imgSnap.data();
  const count = data.likesCount || 0;
  wishLikeCountEl.textContent = count;

  if (!currentUser) {
    wishLikeBtn.classList.add("disabled");
    wishLikeBtn.disabled = true;
    wishLikeBtn.textContent = "♡ 로그인 필요";
    return;
  }

  const likeRef = doc(
    db,
    "treeImages",
    currentOpenedWishId,
    "likes",
    currentUser.uid
  );
  const likeSnap = await getDoc(likeRef);
  const hasLiked = likeSnap.exists();

  wishLikeBtn.classList.remove("disabled");
  wishLikeBtn.disabled = false;
  wishLikeBtn.dataset.liked = hasLiked ? "1" : "0";
  wishLikeBtn.textContent = hasLiked ? "♥ 좋아요 취소" : "♡ 좋아요";
}

async function toggleLike() {
  if (!currentUser || !currentOpenedWishId) {
    alert("로그인 후 좋아요를 누를 수 있어요.");
    return;
  }

  const imgRef = doc(db, "treeImages", currentOpenedWishId);
  const likeRef = doc(
    db,
    "treeImages",
    currentOpenedWishId,
    "likes",
    currentUser.uid
  );

  try {
    await runTransaction(db, async (tx) => {
      const imgSnap = await tx.get(imgRef);
      if (!imgSnap.exists()) return;

      const current = imgSnap.data();
      const currentCount = current.likesCount || 0;

      const likeSnap = await tx.get(likeRef);

      if (likeSnap.exists()) {
        tx.delete(likeRef);
        tx.update(imgRef, {
          likesCount: Math.max(currentCount - 1, 0),
        });
      } else {
        tx.set(likeRef, {
          userUid: currentUser.uid,
          email: currentUser.email,
          createdAt: serverTimestamp(),
        });
        tx.update(imgRef, {
          likesCount: currentCount + 1,
        });
      }
    });

    await refreshLikeUI();
  } catch (err) {
    console.error("좋아요 처리 실패", err);
    alert("좋아요 처리 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
  }
}

if (wishLikeBtn) {
  wishLikeBtn.addEventListener("click", toggleLike);
}

/* ============================================================================
 *  입력 상태 (마우스 / 터치 / 자이로)
 * ==========================================================================*/

let isDragging = false;
let prevX = 0;
const dragRotateSpeed = 0.005;

// 🔹 드래그 vs 클릭 구분용
let dragDistance = 0;
const DRAG_CLICK_THRESHOLD = 6; // px 기준, 이보다 많이 움직이면 "드래그"로 간주

let mouseX = 0;
let mouseY = 0;
let gyroX = 0;
let gyroY = 0;
let useGyro = false;


let baseRotationY = 0;
let spinVelocityY = 0;

let gyroBaseBeta = 0;
let gyroBaseGamma = 0;
let gyroCalibrated = false;

const isMobile =
  "ontouchstart" in window ||
  (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

function beginDrag(clientX) {
  isDragging = true;
  prevX = clientX;
  spinVelocityY = 0;
  dragDistance = 0; // 🔹 새 드래그 시작할 때 거리 초기화
}

function moveDrag(clientX) {
  const deltaX = clientX - prevX;
  prevX = clientX;

  dragDistance += Math.abs(deltaX); // 🔹 얼마나 움직였는지 누적

  const deltaRot = deltaX * dragRotateSpeed;

  treeGroup.rotation.y += deltaRot;
  baseRotationY = treeGroup.rotation.y;
  spinVelocityY = deltaRot;

  const impulse = deltaRot * 8.0;
  for (const ho of hangingObjects) {
    ho.vel += impulse;
  }
}


renderer.domElement.addEventListener("mousedown", (event) => {
  beginDrag(event.clientX);
});

window.addEventListener("mouseup", () => {
  isDragging = false;
});

window.addEventListener("mousemove", (event) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = (event.clientY / window.innerHeight) * 2 - 1;

  if (isDragging) {
    moveDrag(event.clientX);
  }
});

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

function handleOrientation(event) {
  const { beta, gamma } = event;
  if (beta == null || gamma == null) return;

  if (!gyroCalibrated) {
    gyroBaseBeta = beta;
    gyroBaseGamma = gamma;
    gyroCalibrated = true;
    console.log("✅ Gyro first calibrate:", gyroBaseBeta, gyroBaseGamma);
  }

  let diffGamma = gamma - gyroBaseGamma;
  let diffBeta = beta - gyroBaseBeta;

  const neutralFollowStrength = 0.1;
  gyroBaseGamma += diffGamma * neutralFollowStrength;
  gyroBaseBeta += diffBeta * neutralFollowStrength;

  diffGamma = gamma - gyroBaseGamma;
  diffBeta = beta - gyroBaseBeta;

  const nxRaw = THREE.MathUtils.clamp(diffGamma / 5, -1, 1);
  const nyRaw = THREE.MathUtils.clamp(diffBeta / 5, -1, 1);

  const targetX = -nxRaw;
  const targetY = -nyRaw;

  const smooth = 0.01;
  gyroX = gyroX * (1 - smooth) + targetX * smooth;
  gyroY = gyroY * (1 - smooth) + targetY * smooth;
}

function setupGyroButton() {
  const DOE = window.DeviceOrientationEvent;
  if (!DOE) {
    console.log("👉 이 브라우저는 DeviceOrientationEvent 를 지원하지 않음");
    return;
  }

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
});

/* ============================================================================
 *  애니메이션 루프
 * ==========================================================================*/

let lastTime = 0;

const PARALLAX_DESKTOP = {
  x: 8,
  y: 4,
  follow: 0.05,
};

const PARALLAX_MOBILE = {
  x: 12,
  y: 10,
  follow: 1,
};

function animate(time) {
  requestAnimationFrame(animate);
  const delta = (time - lastTime) / 1000;
  lastTime = time;

  // 기본 트리 회전
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

  const inputX = useGyro ? gyroX : mouseX;
  const inputY = useGyro ? gyroY : mouseY;

  const p = isMobile ? PARALLAX_MOBILE : PARALLAX_DESKTOP;

  const baseCamY = 6;
  const targetCamX = inputX * -p.x;
  const targetCamY = baseCamY + inputY * p.y;

  camera.position.x += (targetCamX - camera.position.x) * p.follow;
  camera.position.y += (targetCamY - camera.position.y) * p.follow;

  // 트리 별 회전
  star.rotation.y -= delta * 2;

  // 트리 주변 도는 라이트
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

  // 눈 애니메이션 (프레임당 랜덤 호출 최소화)
  const pos = snowGeo.attributes.position;
  for (let i = 0; i < snowCount; i++) {
    let y = pos.getY(i);

    // 미리 정해둔 속도로만 이동
    y -= delta * snowVelocities[i];

    // 바닥 근처로 내려가면 위로 올리면서 속도만 새로 랜덤 설정
    if (y < 0.5) {
      y = Math.random() * 20 + 5;
      snowVelocities[i] = 0.5 + Math.random() * 0.3;
    }

    pos.setY(i, y);
  }
  pos.needsUpdate = true;


  // 소원 카드 펜듈럼 + 등장/퇴장 스케일
  for (let i = hangingObjects.length - 1; i >= 0; i--) {
    const ho = hangingObjects[i];
    const k = ho.stiffness;
    const d = ho.damping;

    // 펜듈럼 스윙
    ho.vel += -k * ho.angle * delta;
    ho.vel -= ho.vel * d * delta;
    ho.angle += ho.vel * delta;
    ho.hanger.quaternion.setFromAxisAngle(ho.axis, -ho.angle);

    // 스케일 애니메이션 (0 ↔ 1)
    const scaleDamp = 6;
    const sLerp = 1 - Math.exp(-scaleDamp * delta);
    ho.scale = ho.scale + (ho.targetScale - ho.scale) * sLerp;
    ho.hanger.scale.setScalar(ho.scale);

    // 삭제 예약된 카드: 충분히 작아지면 실제로 제거
    if (ho.toRemove && ho.scale < 0.02) {
      if (ho.hanger.parent) {
        ho.hanger.parent.remove(ho.hanger);
      }
      cleanupCardById(ho.id);
      hangingObjects.splice(i, 1);
    }
  }

  // 트리 전구 깜빡임
  const t2 = time * 0.001;
  for (let i = 0; i < treeBulbs.length; i++) {
    const bulb = treeBulbs[i];
    const sprite = bulb.sprite;
    const pulse = 0.5 + 0.5 * Math.sin(t2 * 10.0 + bulb.flickerOffset);
    sprite.material.opacity = pulse;
  }

  // 🔶 POST hover 애니메이션
  // 🔶 POST hover 애니메이션
  let maxPostHover = 0;  // ← 이번 프레임에 POST들이 얼마나 hover 됐는지 최대값

  for (const mesh of postMeshes) {
    const ud = mesh.userData || (mesh.userData = {});

    if (!ud.basePosition) {
      ud.basePosition = mesh.position.clone();
    }

    const mat = mesh.material;
    if (mat && mat.isMeshStandardMaterial) {
      if (!ud.baseColor) {
        ud.baseColor = mat.color.clone();
        ud.hoverColor = mat.color.clone().offsetHSL(0, 0, 0.15);
        ud.baseEmissiveIntensity = mat.emissiveIntensity ?? 0.2;
      }
    }

    const target = ud.hoverTarget || 0;       // 0 또는 1
    const state = ud.hoverState ?? 0;
    ud.hoverState = state + (target - state) * 0.15; // 부드러운 보간

    // 이번 프레임에서 hover가 가장 많이 된 POST 값 기록
    if (ud.hoverState > maxPostHover) {
      maxPostHover = ud.hoverState;
    }

    const lift = 0.3 * ud.hoverState;
    mesh.position.y = ud.basePosition.y + lift;

    if (mat && mat.isMeshStandardMaterial && ud.baseColor && ud.hoverColor) {
      mat.color.copy(ud.baseColor).lerp(ud.hoverColor, ud.hoverState);
      mat.emissiveIntensity =
        ud.baseEmissiveIntensity + 0.5 * ud.hoverState;
    }
  }

  // 🔆 hover 강도에 따라 spotLight / spotLight2 / postLight

  // 0) 메인 스포트라이트는 hover 중에 살짝 어두워지게
  const SPOT1_BASE = 2.0;   // 평소 밝기
  const SPOT1_MIN  = 0;   // hover 최대일 때 밝기 (원하는 대로 조정)

  spotLight.intensity = THREE.MathUtils.lerp(
    SPOT1_BASE,
    SPOT1_MIN,
    maxPostHover
  );


  const SPOT2_MAX = 4;
  spotLight2.intensity = THREE.MathUtils.lerp(0, SPOT2_MAX, maxPostHover);

  // t는 위에서 const t = time * 0.001; 이런 식으로 이미 쓰고 있다고 가정
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.0); // 3.0은 숨쉬기 속도

  // 🔹 항상 존재하는 기본 숨쉬기
  const baseIntensity = 0.5;    // 기본 밝기
  const basePulseAmp  = 0.25;   // 기본 숨쉬기 폭

  // 🔹 hover 되었을 때 추가로 얹을 숨쉬기
  const hoverPulseAmp = 0.4;    // hover 시 추가 폭

  // 기본 + hover 보정
  postLight.intensity =
    baseIntensity +
    basePulseAmp * pulse +                 // 항상 숨쉬는 부분
    hoverPulseAmp * maxPostHover * pulse;  // hover 시 강해지는 부분

  // (선택) 라이트 마커도 같이 숨쉬게
  if (postLightMarker) {
    const s =
      0.35 +
      0.5 * pulse +                       // 항상 숨쉬는 스케일
      0.4 * maxPostHover * pulse;          // hover 시 더 크게
    postLightMarker.scale.set(s, s, s);
  }



  camera.lookAt(0, tree.position.y, 0);
  renderer.render(scene, camera);
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
