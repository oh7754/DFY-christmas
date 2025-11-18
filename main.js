// ===== three.js & GLTFLoader (importmap 버전) =====
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ★ 블룸용 postprocessing
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";


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

// === Firebase 설정 ===
const firebaseConfig = {
  apiKey: "AIzaSyB_bZoaw6cvdrot7DEabrXsfyDYM-ZgaR0",
  authDomain: "dfy-christmas-tree-452d4.firebaseapp.com",
  projectId: "dfy-christmas-tree-452d4",
  storageBucket: "dfy-christmas-tree-452d4.firebasestorage.app",
  messagingSenderId: "424198884902",
  appId: "1:424198884902:web:cb6e92e8abe3299c5160e7",
  measurementId: "G-7TTVR9EM4E",
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const imagesCol = collection(db, "treeImages");

// 🔴 회사 도메인
const ALLOWED_DOMAIN = "dfy.co.kr";

/* ========= DOM 요소 ========= */

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

/* ========= 상태 ========= */

let currentUser = null;
let lastSnapshot = null;
const shownImageIds = new Set();

// 트리 이미지 mesh → 데이터 매핑
const imageMeshes = [];
const meshToData = new Map();

/* ========= 유틸 ========= */

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

/* ========= Auth 상태 ========= */

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

/* ========= 상단 프로필 & 패널 ========= */

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

/* ========= 소원 추가 모달 ========= */

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

// 🔆 라이트 글로우용 캔버스 텍스처 생성
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  // 가운데가 밝고 가장자리로 갈수록 투명해지는 그라디언트
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
  grd.addColorStop(.5, "rgba(255, 255, 255,0)");

  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const glowTexture = createGlowTexture();


/* ========= THREE.js 씬 (WebGLRenderer) ========= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 6, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // 살짝 낮춰줌
document.body.appendChild(renderer.domElement);

// ★ 블룸 컴포저 세팅
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// 화면에서 어느 정도 이상 밝은 애들만 글로우
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.1,  // strength: 글로우 세기 (1.0 ~ 2.0 사이에서 취향대로)
  0.8,  // radius: 번지는 정도
  0.7   // threshold: 0이면 꽤 많은 것들이 글로우, 0.8쯤 올리면 정말 밝은 것만
);
composer.addPass(bloomPass);

const treeGroup = new THREE.Group();
scene.add(treeGroup);


// 바닥
const groundGeo = new THREE.CircleGeometry(18, 64);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x0b1220,
  metalness: 0.2,
  roughness: 0.8,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
scene.add(ground);

// 조명
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x223355, 0.8);
hemiLight.position.set(0, 1, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// 트리 치수(소원 위치 계산용)
const treeHeight = 8;
const treeRadius = 4;
const TREE_CENTER_Y = 0.75 + treeHeight / 2;

// dummy 트리 / 별
const tree = new THREE.Object3D();
tree.position.y = TREE_CENTER_Y;
treeGroup.add(tree);

const star = new THREE.Object3D();
star.position.y = TREE_CENTER_Y + treeHeight / 2 + 0.8;
treeGroup.add(star);

// GLB 트리 로드
const loader = new GLTFLoader();
let treeModel = null;

loader.load(
  "source/christmas-tree.glb",
  (gltf) => {
    treeModel = gltf.scene;
    treeModel.position.set(0, 0, 0);
    treeModel.scale.set(0.7, 0.7, 0.7);
    treeGroup.add(treeModel);
  },
  undefined,
  (error) => {
    console.error("트리 모델 로드 실패:", error);
  }
);

// ====== 동그라미 라이트 세트업 ======
const LIGHT_COUNT = 15;

// 트리 반경이 약 4라서, 그보다 살짝 바깥을 돌게
const ORBIT_INNER_RADIUS = 5;
const ORBIT_OUTER_RADIUS = 9;

// 공통 지오메트리
const lightSphereGeo = new THREE.SphereGeometry(0.02, 10, 10);

// 라이트 + 구체를 같이 들고 있을 배열
const movingLights = [];
const tmpColor = new THREE.Color();

for (let i = 0; i < LIGHT_COUNT; i++) {
  // 예쁜 랜덤 색 (HSL)
  const hue = Math.random();
  tmpColor.setHSL(hue, 0.85, 0.6);

  // 포인트 라이트 (조금 줄인 세기)
  const light = new THREE.PointLight(tmpColor.clone(), 3.0, 10);

  // 궤도 파라미터
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

  // 초기 위치
  light.position.set(
    Math.cos(angle) * radius,
    height,
    Math.sin(angle) * radius
  );
  scene.add(light);

  // 💡 실제 작은 구체 (코어)
  const sphereMat = new THREE.MeshStandardMaterial({
    color: tmpColor.clone(),
    emissive: tmpColor.clone(),
    emissiveIntensity: 0.8,
    metalness: 0.0,
    roughness: 0.3,
    toneMapped: false, // 톤매핑 영향 X → 쨍
  });
  const sphere = new THREE.Mesh(lightSphereGeo, sphereMat);
  sphere.position.copy(light.position);
  sphere.frustumCulled = false;
  scene.add(sphere);

  // 🔆 블러리한 글로우 스프라이트 (헤일로)
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

  // 스케일 = 화면에서 보이는 글로우 크기 (트리 스케일 보고 조절)
  const glowSize = 0.9; // 0.5 ~ 1.2 정도에서 취향 맞춰봐
  glow.scale.set(glowSize, glowSize, 1);
  scene.add(glow);

  // 세 개를 같이 저장
  movingLights.push({ light, sphere, glow });
}



// 눈 파티클
const snowCount = 600;
const snowGeo = new THREE.BufferGeometry();
const snowPositions = new Float32Array(snowCount * 3);
for (let i = 0; i < snowCount; i++) {
  snowPositions[i * 3 + 0] = (Math.random() - 0.5) * 40;
  snowPositions[i * 3 + 1] = Math.random() * 20 + 2;
  snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
}
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
const snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06 });
const snow = new THREE.Points(snowGeo, snowMat);
scene.add(snow);

/* ========= 트리에 이미지 추가 ========= */

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

      const position = getRandomPositionOnTree();
      plane.position.copy(position);
      plane.lookAt(new THREE.Vector3(0, position.y, 0));
      plane.rotateY(Math.PI);

      treeGroup.add(plane);

      imageMeshes.push(plane);
      meshToData.set(plane, { ...data, id: docId });
    },
    undefined,
    (err) => console.error("텍스처 로드 오류", err)
  );
}

/* ========= Firestore 실시간 구독 ========= */

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

/* ========= 이미지 리사이즈 & 업로드 ========= */

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

// 모달 "올리기"
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

/* ========= 내 소원 리스트 렌더링 ========= */

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

/* ========= 트리 이미지 클릭 → 편지 ========= */

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

/* ========= 드래그 회전 / 줌 / 리사이즈 ========= */

let isDragging = false;
let prevX = 0;
let prevY = 0;
const dragRotateSpeed = 0.005;

renderer.domElement.addEventListener("mousedown", (event) => {
  isDragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
});

window.addEventListener("mouseup", () => {
  isDragging = false;
});

window.addEventListener("mousemove", (event) => {
  if (!isDragging) return;
  const deltaX = event.clientX - prevX;
  const deltaY = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;

  treeGroup.rotation.y += deltaX * dragRotateSpeed;
  const newX = THREE.MathUtils.clamp(
    treeGroup.rotation.x + deltaY * dragRotateSpeed,
    -Math.PI / 6,
    Math.PI / 6
  );
  treeGroup.rotation.x = newX;
});

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
});

/* ========= 애니메이션 루프 ========= */

let lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);
  const delta = (time - lastTime) / 1000;
  lastTime = time;

  if (!isDragging) treeGroup.rotation.y += delta * 0.2;
  star.rotation.y -= delta * 0.4;

  // 포인트 라이트 궤도 애니메이션 + 구체 위치 복사
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
    glow.position.copy(light.position);   // 🔆 글로우도 따라가게
  }


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

/* ========= scene export ========= */

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
