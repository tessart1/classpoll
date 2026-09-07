import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase, ref, set, get, update, onValue, remove, push, serverTimestamp
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
        <div class="brand">ClassPoll <small>Instructor view · Version 1.2</small></div>
        <div id="connectionStatus" class="status-pill">${configured ? "Connecting…" : "Firebase setup required"}</div>
      </div>

      ${configured ? "" : `<div class="notice error"><strong>One-time setup needed:</strong> this copy of ClassPoll needs its Firebase configuration before it can be used.</div>`}

      <div class="library-layout">
        <section class="card" id="libraryCard">
          <div class="section-heading">
            <div>
              <h2>Saved polls</h2>
              <p class="helper">Prepare questions before class and organize them into poll sets.</p>
            </div>
            <button id="newSet" class="btn" ${configured ? "" : "disabled"}>+ New set</button>
          </div>
          <div id="libraryEmpty" class="library-empty">No saved polls yet. Create a question below, then choose <strong>Save poll</strong>.</div>
          <div id="setList" class="set-list"></div>
        </section>

        <section class="card" id="setupCard">
          <div class="section-heading">
            <div>
              <h2 id="editorTitle">Create a poll</h2>
              <p id="editorHint" class="helper">Use this for an impromptu poll, or save it for later.</p>
            </div>
            <button id="clearEditor" class="btn">Clear</button>
          </div>
          <label for="question">Question</label>
          <textarea id="question" placeholder="e.g., Which factor is most likely to introduce cognitive bias?"></textarea>
          <label>Response choices</label>
          <div id="answers" class="answers"></div>
          <div class="btn-row">
            <button id="addAnswer" class="btn">+ Add choice</button>
            <button id="savePoll" class="btn" ${configured ? "" : "disabled"}>Save poll</button>
            <button id="createPoll" class="btn btn-primary" ${configured ? "" : "disabled"}>Open poll</button>
          </div>
          <p class="helper">Students vote anonymously. This app limits each browser/device to one response per live poll, but it is intended as a classroom convenience rather than a high-security voting system.</p>
        </section>
      </div>

      <section class="card" id="joinCard" style="margin-top:20px">
        <h2>Student access</h2>
        <div id="noPollMessage" class="helper">Open a poll to generate the student QR code.</div>
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

      <section class="card" id="resultsCard" style="margin-top:20px">
        <div class="results-head">
          <div><h2 style="margin-bottom:4px">Results</h2><div id="resultQuestion" class="helper">No active poll</div></div>
          <div id="responseCount" class="response-count">0 responses</div>
        </div>
        <div class="btn-row">
          <button id="toggleResults" class="btn btn-success" disabled>Reveal results</button>
          <button id="shareResults" class="btn" disabled>Share results with students</button>
          <button id="fullscreen" class="btn" disabled>Full-screen results</button>
        </div>
        <div id="resultsCovered" class="results-covered">Results are hidden from the class</div>
        <div id="barList" class="bar-list hidden"></div>
      </section>
    </main>`;

  const answersEl = document.getElementById("answers");
  let editingSaved = null; // { setId, pollId }
  let savedSets = {};
  let activePollId = null;
  let activePoll = null;
  let resultsVisible = false;

  const addChoice = (value="") => {
    if (answersEl.children.length >= 6) return;
    const row = document.createElement("div");
    row.className = "answer-row";
    row.innerHTML = `<input type="text" maxlength="120" placeholder="Response choice" value="${esc(value)}"><button class="btn remove-choice" title="Remove">×</button>`;
    row.querySelector(".remove-choice").onclick = () => { if (answersEl.children.length > 2) row.remove(); };
    answersEl.appendChild(row);
  };

  function resetAnswers(values=["", "", "", ""]) {
    answersEl.innerHTML = "";
    const normalized = values.length >= 2 ? values.slice(0,6) : ["", "", "", ""];
    normalized.forEach(addChoice);
  }
  resetAnswers();

  document.getElementById("addAnswer").onclick = () => addChoice();
  document.getElementById("clearEditor").onclick = clearEditor;

  function readEditor() {
    return {
      question: document.getElementById("question").value.trim(),
      choices: [...answersEl.querySelectorAll("input")].map(i => i.value.trim()).filter(Boolean)
    };
  }

  function validateEditor() {
    const data = readEditor();
    if (!data.question) { alert("Please enter a question."); return null; }
    if (data.choices.length < 2) { alert("Please enter at least two response choices."); return null; }
    return data;
  }

  function clearEditor() {
    editingSaved = null;
    document.getElementById("question").value = "";
    resetAnswers();
    document.getElementById("editorTitle").textContent = "Create a poll";
    document.getElementById("editorHint").textContent = "Use this for an impromptu poll, or save it for later.";
    document.getElementById("savePoll").textContent = "Save poll";
    document.getElementById("question").focus();
  }

  function loadIntoEditor(setId, pollId) {
    const saved = savedSets?.[setId]?.polls?.[pollId];
    if (!saved) return;
    editingSaved = {setId, pollId};
    document.getElementById("question").value = saved.question || "";
    resetAnswers(saved.choices || []);
    document.getElementById("editorTitle").textContent = "Edit saved poll";
    document.getElementById("editorHint").textContent = `Loaded from “${savedSets[setId].name || "Untitled set"}”. You can edit it, save changes, or open it now.`;
    document.getElementById("savePoll").textContent = "Save changes";
    document.getElementById("setupCard").scrollIntoView({behavior:"smooth", block:"start"});
  }

  function chooseSet(excludeId=null) {
    const entries = Object.entries(savedSets || {}).filter(([id]) => id !== excludeId);
    if (!entries.length) return null;
    const menu = entries.map(([id,s],i)=>`${i+1}. ${s.name || "Untitled set"}`).join("\n");
    const raw = prompt(`Choose a poll set:\n\n${menu}\n\nEnter the number:`);
    if (raw === null) return null;
    const idx = Number(raw) - 1;
    return entries[idx]?.[0] || null;
  }

  document.getElementById("newSet").onclick = async () => {
    const name = prompt("Name this poll set (for example, Ethics – Class 3):");
    if (!name || !name.trim()) return;
    const newRef = push(ref(db, "savedPollSets"));
    await set(newRef, {name:name.trim(), createdAt:serverTimestamp()});
  };

  document.getElementById("savePoll").onclick = async () => {
    const data = validateEditor();
    if (!data) return;

    if (editingSaved) {
      await update(ref(db, `savedPollSets/${editingSaved.setId}/polls/${editingSaved.pollId}`), {
        question:data.question, choices:data.choices, updatedAt:serverTimestamp()
      });
      alert("Saved poll updated.");
      return;
    }

    let setId = chooseSet();
    if (!setId) {
      const setName = prompt("Create a poll set for this question.\n\nSet name:", "My Polls");
      if (!setName || !setName.trim()) return;
      const newSetRef = push(ref(db, "savedPollSets"));
      setId = newSetRef.key;
      await set(newSetRef, {name:setName.trim(), createdAt:serverTimestamp()});
    }
    const pollRef = push(ref(db, `savedPollSets/${setId}/polls`));
    await set(pollRef, {question:data.question, choices:data.choices, createdAt:serverTimestamp()});
    editingSaved = {setId, pollId:pollRef.key};
    document.getElementById("editorTitle").textContent = "Edit saved poll";
    document.getElementById("editorHint").textContent = `Saved in “${savedSets?.[setId]?.name || "poll set"}”.`;
    document.getElementById("savePoll").textContent = "Save changes";
  };

  function renderLibrary() {
    const setList = document.getElementById("setList");
    const entries = Object.entries(savedSets || {}).sort((a,b)=>(a[1].name||"").localeCompare(b[1].name||""));
    document.getElementById("libraryEmpty").classList.toggle("hidden", entries.length > 0);
    setList.innerHTML = entries.map(([setId,setData]) => {
      const polls = Object.entries(setData.polls || {});
      return `<div class="poll-set">
        <div class="poll-set-head">
          <div>
            <div class="poll-set-title">${esc(setData.name || "Untitled set")}</div>
            <div class="helper">${polls.length} saved poll${polls.length===1?"":"s"}</div>
          </div>
          <div class="set-actions">
            <button class="mini-btn rename-set" data-set="${setId}">Rename</button>
            <button class="mini-btn delete-set" data-set="${setId}">Delete set</button>
          </div>
        </div>
        <div class="saved-poll-list">
          ${polls.length ? polls.map(([pollId,p],i)=>`<div class="saved-poll">
            <div class="saved-poll-main">
              <div class="saved-number">${i+1}</div>
              <div><div class="saved-question">${esc(p.question || "Untitled question")}</div><div class="helper">${(p.choices||[]).length} choices</div></div>
            </div>
            <div class="saved-actions">
              <button class="mini-btn open-saved" data-set="${setId}" data-poll="${pollId}">Open</button>
              <button class="mini-btn edit-saved" data-set="${setId}" data-poll="${pollId}">Edit</button>
              <button class="mini-btn duplicate-saved" data-set="${setId}" data-poll="${pollId}">Duplicate</button>
              <button class="mini-btn move-saved" data-set="${setId}" data-poll="${pollId}">Move</button>
              <button class="mini-btn delete-saved" data-set="${setId}" data-poll="${pollId}">Delete</button>
            </div>
          </div>`).join("") : `<div class="helper empty-set">No polls in this set yet.</div>`}
        </div>
      </div>`;
    }).join("");

    setList.querySelectorAll(".edit-saved").forEach(btn => btn.onclick = () => loadIntoEditor(btn.dataset.set, btn.dataset.poll));
    setList.querySelectorAll(".open-saved").forEach(btn => btn.onclick = async () => {
      const p = savedSets?.[btn.dataset.set]?.polls?.[btn.dataset.poll];
      if (p) await openPoll({question:p.question, choices:p.choices});
    });
    setList.querySelectorAll(".duplicate-saved").forEach(btn => btn.onclick = async () => {
      const p = savedSets?.[btn.dataset.set]?.polls?.[btn.dataset.poll];
      if (!p) return;
      const copyRef = push(ref(db, `savedPollSets/${btn.dataset.set}/polls`));
      await set(copyRef, {question:`${p.question} (copy)`, choices:p.choices || [], createdAt:serverTimestamp()});
    });
    setList.querySelectorAll(".delete-saved").forEach(btn => btn.onclick = async () => {
      const p = savedSets?.[btn.dataset.set]?.polls?.[btn.dataset.poll];
      if (!p || !confirm(`Delete this saved poll?\n\n${p.question}`)) return;
      await remove(ref(db, `savedPollSets/${btn.dataset.set}/polls/${btn.dataset.poll}`));
      if (editingSaved?.setId === btn.dataset.set && editingSaved?.pollId === btn.dataset.poll) clearEditor();
    });
    setList.querySelectorAll(".move-saved").forEach(btn => btn.onclick = async () => {
      const fromSet = btn.dataset.set;
      const p = savedSets?.[fromSet]?.polls?.[btn.dataset.poll];
      const toSet = chooseSet(fromSet);
      if (!p || !toSet) return;
      const dest = push(ref(db, `savedPollSets/${toSet}/polls`));
      await set(dest, {...p, movedAt:serverTimestamp()});
      await remove(ref(db, `savedPollSets/${fromSet}/polls/${btn.dataset.poll}`));
    });
    setList.querySelectorAll(".rename-set").forEach(btn => btn.onclick = async () => {
      const oldName = savedSets?.[btn.dataset.set]?.name || "";
      const name = prompt("Rename poll set:", oldName);
      if (!name || !name.trim() || name.trim() === oldName) return;
      await update(ref(db, `savedPollSets/${btn.dataset.set}`), {name:name.trim(), updatedAt:serverTimestamp()});
    });
    setList.querySelectorAll(".delete-set").forEach(btn => btn.onclick = async () => {
      const s = savedSets?.[btn.dataset.set];
      const count = Object.keys(s?.polls || {}).length;
      if (!confirm(`Delete “${s?.name || "this set"}” and its ${count} saved poll${count===1?"":"s"}?\n\nThis cannot be undone.`)) return;
      await remove(ref(db, `savedPollSets/${btn.dataset.set}`));
      if (editingSaved?.setId === btn.dataset.set) clearEditor();
    });
  }

  if (configured) {
    document.getElementById("connectionStatus").textContent = "Ready";
    onValue(ref(db, "savedPollSets"), snap => {
      savedSets = snap.val() || {};
      renderLibrary();
    });
  }

  async function openPoll(data) {
    const question = data.question?.trim();
    const choices = (data.choices || []).map(c=>String(c).trim()).filter(Boolean);
    if (!question || choices.length < 2) return;

    let pollId = randomCode();
    while ((await get(ref(db, `polls/${pollId}`))).exists()) pollId = randomCode();

    const poll = {question, choices, open:true, createdAt:serverTimestamp(), shareResults:false};
    await set(ref(db, `polls/${pollId}`), poll);
    activePollId = pollId;
    activePoll = poll;
    resultsVisible = false;
    showJoinInfo();
    listenResults();
    document.getElementById("toggleResults").disabled = false;
    document.getElementById("shareResults").disabled = true;
    document.getElementById("fullscreen").disabled = false;
    document.getElementById("joinCard").scrollIntoView({behavior:"smooth", block:"start"});
  }

  document.getElementById("createPoll").onclick = async () => {
    const data = validateEditor();
    if (data) await openPoll(data);
  };

  function showJoinInfo() {
    document.getElementById("noPollMessage").classList.add("hidden");
    document.getElementById("joinDetails").classList.remove("hidden");
    document.getElementById("pollCode").textContent = activePollId;
    const joinUrl = `${location.origin}${location.pathname}?poll=${activePollId}`;
    document.getElementById("joinLink").textContent = joinUrl;
    const qr = document.getElementById("qrcode");
    qr.innerHTML = "";
    if (window.QRCode) new QRCode(qr, {text:joinUrl, width:180, height:180});
    document.getElementById("resultQuestion").textContent = activePoll.question;
    document.getElementById("togglePoll").textContent = activePoll.open ? "Close voting" : "Reopen voting";
    document.getElementById("togglePoll").className = activePoll.open ? "btn btn-danger" : "btn btn-success";
    document.getElementById("shareResults").textContent = "Share results with students";
    document.getElementById("shareResults").className = "btn";
    setResultsVisibility(false);
  }

  function listenResults() {
    onValue(ref(db, `responses/${activePollId}`), snap => {
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
    if (activePoll) document.getElementById("shareResults").disabled = !show;
  }

  document.getElementById("toggleResults").onclick = () => setResultsVisibility(!resultsVisible);

  document.getElementById("shareResults").onclick = async () => {
    if (!activePollId || !resultsVisible) return;
    const next = !activePoll.shareResults;
    activePoll.shareResults = next;
    await update(ref(db, `polls/${activePollId}`), {shareResults:next});
    const btn = document.getElementById("shareResults");
    btn.textContent = next ? "Stop sharing with students" : "Share results with students";
    btn.className = next ? "btn btn-danger" : "btn";
  };

  document.getElementById("togglePoll").onclick = async () => {
    if (!activePollId) return;
    activePoll.open = !activePoll.open;
    await update(ref(db, `polls/${activePollId}`), {open:activePoll.open});
    document.getElementById("togglePoll").textContent = activePoll.open ? "Close voting" : "Reopen voting";
    document.getElementById("togglePoll").className = activePoll.open ? "btn btn-danger" : "btn btn-success";
  };

  document.getElementById("newPoll").onclick = async () => {
    if (!activePollId) return;
    if (activePoll?.shareResults) await update(ref(db, `polls/${activePollId}`), {shareResults:false});
    activePollId = null;
    activePoll = null;
    resultsVisible = false;
    document.getElementById("joinDetails").classList.add("hidden");
    document.getElementById("noPollMessage").classList.remove("hidden");
    document.getElementById("resultQuestion").textContent = "No active poll";
    document.getElementById("responseCount").textContent = "0 responses";
    document.getElementById("toggleResults").disabled = true;
    document.getElementById("shareResults").disabled = true;
    document.getElementById("fullscreen").disabled = true;
    document.getElementById("barList").innerHTML = "";
    setResultsVisibility(false);
    document.getElementById("libraryCard").scrollIntoView({behavior:"smooth", block:"start"});
  };

  document.getElementById("fullscreen").onclick = async () => {
    const card = document.getElementById("resultsCard");
    if (!document.fullscreenElement) {
      document.body.classList.add("fullscreen-results");
      try { await card.requestFullscreen?.(); } catch(e) { console.error(e); }
      document.getElementById("fullscreen").textContent = "Exit full screen";
    } else {
      await document.exitFullscreen?.();
      document.getElementById("fullscreen").textContent = "Full-screen results";
    }
  };
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove("fullscreen-results");
      const btn = document.getElementById("fullscreen");
      if (btn) btn.textContent = "Full-screen results";
    }
  });
}

async function renderStudent(pollId) {
  root.innerHTML = `<main class="student-shell"><div class="brand" style="margin-bottom:18px">ClassPoll <small>Student response</small></div><section class="student-card"><div id="studentContent" class="helper">Loading poll…</div></section></main>`;
  const content = document.getElementById("studentContent");
  if (!configured) {
    content.innerHTML = `<div class="notice error">This poll has not been connected to its classroom database yet.</div>`;
    return;
  }

  const pollRef = ref(db, `polls/${pollId}`);
  let renderToken = 0;

  async function showSharedResults(poll) {
    const snap = await get(ref(db, `responses/${pollId}`));
    const values = snap.val() || {};
    const counts = Array(poll.choices.length).fill(0);
    Object.values(values).forEach(v => {
      if (Number.isInteger(v.choice) && counts[v.choice] !== undefined) counts[v.choice]++;
    });
    const total = counts.reduce((a,b)=>a+b,0);
    content.innerHTML = `
      <div class="helper">Poll ${esc(pollId)} · Results</div>
      <div class="student-question">${esc(poll.question)}</div>
      <div class="bar-list student-results">
        ${poll.choices.map((c,i) => {
          const pct = total ? Math.round(counts[i] / total * 100) : 0;
          return `<div class="bar-row"><div class="bar-label">${esc(c)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-value">${counts[i]} · ${pct}%</div></div>`;
        }).join("")}
      </div>
      <p class="helper">${total} response${total===1?"":"s"}</p>`;
  }

  onValue(pollRef, async snap => {
    const token = ++renderToken;
    if (!snap.exists()) {
      content.innerHTML = `<h2>Poll not found</h2><p class="helper">Check the QR code or ask your instructor for a new one.</p>`;
      return;
    }
    const poll = snap.val();
    if (poll.shareResults) {
      await showSharedResults(poll);
      return;
    }
    if (!poll.open) {
      content.innerHTML = `<h2>Voting is closed</h2><p class="helper">Your instructor has closed this poll. Results will appear here if the instructor shares them.</p>`;
      return;
    }
    const id = respondentId(pollId);
    const myVoteRef = ref(db, `responses/${pollId}/${id}`);
    const existing = await get(myVoteRef);
    if (token !== renderToken) return;
    if (existing.exists()) {
      content.innerHTML = `<div class="thanks"><div class="check">✓</div><h2>Response recorded</h2><p class="helper">Results will appear here if your instructor shares them.</p></div>`;
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
      await set(myVoteRef, {choice:selected, submittedAt:serverTimestamp()});
      content.innerHTML = `<div class="thanks"><div class="check">✓</div><h2>Response recorded</h2><p class="helper">Results will appear here if your instructor shares them.</p></div>`;
    };
  });
}
