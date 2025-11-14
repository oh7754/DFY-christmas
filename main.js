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

// DOM 요소들
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfoEl = document.getElementById("userInfo");
const fileInput = document.getElementById("fileInput");
const countEl = document.getElementById("count");
const myImagesList = document.getElementById("myImagesList");

// 상태 변수
let currentUser = null;
const shownImageIds = new Set();
let lastSnapshot = null;

// 도메인 체크
function isAllowedDomain(email) {
  return email && email.endsWith("@" + ALLOWED_DOMAIN);
}

// ----- Auth 상태 관리 -----
onAuthStateChanged(auth, (user) => {
  if (user && isAllowedDomain(user.email)) {
    // ✅ 허용된 회사 계정
    currentUser = user;
    userInfoEl.textContent = `로그인: ${user.email}`;
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    fileInput.disabled = false;
  } else if (user && !isAllowedDomain(user.email)) {
    // ❌ 다른 구글 계정
    currentUser = null;
    userInfoEl.textContent = `허용되지 않은 도메인입니다: ${user.email}`;
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "inline-block";
    fileInput.disabled = true;
  } else {
    // 로그아웃 상태
    currentUser = null;
    userInfoEl.textContent = "로그인 필요 (사내 구글 계정만 가능)";
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    fileInput.disabled = true;
  }

  renderMyImages(); // 내 이미지 리스트 다시 그리기
});

// 로그인 버튼
loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("로그인 실패", err);
    alert("로그인에 실패했습니다. 콘솔을 확인해주세요.");
  }
});

// 로그아웃 버튼
logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("로그아웃 실패", err);
  }
});

// ----- Three.js 씬 설정 -----
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

function updateCount(num) {
  countEl.textContent = `걸린 사진: ${num}장`;
}

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

  const position = new THREE.Vector3(x, y, z);
  return { position };
}

// --- 이미지 한 장을 트리에 추가 ---
function addImageToTree(imageUrl) {
  const texLoader = new THREE.TextureLoader();
  texLoader.load(
    imageUrl,
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

      const { position } = getRandomPositionOnTree();
      plane.position.copy(position);
      plane.lookAt(new THREE.Vector3(0, position.y, 0));
      plane.rotateY(Math.PI);

      treeGroup.add(plane);
    },
    undefined,
    (err) => {
      console.error("텍스처 로드 오류", err);
    }
  );
}

// --- Firestore에서 실시간으로 이미지 목록 가져오기 ---
const q = query(imagesCol, orderBy("createdAt", "asc"));
onSnapshot(q, (snapshot) => {
  console.log("Firestore snapshot size:", snapshot.size);
  lastSnapshot = snapshot;

  snapshot.docs.forEach((docSnap) => {
    const id = docSnap.id;
    if (shownImageIds.has(id)) return;
    shownImageIds.add(id);

    const data = docSnap.data();
    if (data.url) {
      console.log("addImageFromDoc:", id, data.url);
      addImageToTree(data.url);
    }
  });

  updateCount(snapshot.size);
  renderMyImages();
});

// --- 파일 업로드 → Storage에 올리고 URL을 Firestore에 저장 ---
async function uploadAndRegister(file) {
  if (!currentUser) {
    alert("이미지를 올리려면 먼저 로그인 해주세요!");
    return;
  }

  const filePath = `uploads/${currentUser.uid}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, filePath);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);

  await addDoc(imagesCol, {
    url: downloadURL,
    path: filePath, // 삭제할 때 쓸 경로
    ownerUid: currentUser.uid,
    ownerEmail: currentUser.email,
    originalName: file.name,
    createdAt: serverTimestamp(),
  });
}

// 업로드 인풋
fileInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (!files || !files.length) return;

  const user = auth.currentUser;
  if (!user || !isAllowedDomain(user.email)) {
    alert("사내 구글 계정으로 로그인해야 업로드할 수 있습니다.");
    fileInput.value = "";
    return;
  }

  Array.from(files).forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    uploadAndRegister(file).catch((err) =>
      console.error("업로드 실패", err)
    );
  });

  fileInput.value = "";
});

// ----- “내가 올린 사진” 리스트 + 삭제 -----
function renderMyImages() {
  if (!myImagesList) return;

  myImagesList.innerHTML = "";

  if (!currentUser) {
    myImagesList.innerHTML =
      '<div style="opacity:0.6;">로그인 후 확인 가능합니다.</div>';
    return;
  }

  if (!lastSnapshot) {
    myImagesList.innerHTML =
      '<div style="opacity:0.6;">불러오는 중...</div>';
    return;
  }

  const myDocs = lastSnapshot.docs.filter((docSnap) => {
    const data = docSnap.data();
    return data.ownerUid === currentUser.uid;
  });

  if (!myDocs.length) {
    myImagesList.innerHTML =
      '<div style="opacity:0.6;">아직 올린 사진이 없습니다.</div>';
    return;
  }

  myDocs.forEach((docSnap) => {
    const data = docSnap.data();

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "4px";
    row.style.marginBottom = "2px";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = data.originalName || "사진";
    nameSpan.style.flex = "1";
    nameSpan.style.whiteSpace = "nowrap";
    nameSpan.style.overflow = "hidden";
    nameSpan.style.textOverflow = "ellipsis";

    const delBtn = document.createElement("button");
    delBtn.textContent = "삭제";
    delBtn.classList.add("secondary");
    delBtn.style.fontSize = "10px";
    delBtn.style.padding = "2px 6px";

    delBtn.addEventListener("click", () =>
      handleDeleteImage(docSnap.id, data)
    );

    row.appendChild(nameSpan);
    row.appendChild(delBtn);
    myImagesList.appendChild(row);
  });
}

async function handleDeleteImage(docId, data) {
  if (!currentUser || data.ownerUid !== currentUser.uid) {
    alert("내가 올린 사진만 삭제할 수 있습니다.");
    return;
  }

  const ok = confirm("정말 이 사진을 삭제할까요?");
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

// ----- 마우스 드래그 회전 / 줌 / 리사이즈 -----
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

// ----- 애니메이션 루프 -----
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
