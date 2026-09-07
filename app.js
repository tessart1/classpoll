import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase, ref, set, get, update, onValue, remove, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const root = document.getElementById("app");
const params = new URLSearchParams(location.search);
const pollFromUrl = (params.get("poll") || "").toUpperCase();
const isStudent = !!pollFromUrl;
let db = null;
let configured = false;

function configIsReady(cfg) {
  return cfg && cfg.apiKey && !cfg.apiKey.includes("PASTE_") && cfg.databaseURL && !cfg.databaseURL.includes("PASTE_");
}

try {
  configured = configIsReady(window.CLASSPOLL_FIREBASE_CONFIG);
  if (configured) {
    const firebaseApp = initializeApp(window.CLASSPOLL_FIREBASE_CONFIG);
    db = getDatabase(firebaseApp);
  }
} catch (e) {
  console.error(e);
}

function esc(s="") {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function respondentId(pollId) {
  const key = `classpoll_respondent_${pollId}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    localStorage.setItem(key, id);
  }
  return id;
}

if (isStudent) renderStudent(pollFromUrl); else renderInstructor();

function renderInstructor() {
  root.innerHTML = `
    <main class="app-shell">
      <div class="topbar">
        <div class="brand">ClassPoll <small>Instructor view · Version 1.0</small></div>
        <div id="connectionStatus" class="status-pill">${configured ? "Connecting…" : "Firebase setup required"}</div>
      </div>

      ${configured ? "" : `<div class="notice error"><strong>One-time setup needed:</strong> this copy of ClassPoll is ready, but it still needs your Firebase configuration. Follow the README instructions before publishing it to students.</div>`}

      <div class="grid">
        <section class="card" id="setupCard">
          <h2>Create a poll</h2>
          <label for="question">Question</label>
          <textarea id="question" placeholder="e.g., Which factor is most likely to introduce cognitive bias?"></textarea>
          <label>Response choices</label>
          <div id="answers" class="answers"></div>
          <div class="btn-row">
            <button id="addAnswer" class="btn">+ Add choice</button>
            <button id="createPoll" class="btn btn-primary" ${configured ? "" : "disabled"}>Open poll</button>
          </div>
          <p class="helper">Students vote anonymously. Version 1 limits each browser/device to one response per poll, but this is intended as a classroom convenience rather than a high-security voting system.</p>
        </section>

        <section class="card" id="joinCard">
          <h2>Student access</h2>
          <div id="noPollMessage" class="helper">Create a poll to generate the student QR code.</div>
          <div id="joinDetails" class="hidden">
            <div class="qr-wrap">
              <div id="qrcode"></div>
              <div>
                <div class="helper">Poll code</div>
                <div id="pollCode" class="code-box"></div>
                <p class="helper">Students can scan the QR code with their phone camera.</p>
                <div id="joinLink" class="join-link"></div>
              </div>
            </div>
            <div class="btn-row">
              <button id="togglePoll" class="btn btn-danger">Close voting</button>
              <button id="newPoll" class="btn">New poll</button>
            </div>
          </div>
        </section>
      </div>

      <section class="card" id="resultsCard" style="margin-top:20px">
        <div class="results-head">
          <div><h2 style="margin-bottom:4px">Results</h2><div id="resultQuestion" class="helper">No active poll</div></div>
          <div id="responseCount" class="response-count">0 responses</div>
        </div>
        <div class="btn-row">
          <button id="toggleResults" class="btn btn-success" disabled>Reveal results</button>
          <button id="fullscreen" class="btn" disabled>Full-screen results</button>
        </div>
        <div id="resultsCovered" class="results-covered">Results are hidden from the class</div>
        <div id="barList" class="bar-list hidden"></div>
      </section>
    </main>`;

  const answersEl = document.getElementById("answers");
  const addChoice = (value="") => {
    if (answersEl.children.length >= 6) return;
    const row = document.createElement("div");
    row.className = "answer-row";
    row.innerHTML = `<input type="text" maxlength="120" placeholder="Response choice" value="${esc(value)}"><button class="btn remove-choice" title="Remove">×</button>`;
    row.querySelector(".remove-choice").onclick = () => { if (answersEl.children.length > 2) row.remove(); };
    answersEl.appendChild(row);
  };
  ["", "", "", ""].forEach(addChoice);
  document.getElementById("addAnswer").onclick = () => addChoice();

  let activePollId = null;
  let activePoll = null;
  let resultsVisible = false;
  let unsubscribe = null;

  if (configured) {
    document.getElementById("connectionStatus").textContent = "Ready";
  }

  document.getElementById("createPoll").onclick = async () => {
    const question = document.getElementById("question").value.trim();
    const choices = [...answersEl.querySelectorAll("input")].map(i => i.value.trim()).filter(Boolean);
    if (!question) return alert("Please enter a question.");
    if (choices.length < 2) return alert("Please enter at least two response choices.");

    let pollId = randomCode();
    while ((await get(ref(db, `polls/${pollId}`))).exists()) pollId = randomCode();

    const poll = {
      question,
      choices,
      open: true,
      createdAt: serverTimestamp()
    };
    await set(ref(db, `polls/${pollId}`), poll);
    activePollId = pollId;
    activePoll = poll;
    resultsVisible = false;
    showJoinInfo();
    listenResults();
    document.getElementById("toggleResults").disabled = false;
    document.getElementById("fullscreen").disabled = false;
  };

  function showJoinInfo() {
    document.getElementById("noPollMessage").classList.add("hidden");
    document.getElementById("joinDetails").classList.remove("hidden");
    document.getElementById("pollCode").textContent = activePollId;
    const joinUrl = `${location.origin}${location.pathname}?poll=${activePollId}`;
    document.getElementById("joinLink").textContent = joinUrl;
    const qr = document.getElementById("qrcode");
    qr.innerHTML = "";
    if (window.QRCode) new QRCode(qr, { text: joinUrl, width: 180, height: 180 });
    document.getElementById("resultQuestion").textContent = activePoll.question;
    document.getElementById("togglePoll").textContent = activePoll.open ? "Close voting" : "Reopen voting";
    document.getElementById("togglePoll").className = activePoll.open ? "btn btn-danger" : "btn btn-success";
    setResultsVisibility(false);
  }

  function listenResults() {
    const voteRef = ref(db, `responses/${activePollId}`);
    onValue(voteRef, snap => {
      const values = snap.val() || {};
      const counts = Array(activePoll.choices.length).fill(0);
      Object.values(values).forEach(v => {
        if (Number.isInteger(v.choice) && counts[v.choice] !== undefined) counts[v.choice]++;
      });
      renderBars(counts);
    });
  }

  function renderBars(counts) {
    const total = counts.reduce((a,b)=>a+b,0);
    document.getElementById("responseCount").textContent = `${total} response${total===1?"":"s"}`;
    const list = document.getElementById("barList");
    list.innerHTML = activePoll.choices.map((c,i) => {
      const pct = total ? Math.round(counts[i] / total * 100) : 0;
      return `<div class="bar-row"><div class="bar-label">${esc(c)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-value">${counts[i]} · ${pct}%</div></div>`;
    }).join("");
  }

  function setResultsVisibility(show) {
    resultsVisible = show;
    document.getElementById("barList").classList.toggle("hidden", !show);
    document.getElementById("resultsCovered").classList.toggle("hidden", show);
    document.getElementById("toggleResults").textContent = show ? "Hide results" : "Reveal results";
  }

  document.getElementById("toggleResults").onclick = () => setResultsVisibility(!resultsVisible);

  document.getElementById("togglePoll").onclick = async () => {
    if (!activePollId) return;
    activePoll.open = !activePoll.open;
    await update(ref(db, `polls/${activePollId}`), {open: activePoll.open});
    showJoinInfo();
  };

  document.getElementById("newPoll").onclick = () => {
    activePollId = null;
    activePoll = null;
    document.getElementById("joinDetails").classList.add("hidden");
    document.getElementById("noPollMessage").classList.remove("hidden");
    document.getElementById("resultQuestion").textContent = "No active poll";
    document.getElementById("responseCount").textContent = "0 responses";
    document.getElementById("barList").innerHTML = "";
    setResultsVisibility(false);
    document.getElementById("toggleResults").disabled = true;
    document.getElementById("fullscreen").disabled = true;
    document.getElementById("question").focus();
  };

  document.getElementById("fullscreen").onclick = async () => {
    document.body.classList.toggle("fullscreen-results");
    if (document.body.classList.contains("fullscreen-results")) {
      try { await document.documentElement.requestFullscreen?.(); } catch {}
      document.getElementById("fullscreen").textContent = "Exit full screen";
    } else {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      document.getElementById("fullscreen").textContent = "Full-screen results";
    }
  };
}

async function renderStudent(pollId) {
  root.innerHTML = `<main class="student-shell"><div class="brand" style="margin-bottom:18px">ClassPoll <small>Student response</small></div><section class="student-card"><div id="studentContent" class="helper">Loading poll…</div></section></main>`;
  const content = document.getElementById("studentContent");
  if (!configured) {
    content.innerHTML = `<div class="notice error">This poll has not been connected to its classroom database yet.</div>`;
    return;
  }

  const pollRef = ref(db, `polls/${pollId}`);
  onValue(pollRef, async snap => {
    if (!snap.exists()) {
      content.innerHTML = `<h2>Poll not found</h2><p class="helper">Check the QR code or ask your instructor for a new one.</p>`;
      return;
    }
    const poll = snap.val();
    if (!poll.open) {
      content.innerHTML = `<h2>Voting is closed</h2><p class="helper">Your instructor has closed this poll.</p>`;
      return;
    }
    const id = respondentId(pollId);
    const myVoteRef = ref(db, `responses/${pollId}/${id}`);
    const existing = await get(myVoteRef);
    if (existing.exists()) {
      content.innerHTML = `<div class="thanks"><div class="check">✓</div><h2>Response recorded</h2><p class="helper">You have already responded to this poll.</p></div>`;
      return;
    }

    content.innerHTML = `
      <div class="helper">Poll ${esc(pollId)}</div>
      <div class="student-question">${esc(poll.question)}</div>
      <div id="optionList" class="option-list">
        ${poll.choices.map((c,i)=>`<button class="option-btn" data-index="${i}">${esc(c)}</button>`).join("")}
      </div>
      <button id="submitVote" class="btn btn-primary submit-btn" disabled>Submit response</button>
      <p class="helper" style="margin-bottom:0">Your response is anonymous.</p>`;

    let selected = null;
    content.querySelectorAll(".option-btn").forEach(btn => btn.onclick = () => {
      content.querySelectorAll(".option-btn").forEach(b=>b.classList.remove("selected"));
      btn.classList.add("selected");
      selected = Number(btn.dataset.index);
      document.getElementById("submitVote").disabled = false;
    });
    document.getElementById("submitVote").onclick = async () => {
      if (selected === null) return;
      const current = (await get(pollRef)).val();
      if (!current || !current.open) {
        alert("Voting has just closed.");
        return;
      }
      await set(myVoteRef, { choice:selected, submittedAt:serverTimestamp() });
      content.innerHTML = `<div class="thanks"><div class="check">✓</div><h2>Response recorded</h2><p class="helper">Thank you.</p></div>`;
    };
  });
}
