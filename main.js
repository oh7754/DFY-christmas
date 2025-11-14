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

// ===== DOM 요소들 =====
// 프로필 / 사이드 레일
const profileCircle = document.getElementById("profileCircle");
const profileImage = document.getElementById("profileImage");
const profileInitials = document.getElementById("profileInitials");
const profileEmailEl = document.getElementById("profileEmail");
const addWishBtn = document.getElementById("addWishBtn");
const myWishListEl = document.getElementById("myWishList");

// 소원 작성 모달
const wishModal = document.getElementById("wishModal");
const wishNameInput = document.getElementById("wishName");
const wishTextInput = document.getElementById("wishText");
const wishImageInput = document.getElementById("wishImageInput");
const wishImageName = document.getElementById("wishImageName");
const wishCancelBtn = document.getElementById("wishCancelBtn");
const wishSubmitBtn = document.getElementById("wishSubmitBtn");

// 전체 개수
const countEl = document.getElementById("count");

// 편지 패널
const wishPanel = document.getElementById("wishPanel");
const wishSenderEl = document.getElementById("wishSender");
const wishContentEl = document.getElementById("wishContent");
const wishCloseBtn = document.getElementById("wishCloseBtn");

// ===== 상태 =====
let currentUser = null;
const shownImageIds = new Set();
let lastSnapshot = null;

// 트리에 걸린 이미지 메쉬들 → 소원 데이터 매핑
const imageMeshes = [];
const meshToData = new Map();

// ===== 유틸: 도메인 체크 =====
function isAllowedDomain(email) {
  return email && email.endsWith("@" + ALLOWED_DOMAIN);
}

// ===== Auth 상태 관리 =====
onAuthStateChanged(auth, (user) => {
  if (user && isAllowedDomain(user.email)) {
    currentUser = user;

    // 프로필 UI 업데이트
    if (profileCircle) {
      profileCircle.classList.remove("logged-out");
    }

    const email = user.email || "";
    const name = user.displayName || email.split("@")[0] || "";

    if (profileEmailEl) {
      profileEmailEl.textContent = email;
    }

    if (user.photoURL && profileImage) {
      profileImage.src = user.photoURL;
      profileImage.style.display = "block";
      if (profileInitials) profileInitials.style.display = "none";
    } else if (profileInitials) {
      const initials = name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      profileInitials.textContent = initials || "?";
      profileInitials.style.display = "flex";
      if (profileImage) profileImage.style.display = "none";
    }

    if (addWishBtn) addWishBtn.disabled = false;
  } else {
    // 로그아웃 / 다른 도메인
    currentUser = null;

    if (profileCircle) profileCircle.classList.add("logged-out");
    if (profileImage) profileImage.style.display = "none";
    if (profileInitials) {
      profileInitials.style.display = "flex";
      profileInitials.textContent = "?";
    }
    if (profileEmailEl) {
      profileEmailEl.textContent = "로그인 필요";
    }
    if (addWishBtn) addWishBtn.disabled = true;
  }

  // 내 소원 코인 리스트 다시 그리기
  renderMyWishList();
});

// 프로필 동그라미 클릭 → 로그인 / 로그아웃
if (profileCircle) {
  profileCircle.addEventListener("click", async () => {
    try {
      if (!currentUser) {
        await signInWithPopup(auth, provider);
      } else {
        const ok = confirm("이 계정에서 로그아웃 할까요?");
        if (ok) {
          closeWishPanel();
          await signOut(auth);
        }
      }
    } catch (err) {
      console.error("로그인/로그아웃 실패", err);
      alert("로그인/로그아웃 중 오류가 발생했습니다.");
    }
  });
}

// ===== 소원 작성 모달 열기/닫기 =====
function openWishModal() {
  if (!currentUser || !isAllowedDomain(currentUser.email)) {
    alert("사내 구글 계정으로 로그인해야 소원을 올릴 수 있습니다.");
    return;
  }
  if (!wishModal) return;

  if (wishNameInput && !wishNameInput.value) {
    // 기본값: 이름 없으면 이메일 앞부분
    const email = currentUser.email || "";
    wishNameInput.value = currentUser.displayName || email.split("@")[0] || "";
  }

  if (wishTextInput) wishTextInput.value = "";
  if (wishImageInput) wishImageInput.value = "";
  if (wishImageName) wishImageName.textContent = "선택된 파일 없음";

  wishModal.classList.remove("hidden");
}

function closeWishModal() {
  if (!wishModal) return;
  wishModal.classList.add("hidden");
}

if (addWishBtn) addWishBtn.addEventListener("click", openWishModal);
if (wishCancelBtn) wishCancelBtn.addEventListener("click", closeWishModal);

// 배경 클릭으로 닫기
if (wishModal) {
  const backdrop = wishModal.querySelector(".modal-backdrop");
  if (backdrop) {
    backdrop.addEventListener("click", closeWishModal);
  }
}

// 파일 선택시 파일 이름 표시
if (wishImageInput) {
  wishImageInput.addEventListener("change", () => {
    const f = wishImageInput.files[0];
    if (wishImageName) {
      wishImageName.textContent = f ? f.name : "선택된 파일 없음";
    }
  });
}

// ===== 이미지 리사이즈 & 압축 =====
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
            return reject(new Error("이미지 압축 실패"));
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

    img.onerror = reject;
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

// ===== 업로드 로직 (모달에서 호출) =====
async function uploadAndRegister(file, wishName, wishText) {
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
    path: filePath,
    ownerUid: currentUser.uid,
    ownerEmail: currentUser.email,
    originalName: file.name,
    wishName: wishName || "",
    wishText: wishText || "",
    createdAt: serverTimestamp(),
  });
}

// 모달 "소원 올리기" 버튼
if (wishSubmitBtn) {
  wishSubmitBtn.addEventListener("click", async () => {
    if (!wishImageInput) return;

    const file = wishImageInput.files[0];
    if (!file) {
      alert("이미지를 선택해 주세요.");
      return;
    }

    const name = (wishNameInput && wishNameInput.value.trim()) || "";
    const text = (wishTextInput && wishTextInput.value.trim()) || "";

    try {
      const processed = await compressImage(file);
      await uploadAndRegister(processed, name, text);
      closeWishModal();
    } catch (err) {
      console.error("소원 업로드 실패", err);
      alert("소원을 올리는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
    }
  });
}

// ===== Three.js 씬 설정 =====
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
  if (!countEl) return;
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

      const { position } = getRandomPositionOnTree();
      plane.position.copy(position);
      plane.lookAt(new THREE.Vector3(0, position.y, 0));
      plane.rotateY(Math.PI);

      treeGroup.add(plane);

      imageMeshes.push(plane);
      meshToData.set(plane, { ...data, id: docId });
    },
    undefined,
    (err) => {
      console.error("텍스처 로드 오류", err);
    }
  );
}

// ===== Firestore 실시간 구독 =====
const q = query(imagesCol, orderBy("createdAt", "asc"));
onSnapshot(q, (snapshot) => {
  console.log("Firestore snapshot size:", snapshot.size);
  lastSnapshot = snapshot;

  snapshot.docChanges().forEach((change) => {
    const id = change.doc.id;
    const data = change.doc.data();

    if (change.type === "added") {
      if (shownImageIds.has(id) || !data.url) return;
      shownImageIds.add(id);
      addImageToTree(id, data);
    } else if (change.type === "removed") {
      shownImageIds.delete(id);

      // 메쉬 제거
      const entry = [...meshToData.entries()].find(
        ([, value]) => value.id === id
      );
      if (entry) {
        const [mesh] = entry;
        treeGroup.remove(mesh);
        meshToData.delete(mesh);
        const idx = imageMeshes.indexOf(mesh);
        if (idx >= 0) imageMeshes.splice(idx, 1);
      }
    }
  });

  updateCount(snapshot.size);
  renderMyWishList();
});

// ===== “내 소원” 코인 리스트 + 삭제 =====
function renderMyWishList() {
  if (!myWishListEl) return;

  myWishListEl.innerHTML = "";

  if (!currentUser) {
    myWishListEl.innerHTML =
      '<div style="opacity:0.6; font-size:12px;">로그인 후 확인 가능합니다.</div>';
    return;
  }
  if (!lastSnapshot) {
    myWishListEl.innerHTML =
      '<div style="opacity:0.6; font-size:12px;">불러오는 중...</div>';
    return;
  }

  const myDocs = lastSnapshot.docs.filter(
    (docSnap) => docSnap.data().ownerUid === currentUser.uid
  );

  if (!myDocs.length) {
    myWishListEl.innerHTML =
      '<div style="opacity:0.6; font-size:12px;">아직 올린 소원이 없습니다.</div>';
    return;
  }

  myDocs.forEach((docSnap) => {
    const data = docSnap.data();
    const id = docSnap.id;

    const coin = document.createElement("div");
    coin.className = "wish-coin";

    // 코인 클릭 → 편지 패널 열기
    coin.addEventListener("click", () => {
      showWishPanel({
        wishName: data.wishName,
        ownerEmail: data.ownerEmail,
        wishText: data.wishText,
      });
    });

    const dot = document.createElement("div");
    dot.className = "delete-dot";
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteImage(id, data);
    });

    coin.appendChild(dot);
    myWishListEl.appendChild(coin);
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
    await deleteDoc(doc(db, "treeImages", docId));
  } catch (err) {
    console.error("삭제 실패", err);
    alert("삭제 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
  }
}

// ===== 트리에 걸린 이미지 클릭 → 소원 편지 패널 =====
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
  if (!wishPanel || !wishSenderEl || !wishContentEl) return;

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
  if (!wishPanel) return;
  wishPanel.classList.add("hidden");
}

if (wishCloseBtn) {
  wishCloseBtn.addEventListener("click", closeWishPanel);
}

// ===== 마우스 드래그 회전 / 줌 / 리사이즈 =====
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

// ===== 애니메이션 루프 =====
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
