// ===== Firebase CDN import =====
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
const profileButton = document.getElementById("profileButton");
const profileInitial = document.getElementById("profileInitial");
const profileImage = document.getElementById("profileImage");
const menuToggle = document.getElementById("menuToggle");

// 사이드 패널
const sidePanel = document.getElementById("sidePanel");
const accountInitial = document.getElementById("accountInitial");
const accountImage = document.getElementById("accountImage");
const accountEmail = document.getElementById("accountEmail");
const accountSub = document.getElementById("accountSub");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const panelCloseBtn = document.getElementById("panelCloseBtn");
const myWishList = document.getElementById("myWishList");
const openWishModalBtn = document.getElementById("openWishModal");

// 소원 추가 모달
const wishModal = document.getElementById("wishModal");
const wishFileInput = document.getElementById("wishFileInput");
const wishNameInput = document.getElementById("wishNameInput");
const wishTextInput = document.getElementById("wishTextInput");
const wishCancelBtn = document.getElementById("wishCancelBtn");
const wishSubmitBtn = document.getElementById("wishSubmitBtn");

// 편지 패널 (트리 이미지 클릭 시)
const wishPanel = document.getElementById("wishPanel");
const wishSenderEl = document.getElementById("wishSender");
const wishContentEl = document.getElementById("wishContent");
const wishCloseBtn = document.getElementById("wishCloseBtn");

// ===== 상태 =====
let currentUser = null;
let lastSnapshot = null;
const shownImageIds = new Set();

// 트리에 올라간 이미지 mesh들 → 소원 데이터 매핑
const imageMeshes = [];
const meshToData = new Map();

/* ========= 유틸 ========= */

function isAllowedDomain(email) {
  return email && email.endsWith("@" + ALLOWED_DOMAIN);
}

// 이름이나 이메일에서 이니셜 뽑기
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

/* ========= Auth 상태 관리 ========= */

onAuthStateChanged(auth, (user) => {
  if (user && !isAllowedDomain(user.email)) {
    // 다른 도메인이면 바로 로그아웃
    alert("사내 구글 계정만 사용할 수 있습니다.");
    signOut(auth).catch(() => {});
    return;
  }

  currentUser = user || null;

  if (currentUser) {
    const init = makeInitialFromUser(currentUser);

    // 상단 프로필
    profileInitial.textContent = init;
    accountInitial.textContent = init;

    if (currentUser.photoURL) {
      profileImage.src = currentUser.photoURL;
      profileImage.classList.remove("hidden");
      accountImage.src = currentUser.photoURL;
      accountImage.classList.remove("hidden");
    } else {
      profileImage.classList.add("hidden");
      accountImage.classList.add("hidden");
    }

    accountEmail.textContent = currentUser.email || "알 수 없는 계정";
    accountSub.textContent = "로그인 완료";
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    profileInitial.textContent = "?";
    profileImage.classList.add("hidden");
    accountInitial.textContent = "?";
    accountImage.classList.add("hidden");

    accountEmail.textContent = "로그인 필요";
    accountSub.textContent = "사내 구글 계정만 사용 가능";
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }

  renderMyWishes();
});

// 로그인 / 로그아웃 버튼
loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("로그인 실패", err);
    alert("로그인에 실패했습니다. 콘솔을 확인해주세요.");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    closePanel();
    closeWishModal();
  } catch (err) {
    console.error("로그아웃 실패", err);
  }
});

/* ========= 사이드 패널 토글 ========= */

function openPanel() {
  sidePanel.classList.add("open");
}

function closePanel() {
  sidePanel.classList.remove("open");
}

menuToggle.addEventListener("click", () => {
  if (sidePanel.classList.contains("open")) closePanel();
  else openPanel();
});

panelCloseBtn.addEventListener("click", closePanel);

/* ========= 소원 추가 모달 토글 ========= */

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
  // 이름은 유지하고 싶으면 주석 처리
  // wishNameInput.value = "";
  wishTextInput.value = "";
}

openWishModalBtn.addEventListener("click", openWishModal);
wishCancelBtn.addEventListener("click", closeWishModal);

// 모달 바깥 클릭 시 닫기
wishModal.addEventListener("click", (e) => {
  if (e.target === wishModal || e.target.classList.contains("modal-backdrop")) {
    closeWishModal();
  }
});

/* ========= THREE.js 씬 ========= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 6, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const treeGroup = new THREE.Group();
scene.add(treeGroup);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x223355, 0.8);
hemiLight.position.set(0, 1, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

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

const treeHeight = 8;
const treeRadius = 3;

const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 1.5, 16);
const trunkMat = new THREE.MeshStandardMaterial({
  color: 0x5b3a1e,
  roughness: 0.9,
});
const trunk = new THREE.Mesh(trunkGeo, trunkMat);
trunk.position.y = 0.75;
treeGroup.add(trunk);

const treeGeo = new THREE.ConeGeometry(treeRadius, treeHeight, 32, 1, true);
const treeMat = new THREE.MeshStandardMaterial({
  color: 0x0f766e,
  roughness: 0.6,
  metalness: 0.2,
});
const tree = new THREE.Mesh(treeGeo, treeMat);
tree.position.y = 0.75 + treeHeight / 2;
treeGroup.add(tree);

const starGeo = new THREE.OctahedronGeometry(0.4);
const starMat = new THREE.MeshStandardMaterial({
  color: 0xfacc15,
  emissive: 0xfacc15,
  emissiveIntensity: 0.6,
  metalness: 0.9,
  roughness: 0.3,
});
const star = new THREE.Mesh(starGeo, starMat);
star.position.y = tree.position.y + treeHeight / 2 + 0.8;
treeGroup.add(star);

const snowCount = 600;
const snowGeo = new THREE.BufferGeometry();
const snowPositions = new Float32Array(snowCount * 3);
for (let i = 0; i < snowCount; i++) {
  snowPositions[i * 3 + 0] = (Math.random() - 0.5) * 40;
  snowPositions[i * 3 + 1] = Math.random() * 20 + 2;
  snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
}
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
const snowMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.06,
});
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

// Firestore 문서 한 개를 트리에 붙이기
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
      meshToData.set(plane, {
        ...data,
        id: docId,
      });
    },
    undefined,
    (err) => {
      console.error("텍스처 로드 오류", err);
    }
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
    if (data.url) {
      addImageToTree(id, data);
    }
  });

  renderMyWishes();
});

/* ========= 이미지 리사이즈 & 업로드 ========= */

function compressImage(file) {
  const MAX_WIDTH = 1920;
  const MAX_HEIGHT = 1920;
  const MAX_MB = 1.5;

  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB <= MAX_MB) {
    return Promise.resolve(file);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target.result;
    };

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
          if (!blob) {
            reject(new Error("이미지 압축 실패"));
            return;
          }
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

    img.onerror = (err) => reject(err);
    reader.onerror = (err) => reject(err);

    reader.readAsDataURL(file);
  });
}

async function uploadAndRegister(file) {
  if (!currentUser) {
    alert("먼저 로그인 해주세요!");
    return;
  }

  const processedFile = await compressImage(file);

  const filePath = `uploads/${currentUser.uid}/${Date.now()}_${
    processedFile.name
  }`;
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

// 모달의 "올리기" 버튼
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
    .reverse() // 최근 것이 위로
    .forEach((docSnap) => {
      const data = docSnap.data();

      const row = document.createElement("div");
      row.className = "wish-row";

      const thumb = document.createElement("div");
      thumb.className = "wish-thumb";
      if (data.url) {
        thumb.style.backgroundImage = `url(${data.url})`;
      }

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

/* ========= 트리 이미지 클릭 → 편지 띄우기 ========= */

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
});

/* ========= 애니메이션 루프 ========= */

let lastTime = 0;
function animate(time) {
  requestAnimationFrame(animate);
  const delta = (time - lastTime) / 1000;
  lastTime = time;

  if (!isDragging) {
    treeGroup.rotation.y += delta * 0.2;
  }
  star.rotation.y -= delta * 0.4;

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
  renderer.render(scene, camera);
}
animate(0);
