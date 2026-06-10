import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyARCjOAcGbnt6O0SvAStZ_lkG6qN5zFpPY",
  authDomain: "rifa-gremio.firebaseapp.com",
  projectId: "rifa-gremio",
  storageBucket: "rifa-gremio.firebasestorage.app",
  messagingSenderId: "394287283308",
  appId: "1:394287283308:web:eea8c1cdb9c6fec428ec49",
  measurementId: "G-V2HW5CDKSY",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const TOTAL = 1000;
const docRef = doc(db, "rifas", "ifarraia2026");

let takenMap = {};
let initialized = false;

const grid = document.getElementById("grid");
for (let i = 1; i <= TOTAL; i++) {
  const btn = document.createElement("button");
  btn.className = "num-btn";
  btn.textContent = i;
  btn.dataset.num = i;
  btn.disabled = true;
  btn.addEventListener("click", () => openModal(i));
  grid.appendChild(btn);
}

// Converte valores antigos (string) para o novo formato objeto
function normalizeEntry(value, num) {
  if (typeof value === "string") {
    return {
      comprador: value,
      contato: "não informado",
      vendedor: "não informado",
    };
  }
  if (value && typeof value === "object") {
    return {
      comprador: value.comprador || "?",
      contato: value.contato || "não informado",
      vendedor: value.vendedor || "não informado",
    };
  }
  return {
    comprador: "erro",
    contato: "erro",
    vendedor: "erro",
  };
}

async function ensureDoc() {
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    await setDoc(docRef, { takenMap: {} });
  }
}

function startListener() {
  onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        takenMap = snap.data().takenMap || {};
      } else {
        takenMap = {};
      }
      renderGrid();
      updateStats();
      if (!initialized) {
        document.getElementById("loading-screen").classList.add("hidden");
        grid.querySelectorAll(".num-btn").forEach((b) => (b.disabled = false));
        initialized = true;
      }
    },
    () => setOnlineStatus(false),
  );
}

function renderGrid() {
  grid.querySelectorAll(".num-btn").forEach((btn) => {
    const n = parseInt(btn.dataset.num);
    btn.classList.toggle("taken", takenMap[n] !== undefined);
  });
}

function updateStats() {
  const n = Object.keys(takenMap).length;
  document.getElementById("count-taken").textContent = n;
  document.getElementById("count-free").textContent = TOTAL - n;
  const pct = Math.round((n / TOTAL) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent = pct + "% vendido";
}

async function markNum(num, comprador, contato, vendedor) {
  const newMap = {
    ...takenMap,
    [num]: { comprador, contato, vendedor },
  };
  const btn = grid.querySelector(`[data-num="${num}"]`);
  takenMap = newMap;
  btn.classList.add("taken");
  updateStats();
  try {
    await setDoc(docRef, { takenMap: newMap });
    showToast(`Número ${num} marcado para ${comprador} (vendedor: ${vendedor}) ✓`);
  } catch (e) {
    delete takenMap[num];
    btn.classList.remove("taken");
    updateStats();
    showToast("Erro ao salvar. Verifique sua conexão.");
  }
}

async function unmarkNum(num) {
  const newMap = { ...takenMap };
  delete newMap[num];
  const btn = grid.querySelector(`[data-num="${num}"]`);
  takenMap = newMap;
  btn.classList.remove("taken");
  updateStats();
  try {
    await setDoc(docRef, { takenMap: newMap });
    showToast(`Número ${num} liberado`);
  } catch (e) {
    takenMap[num] = newMap[num];
    btn.classList.add("taken");
    updateStats();
    showToast("Erro ao salvar.");
  }
}

let pendingUnmarkNum = null;

function openModal(num) {
  const isTaken = takenMap[num] !== undefined;
  const rawOwner = takenMap[num];
  const owner = rawOwner ? normalizeEntry(rawOwner, num) : null;

  document.getElementById("modal-num").textContent = num;
  const st = document.getElementById("modal-status");
  st.textContent = isTaken ? "✓ Pego" : "Disponível";
  st.className = "modal-status " + (isTaken ? "taken" : "free");
  const body = document.getElementById("modal-body");
  const btns = document.getElementById("modal-btns");
  body.innerHTML = "";
  btns.innerHTML = "";

  if (isTaken) {
    body.innerHTML = `
      <div class="owner-badge">👤 Comprador: ${owner.comprador}</div>
      <div class="owner-badge">📞 Contato: ${owner.contato}</div>
      <div class="owner-badge">🤝 Vendedor: ${owner.vendedor}</div>
      <p>Deseja liberar este número?</p>
    `;
    const unmark = document.createElement("button");
    unmark.className = "btn btn-unmark";
    unmark.textContent = "↩ Liberar número";
    unmark.onclick = () => {
      closeModal("modal-overlay");
      openConfirm(num, owner.comprador);
    };
    btns.appendChild(unmark);
  } else {
    body.innerHTML = `
      <p style="margin-bottom:10px;">Dados do número <strong>${num}</strong>:</p>
      <input type="text" id="input-comprador" class="name-input" placeholder="Nome do comprador *" maxlength="40">
      <input type="text" id="input-contato" class="name-input" placeholder="Telefone / Documento *" maxlength="30">
      <input type="text" id="input-vendedor" class="name-input" placeholder="Nome de quem vendeu *" maxlength="40">
    `;
    const confirm = document.createElement("button");
    confirm.className = "btn btn-confirm";
    confirm.textContent = "✓ Marcar pego";
    confirm.onclick = () => {
      const comprador = document.getElementById("input-comprador").value.trim();
      const contato = document.getElementById("input-contato").value.trim();
      const vendedor = document.getElementById("input-vendedor").value.trim();
      if (!comprador || !contato || !vendedor) {
        showToast("⚠️ Preencha todos os campos!");
        return;
      }
      markNum(num, comprador, contato, vendedor);
      closeModal("modal-overlay");
    };
    // Enter no último campo aciona o botão
    const handleEnter = (e) => {
      if (e.key === "Enter") confirm.click();
    };
    btns.appendChild(confirm);
    // Adicionar listener após elementos criados
    setTimeout(() => {
      const inpComprador = document.getElementById("input-comprador");
      const inpContato = document.getElementById("input-contato");
      const inpVendedor = document.getElementById("input-vendedor");
      if (inpComprador) inpComprador.addEventListener("keydown", handleEnter);
      if (inpContato) inpContato.addEventListener("keydown", handleEnter);
      if (inpVendedor) inpVendedor.addEventListener("keydown", handleEnter);
      if (inpComprador) inpComprador.focus();
    }, 50);
  }

  const cancel = document.createElement("button");
  cancel.className = "btn btn-cancel";
  cancel.textContent = "Cancelar";
  cancel.onclick = () => closeModal("modal-overlay");
  btns.appendChild(cancel);
  document.getElementById("modal-overlay").classList.add("open");
}

function openConfirm(num, ownerName) {
  pendingUnmarkNum = num;
  document.getElementById("confirm-msg").textContent =
    `"${ownerName}" tem o número ${num}. Tem certeza que quer liberar?`;
  document.getElementById("confirm-overlay").classList.add("open");
}

document.getElementById("confirm-yes").onclick = () => {
  if (pendingUnmarkNum !== null) {
    unmarkNum(pendingUnmarkNum);
    pendingUnmarkNum = null;
  }
  closeModal("confirm-overlay");
};
document.getElementById("confirm-no").onclick = () =>
  closeModal("confirm-overlay");

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}
document
  .getElementById("modal-overlay")
  .addEventListener("click", function (e) {
    if (e.target === this) closeModal("modal-overlay");
  });
document
  .getElementById("confirm-overlay")
  .addEventListener("click", function (e) {
    if (e.target === this) closeModal("confirm-overlay");
  });

const rouletteOverlay = document.getElementById("roulette-overlay");
const btnStartRoll = document.getElementById("btn-start-roll");
const rouletteSub = document.getElementById("roulette-sub");
const prizeLabelTop = document.getElementById("prize-label-top");
const raffleCanvas = document.getElementById("raffle-canvas");

document.getElementById("btn-sorteio").onclick = openRoulette;
document.getElementById("btn-close-roulette").onclick = closeRoulette;

let rolling = false;
let animFrameId = null;

function clearCanvas() {
  const ctx = raffleCanvas.getContext("2d");
  ctx.clearRect(0, 0, raffleCanvas.width, raffleCanvas.height);
}

function openRoulette() {
  const participants = Object.entries(takenMap);
  if (participants.length < 1) {
    showToast("Nenhum número pego ainda!");
    return;
  }
  prizeLabelTop.textContent = "";
  prizeLabelTop.classList.remove("show");
  rouletteSub.textContent = "Quem vai ganhar o Balaio Junino?";
  rouletteSub.classList.remove("active");
  btnStartRoll.style.display = "";
  btnStartRoll.disabled = false;
  btnStartRoll.textContent = "🔥 Acender a Fogueira";
  rolling = false;
  clearCanvas();
  rouletteOverlay.classList.add("open");
}

function closeRoulette() {
  if (rolling) return;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  rouletteOverlay.classList.remove("open");
}

btnStartRoll.onclick = async () => {
  if (rolling) return;
  rolling = true;
  btnStartRoll.disabled = true;
  btnStartRoll.textContent = "🔥 Sorteando...";

  const participants = Object.entries(takenMap).map(([num, data]) => {
    const norm = normalizeEntry(data, num);
    return {
      num: parseInt(num),
      name: norm.comprador,
      raw: norm,
    };
  });
  const pool = [...participants];
  shuffleArray(pool);
  const winner = pool[0];

  prizeLabelTop.textContent = "";
  rouletteSub.textContent = "A fogueira está escolhendo...";
  rouletteSub.classList.add("active");

  await runFireAnimation(participants, winner);

  rouletteSub.textContent = `🎉 Parabéns, ${winner.name}!`;
  rouletteSub.classList.add("active");
  btnStartRoll.textContent = "🔄 Sortear novamente";
  btnStartRoll.disabled = false;
  rolling = false;
};

function runFireAnimation(participants, winner) {
  return new Promise((resolve) => {
    const canvas = raffleCanvas;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    const PHASE_SPARKS = 2200;
    const PHASE_CONVERGE = 1400;
    const PHASE_REVEAL = 1200;
    const TOTAL_DUR = PHASE_SPARKS + PHASE_CONVERGE + PHASE_REVEAL;

    let startTime = null;
    let particles = [];
    let fireParticles = [];
    let explosionDone = false;
    let idleMode = false;
    let idleStart = null;

    const count = Math.min(participants.length, 60);
    for (let i = 0; i < count; i++) {
      const p = participants[i % participants.length];
      const angle = (i / count) * Math.PI * 2;
      const radius = 80 + Math.random() * 90;
      particles.push({
        x: W / 2 + Math.cos(angle) * radius,
        y: H / 2 + Math.sin(angle) * radius,
        name: p.name,
        num: p.num,
        isWinner: p.num === winner.num,
        size: 11 + Math.random() * 4,
        hue: 15 + Math.random() * 45,
        trail: [],
        orbitAngle: angle,
        orbitR: radius,
        orbitSpeed:
          (Math.random() > 0.5 ? 1 : -1) * (0.008 + Math.random() * 0.012),
      });
    }

    const idleEmbers = [];
    const cx0 = W / 2;
    const cy0 = H - 20;

    function spawnEmber(cx, cy) {
      fireParticles.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy,
        vx: (Math.random() - 0.5) * 2,
        vy: -(1.5 + Math.random() * 3),
        life: 1,
        decay: 0.012 + Math.random() * 0.018,
        size: 2 + Math.random() * 4,
        hue: 20 + Math.random() * 50,
      });
    }

    function spawnIdleEmber() {
      idleEmbers.push({
        x: cx0 + (Math.random() - 0.5) * 22,
        y: cy0 - 10,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -(0.8 + Math.random() * 1.8),
        life: 1,
        decay: 0.012 + Math.random() * 0.018,
        size: 1.2 + Math.random() * 2,
        hue: 20 + Math.random() * 40,
      });
    }

    function drawFlame(cx, cy, t) {
      const layers = [
        { h: 55, w: 28, color: "rgba(255,60,0,0.9)" },
        { h: 42, w: 20, color: "rgba(255,130,0,0.85)" },
        { h: 28, w: 13, color: "rgba(255,220,0,0.9)" },
        { h: 14, w: 7, color: "rgba(255,255,180,0.95)" },
      ];
      const wobble = Math.sin(t * 8) * 3;
      layers.forEach(({ h, w, color }) => {
        ctx.beginPath();
        ctx.moveTo(cx - w, cy);
        ctx.bezierCurveTo(
          cx - w,
          cy - h * 0.4,
          cx - w * 0.3 + wobble,
          cy - h * 0.8,
          cx,
          cy - h,
        );
        ctx.bezierCurveTo(
          cx + w * 0.3 + wobble,
          cy - h * 0.8,
          cx + w,
          cy - h * 0.4,
          cx + w,
          cy,
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      });
    }

    function drawIdleFlame(t) {
      const layers = [
        { r: 42, h: 72, hue: 10, alpha: 0.22 },
        { r: 30, h: 56, hue: 25, alpha: 0.35 },
        { r: 20, h: 38, hue: 40, alpha: 0.55 },
        { r: 12, h: 22, hue: 55, alpha: 0.75 },
        { r: 6, h: 11, hue: 60, alpha: 0.9 },
      ];
      for (const l of layers) {
        const wobble = Math.sin(t * 4.5 + l.r) * 3;
        const wobble2 = Math.cos(t * 3.7 + l.h) * 2;
        const grad = ctx.createRadialGradient(
          cx0 + wobble,
          cy0 - l.h * 0.4 + wobble2,
          0,
          cx0 + wobble * 0.5,
          cy0 - l.h * 0.2,
          l.r * 1.4,
        );
        grad.addColorStop(0, `hsla(${l.hue + 10},100%,90%,${l.alpha})`);
        grad.addColorStop(0.4, `hsla(${l.hue},100%,65%,${l.alpha * 0.8})`);
        grad.addColorStop(1, `hsla(${l.hue - 10},100%,40%,0)`);
        const bx = cx0 + wobble,
          by = cy0;
        const tipX = cx0 + wobble2,
          tipY = cy0 - l.h;
        ctx.beginPath();
        ctx.moveTo(bx - l.r, by);
        ctx.bezierCurveTo(
          bx - l.r * 0.8,
          by - l.h * 0.3,
          tipX - l.r * 0.3,
          tipY + l.h * 0.2,
          tipX,
          tipY,
        );
        ctx.bezierCurveTo(
          tipX + l.r * 0.3,
          tipY + l.h * 0.2,
          bx + l.r * 0.8,
          by - l.h * 0.3,
          bx + l.r,
          by,
        );
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      const core = ctx.createRadialGradient(
        cx0,
        cy0 - 12,
        0,
        cx0,
        cy0 - 12,
        10,
      );
      core.addColorStop(0, "rgba(255,255,240,0.9)");
      core.addColorStop(1, "rgba(255,200,50,0)");
      ctx.beginPath();
      ctx.arc(cx0, cy0 - 12, 10, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();
    }

    function drawIdleLogs() {
      ctx.save();
      ctx.strokeStyle = "#5c2d00";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx0 - 55, H - 10);
      ctx.lineTo(cx0 + 10, H - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx0 + 55, H - 10);
      ctx.lineTo(cx0 - 10, H - 22);
      ctx.stroke();
      ctx.strokeStyle = "#7a3d00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx0 - 52, H - 13);
      ctx.lineTo(cx0 + 8, H - 25);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx0 + 52, H - 13);
      ctx.lineTo(cx0 - 8, H - 25);
      ctx.stroke();
      ctx.restore();
    }

    function wrapText(text, maxWidth, fontSize) {
      ctx.font = `700 ${fontSize}px "Nunito", sans-serif`;
      const words = text.split(" ");
      const lines = [];
      let current = "";
      for (const word of words) {
        const test = current ? current + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines;
    }

    function drawWinnerOverlay(t) {
      const pulse = 0.12 + Math.sin(t * 3.1) * 0.04;
      const grd = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, 90);
      grd.addColorStop(0, `rgba(255,140,0,${pulse})`);
      grd.addColorStop(1, "rgba(255,60,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      const R = 80;
      const centerY = H / 2 - 50;

      ctx.save();
      ctx.translate(W / 2, centerY);
      ctx.shadowColor = "rgba(255,200,0,1)";
      ctx.shadowBlur = 40 + Math.sin(t * 6) * 10;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,140,0,0.18)";
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = `900 44px "Abril Fatface", serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff7b0";
      ctx.shadowColor = "#ff8800";
      ctx.shadowBlur = 20;
      ctx.fillText(winner.num, 0, -18);

      ctx.font = `800 13px "Nunito", sans-serif`;
      ctx.fillStyle = "#ffe590";
      ctx.shadowBlur = 8;
      ctx.fillText(winner.name.toUpperCase(), 0, 10);

      const subFontSize = 10;
      const maxW = R * 1.6;
      const lines = wrapText("Você ganhou um Balaio Junino", maxW, subFontSize);
      ctx.font = `700 ${subFontSize}px "Nunito", sans-serif`;
      ctx.fillStyle = "rgba(255,210,120,0.8)";
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 5;
      const lineH = subFontSize + 4;
      lines.forEach((line, i) => {
        ctx.fillText(line, 0, 28 + i * lineH);
      });

      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function easeInOut(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function frame(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const t = elapsed / 1000;

      ctx.clearRect(0, 0, W, H);

      if (idleMode) {
        if (!idleStart) idleStart = ts;
        const it = (ts - idleStart) / 1000;

        const vignette = ctx.createRadialGradient(
          W / 2,
          H / 2,
          20,
          W / 2,
          H / 2,
          W * 0.7,
        );
        vignette.addColorStop(0, "rgba(30,5,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);

        drawIdleLogs();
        if (Math.random() < 0.35) spawnIdleEmber();
        for (let i = idleEmbers.length - 1; i >= 0; i--) {
          const e = idleEmbers[i];
          e.x += e.vx + Math.sin(it * 3 + i) * 0.3;
          e.y += e.vy;
          e.vy -= 0.03;
          e.life -= e.decay;
          if (e.life <= 0) {
            idleEmbers.splice(i, 1);
            continue;
          }
          ctx.beginPath();
          ctx.arc(e.x, e.y, Math.max(0, e.size * e.life), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${e.hue},100%,65%,${e.life * 0.9})`;
          ctx.fill();
        }
        drawIdleFlame(it);
        drawWinnerOverlay(it);

        animFrameId = requestAnimationFrame(frame);
        return;
      }

      const vignette = ctx.createRadialGradient(
        W / 2,
        H / 2,
        20,
        W / 2,
        H / 2,
        W * 0.7,
      );
      vignette.addColorStop(0, "rgba(30,5,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      if (elapsed < PHASE_SPARKS) {
        const prog = elapsed / PHASE_SPARKS;
        if (Math.random() < 0.4) spawnEmber(W / 2, H - 20);
        drawFlame(W / 2, H - 20, t);
        fireParticles = fireParticles.filter((fp) => fp.life > 0);
        fireParticles.forEach((fp) => {
          fp.x += fp.vx;
          fp.y += fp.vy;
          fp.vy -= 0.04;
          fp.life -= fp.decay;
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, Math.max(0, fp.size * fp.life), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${fp.hue},100%,60%,${fp.life * 0.8})`;
          ctx.fill();
        });
        particles.forEach((p) => {
          p.orbitAngle += p.orbitSpeed;
          const targetR = p.orbitR * (1 - prog * 0.25);
          p.x = W / 2 + Math.cos(p.orbitAngle) * targetR;
          p.y = H / 2 + Math.sin(p.orbitAngle) * targetR;
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 8) p.trail.shift();
          p.trail.forEach((tp, ti) => {
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue + 20},100%,70%,${(ti / p.trail.length) * 0.4})`;
            ctx.fill();
          });
          ctx.shadowColor = `hsl(${p.hue},100%,60%)`;
          ctx.shadowBlur = p.isWinner ? 18 : 12;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${p.hue},100%,65%)`;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.font = `700 ${p.size}px "Nunito", sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(255,230,180,0.9)";
          ctx.fillText(p.num, p.x, p.y - 8);
          ctx.font = `800 9px "Nunito", sans-serif`;
          ctx.fillStyle = "rgba(255,200,130,0.7)";
          ctx.fillText(p.name.substring(0, 10), p.x, p.y + 14);
        });
      } else if (elapsed < PHASE_SPARKS + PHASE_CONVERGE) {
        const prog = (elapsed - PHASE_SPARKS) / PHASE_CONVERGE;
        const eased = easeInOut(prog);
        for (let i = 0; i < 3; i++)
          spawnEmber(W / 2, H / 2 + 30 + (1 - eased) * (H / 2 - 50 - 30));
        drawFlame(W / 2, H / 2 + 30 + (1 - eased) * (H / 2 - 50 - 30), t);
        fireParticles = fireParticles.filter((fp) => fp.life > 0);
        fireParticles.forEach((fp) => {
          fp.x += fp.vx;
          fp.y += fp.vy;
          fp.vy -= 0.05;
          fp.life -= fp.decay;
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, Math.max(0, fp.size * fp.life), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${fp.hue},100%,60%,${fp.life})`;
          ctx.fill();
        });
        particles.forEach((p) => {
          p.x += (W / 2 - p.x) * (0.06 + eased * 0.1);
          p.y += (H / 2 - p.y) * (0.06 + eased * 0.1);
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 5) p.trail.shift();
          p.trail.forEach((tp, ti) => {
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue},100%,70%,${(ti / p.trail.length) * 0.5 * (1 - eased)})`;
            ctx.fill();
          });
          ctx.globalAlpha = 1 - eased * 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 * (1 - eased * 0.6), 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${p.hue},100%,65%)`;
          ctx.fill();
          ctx.globalAlpha = 1;
        });
        const glowR = eased * 60;
        const glow = ctx.createRadialGradient(
          W / 2,
          H / 2,
          0,
          W / 2,
          H / 2,
          glowR,
        );
        glow.addColorStop(0, `rgba(255,180,0,${eased * 0.9})`);
        glow.addColorStop(0.5, `rgba(255,80,0,${eased * 0.5})`);
        glow.addColorStop(1, "rgba(255,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
      } else if (elapsed < TOTAL_DUR) {
        const prog = (elapsed - PHASE_SPARKS - PHASE_CONVERGE) / PHASE_REVEAL;
        const eased = easeInOut(prog);
        if (!explosionDone) {
          explosionDone = true;
          for (let i = 0; i < 80; i++) {
            const angle = (i / 80) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 3 + Math.random() * 7;
            const hue = [15, 45, 200, 130, 270, 0][
              Math.floor(Math.random() * 6)
            ];
            fireParticles.push({
              x: W / 2,
              y: H / 2,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1,
              decay: 0.008 + Math.random() * 0.012,
              size: 4 + Math.random() * 8,
              hue,
            });
          }
        }
        fireParticles = fireParticles.filter((fp) => fp.life > 0);
        fireParticles.forEach((fp) => {
          fp.x += fp.vx;
          fp.y += fp.vy;
          fp.vy += 0.12;
          fp.vx *= 0.97;
          fp.life -= fp.decay;
          ctx.shadowColor = `hsl(${fp.hue},100%,60%)`;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, Math.max(0, fp.size * fp.life), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${fp.hue},100%,65%,${fp.life})`;
          ctx.fill();
          ctx.shadowBlur = 0;
        });
        const scale = 0.4 + eased * 0.6;
        const alpha = Math.min(1, prog * 3);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        ctx.shadowColor = "rgba(255,200,0,1)";
        ctx.shadowBlur = 40 + Math.sin(t * 6) * 10;
        ctx.beginPath();
        ctx.arc(0, 0, 58, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,140,0,0.25)";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = `900 38px "Abril Fatface", serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff7b0";
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 18;
        ctx.fillText(winner.num, 0, -10);
        ctx.font = `800 13px "Nunito", sans-serif`;
        ctx.fillStyle = "#ffe590";
        ctx.shadowBlur = 10;
        ctx.fillText(winner.name.toUpperCase(), 0, 18);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        idleMode = true;
        resolve();
      }

      animFrameId = requestAnimationFrame(frame);
    }

    animFrameId = requestAnimationFrame(frame);
  });
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setOnlineStatus(online) {
  const bar = document.getElementById("online-bar");
  bar.className = "online-bar " + (online ? "online" : "offline");
  document.getElementById("online-text").textContent = online
    ? "Conectado — atualizações em tempo real"
    : "Sem conexão — reconectando...";
}
window.addEventListener("online", () => setOnlineStatus(true));
window.addEventListener("offline", () => setOnlineStatus(false));

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

await ensureDoc();
startListener();