/* ═══════════════════════════════════════════════════════════
   COMMAND CENTER — app.js
   ═══════════════════════════════════════════════════════════ */

/* ─── UTILS ──────────────────────────────────────────────── */
function uid()  { return Math.random().toString(36).slice(2,10); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
function msToTime(ms) { const s=Math.floor(ms/1000),m=Math.floor(s/60); return `${m}:${(s%60).toString().padStart(2,'0')}`; }
function wait(ms) { return new Promise(r=>setTimeout(r,ms)); }

const xSVG      = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const handleSVG = `<svg width="9" height="13" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>`;
const downSVG   = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,4 6,8 10,4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const pencilSVG = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M8 2l2 2-6.5 6.5L1 11l.5-2.5L8 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><line x1="7" y1="3" x2="9" y2="5" stroke="currentColor" stroke-width="1.4"/></svg>`;

/* ─── STATE ──────────────────────────────────────────────── */

const DEFAULT_TASK_TIMER = 25 * 60;

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem('cc_tasks') || 'null');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch(e) {}
  return [
    { id:uid(), title:'Plan the week ahead',       done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
    { id:uid(), title:'Review open pull requests', done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
    { id:uid(), title:'Write release notes',       done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
    { id:uid(), title:'Update project roadmap',    done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
    { id:uid(), title:'Clear email inbox',         done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
  ];
}
function saveTasks() { try { localStorage.setItem('cc_tasks', JSON.stringify(tasks.map(({timerDeadline,...t})=>t))); } catch(e) {} }

let tasks = loadTasks();

const DURATIONS = { work:25*60, short:5*60, long:15*60 };

const pomo = { mode:'work', timeLeft:DURATIONS.work, running:false, sessions:0, interval:null, deadline:null };

let dragSrc = null;
let pendingLaunchTask  = null;  // task waiting for launch decision
let pendingSeatedTask  = null;  // task waiting for time-picker before seating
let taskTimerInterval  = null;

/* ─── NOTEBOOKS ──────────────────────────────────────────── */

const NB_COLORS = ['#6674f5','#f56b6b','#56cf6c','#f5d142','#c45de8','#f58c42','#22ccaa','#76c8f5'];
let notebooks = [];
let activeNotebookId  = null;
let activeNbTabId     = null;

function loadNotebooks() {
  try { notebooks = JSON.parse(localStorage.getItem('nb_notebooks') || '[]'); } catch(e) { notebooks = []; }
  if (notebooks.length === 0) {
    notebooks = [{
      id: uid(), name: 'Personal', color: NB_COLORS[0],
      tabs: [{ id: uid(), name: 'Main', tasks: [], notes: '' }]
    }];
  }
  // Auto-select first notebook
  if (!activeNotebookId || !notebooks.find(n => n.id === activeNotebookId)) {
    activeNotebookId = notebooks[0]?.id || null;
    const nb = notebooks.find(n => n.id === activeNotebookId);
    activeNbTabId = nb?.tabs[0]?.id || null;
  }
}

function saveNotebooks() {
  localStorage.setItem('nb_notebooks', JSON.stringify(notebooks));
}

/* YouTube history */
let ytHistory = [];
function loadYtHistory() {
  try { ytHistory = JSON.parse(localStorage.getItem('yt_history') || '[]'); } catch(e) { ytHistory = []; }
}
function saveYtHistory() {
  localStorage.setItem('yt_history', JSON.stringify(ytHistory));
}

/* ─── MINESWEEPER STATE ──────────────────────────────────── */

const MS_DIFF = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
};

// B&W gradient: 1 = dim, 8 = bright white
const MS_COLORS = [
  '',
  'rgba(255,255,255,0.40)',
  'rgba(255,255,255,0.52)',
  'rgba(255,255,255,0.68)',
  'rgba(255,255,255,0.58)',
  'rgba(255,255,255,0.76)',
  'rgba(255,255,255,0.84)',
  'rgba(255,255,255,0.92)',
  '#ffffff',
];

let ms = {
  board: [], rows: 9, cols: 9, mines: 10,
  state: 'idle',   // idle | playing | won | lost
  firstClick: true, timer: 0, timerInterval: null,
  flagsPlaced: 0, diff: 'easy',
};

/* ─── DOM ────────────────────────────────────────────────── */

const takeoffZone      = document.getElementById('takeoffZone');
const takeoffEmpty     = document.getElementById('takeoffEmpty');
const rocketDisplay    = document.getElementById('rocketDisplay');
const rocketWrapper    = document.getElementById('rocketWrapper');
const portholeTitle    = document.getElementById('portholeTitle');
const portholeTimerEl  = document.getElementById('portholeTimerEl');
const rocketProgressFill = document.getElementById('rocketProgressFill');
const takeoffSecondary = document.getElementById('takeoffSecondary');
const fuelBtn          = document.getElementById('fuelBtn');
const taskList         = document.getElementById('taskList');
const orbitDropZone    = document.getElementById('orbitDropZone');
const orbitEmpty       = document.getElementById('orbitEmpty');
const orbitListEl      = document.getElementById('orbitList');
const timerDisplay     = document.getElementById('timerDisplay');
const btnStartPause    = document.getElementById('btnStartPause');
const btnReset         = document.getElementById('btnReset');
const sessionDots      = document.getElementById('sessionDots');
const focusWrap        = document.getElementById('pomodoroFocusTask');
const focusName        = document.getElementById('pomodoroFocusName');

/* ─── RENDER ─────────────────────────────────────────────── */

function render() {
  saveTasks();
  renderTakeoff();
  renderLaunchpad();
  renderOrbit();
  renderPomoFocus();
}

/* TAKEOFF ─────────────────────────────────────────────────── */

function getFireLevel(remaining, total) {
  const p = remaining / total;
  if (p > 0.75) return 0;
  if (p > 0.50) return 1;
  if (p > 0.25) return 2;
  if (p > 0.10) return 3;
  return 4;
}

function timerColor(remaining, total) {
  const p = remaining / total;
  if (p > 0.50) return '#e0e0e0';
  if (p > 0.25) return '#ffcc44';
  if (p > 0.10) return '#ff8833';
  return '#ff3311';
}

function renderTakeoff() {
  const seated = tasks.filter(t => t.seat && !t.orbit);

  if (seated.length === 0) {
    takeoffEmpty.style.display = 'flex';
    rocketDisplay.style.display = 'none';
    takeoffZone.classList.remove('has-tasks');
    return;
  }

  takeoffEmpty.style.display = 'none';
  rocketDisplay.style.display = 'block';
  takeoffZone.classList.add('has-tasks');

  const primary = seated[0];
  const fire = getFireLevel(primary.timerLeft, primary.timerTotal);
  rocketWrapper.dataset.fire = fire;

  // Make the rocket itself draggable to the orbit zone
  rocketWrapper.draggable = true;
  rocketWrapper.dataset.id   = primary.id;
  rocketWrapper.dataset.from = 'seat';

  // Porthole text
  if (portholeTitle)   portholeTitle.textContent   = primary.title;
  if (portholeTimerEl) {
    portholeTimerEl.textContent = fmtTime(primary.timerLeft);
    portholeTimerEl.style.color = timerColor(primary.timerLeft, primary.timerTotal);
  }

  // Progress bar
  const pct = Math.max(0, primary.timerLeft / primary.timerTotal * 100);
  rocketProgressFill.style.width = pct + '%';
  const fireColors = ['var(--white)', '#ffe066', '#ffaa33', '#ff7722', '#ff2200'];
  rocketProgressFill.style.background = fireColors[fire];

  // Secondary tasks
  takeoffSecondary.innerHTML = '';
  seated.slice(1).forEach(t => {
    const pill = document.createElement('div');
    pill.className = 'sec-task-pill';
    pill.draggable = true;
    pill.dataset.id = t.id;
    pill.dataset.from = 'seat';
    pill.innerHTML = `<span class="sec-title">${esc(t.title)}</span><span class="sec-timer">${fmtTime(t.timerLeft)}</span><button class="sec-eject" data-id="${t.id}">${xSVG}</button>`;
    pill.querySelector('.sec-eject').addEventListener('click', e => { e.stopPropagation(); ejectTask(t.id); });
    pill.addEventListener('dragstart', onDragStart);
    pill.addEventListener('dragend', onDragEnd);
    takeoffSecondary.appendChild(pill);
  });
}

/* LAUNCHPAD ───────────────────────────────────────────────── */

function renderLaunchpad() {
  taskList.innerHTML = '';
  tasks.filter(t => !t.seat && !t.orbit).forEach(t => {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.draggable = true;
    row.dataset.id = t.id;
    row.dataset.from = 'queue';
    const cbStyle = t.done ? ' style="background:var(--white);border-color:var(--white)"' : '';
    const check   = t.done ? `<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="var(--bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    row.innerHTML = `<span class="drag-handle">${handleSVG}</span><div class="task-cb${t.done?' checked':''}"${cbStyle} data-id="${t.id}">${check}</div><input class="task-title${t.done?' done':''}" type="text" value="${esc(t.title)}" data-id="${t.id}" spellcheck="false"/><button class="task-del" data-id="${t.id}">${xSVG}</button>`;
    // Notebook color left-border
    if (t.nbColor) {
      row.classList.add('nb-colored');
      row.style.setProperty('--nb-color', t.nbColor);
    }
    row.querySelector('.task-cb').addEventListener('click', () => toggleDone(t.id));
    const inp = row.querySelector('.task-title');
    inp.addEventListener('change', e => renameTask(t.id, e.target.value));
    inp.addEventListener('keydown', e => { if(e.key==='Enter') e.target.blur(); });
    row.querySelector('.task-del').addEventListener('click', e => { e.stopPropagation(); deleteTask(t.id); });
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragend', onDragEnd);
    taskList.appendChild(row);
  });
}

/* ORBIT ───────────────────────────────────────────────────── */

function renderOrbit() {
  const orbiting = tasks.filter(t => t.orbit);
  orbitListEl.innerHTML = '';
  orbitEmpty.style.display = orbiting.length ? 'none' : 'flex';
  orbiting.forEach(t => {
    const card = document.createElement('div');
    card.className = 'orbit-card';
    card.innerHTML = `<span class="orbit-rocket">🚀</span><span class="orbit-title">${esc(t.title)}</span><button class="orbit-deorbit" data-id="${t.id}" title="Return to Launchpad">${downSVG}</button>`;
    card.querySelector('.orbit-deorbit').addEventListener('click', () => deorbitTask(t.id));
    orbitListEl.appendChild(card);
  });
}

function renderPomoFocus() {
  const active = tasks.filter(t => t.seat && !t.orbit && !t.done);
  if (active.length > 0) { focusWrap.style.display='flex'; focusName.textContent=active[0].title; }
  else focusWrap.style.display = 'none';
}

/* ─── TASK ACTIONS ───────────────────────────────────────── */

function toggleDone(id) { const t=tasks.find(t=>t.id===id); if(t){t.done=!t.done; render();} }
function ejectTask(id)  { const t=tasks.find(t=>t.id===id); if(t){t.seat=false; render();} }
function deorbitTask(id){ const t=tasks.find(t=>t.id===id); if(t){t.orbit=false;t.seat=false; render();} }
function deleteTask(id) { tasks=tasks.filter(t=>t.id!==id); render(); }
function renameTask(id,val){ const t=tasks.find(t=>t.id===id); if(t) t.title=val.trim()||t.title; }
function addTask() {
  const t={id:uid(),title:'New task',done:false,seat:false,orbit:false,timerLeft:DEFAULT_TASK_TIMER,timerTotal:DEFAULT_TASK_TIMER};
  tasks.push(t); render();
  requestAnimationFrame(()=>{ const inp=taskList.querySelectorAll('.task-title'); const last=inp[inp.length-1]; if(last){last.focus();last.select();} });
}

/* ─── TASK TIMERS ────────────────────────────────────────── */

function startTaskTimers() {
  if (taskTimerInterval) return;
  taskTimerInterval = setInterval(() => {
    const now = Date.now();
    let needsRender = false;
    tasks.forEach(t => {
      if (!t.seat || t.orbit || t.done) return;
      if (pendingLaunchTask && pendingLaunchTask.id === t.id) return; // paused for modal
      if (!t.timerDeadline) t.timerDeadline = now + t.timerLeft * 1000;
      const newLeft = Math.max(0, Math.round((t.timerDeadline - now) / 1000));
      if (newLeft !== t.timerLeft) {
        t.timerLeft = newLeft;
        needsRender = true;
        if (t.timerLeft === 0) {
          pendingLaunchTask = t;
          showLaunchModal(t);
        }
      }
    });
    if (needsRender) renderTakeoff();
  }, 500);
}

function showLaunchModal(task) {
  document.getElementById('launchModalTask').textContent = task.title;
  document.getElementById('launchModalOverlay').style.display = 'flex';
}

document.getElementById('btnLaunchConfirm').addEventListener('click', async () => {
  document.getElementById('launchModalOverlay').style.display = 'none';
  if (!pendingLaunchTask) return;
  const t = pendingLaunchTask;
  pendingLaunchTask = null;
  t.seat = false;
  render();
  await playOrbitAnimation(t.title);
  t.orbit = true;
  render();
});

document.getElementById('btnLaunchRefuel').addEventListener('click', () => {
  document.getElementById('launchModalOverlay').style.display = 'none';
  if (pendingLaunchTask) {
    pendingLaunchTask.timerLeft  = 5 * 60;
    pendingLaunchTask.timerTotal = Math.max(pendingLaunchTask.timerTotal, 5*60);
    pendingLaunchTask.timerDeadline = Date.now() + 5 * 60 * 1000;
    pendingLaunchTask = null;
  }
  renderTakeoff();
});

/* ─── FUEL BUTTON ────────────────────────────────────────── */

fuelBtn.addEventListener('click', () => {
  const seated = tasks.filter(t => t.seat && !t.orbit);
  if (seated.length === 0) return;
  const primary = seated[0];
  primary.timerLeft  += 5 * 60;
  primary.timerTotal  = primary.timerLeft; // reset progress bar to full
  primary.timerDeadline = Date.now() + primary.timerLeft * 1000;
  fuelBtn.classList.add('clicked');
  setTimeout(() => fuelBtn.classList.remove('clicked'), 200);
  renderTakeoff();
  startTaskTimers();
});

// Rocket wrapper drag (treat like a seated task card)
rocketWrapper.addEventListener('dragstart', onDragStart);
rocketWrapper.addEventListener('dragend',   onDragEnd);

/* ─── DRAG & DROP ────────────────────────────────────────── */

function onDragStart(e) {
  dragSrc = { id: e.currentTarget.dataset.id, from: e.currentTarget.dataset.from };
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drag-target-above,.drag-target-below').forEach(el=>el.classList.remove('drag-target-above','drag-target-below'));
  dragSrc = null;
}

// Takeoff zone
takeoffZone.addEventListener('dragover', e => {
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  takeoffZone.classList.add('drag-over');
});
takeoffZone.addEventListener('dragleave', e => {
  if (!takeoffZone.contains(e.relatedTarget)) takeoffZone.classList.remove('drag-over');
});
takeoffZone.addEventListener('drop', e => {
  e.preventDefault(); takeoffZone.classList.remove('drag-over');
  if (!dragSrc) return;
  const t = tasks.find(t=>t.id===dragSrc.id);
  if (!t || t.orbit) return;
  if (dragSrc.from === 'seat') return; // already seated, ignore drop back
  // Show time picker; swap will happen on confirm
  pendingSeatedTask = t;
  showTimePicker();
});

// Orbit zone (only accepts from seat)
orbitDropZone.addEventListener('dragover', e => {
  if (!dragSrc || dragSrc.from !== 'seat') return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  orbitDropZone.classList.add('drag-over');
});
orbitDropZone.addEventListener('dragleave', e => {
  if (!orbitDropZone.contains(e.relatedTarget)) orbitDropZone.classList.remove('drag-over');
});
orbitDropZone.addEventListener('drop', async e => {
  e.preventDefault(); orbitDropZone.classList.remove('drag-over');
  if (!dragSrc || dragSrc.from !== 'seat') return;
  const t = tasks.find(t=>t.id===dragSrc.id);
  if (!t) return;
  t.seat = false;
  render();
  await playOrbitAnimation(t.title);
  t.orbit = true;
  render();
});

// Launchpad reorder
taskList.addEventListener('dragover', e => {
  e.preventDefault();
  const row = e.target.closest('.task-row');
  document.querySelectorAll('.task-row').forEach(r=>r.classList.remove('drag-target-above','drag-target-below'));
  if (row) {
    const mid = row.getBoundingClientRect().top + row.getBoundingClientRect().height/2;
    row.classList.add(e.clientY < mid ? 'drag-target-above' : 'drag-target-below');
  }
});
taskList.addEventListener('dragleave', e => {
  if (!taskList.contains(e.relatedTarget))
    document.querySelectorAll('.task-row').forEach(r=>r.classList.remove('drag-target-above','drag-target-below'));
});
taskList.addEventListener('drop', e => {
  e.preventDefault();
  document.querySelectorAll('.task-row').forEach(r=>r.classList.remove('drag-target-above','drag-target-below'));
  if (!dragSrc) return;
  const dragged = tasks.find(t=>t.id===dragSrc.id);
  if (!dragged) return;
  dragged.seat = false; dragged.orbit = false;
  const targetRow = e.target.closest('.task-row');
  if (!targetRow || targetRow.dataset.id===dragSrc.id) { render(); return; }
  const insertAfter = e.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height/2;
  tasks = tasks.filter(t=>t.id!==dragSrc.id);
  const idx = tasks.findIndex(t=>t.id===targetRow.dataset.id);
  tasks.splice(insertAfter ? idx+1 : idx, 0, dragged);
  render();
});

/* ─── ORBIT ANIMATION ────────────────────────────────────── */

function generateStars(field, count=160) {
  field.innerHTML = '';
  for (let i=0; i<count; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random()*2.5+0.5;
    s.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100}%;width:${size}px;height:${size}px;--dur:${(Math.random()*2+0.8).toFixed(1)}s;--delay:${(Math.random()*3).toFixed(1)}s;`;
    field.appendChild(s);
  }
}

async function playOrbitAnimation(title) {
  const overlay=document.getElementById('spaceOverlay'),starsField=document.getElementById('starsField'),
    launchCard=document.getElementById('animLaunchCard'),earth=document.getElementById('animEarth'),
    orbitArm=document.getElementById('animOrbitArm'),
    finale=document.getElementById('animFinale');

  launchCard.textContent=title;
  launchCard.className='anim-launch-card'; earth.className='anim-earth';
  orbitArm.className='anim-orbit-arm'; finale.className='anim-finale';
  finale.style.display='none'; generateStars(starsField);

  overlay.style.display='flex';
  await wait(20); overlay.classList.add('active');
  await wait(300); launchCard.classList.add('show');
  await wait(700); launchCard.classList.remove('show'); launchCard.classList.add('launch');
  await wait(600); earth.classList.add('show');
  await wait(500); orbitArm.style.display='block'; orbitArm.classList.add('orbiting');
  await wait(3200); orbitArm.classList.remove('orbiting'); orbitArm.style.display='none'; earth.classList.remove('show');
  await wait(200); finale.style.display='flex'; finale.classList.add('show');
  await wait(1400);
  overlay.classList.remove('active'); overlay.classList.add('fading');
  await wait(450);
  overlay.style.display='none'; overlay.className='space-overlay'; finale.style.display='none';
}

/* ─── TIME PICKER ────────────────────────────────────────── */

function showTimePicker() {
  // Reset to 25 min default
  document.querySelectorAll('.tp-opt').forEach(b => b.classList.toggle('selected', b.dataset.mins === '25'));
  document.getElementById('tpCustom').value = '';
  document.getElementById('timepickOverlay').style.display = 'flex';
}

function confirmSeat(mins) {
  if (!pendingSeatedTask) return;
  const t = pendingSeatedTask;
  pendingSeatedTask = null;
  // Swap: eject any currently seated tasks back to launchpad
  tasks.forEach(tk => { if (tk.seat && !tk.orbit && tk.id !== t.id) tk.seat = false; });
  t.seat = true;
  t.timerLeft  = mins * 60;
  t.timerTotal = mins * 60;
  t.timerDeadline = Date.now() + mins * 60 * 1000;
  render();
  startTaskTimers();
}

document.querySelectorAll('.tp-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tp-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('tpCustom').value = '';
  });
});

document.getElementById('tpCustom').addEventListener('input', () => {
  document.querySelectorAll('.tp-opt').forEach(b => b.classList.remove('selected'));
});

document.getElementById('btnTpConfirm').addEventListener('click', () => {
  document.getElementById('timepickOverlay').style.display = 'none';
  const customVal = document.getElementById('tpCustom').value;
  const selOpt = document.querySelector('.tp-opt.selected');
  let mins = customVal ? Math.max(1, parseInt(customVal) || 1) : (selOpt ? parseInt(selOpt.dataset.mins) : 25);
  confirmSeat(mins);
});

document.getElementById('btnTpCancel').addEventListener('click', () => {
  pendingSeatedTask = null;
  document.getElementById('timepickOverlay').style.display = 'none';
});

/* ─── NOTES / NOTEBOOKS ──────────────────────────────────── */

function startInlineRename(nameEl, currentName, onSave) {
  const inp = document.createElement('input');
  inp.className = 'nb-item-name-input';
  inp.value = currentName;
  nameEl.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = () => {
    const val = inp.value.trim() || currentName;
    onSave(val);
  };
  inp.addEventListener('blur', commit, { once: true });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = currentName; inp.blur(); }
  });
}

function renderNotebooks() {
  const list = document.getElementById('nbSidebarList');
  if (!list) return;
  list.innerHTML = '';
  notebooks.forEach(nb => {
    const item = document.createElement('div');
    item.className = 'nb-sidebar-item' + (nb.id === activeNotebookId ? ' active' : '');
    item.innerHTML = `
      <span class="nb-color-dot" style="background:${nb.color}"></span>
      <span class="nb-item-name">${esc(nb.name)}</span>
      <button class="nb-rename-btn" title="Rename">${pencilSVG}</button>
      <button class="nb-del" title="Delete">${xSVG}</button>`;

    item.addEventListener('click', e => {
      if (e.target.closest('.nb-del') || e.target.closest('.nb-rename-btn')) return;
      activeNotebookId = nb.id;
      if (!nb.tabs.find(t => t.id === activeNbTabId)) activeNbTabId = nb.tabs[0]?.id || null;
      renderNotebooks(); renderNbWorkspace();
    });

    // Rename: pencil button or double-click name
    const triggerRename = () => {
      const nameEl = item.querySelector('.nb-item-name');
      if (!nameEl) return;
      startInlineRename(nameEl, nb.name, val => {
        nb.name = val; saveNotebooks(); renderNotebooks();
      });
    };
    item.querySelector('.nb-rename-btn').addEventListener('click', e => { e.stopPropagation(); triggerRename(); });
    item.querySelector('.nb-item-name').addEventListener('dblclick', e => { e.stopPropagation(); triggerRename(); });

    item.querySelector('.nb-del').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete notebook "${nb.name}"?`)) return;
      notebooks = notebooks.filter(n => n.id !== nb.id);
      if (activeNotebookId === nb.id) { activeNotebookId = notebooks[0]?.id || null; activeNbTabId = null; }
      saveNotebooks(); renderNotebooks(); renderNbWorkspace();
    });
    list.appendChild(item);
  });
  const empty = document.getElementById('nbEmptyState');
  const ws    = document.getElementById('nbWorkspace');
  if (activeNotebookId && notebooks.length) { empty.style.display='none'; ws.style.display='flex'; }
  else { empty.style.display='flex'; ws.style.display='none'; }
}

function renderNbWorkspace() {
  const nb = notebooks.find(n => n.id === activeNotebookId);
  if (!nb) return;
  if (!nb.tabs.find(t => t.id === activeNbTabId)) activeNbTabId = nb.tabs[0]?.id || null;

  const scroll = document.getElementById('nbTabsScroll');
  if (!scroll) return;
  scroll.innerHTML = '';
  nb.tabs.forEach(tab => {
    const wrap = document.createElement('div');
    wrap.className = 'nb-tab-wrap' + (tab.id === activeNbTabId ? ' active' : '');

    const btn = document.createElement('button');
    btn.className = 'nb-tab-btn';
    btn.textContent = tab.name;
    btn.title = 'Click to switch · Double-click to rename';
    btn.addEventListener('click', () => { activeNbTabId = tab.id; renderNbWorkspace(); });
    btn.addEventListener('dblclick', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.value = tab.name;
      input.className = 'nb-tab-rename-input';
      btn.replaceWith(input);
      input.focus(); input.select();
      const save = () => { tab.name = input.value.trim() || tab.name; saveNotebooks(); renderNbWorkspace(); };
      input.addEventListener('blur', save, { once: true });
      input.addEventListener('keydown', ke => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
        if (ke.key === 'Escape') { input.value = tab.name; input.blur(); }
      });
    });

    // Action buttons (rename + delete) shown on hover
    const actions = document.createElement('div');
    actions.className = 'nb-tab-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'nb-tab-act-btn';
    renameBtn.title = 'Rename section';
    renameBtn.innerHTML = pencilSVG;
    renameBtn.addEventListener('click', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.value = tab.name;
      input.className = 'nb-tab-rename-input';
      btn.replaceWith(input);
      input.focus(); input.select();
      const save = () => { tab.name = input.value.trim() || tab.name; saveNotebooks(); renderNbWorkspace(); };
      input.addEventListener('blur', save, { once: true });
      input.addEventListener('keydown', ke => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
        if (ke.key === 'Escape') { input.value = tab.name; input.blur(); }
      });
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'nb-tab-act-btn nb-tab-del-btn';
    delBtn.title = 'Delete section';
    delBtn.innerHTML = xSVG;
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (nb.tabs.length <= 1) return; // keep at least one
      if (!confirm(`Delete section "${tab.name}"?`)) return;
      nb.tabs = nb.tabs.filter(t => t.id !== tab.id);
      if (activeNbTabId === tab.id) activeNbTabId = nb.tabs[0]?.id || null;
      saveNotebooks(); renderNbWorkspace();
    });

    actions.appendChild(renameBtn);
    if (nb.tabs.length > 1) actions.appendChild(delBtn);
    wrap.appendChild(btn);
    wrap.appendChild(actions);
    scroll.appendChild(wrap);
  });

  const tab = nb.tabs.find(t => t.id === activeNbTabId);
  renderNbContent(nb, tab);
}

/* ── Rich-text toolbar definition ── */
const RT_TOOLS = [
  { cmd:'bold',                icon:'<b>B</b>',   title:'Bold (Ctrl+B)' },
  { cmd:'italic',              icon:'<i>I</i>',   title:'Italic (Ctrl+I)' },
  { cmd:'underline',           icon:'<u>U</u>',   title:'Underline (Ctrl+U)' },
  { cmd:'strikeThrough',       icon:'<s>S</s>',   title:'Strikethrough' },
  { sep:true },
  { cmd:'formatBlock', val:'h2',  icon:'H1', title:'Heading' },
  { cmd:'formatBlock', val:'p',   icon:'¶',  title:'Paragraph' },
  { sep:true },
  { cmd:'insertUnorderedList', icon:`<svg width="12" height="10" viewBox="0 0 14 12" fill="none"><circle cx="2" cy="2" r="1.4" fill="currentColor"/><circle cx="2" cy="6" r="1.4" fill="currentColor"/><circle cx="2" cy="10" r="1.4" fill="currentColor"/><line x1="5" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`, title:'Bullet list' },
  { cmd:'insertOrderedList',   icon:`<svg width="12" height="10" viewBox="0 0 14 12" fill="none"><text x="0" y="3.5" font-size="4" fill="currentColor">1.</text><text x="0" y="7.5" font-size="4" fill="currentColor">2.</text><text x="0" y="11.5" font-size="4" fill="currentColor">3.</text><line x1="6" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`, title:'Numbered list' },
  { sep:true },
  { cmd:'indent',   icon:`<svg width="12" height="10" viewBox="0 0 14 12" fill="none"><line x1="0" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="0,5.5 3,8 0,10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="5" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="5" y1="10.5" x2="14" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`, title:'Indent (Tab)' },
  { cmd:'outdent',  icon:`<svg width="12" height="10" viewBox="0 0 14 12" fill="none"><line x1="0" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="3,5.5 0,8 3,10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="5" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="5" y1="10.5" x2="14" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`, title:'Outdent (Shift+Tab)' },
  { sep:true },
  { cmd:'removeFormat', icon:`<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`, title:'Clear formatting' },
];

function buildRtToolbar(editor) {
  const bar = document.createElement('div');
  bar.className = 'nb-toolbar';
  RT_TOOLS.forEach(t => {
    if (t.sep) { const s = document.createElement('span'); s.className = 'nb-tool-sep'; bar.appendChild(s); return; }
    const btn = document.createElement('button');
    btn.className = 'nb-tool-btn';
    btn.innerHTML = t.icon;
    btn.title = t.title;
    btn.addEventListener('mousedown', e => {
      e.preventDefault(); // keep editor focus
      document.execCommand(t.cmd, false, t.val || null);
      editor.focus();
      updateToolbarState(bar, editor);
    });
    bar.appendChild(btn);
  });
  // Update active states on selection change
  editor.addEventListener('keyup',    () => updateToolbarState(bar, editor));
  editor.addEventListener('mouseup',  () => updateToolbarState(bar, editor));
  editor.addEventListener('focus',    () => updateToolbarState(bar, editor));
  return bar;
}

function updateToolbarState(bar, editor) {
  const stateCmds = ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'];
  bar.querySelectorAll('.nb-tool-btn').forEach((btn, i) => {
    const tool = RT_TOOLS.filter(t => !t.sep)[i];
    if (tool && stateCmds.includes(tool.cmd)) {
      btn.classList.toggle('active', document.queryCommandState(tool.cmd));
    }
  });
}

function renderNbContent(nb, tab) {
  const content = document.getElementById('nbContent');
  if (!content || !tab) return;
  content.innerHTML = '';

  // ── TASKS SECTION ──
  const tasksSection = document.createElement('div');
  tasksSection.className = 'nb-tasks-section';
  const taskListId = `nbTL_${tab.id}`;
  tasksSection.innerHTML = `
    <div class="nb-section-header">
      <span class="nb-section-label">Tasks</span>
      <button class="nb-add-task-btn">+ Add task</button>
    </div>
    <div class="nb-task-list" id="${taskListId}"></div>`;
  tasksSection.querySelector('.nb-add-task-btn').addEventListener('click', () => {
    tab.tasks.push({ id: uid(), title: 'New task', done: false, addedToFocus: false });
    saveNotebooks(); renderNbContent(nb, tab);
  });
  const taskListEl = tasksSection.querySelector(`#${taskListId}`);
  tab.tasks.forEach(t => {
    const row = document.createElement('div');
    row.className = 'nb-task-row';
    row.style.setProperty('--nb-color', nb.color);
    const cbStyle = t.done ? ' style="background:var(--white);border-color:var(--white)"' : '';
    const check   = t.done ? `<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="var(--bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    const addedClass = t.addedToFocus ? ' added' : '';
    const addedLabel = t.addedToFocus ? '✓ In Focus' : '→ Focus';
    row.innerHTML = `
      <div class="nb-task-cb${t.done?' checked':''}"${cbStyle}>${check}</div>
      <input class="nb-task-title${t.done?' done':''}" type="text" value="${esc(t.title)}" spellcheck="false"/>
      <button class="nb-focus-btn${addedClass}">${addedLabel}</button>
      <button class="nb-task-del-btn">${xSVG}</button>`;
    row.querySelector('.nb-task-cb').addEventListener('click', () => { t.done=!t.done; saveNotebooks(); renderNbContent(nb,tab); });
    const inp = row.querySelector('.nb-task-title');
    inp.addEventListener('change', e => { t.title=e.target.value.trim()||t.title; saveNotebooks(); });
    inp.addEventListener('keydown', e => { if(e.key==='Enter') e.target.blur(); });
    row.querySelector('.nb-focus-btn').addEventListener('click', () => {
      if (t.addedToFocus) return;
      t.addedToFocus = true;
      tasks.push({ id:uid(), title:t.title, done:false, seat:false, orbit:false,
        timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER, nbColor:nb.color });
      saveNotebooks(); render(); renderNbContent(nb,tab);
    });
    row.querySelector('.nb-task-del-btn').addEventListener('click', () => {
      tab.tasks = tab.tasks.filter(tk => tk.id !== t.id); saveNotebooks(); renderNbContent(nb,tab);
    });
    taskListEl.appendChild(row);
  });
  content.appendChild(tasksSection);

  // ── NOTES SECTION ──
  const notesSection = document.createElement('div');
  notesSection.className = 'nb-notes-section';
  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'nb-section-header';
  sectionHeader.innerHTML = '<span class="nb-section-label">Notes</span>';
  notesSection.appendChild(sectionHeader);

  // Rich-text editor (contenteditable)
  const editor = document.createElement('div');
  editor.className = 'nb-notes-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('data-placeholder', 'Write your notes here…');
  editor.setAttribute('spellcheck', 'false');
  if (tab.notes) editor.innerHTML = tab.notes;
  editor.addEventListener('input', () => { tab.notes = editor.innerHTML; saveNotebooks(); });
  editor.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
    }
  });

  // Build and prepend toolbar
  const toolbar = buildRtToolbar(editor);
  notesSection.appendChild(toolbar);
  notesSection.appendChild(editor);
  content.appendChild(notesSection);
}

document.getElementById('btnAddNotebook')?.addEventListener('click', () => {
  const color = NB_COLORS[notebooks.length % NB_COLORS.length];
  const nb = { id: uid(), name: 'New Notebook', color, tabs: [{ id: uid(), name: 'Main', tasks: [], notes: '' }] };
  notebooks.push(nb);
  activeNotebookId = nb.id; activeNbTabId = nb.tabs[0].id;
  saveNotebooks(); renderNotebooks(); renderNbWorkspace();
  // Focus name for rename
  requestAnimationFrame(() => {
    const last = document.querySelector('.nb-sidebar-item.active .nb-item-name');
    if (last) last.dispatchEvent(new MouseEvent('dblclick'));
  });
});

document.getElementById('btnAddNbTab')?.addEventListener('click', () => {
  const nb = notebooks.find(n => n.id === activeNotebookId);
  if (!nb) return;
  const tab = { id: uid(), name: 'Section', tasks: [], notes: '' };
  nb.tabs.push(tab);
  activeNbTabId = tab.id;
  saveNotebooks(); renderNbWorkspace();
});

/* ─── MINESWEEPER ────────────────────────────────────────── */

function msInit(diff) {
  diff = diff || ms.diff || 'easy';
  const d = MS_DIFF[diff];
  clearInterval(ms.timerInterval);
  ms = {
    board: [], rows: d.rows, cols: d.cols, mines: d.mines,
    state: 'idle', firstClick: true, timer: 0,
    timerInterval: null, flagsPlaced: 0, diff,
  };
  for (let r = 0; r < d.rows; r++) {
    ms.board[r] = [];
    for (let c = 0; c < d.cols; c++)
      ms.board[r][c] = { mine:false, revealed:false, flagged:false, count:0, hitMine:false };
  }
  const modal = document.getElementById('msModal');
  const cellPx = { easy:34, medium:26, hard:20 }[diff];
  if (modal) modal.style.setProperty('--ms-cs', cellPx + 'px');
  const faceEl = document.getElementById('msFaceBtn');
  if (faceEl) faceEl.textContent = '🙂';
  const timerEl = document.getElementById('msTimerDisplay');
  if (timerEl) timerEl.textContent = '0:00';
  const flagEl = document.getElementById('msFlagCounter');
  if (flagEl) flagEl.textContent = '⚑ ' + d.mines;
  msRender();
}

function msPlaceMines(safeR, safeC) {
  // Avoid 3×3 area around first click so it's never instant death
  const safe = new Set();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = safeR + dr, nc = safeC + dc;
    if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols)
      safe.add(nr * ms.cols + nc);
  }
  let placed = 0;
  while (placed < ms.mines) {
    const idx = Math.floor(Math.random() * ms.rows * ms.cols);
    const r = Math.floor(idx / ms.cols), c = idx % ms.cols;
    if (!safe.has(idx) && !ms.board[r][c].mine) { ms.board[r][c].mine = true; placed++; }
  }
  // Calculate neighbour counts
  for (let r = 0; r < ms.rows; r++) for (let c = 0; c < ms.cols; c++) {
    if (ms.board[r][c].mine) continue;
    let cnt = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r+dr, nc = c+dc;
      if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols && ms.board[nr][nc].mine) cnt++;
    }
    ms.board[r][c].count = cnt;
  }
}

function msFloodReveal(startR, startC) {
  // Iterative flood fill — safe for large boards
  const queue = [[startR, startC]], seen = new Set();
  while (queue.length) {
    const [r, c] = queue.shift();
    const key = r * ms.cols + c;
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = ms.board[r][c];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    if (cell.count === 0) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r+dr, nc = c+dc;
        if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols) queue.push([nr, nc]);
      }
    }
  }
}

function msCheckWin() {
  for (let r = 0; r < ms.rows; r++)
    for (let c = 0; c < ms.cols; c++)
      if (!ms.board[r][c].mine && !ms.board[r][c].revealed) return false;
  return true;
}

function msRevealCell(r, c) {
  if (ms.state === 'won' || ms.state === 'lost') return;
  const cell = ms.board[r][c];
  if (cell.revealed || cell.flagged) return;

  // First click: place mines now (guarantees safe first click)
  if (ms.firstClick) {
    ms.firstClick = false;
    msPlaceMines(r, c);
    ms.state = 'playing';
    ms.timerInterval = setInterval(() => {
      ms.timer++;
      const el = document.getElementById('msTimerDisplay');
      if (el) el.textContent = fmtTime(ms.timer);
    }, 1000);
  }

  // Hit a mine
  if (cell.mine) {
    cell.revealed = true; cell.hitMine = true;
    ms.state = 'lost';
    clearInterval(ms.timerInterval);
    // Reveal all un-flagged mines
    for (let rr = 0; rr < ms.rows; rr++) for (let cc = 0; cc < ms.cols; cc++)
      if (ms.board[rr][cc].mine && !ms.board[rr][cc].flagged) ms.board[rr][cc].revealed = true;
    const fb = document.getElementById('msFaceBtn');
    if (fb) fb.textContent = '💀';
    msRender(); return;
  }

  msFloodReveal(r, c);

  if (msCheckWin()) {
    ms.state = 'won';
    clearInterval(ms.timerInterval);
    const fb = document.getElementById('msFaceBtn');
    if (fb) fb.textContent = '😎';
    // Auto-flag remaining mines
    for (let rr = 0; rr < ms.rows; rr++) for (let cc = 0; cc < ms.cols; cc++)
      if (ms.board[rr][cc].mine) ms.board[rr][cc].flagged = true;
    ms.flagsPlaced = ms.mines;
  }

  msRender();
}

function msToggleFlag(r, c) {
  // Can only flag after the first click reveals the board
  if (ms.state !== 'playing') return;
  const cell = ms.board[r][c];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  ms.flagsPlaced += cell.flagged ? 1 : -1;
  const el = document.getElementById('msFlagCounter');
  if (el) el.textContent = '⚑ ' + (ms.mines - ms.flagsPlaced);
  msRender();
}

function msChord(r, c) {
  // Double-click on a revealed number: if flagged neighbours = count, reveal the rest
  if (ms.state !== 'playing') return;
  const cell = ms.board[r][c];
  if (!cell.revealed || cell.count === 0) return;
  let flags = 0; const toReveal = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r+dr, nc = c+dc;
    if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols) {
      const n = ms.board[nr][nc];
      if (n.flagged) flags++;
      else if (!n.revealed) toReveal.push([nr, nc]);
    }
  }
  if (flags !== cell.count) return; // not enough flags — do nothing
  toReveal.forEach(([nr, nc]) => msRevealCell(nr, nc));
}

function msRender() {
  const el = document.getElementById('msBoard');
  if (!el) return;
  el.className = `ms-board ms-board-${ms.diff}`;
  el.style.gridTemplateColumns = `repeat(${ms.cols}, var(--ms-cs, 26px))`;
  el.innerHTML = '';

  for (let r = 0; r < ms.rows; r++) {
    for (let c = 0; c < ms.cols; c++) {
      const cell = ms.board[r][c];
      const div = document.createElement('div');
      div.className = 'ms-cell';

      if (cell.revealed) {
        div.classList.add('ms-cell-open');
        if (cell.mine) {
          div.classList.add(cell.hitMine ? 'ms-cell-boom' : 'ms-cell-mine');
          div.textContent = '●';
        } else if (cell.count > 0) {
          div.textContent = cell.count;
          div.style.color = MS_COLORS[cell.count];
        }
      } else if (cell.flagged) {
        div.classList.add('ms-cell-flag');
        // Wrong flag (flagged non-mine) shown dimmed/struck on loss
        if (ms.state === 'lost' && !cell.mine) div.classList.add('ms-cell-wrong');
        div.textContent = '⚑';
      }

      // Left click = reveal | right click = flag | double click = chord
      div.addEventListener('click',       () => msRevealCell(r, c));
      div.addEventListener('contextmenu', e  => { e.preventDefault(); msToggleFlag(r, c); });
      div.addEventListener('dblclick',    () => msChord(r, c));
      el.appendChild(div);
    }
  }
}

function openMinesweeper() {
  const overlay = document.getElementById('minesweeperOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  // Init on first open; keep an in-progress game alive between opens
  if (!ms.board.length) msInit('easy');
  else msRender();
}

// MS button wiring
document.getElementById('msFaceBtn').addEventListener('click', () => msInit());
document.getElementById('btnMsClose').addEventListener('click', () => {
  document.getElementById('minesweeperOverlay').style.display = 'none';
});
document.getElementById('minesweeperOverlay').addEventListener('contextmenu', e => e.preventDefault());
document.querySelectorAll('.ms-diff-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.ms-diff-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  msInit(btn.dataset.diff);
}));

/* ─── POMODORO ───────────────────────────────────────────── */

function sandColor(p) {
  if (p > 0.50) return `rgb(${accentRGB})`;   // holographic sand in the theme's light color
  if (p > 0.25) return '#ffd54f';
  if (p > 0.10) return '#ff8833';
  return '#ff4422';
}

function renderTimer() {
  timerDisplay.textContent = fmtTime(pomo.timeLeft);
  const p = pomo.timeLeft / DURATIONS[pomo.mode];

  // Update hourglass sand
  const topSand = document.getElementById('hgTopSand');
  const botSand = document.getElementById('hgBotSand');
  if (topSand && botSand) {
    const topH = p * 70;               // top chamber height = 70 (y 8→78)
    topSand.setAttribute('y', 78 - topH);
    topSand.setAttribute('height', topH);
    const botH = (1 - p) * 70;        // bot chamber height = 70 (y 92→162)
    botSand.setAttribute('y', 162 - botH);
    botSand.setAttribute('height', botH);
    const col = sandColor(p);
    topSand.setAttribute('fill', col);
    botSand.setAttribute('fill', col);
  }
  // Toggle particle animation
  const hgWrap = document.getElementById('hourglassWrap');
  if (hgWrap) hgWrap.classList.toggle('hourglass-running', pomo.running && pomo.timeLeft > 0);

  btnStartPause.textContent = pomo.running ? 'Pause' : 'Start';
  const dots = sessionDots.querySelectorAll('.s-dot');
  dots.forEach((d,i) => d.classList.toggle('done', i < (pomo.sessions%4)));
}

function startTimer() {
  clearInterval(pomo.interval);   // never stack two tickers
  pomo.running = true;
  pomo.deadline = Date.now() + pomo.timeLeft * 1000;
  pomo.interval = setInterval(() => {
    pomo.timeLeft = Math.max(0, Math.round((pomo.deadline - Date.now()) / 1000));
    renderTimer();
    if (pomo.timeLeft <= 0) {
      clearInterval(pomo.interval); pomo.running = false; pomo.deadline = null;
      if (pomo.mode==='work') { pomo.sessions++; podOnPomoComplete(); setMode(pomo.sessions%4===0?'long':'short'); }
      else setMode('work');
    }
  }, 500);
}

function pauseTimer() { clearInterval(pomo.interval); pomo.running=false; pomo.deadline=null; renderTimer(); }
function resetTimer() { pauseTimer(); pomo.timeLeft=DURATIONS[pomo.mode]; renderTimer(); }
function setMode(mode) {
  pauseTimer(); pomo.mode=mode; pomo.timeLeft=DURATIONS[mode];
  document.querySelectorAll('.pomo-mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  renderTimer();
}

btnStartPause.addEventListener('click', ()=>pomo.running?pauseTimer():startTimer());
btnReset.addEventListener('click', resetTimer);
document.querySelectorAll('.pomo-mode').forEach(btn => btn.addEventListener('click', () => {
  setMode(btn.dataset.mode);
  if (btn.dataset.mode === 'short' || btn.dataset.mode === 'long') openMinesweeper();
}));

/* ─── TAB SWITCHING ──────────────────────────────────────── */

document.querySelectorAll('.nav-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    const id=tab.dataset.tab;
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${id}`));
  });
});

document.getElementById('btnAddTask').addEventListener('click', addTask);

/* ─── MEDIA TABS ─────────────────────────────────────────── */

document.querySelectorAll('.media-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    const m=tab.dataset.media;
    document.querySelectorAll('.media-tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.getElementById('mediaPanelSpotify').classList.toggle('active', m==='spotify');
    document.getElementById('mediaPanelYoutube').classList.toggle('active', m==='youtube');
  });
});

// Init first panel active
document.getElementById('mediaPanelSpotify').classList.add('active');

/* ─── YOUTUBE ────────────────────────────────────────────── */

function extractYtId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const p of patterns) { const m=url.match(p); if(m) return m[1]; }
  return null;
}

function loadYouTube(url) {
  const raw = url.trim();
  const id = extractYtId(raw);
  const player = document.getElementById('ytPlayer');
  if (!id) {
    player.innerHTML = `<div class="yt-player-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity=".3"><rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg><span>Invalid URL or video ID</span></div>`;
    return;
  }
  player.innerHTML = `<iframe width="100%" height="160" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&controls=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  // Save to history
  ytHistory = ytHistory.filter(h => h.id !== id);
  ytHistory.unshift({ id, title: raw.length < 40 ? raw : id });
  if (ytHistory.length > 5) ytHistory.pop();
  saveYtHistory();
  renderYtHistory();
}

function renderYtHistory() {
  const recent = document.getElementById('ytRecent');
  const list   = document.getElementById('ytRecentList');
  if (!recent || !list) return;
  if (ytHistory.length === 0) { recent.style.display = 'none'; return; }
  recent.style.display = 'flex';
  list.innerHTML = '';
  ytHistory.forEach(h => {
    const item = document.createElement('div');
    item.className = 'yt-recent-item';
    item.innerHTML = `<img class="yt-recent-thumb" src="https://img.youtube.com/vi/${h.id}/default.jpg" alt=""/><span class="yt-recent-title">${esc(h.title)}</span>`;
    item.addEventListener('click', () => {
      document.getElementById('ytInput').value = h.id;
      loadYouTube(h.id);
    });
    list.appendChild(item);
  });
}

document.getElementById('btnYtLoad').addEventListener('click', () => {
  loadYouTube(document.getElementById('ytInput').value);
});
document.getElementById('ytInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadYouTube(e.target.value);
});
document.getElementById('btnYtClear').addEventListener('click', () => {
  document.getElementById('ytInput').value = '';
  document.getElementById('ytPlayer').innerHTML = '';
  document.getElementById('ytInput').focus();
});

/* ─── GOOGLE SIGN-IN (account) ───────────────────────────── */

let googleUser = null; // { id, name, email, picture }

function settingsKey(key) {
  return googleUser ? `u_${googleUser.id}_${key}` : key;
}

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  } catch(e) { return null; }
}

function onGoogleSignIn(credential) {
  const payload = parseJwt(credential);
  if (!payload) return;
  googleUser = { id: payload.sub, name: payload.name, email: payload.email, picture: payload.picture };
  localStorage.setItem('google_user', JSON.stringify(googleUser));
  renderGoogleProfile();
  loadSettings(); // reload settings scoped to this user
}

function renderGoogleProfile() {
  if (googleUser) {
    document.getElementById('googleSignedOut').style.display = 'none';
    document.getElementById('googleSignedIn').style.display  = 'flex';
    document.getElementById('googleAvatar').src              = googleUser.picture || '';
    document.getElementById('googleProfileName').textContent = googleUser.name   || '';
    document.getElementById('googleProfileEmail').textContent= googleUser.email  || '';
  } else {
    document.getElementById('googleSignedOut').style.display = 'flex';
    document.getElementById('googleSignedIn').style.display  = 'none';
  }
}

const SIGNIN_CLIENT_ID = '975788598714-8bbmso43rl6mamdi5k70huke2sc961sc.apps.googleusercontent.com';

function initGoogleSignIn() {
  // Restore previous session
  try {
    const saved = JSON.parse(localStorage.getItem('google_user') || 'null');
    if (saved && saved.id) googleUser = saved;
  } catch(e) {}
  renderGoogleProfile();

  // Wait for GSI library then render button
  function tryRender() {
    if (typeof google === 'undefined' || !google.accounts) { setTimeout(tryRender, 300); return; }
    google.accounts.id.initialize({
      client_id: SIGNIN_CLIENT_ID,
      callback: (resp) => onGoogleSignIn(resp.credential),
      auto_select: false,
    });
    google.accounts.id.renderButton(document.getElementById('googleSignInBtn'), {
      theme: 'filled_black',
      size: 'medium',
      text: 'signin_with',
      shape: 'rectangular',
    });
  }
  tryRender();
}

document.getElementById('btnGoogleSignOut').addEventListener('click', () => {
  googleUser = null;
  localStorage.removeItem('google_user');
  if (typeof google !== 'undefined' && google.accounts) google.accounts.id.disableAutoSelect();
  renderGoogleProfile();
  loadSettings();
});

/* ─── SETTINGS ───────────────────────────────────────────── */

function loadSettings() {
  document.getElementById('inputGoogleClientId').value  = localStorage.getItem(settingsKey('googleClientId'))  || '';
  document.getElementById('inputSpotifyClientId').value = localStorage.getItem(settingsKey('spotifyClientId')) || '';
  const redirectUri=window.location.origin+window.location.pathname.replace(/\/?$/,'/');
  const d=document.getElementById('redirectUriDisplay');
  if(d) d.textContent=redirectUri;
  const d2=document.getElementById('redirectUriDisplay2');
  if(d2) d2.textContent=redirectUri;
}

document.getElementById('btnSaveSettings').addEventListener('click',()=>{
  localStorage.setItem(settingsKey('googleClientId'),  document.getElementById('inputGoogleClientId').value.trim());
  localStorage.setItem(settingsKey('spotifyClientId'), document.getElementById('inputSpotifyClientId').value.trim());
  // also keep a global copy so Spotify/Calendar can find it regardless of sign-in state
  localStorage.setItem('googleClientId',  document.getElementById('inputGoogleClientId').value.trim());
  localStorage.setItem('spotifyClientId', document.getElementById('inputSpotifyClientId').value.trim());
  const msg=document.getElementById('settingsSavedMsg');
  msg.style.display='block'; setTimeout(()=>msg.style.display='none',2000);
});

/* ─── GOOGLE CALENDAR ────────────────────────────────────── */

let googleToken = null;
let googleTokenClient = null;
let googleMailClient = null;
let googleHasMail = false;
let calendarEvents = [];

const G_CAL_SCOPES  = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';
const G_MAIL_SCOPE  = 'https://www.googleapis.com/auth/gmail.readonly';

function gAuthCallback(resp) {
  const hint = document.getElementById('calConfigHint');
  if (resp.error) {
    if (hint) hint.textContent = `Google sign-in failed: ${resp.error}${resp.error_description ? ' — ' + resp.error_description : ''}`;
    return;
  }
  googleToken = resp.access_token;
  googleHasMail = (resp.scope || '').includes('gmail.readonly');
  if (hint) hint.textContent = '';
  loadCalendarEvents();
}

function initGoogleAuth() {
  const clientId=localStorage.getItem('googleClientId');
  if (!clientId || typeof google==='undefined') return;
  // Calendar-only connect: gmail.readonly is a restricted scope, so bundling it
  // into the main flow can get the whole consent rejected. Mail is opt-in below.
  googleTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: G_CAL_SCOPES,
    callback: gAuthCallback,
    error_callback: e => { const h=document.getElementById('calConfigHint'); if (h) h.textContent = `Google popup error: ${e.type || e.message || 'unknown'}`; },
  });
  googleMailClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: G_CAL_SCOPES + ' ' + G_MAIL_SCOPE,
    callback: gAuthCallback,
    error_callback: e => { const h=document.getElementById('calConfigHint'); if (h) h.textContent = `Google popup error: ${e.type || e.message || 'unknown'}`; },
  });
}

document.getElementById('btnCalConnect').addEventListener('click',()=>{
  const clientId=localStorage.getItem('googleClientId');
  if (!clientId) { document.getElementById('calConfigHint').textContent='Add your Google Client ID in Settings first.'; return; }
  if (!googleTokenClient) initGoogleAuth();
  if (!googleTokenClient) return;
  googleTokenClient.requestAccessToken({prompt:'consent'});
});

document.getElementById('btnCalMail')?.addEventListener('click',()=>{
  if (!googleMailClient) initGoogleAuth();
  if (!googleMailClient) return;
  googleMailClient.requestAccessToken({prompt:'consent'});
});

document.getElementById('btnCalDisconnect').addEventListener('click',()=>{
  googleToken=null; calendarEvents=[]; googleHasMail=false;
  document.getElementById('calEventsState').style.display='none';
  document.getElementById('calConnectState').style.display='flex';
});

document.getElementById('btnCalImportAll').addEventListener('click',()=>{
  calendarEvents.forEach(ev=>{
    const title=(ev.summary||'Untitled').trim();
    if (!tasks.find(t=>t.title===title))
      tasks.push({id:uid(),title,done:false,seat:false,orbit:false,timerLeft:DEFAULT_TASK_TIMER,timerTotal:DEFAULT_TASK_TIMER});
  });
  render();
  // Switch to focus tab
  document.querySelector('[data-tab="focus"]').click();
});

async function loadCalendarEvents() {
  if (!googleToken) return;
  const now=new Date().toISOString(), future=new Date(Date.now()+14*86400000).toISOString();
  const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(future)}&singleEvents=true&orderBy=startTime&maxResults=50`;
  try {
    const res=await fetch(url,{headers:{Authorization:`Bearer ${googleToken}`}});
    if (res.status===401){googleToken=null;return;}
    const data=await res.json();
    calendarEvents=data.items||[];
    renderCalendarEvents(calendarEvents);
  } catch(e){ console.error('Calendar fetch failed',e); }
}

function importEventAsTask(title, btn) {
  const trimmed = title.trim();
  if (!tasks.find(t=>t.title===trimmed)) {
    tasks.push({id:uid(),title:trimmed,done:false,seat:false,orbit:false,timerLeft:DEFAULT_TASK_TIMER,timerTotal:DEFAULT_TASK_TIMER});
    render();
  }
  btn.textContent='✓ Added';
  btn.classList.add('imported');
  btn.disabled=true;
}

function renderCalendarEvents(events) {
  document.getElementById('calConnectState').style.display='none';
  document.getElementById('calEventsState').style.display='flex';
  const list=document.getElementById('calEventsList');
  list.innerHTML='';
  if (events.length===0) { list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:20px 0">No upcoming events</div>'; return; }

  const grouped={};
  events.forEach(ev=>{
    const key=ev.start.dateTime?new Date(ev.start.dateTime).toDateString():new Date(ev.start.date+'T00:00:00').toDateString();
    (grouped[key]=grouped[key]||[]).push(ev);
  });

  const today=new Date().toDateString(), tomorrow=new Date(Date.now()+86400000).toDateString();
  Object.entries(grouped).forEach(([dateStr,dayEvs])=>{
    const hdr=document.createElement('div');
    hdr.className='cal-date-header';
    hdr.textContent=dateStr===today?'Today':dateStr===tomorrow?'Tomorrow':new Date(dateStr).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
    list.appendChild(hdr);
    dayEvs.forEach(ev=>{
      const el=document.createElement('div');
      el.className='cal-event';
      const startT=ev.start.dateTime?new Date(ev.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'All day';
      const endT=ev.end.dateTime?' – '+new Date(ev.end.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';
      const importBtn=document.createElement('button');
      importBtn.className='cal-import-btn';
      importBtn.textContent='+ Task';
      const title=ev.summary||'Untitled';
      importBtn.addEventListener('click',()=>importEventAsTask(title,importBtn));
      el.innerHTML=`<div class="cal-event-time">${startT}${endT}</div><div class="cal-event-details"><div class="cal-event-title">${esc(title)}</div>${ev.location?`<div class="cal-event-location">${esc(ev.location)}</div>`:''}</div>`;
      el.appendChild(importBtn);
      list.appendChild(el);
    });
  });
}

/* ─── SPOTIFY ────────────────────────────────────────────── */

const SP_SCOPES='user-read-currently-playing user-read-playback-state user-modify-playback-state';
let spotifyPollTimer=null;
let spProgressMs=0, spDurationMs=0, spIsPlaying=false, spProgressInterval=null;

function spVerifier(){ const a=new Uint8Array(64); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
async function spChallenge(v){ const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)); return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }

async function connectSpotify(){
  const clientId=localStorage.getItem('spotifyClientId');
  if (!clientId){ alert('Add your Spotify Client ID in Settings first.'); document.querySelector('[data-tab="settings"]').click(); return; }
  const v=spVerifier(), c=await spChallenge(v);
  const redirectUri=window.location.origin+window.location.pathname.replace(/\/?$/,'/');
  localStorage.setItem('sp_verifier',v); localStorage.setItem('sp_redirect',redirectUri);
  const p=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,code_challenge_method:'S256',code_challenge:c,scope:SP_SCOPES});
  window.location.href=`https://accounts.spotify.com/authorize?${p}`;
}

async function handleSpotifyCallback(){
  const p=new URLSearchParams(window.location.search), code=p.get('code');
  if (!code) return;
  history.replaceState({},'',window.location.pathname);
  const clientId=localStorage.getItem('spotifyClientId'), v=localStorage.getItem('sp_verifier'), redirectUri=localStorage.getItem('sp_redirect');
  if (!clientId||!v) return;
  try {
    const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri,client_id:clientId,code_verifier:v})});
    const data=await res.json();
    if (data.access_token){
      localStorage.setItem('sp_token',data.access_token);
      if(data.refresh_token) localStorage.setItem('sp_refresh',data.refresh_token);
      localStorage.setItem('sp_expiry',Date.now()+data.expires_in*1000);
      showSpotifyPlayer(); pollNowPlaying();
    }
  } catch(e){ console.error('Spotify token exchange failed',e); }
}

async function refreshSpotifyToken(){
  const clientId=localStorage.getItem('spotifyClientId'), refresh=localStorage.getItem('sp_refresh');
  if(!clientId||!refresh) return false;
  try{
    const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:clientId})});
    const data=await res.json();
    if(data.access_token){localStorage.setItem('sp_token',data.access_token);localStorage.setItem('sp_expiry',Date.now()+data.expires_in*1000);return true;}
  }catch(e){}
  return false;
}

async function spFetch(url,opts={}){
  const expiry=+localStorage.getItem('sp_expiry')||0;
  if(Date.now()>expiry-60000) await refreshSpotifyToken();
  const token=localStorage.getItem('sp_token');
  if(!token) return null;
  return fetch(url,{...opts,headers:{...(opts.headers||{}),Authorization:`Bearer ${token}`}});
}

async function pollNowPlaying(){
  clearTimeout(spotifyPollTimer);
  try{
    const res=await spFetch('https://api.spotify.com/v1/me/player/currently-playing');
    if(!res){hideSpotifyPlayer();return;}
    if(res.status===200){ const data=await res.json(); updateSpotifyDisplay(data); }
    else if(res.status===204){ updateSpotifyDisplay(null); }
    else if(res.status===401){ hideSpotifyPlayer();return; }
  }catch(e){}
  spotifyPollTimer=setTimeout(pollNowPlaying,5000);
}

function updateSpotifyDisplay(data){
  const trackEl=document.getElementById('spotifyTrackName'), artistEl=document.getElementById('spotifyArtist'),
    artEl=document.getElementById('spotifyArt'), playIcon=document.getElementById('playIcon');

  if(!data||!data.item){
    trackEl.textContent='Nothing playing'; artistEl.textContent='—'; artEl.src='';
    playIcon.innerHTML='<path d="M8 5v14l11-7z"/>';
    spProgressMs=0; spDurationMs=0; spIsPlaying=false; renderSpotifyProgress(); return;
  }
  const{name,artists,album,duration_ms,id:trackId}=data.item;
  trackEl.textContent=name; artistEl.textContent=artists.map(a=>a.name).join(', ');
  artEl.src=album.images.slice(-1)[0]?.url||'';
  // Fetch audio features for visualizer (only when track changes)
  if (trackId && trackId !== (window._lastVizTrackId||'')) {
    window._lastVizTrackId = trackId;
    fetchAudioFeatures(trackId);
  }
  spProgressMs=data.progress_ms||0; spDurationMs=duration_ms||0; spIsPlaying=data.is_playing;
  playIcon.innerHTML=data.is_playing?'<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>':'<path d="M8 5v14l11-7z"/>';
  renderSpotifyProgress();
  clearInterval(spProgressInterval);
  if(spIsPlaying) spProgressInterval=setInterval(()=>{ spProgressMs+=1000; if(spProgressMs>spDurationMs)spProgressMs=spDurationMs; renderSpotifyProgress(); },1000);
}

function renderSpotifyProgress(){
  const pct=spDurationMs>0?(spProgressMs/spDurationMs*100):0;
  document.getElementById('spProgressFill').style.width=pct+'%';
  document.getElementById('spCurrentTime').textContent=msToTime(spProgressMs);
  document.getElementById('spTotalTime').textContent=msToTime(spDurationMs);
}

function showSpotifyPlayer(){ document.getElementById('spotifyConnect').style.display='none'; document.getElementById('spotifyPlayer').style.display='flex'; }
function hideSpotifyPlayer(){ document.getElementById('spotifyPlayer').style.display='none'; document.getElementById('spotifyConnect').style.display='block'; }

async function spControl(action){
  const map={play:{method:'PUT',url:'https://api.spotify.com/v1/me/player/play'},pause:{method:'PUT',url:'https://api.spotify.com/v1/me/player/pause'},next:{method:'POST',url:'https://api.spotify.com/v1/me/player/next'},prev:{method:'POST',url:'https://api.spotify.com/v1/me/player/previous'}};
  const{method,url}=map[action];
  await spFetch(url,{method});
  setTimeout(pollNowPlaying,400);
}

document.getElementById('btnSpotifyConnect').addEventListener('click',connectSpotify);
document.getElementById('btnSpotifyDisconnect').addEventListener('click',()=>{
  clearTimeout(spotifyPollTimer); clearInterval(spProgressInterval);
  localStorage.removeItem('sp_token'); localStorage.removeItem('sp_refresh'); localStorage.removeItem('sp_expiry');
  hideSpotifyPlayer();
});
document.getElementById('btnPlay').addEventListener('click',async()=>{
  const res=await spFetch('https://api.spotify.com/v1/me/player');
  if(!res) return;
  const state=res.status===200?await res.json():null;
  spControl(state?.is_playing?'pause':'play');
});
document.getElementById('btnNext').addEventListener('click',()=>spControl('next'));
document.getElementById('btnPrev').addEventListener('click',()=>spControl('prev'));

// Progress bar seek
document.getElementById('spProgressTrack').addEventListener('click', async e => {
  if (!spDurationMs) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const ms = Math.floor(pct * spDurationMs);
  await spFetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${ms}`, {method:'PUT'});
  spProgressMs = ms; renderSpotifyProgress();
});

/* ─── THEMES ─────────────────────────────────────────────── */

/* Holographic HUD palettes — every theme is a hologram, only the light color changes */
const THEMES = {
  dark:     { '--bg':'#020609','--bg2':'#031017','--surface':'#04141e','--surface2':'#051d2b','--card':'#041926','--card-hi':'#072b3d','--border':'#0b394d','--border2':'#125570','--text':'#d8f6ff','--text2':'#5fa8bf','--text3':'#25566b','--accent':'#35e0ff','--accent-rgb':'53,224,255','--white':'#35e0ff' },
  midnight: { '--bg':'#050309','--bg2':'#080512','--surface':'#0c081a','--surface2':'#120c26','--card':'#100a22','--card-hi':'#1b1238','--border':'#241847','--border2':'#392564','--text':'#ecdfff','--text2':'#9d7fc7','--text3':'#4c3a6b','--accent':'#b16cff','--accent-rgb':'177,108,255','--white':'#b16cff' },
  ember:    { '--bg':'#090501','--bg2':'#110a03','--surface':'#170e04','--surface2':'#211405','--card':'#1c1105','--card-hi':'#301f09','--border':'#42280a','--border2':'#5e3a10','--text':'#fff0da','--text2':'#c49b64','--text3':'#6b4e26','--accent':'#ffb340','--accent-rgb':'255,179,64','--white':'#ffb340' },
  forest:   { '--bg':'#010805','--bg2':'#02110a','--surface':'#03170e','--surface2':'#042113','--card':'#031c10','--card-hi':'#06301d','--border':'#0a4226','--border2':'#0f5e36','--text':'#dcffe9','--text2':'#6fbf8f','--text3':'#2c6b46','--accent':'#4dff88','--accent-rgb':'77,255,136','--white':'#4dff88' },
  ocean:    { '--bg':'#020409','--bg2':'#040814','--surface':'#050c1e','--surface2':'#071129','--card':'#060e23','--card-hi':'#0b1a3d','--border':'#10254d','--border2':'#1a3870','--text':'#dfeaff','--text2':'#7f9dc7','--text3':'#3a4f6b','--accent':'#4d8dff','--accent-rgb':'77,141,255','--white':'#4d8dff' },
};

let accentRGB = '53,224,255';   // cached for canvas drawing (visualizer)

function applyTheme(key) {
  const t = THEMES[key]; if (!t) return;
  Object.entries(t).forEach(([k,v]) => document.documentElement.style.setProperty(k,v));
  accentRGB = t['--accent-rgb'] || '53,224,255';
  localStorage.setItem('cc_theme', key);
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme===key));
}

function loadTheme() { applyTheme(localStorage.getItem('cc_theme') || 'dark'); }

document.querySelectorAll('.theme-swatch').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

/* ─── CALENDAR CREATE EVENT ──────────────────────────────── */

document.getElementById('btnCalNewEvent')?.addEventListener('click', () => {
  // Pre-fill date to today
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('calEvDate').value  = today;
  document.getElementById('calEvStart').value = '09:00';
  document.getElementById('calEvEnd').value   = '10:00';
  document.getElementById('calEvTitle').value = '';
  document.getElementById('calEvDesc').value  = '';
  document.getElementById('calCreateStatus').textContent = '';
  document.getElementById('calCreateOverlay').style.display = 'flex';
});

document.getElementById('btnCalCreateClose')?.addEventListener('click', () => {
  document.getElementById('calCreateOverlay').style.display = 'none';
});
document.getElementById('btnCalCreateCancel')?.addEventListener('click', () => {
  document.getElementById('calCreateOverlay').style.display = 'none';
});

document.getElementById('btnCalCreateSave')?.addEventListener('click', async () => {
  const title = document.getElementById('calEvTitle').value.trim();
  const date  = document.getElementById('calEvDate').value;
  const start = document.getElementById('calEvStart').value;
  const end   = document.getElementById('calEvEnd').value;
  const desc  = document.getElementById('calEvDesc').value.trim();
  const status = document.getElementById('calCreateStatus');

  if (!title) { status.style.color='#e87'; status.textContent='Title is required'; return; }
  if (!date)  { status.style.color='#e87'; status.textContent='Date is required'; return; }

  const btn = document.getElementById('btnCalCreateSave');
  btn.disabled = true; btn.textContent = 'Creating…';
  status.style.color='var(--text2)'; status.textContent = '';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = {
    summary: title,
    description: desc || undefined,
    start: start ? { dateTime:`${date}T${start}:00`, timeZone:tz } : { date },
    end:   end   ? { dateTime:`${date}T${end}:00`,   timeZone:tz } : { date },
  };

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Authorization':`Bearer ${googleToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      status.style.color='var(--green)'; status.textContent='Event created ✓';
      await loadCalendarEvents();
      setTimeout(() => { document.getElementById('calCreateOverlay').style.display='none'; }, 900);
    } else {
      const err = await res.json().catch(()=>({}));
      status.style.color='#e87'; status.textContent = err.error?.message || 'Failed to create event';
    }
  } catch(e) {
    status.style.color='#e87'; status.textContent = 'Network error';
  }
  btn.disabled = false; btn.textContent = 'Create Event';
});

/* ─── VISION BOARD ───────────────────────────────────────── */

let vbBoards = [];
let vbActiveId = null;
let vbDraggingBubble = null;
let vbPanningState   = null;

document.addEventListener('mousemove', e => {
  if (vbDraggingBubble) {
    const {bubble, startX, startY, startBX, startBY, el} = vbDraggingBubble;
    bubble.x = startBX + (e.clientX - startX);
    bubble.y = startBY + (e.clientY - startY);
    el.style.left = bubble.x + 'px';
    el.style.top  = bubble.y + 'px';
    const line = document.getElementById(`vbLine_${bubble.id}`);
    if (line) {
      line.setAttribute('x2', bubble.x + Math.floor((bubble.w||180)/2));
      line.setAttribute('y2', bubble.y + Math.floor((bubble.h||100)/2));
    }
  }
  if (vbPanningState) {
    const {board, startX, startY, startPanX, startPanY} = vbPanningState;
    board.panX = startPanX + (e.clientX - startX);
    board.panY = startPanY + (e.clientY - startY);
    const pan = document.getElementById('vbPan');
    if (pan) pan.style.transform = `translate(${board.panX}px,${board.panY}px)`;
  }
});

document.addEventListener('mouseup', () => {
  if (vbDraggingBubble) { saveVb(); vbDraggingBubble = null; }
  if (vbPanningState) {
    saveVb();
    vbPanningState = null;
    const area = document.getElementById('vbCanvasArea');
    if (area) area.classList.remove('panning');
  }
});

function loadVb() {
  try { vbBoards = JSON.parse(localStorage.getItem('vb_boards') || '[]'); } catch(e) { vbBoards = []; }
  // Migration: existing local boards predate timestamping — stamp them as current so a
  // freshly git-pulled default file can't silently overwrite real local data on first sync.
  if (vbBoards.length && !localStorage.getItem('vb_boards_at')) {
    try { localStorage.setItem('vb_boards_at', String(Date.now())); } catch(e) {}
  }
  if (!vbBoards.length) {
    vbBoards = [{ id:uid(), name:'My Vision', panX:0, panY:0, vision:{title:'My Goal',img:''}, bubbles:[] }];
  }
  if (!vbActiveId || !vbBoards.find(b=>b.id===vbActiveId)) vbActiveId = vbBoards[0]?.id || null;
}

function saveVb() {
  const at = Date.now();
  try {
    localStorage.setItem('vb_boards', JSON.stringify(vbBoards));
    localStorage.setItem('vb_boards_at', String(at));
  } catch(e) {}
  saveVbToServer(at);
}

/* Push to data/vb_boards.json via the server (debounced) so the board syncs through git */
let vbServerTimer = null;
function saveVbToServer(at) {
  clearTimeout(vbServerTimer);
  vbServerTimer = setTimeout(() => {
    fetch('/api/state', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ key:'vb_boards', savedAt: at, value: vbBoards }) }).catch(()=>{});
  }, 600);
}

/* On boot, pull the server copy. Newer-timestamp wins, so neither machine wipes the other. */
async function syncVbFromServer() {
  let remote = null;
  try {
    const r = await (await fetch('/api/state?key=vb_boards')).json();
    remote = r && r.data ? r.data : null;
  } catch(e) { return; }   // offline or old server — localStorage still works
  const localAt = Number(localStorage.getItem('vb_boards_at') || 0);
  if (remote && Array.isArray(remote.value) && remote.value.length && (remote.savedAt || 0) > localAt) {
    vbBoards = remote.value;
    try {
      localStorage.setItem('vb_boards', JSON.stringify(vbBoards));
      localStorage.setItem('vb_boards_at', String(remote.savedAt || Date.now()));
    } catch(e) {}
    if (!vbActiveId || !vbBoards.find(b=>b.id===vbActiveId)) vbActiveId = vbBoards[0]?.id || null;
    renderVbSidebar();
    renderVbCanvas();
  } else if (!remote) {
    // server has no file yet → push our current local copy up so git can track it
    saveVb();
  }
}

function vbGetActive() { return vbBoards.find(b=>b.id===vbActiveId); }

function renderVbSidebar() {
  const list = document.getElementById('vbSidebarList');
  if (!list) return;
  list.innerHTML = '';
  vbBoards.forEach(b => {
    const item = document.createElement('div');
    item.className = 'vb-sidebar-item' + (b.id===vbActiveId ? ' active' : '');
    item.innerHTML = `<span class="vb-sidebar-item-name">${esc(b.name)}</span>
      <button class="nb-del" title="Delete">${xSVG}</button>`;

    item.addEventListener('click', e => {
      if (e.target.closest('.nb-del')) return;
      vbActiveId = b.id; renderVbSidebar(); renderVbCanvas();
    });

    item.querySelector('.vb-sidebar-item-name').addEventListener('dblclick', () => {
      const nameEl = item.querySelector('.vb-sidebar-item-name');
      const inp = document.createElement('input');
      inp.className = 'nb-item-name-input'; inp.value = b.name;
      nameEl.replaceWith(inp); inp.focus(); inp.select();
      const save = () => { b.name = inp.value.trim() || b.name; saveVb(); renderVbSidebar(); };
      inp.addEventListener('blur', save, {once:true});
      inp.addEventListener('keydown', ke => {
        if (ke.key==='Enter') { ke.preventDefault(); inp.blur(); }
        if (ke.key==='Escape') { inp.value=b.name; inp.blur(); }
      });
    });

    item.querySelector('.nb-del').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete "${b.name}"?`)) return;
      vbBoards = vbBoards.filter(x=>x.id!==b.id);
      if (vbActiveId===b.id) vbActiveId = vbBoards[0]?.id || null;
      saveVb(); renderVbSidebar(); renderVbCanvas();
    });
    list.appendChild(item);
  });
}

function renderVbCanvas() {
  const area = document.getElementById('vbCanvasArea');
  if (!area) return;
  area.innerHTML = '';

  const board = vbGetActive();
  if (!board) {
    const emp = document.createElement('div');
    emp.className = 'vb-canvas-empty';
    emp.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" opacity=".18"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>No board selected</span>`;
    area.appendChild(emp); return;
  }

  const pan = document.createElement('div');
  pan.id = 'vbPan';
  pan.style.cssText = `position:absolute;left:50%;top:50%;width:0;height:0;will-change:transform;transform:translate(${board.panX||0}px,${board.panY||0}px);`;
  area.appendChild(pan);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.id = 'vbSvg';
  svg.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;';
  pan.appendChild(svg);

  // Vision node
  pan.appendChild(buildVbVisionNode(board));

  // Bubbles
  board.bubbles.forEach(bubble => {
    vbDrawLine(svg, bubble);
    pan.appendChild(buildVbBubble(board, bubble));
  });

  // Canvas panning
  area.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.vb-bubble') || e.target.closest('.vb-vision-node')) return;
    vbPanningState = { board, startX:e.clientX, startY:e.clientY, startPanX:board.panX||0, startPanY:board.panY||0 };
    area.classList.add('panning');
    e.preventDefault();
  });
}

function vbDrawLine(svg, bubble) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(svgNS, 'line');
  line.id = `vbLine_${bubble.id}`;
  line.setAttribute('x1', 0); line.setAttribute('y1', 0);
  line.setAttribute('x2', bubble.x + Math.floor((bubble.w||180)/2));
  line.setAttribute('y2', bubble.y + Math.floor((bubble.h||100)/2));
  line.setAttribute('stroke', `rgba(${accentRGB},0.4)`);
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-dasharray', '5,4');
  line.setAttribute('stroke-linecap', 'round');
  svg.appendChild(line);
}

function buildVbVisionNode(board) {
  const vn = document.createElement('div');
  vn.className = 'vb-vision-node';

  if (board.vision.img) {
    const img = document.createElement('img');
    img.className = 'vb-vision-img'; img.src = board.vision.img;
    img.addEventListener('click', e => { e.stopPropagation(); vbPickImage(board); });
    vn.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'vb-vision-img-placeholder';
    ph.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>Add image</span>`;
    ph.addEventListener('click', e => { e.stopPropagation(); vbPickImage(board); });
    vn.appendChild(ph);
  }

  const titleInp = document.createElement('input');
  titleInp.className = 'vb-vision-title-inp';
  titleInp.value = board.vision.title || '';
  titleInp.placeholder = 'Your vision…';
  titleInp.addEventListener('mousedown', e => e.stopPropagation());
  titleInp.addEventListener('change', e => { board.vision.title = e.target.value; saveVb(); });
  vn.appendChild(titleInp);

  const addBtn = document.createElement('button');
  addBtn.className = 'vb-add-bubble-btn';
  addBtn.textContent = '+ Add thought';
  addBtn.addEventListener('mousedown', e => e.stopPropagation());
  addBtn.addEventListener('click', e => { e.stopPropagation(); vbAddBubble(board); });
  vn.appendChild(addBtn);

  return vn;
}

function vbPickImage(board) {
  const inp = document.getElementById('vbImageInput');
  if (!inp) return;
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 400;
        const scale = Math.min(MAX/img.width, MAX/img.height, 1);
        canvas.width  = Math.floor(img.width  * scale);
        canvas.height = Math.floor(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        board.vision.img = canvas.toDataURL('image/jpeg', 0.72);
        inp.value = '';
        saveVb(); renderVbCanvas();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}

function vbAddBubble(board) {
  const i = board.bubbles.length;
  const angle = (i * 72) * Math.PI / 180;
  const r = 230 + i * 15;
  const bw = 180, bh = 100;
  const bubble = {
    id: uid(),
    x: Math.round(Math.cos(angle)*r - bw/2),
    y: Math.round(Math.sin(angle)*r - bh/2),
    w: bw, h: bh,
    content: ''
  };
  board.bubbles.push(bubble);
  saveVb(); renderVbCanvas();
}

function buildVbBubble(board, bubble) {
  const bel = document.createElement('div');
  bel.className = 'vb-bubble';
  bel.id = `vbBubble_${bubble.id}`;
  bel.style.cssText = `left:${bubble.x}px;top:${bubble.y}px;width:${bubble.w||180}px;height:${bubble.h||100}px;`;

  // Header (drag handle + mini toolbar)
  const header = document.createElement('div');
  header.className = 'vb-bubble-header';

  const editor = document.createElement('div');
  editor.className = 'vb-bubble-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('data-placeholder', 'Write a thought…');
  editor.spellcheck = false;
  if (bubble.content) editor.innerHTML = bubble.content;

  const BTOOLS = [
    {cmd:'bold',icon:'<b>B</b>'},{cmd:'italic',icon:'<i>I</i>'},
    {cmd:'underline',icon:'<u>U</u>'},{cmd:'strikeThrough',icon:'<s>S</s>'},
  ];
  BTOOLS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'nb-tool-btn'; btn.innerHTML = t.icon;
    btn.style.cssText = 'width:20px;height:18px;font-size:10px;';
    btn.addEventListener('mousedown', e => { e.preventDefault(); document.execCommand(t.cmd,false,null); editor.focus(); });
    header.appendChild(btn);
  });

  editor.addEventListener('input', () => { bubble.content = editor.innerHTML; saveVb(); });
  editor.addEventListener('mousedown', e => e.stopPropagation());

  // Delete btn
  const del = document.createElement('button');
  del.className = 'vb-bubble-del'; del.innerHTML = xSVG;
  del.addEventListener('click', e => {
    e.stopPropagation();
    board.bubbles = board.bubbles.filter(b2=>b2.id!==bubble.id);
    saveVb(); renderVbCanvas();
  });

  bel.appendChild(header);
  bel.appendChild(editor);
  bel.appendChild(del);

  // Drag via header
  header.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    vbDraggingBubble = { bubble, startX:e.clientX, startY:e.clientY, startBX:bubble.x, startBY:bubble.y, el:bel };
    e.preventDefault(); e.stopPropagation();
  });

  // Track resize
  const ro = new ResizeObserver(() => {
    bubble.w = bel.offsetWidth; bubble.h = bel.offsetHeight; saveVb();
    const line = document.getElementById(`vbLine_${bubble.id}`);
    if (line) {
      line.setAttribute('x2', bubble.x + Math.floor(bubble.w/2));
      line.setAttribute('y2', bubble.y + Math.floor(bubble.h/2));
    }
  });
  ro.observe(bel);

  return bel;
}

document.getElementById('btnAddVbBoard')?.addEventListener('click', () => {
  const board = { id:uid(), name:'New Board', panX:0, panY:0, vision:{title:'',img:''}, bubbles:[] };
  vbBoards.push(board);
  vbActiveId = board.id;
  saveVb(); renderVbSidebar(); renderVbCanvas();
});

/* ─── VISUALIZER ─────────────────────────────────────────── */

let vizCtx = null, vizRaf = null;
let vizBPM = 120, vizEnergy = 0.5;
let vizLastBeatTime = Date.now();

function initVisualizer() {
  const canvas = document.getElementById('spVizCanvas');
  if (!canvas) return;
  // Match CSS width
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  vizCtx = canvas.getContext('2d');
  vizCtx.scale(dpr, dpr);
  vizLoop();
}

function vizLoop() {
  vizRaf = requestAnimationFrame(vizLoop);
  const canvas = document.getElementById('spVizCanvas');
  if (!canvas || !vizCtx) return;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  vizCtx.clearRect(0, 0, W, H);

  const now = Date.now();
  const t = now * 0.001;
  const beatMs = 60000 / vizBPM;
  const phase = ((now - vizLastBeatTime) % beatMs) / beatMs;
  const beatPulse = spIsPlaying ? Math.pow(Math.max(0, 1 - phase * 2.5), 2) : 0;

  const bars = 20;
  const gap  = 1;
  const barW = (W - gap*(bars-1)) / bars;

  for (let i = 0; i < bars; i++) {
    const center = (bars - 1) / 2;
    const dist   = Math.abs(i - center) / center;   // 0=center, 1=edge
    const wave   = Math.sin(t * 2.5 + i * 0.55) * 0.5 + 0.5;

    let h;
    if (spIsPlaying) {
      h = H * (0.15 + vizEnergy * 0.45 + beatPulse * 0.35) * (1 - dist * 0.4) * (0.7 + wave * 0.3);
    } else {
      h = H * (0.08 + wave * 0.18) * (1 - dist * 0.35);
    }
    h = Math.max(2, h);

    const x = i * (barW + gap);
    const y = (H - h) / 2;
    const alpha = spIsPlaying ? 0.35 + beatPulse * 0.5 + vizEnergy * 0.15 : 0.18;
    vizCtx.fillStyle = `rgba(${accentRGB},${alpha.toFixed(2)})`;
    vizCtx.beginPath();
    vizCtx.rect(x, y, Math.max(1, barW), h);
    vizCtx.fill();
  }
}

async function fetchAudioFeatures(trackId) {
  if (!trackId) return;
  try {
    const res = await spFetch(`https://api.spotify.com/v1/audio-features/${trackId}`);
    if (!res || res.status !== 200) return;
    const data = await res.json();
    vizBPM    = data.tempo    || 120;
    vizEnergy = data.energy   || 0.5;
    vizLastBeatTime = Date.now();
  } catch(e) {}
}

/* ─── VISIBILITY CATCH-UP ───────────────────────────────────── */

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  // Snap pomo timer to real elapsed time the moment tab becomes visible
  if (pomo.running && pomo.deadline) {
    pomo.timeLeft = Math.max(0, Math.round((pomo.deadline - Date.now()) / 1000));
    renderTimer();
    if (pomo.timeLeft <= 0) {
      clearInterval(pomo.interval); pomo.running = false; pomo.deadline = null;
      if (pomo.mode==='work') { pomo.sessions++; podOnPomoComplete(); setMode(pomo.sessions%4===0?'long':'short'); }
      else setMode('work');
    }
  }
  // Snap task timers too
  let needsRender = false;
  tasks.forEach(t => {
    if (!t.seat || !t.timerDeadline || t.orbit || t.done) return;
    const newLeft = Math.max(0, Math.round((t.timerDeadline - Date.now()) / 1000));
    if (newLeft !== t.timerLeft) { t.timerLeft = newLeft; needsRender = true; }
  });
  if (needsRender) renderTakeoff();
});

/* ─── PROJECT OF THE DAY ─────────────────────────────────── */

const POD_TIER_NAMES = ['', 'Fundamentals', 'APIs & Data', 'Automation & Bots', 'Web Apps', 'Data & Visualization', 'AI & Advanced'];

const POD_BANK = [
  // ── Tier 1: Fundamentals ──
  { id:'cli-todo', tier:1, title:'CLI To-Do Manager', blurb:'A command-line task manager with add/complete/delete, priorities, and due dates — saved to JSON so nothing is lost between runs.',
    skills:['argparse','JSON','file I/O','datetime'],
    milestones:['Set up argparse with add / list / done / delete commands','Store tasks in a JSON file with load/save helpers','Add priorities and due dates with sorting','Color-code overdue and high-priority tasks in output','Write a README with usage examples'],
    resources:[{label:'argparse — official docs',url:'https://docs.python.org/3/library/argparse.html'},{label:'Working with JSON in Python (Real Python)',url:'https://realpython.com/python-json/'},{label:'Automate the Boring Stuff — Files',url:'https://automatetheboringstuff.com/2e/chapter9/'}],
    yt:['python argparse tutorial','python json file tutorial','build a cli todo app python'] },
  { id:'expense-tracker', tier:1, title:'Expense Tracker CLI', blurb:'Track spending from the terminal: log expenses by category, then generate monthly summaries and a simple text bar chart.',
    skills:['CSV','datetime','dictionaries','formatting'],
    milestones:['Log expenses (amount, category, note) to a CSV file','List expenses filtered by month or category','Compute monthly totals per category','Render a text-based bar chart of spending','Add a budget warning when a category exceeds its limit'],
    resources:[{label:'csv module — official docs',url:'https://docs.python.org/3/library/csv.html'},{label:'Python datetime guide (Real Python)',url:'https://realpython.com/python-datetime/'},{label:'f-strings formatting',url:'https://realpython.com/python-f-strings/'}],
    yt:['python expense tracker project','python csv tutorial'] },
  { id:'password-vault', tier:1, title:'Password Generator & Strength Checker', blurb:'Generate cryptographically secure passwords and grade any password\'s strength with clear feedback on what to improve.',
    skills:['secrets','regex','string ops','CLI UX'],
    milestones:['Generate random passwords with the secrets module','Add options for length, symbols, and excluded characters','Write a strength checker using regex rules','Score passwords and explain each deduction','Add a passphrase mode using a word list'],
    resources:[{label:'secrets module — official docs',url:'https://docs.python.org/3/library/secrets.html'},{label:'Regex in Python (Real Python)',url:'https://realpython.com/regex-python/'},{label:'re module docs',url:'https://docs.python.org/3/library/re.html'}],
    yt:['python password generator project','python regex tutorial'] },
  { id:'file-organizer', tier:1, title:'Automatic File Organizer', blurb:'Point it at a messy folder (like Downloads) and it sorts every file into tidy subfolders by type and date — with a dry-run mode.',
    skills:['pathlib','shutil','os','error handling'],
    milestones:['Scan a folder and group files by extension','Move files into category folders (Images, Docs, Code…)','Add a dry-run flag that previews changes','Handle name collisions safely','Add an undo log that can reverse the last run'],
    resources:[{label:'pathlib — official docs',url:'https://docs.python.org/3/library/pathlib.html'},{label:'shutil — official docs',url:'https://docs.python.org/3/library/shutil.html'},{label:'Automate the Boring Stuff — Organizing Files',url:'https://automatetheboringstuff.com/2e/chapter10/'}],
    yt:['python file organizer project','python pathlib tutorial'] },
  { id:'quiz-game', tier:1, title:'Terminal Quiz Game', blurb:'A quiz engine that loads question banks from files, times answers, keeps high scores, and gets harder as you streak.',
    skills:['OOP basics','random','JSON','game loop'],
    milestones:['Design a Question class and load questions from JSON','Build the quiz loop with score tracking','Add a countdown timer per question','Persist high scores to a file','Add difficulty levels and a streak bonus'],
    resources:[{label:'Classes — official tutorial',url:'https://docs.python.org/3/tutorial/classes.html'},{label:'OOP in Python (Real Python)',url:'https://realpython.com/python3-object-oriented-programming/'},{label:'random module docs',url:'https://docs.python.org/3/library/random.html'}],
    yt:['python quiz game project','python oop tutorial'] },
  { id:'unit-converter', tier:1, title:'Smart Unit Converter', blurb:'Convert anything — “5 mi to km”, “72f to c”, “2 cups to ml” — from one natural command, with a clean conversion engine behind it.',
    skills:['parsing','dictionaries','functions','testing'],
    milestones:['Build conversion tables for length, weight, temp, volume','Parse free-text input like "5 mi to km"','Route through a base-unit conversion engine','Handle bad input with helpful errors','Add unit tests with pytest'],
    resources:[{label:'pytest — getting started',url:'https://docs.pytest.org/en/stable/getting-started.html'},{label:'String methods — official docs',url:'https://docs.python.org/3/library/stdtypes.html#string-methods'},{label:'Python dictionaries (Real Python)',url:'https://realpython.com/python-dicts/'}],
    yt:['python unit converter project','pytest tutorial for beginners'] },

  // ── Tier 2: APIs & Data ──
  { id:'weather-cli', tier:2, title:'Weather Dashboard CLI', blurb:'Pull live weather for any city from a real API and render a slick terminal dashboard with a 5-day forecast.',
    skills:['requests','REST APIs','API keys','env vars'],
    milestones:['Sign up for the OpenWeatherMap free API','Fetch current weather with requests + API key in env var','Parse JSON into a clean display (temp, wind, humidity)','Add a 5-day forecast view','Cache responses for 10 minutes to avoid rate limits'],
    resources:[{label:'requests — quickstart',url:'https://requests.readthedocs.io/en/latest/user/quickstart/'},{label:'OpenWeatherMap API',url:'https://openweathermap.org/api'},{label:'API basics (Real Python)',url:'https://realpython.com/api-integration-in-python/'}],
    yt:['python weather app api project','python requests tutorial'] },
  { id:'currency-converter', tier:2, title:'Live Currency Converter', blurb:'Convert between 150+ currencies using live exchange rates, with offline caching and historical rate lookups.',
    skills:['requests','JSON','caching','decimal'],
    milestones:['Fetch live rates from a free exchange-rate API','Convert between any two currencies accurately with decimal','Cache the latest rates locally for offline use','Add historical rate lookup by date','Format output with proper currency symbols'],
    resources:[{label:'decimal — official docs',url:'https://docs.python.org/3/library/decimal.html'},{label:'requests docs',url:'https://requests.readthedocs.io/en/latest/'},{label:'Frankfurter free FX API',url:'https://www.frankfurter.app/docs/'}],
    yt:['python currency converter api','python api project for beginners'] },
  { id:'github-stats', tier:2, title:'GitHub Profile Analyzer', blurb:'Enter any GitHub username and get a breakdown of their repos, languages, stars, and commit activity — using the public GitHub API.',
    skills:['REST APIs','pagination','data aggregation'],
    milestones:['Fetch a user profile and repo list from the GitHub API','Handle pagination for users with many repos','Aggregate stars, forks, and top languages','Render a language-share text chart','Export the report to Markdown'],
    resources:[{label:'GitHub REST API docs',url:'https://docs.github.com/en/rest'},{label:'requests docs',url:'https://requests.readthedocs.io/en/latest/'},{label:'collections.Counter',url:'https://docs.python.org/3/library/collections.html#collections.Counter'}],
    yt:['github api python tutorial','python api data project'] },
  { id:'news-digest', tier:2, title:'Daily News Digest', blurb:'Pull top headlines on your topics every morning and compile them into a clean digest — printed, saved, or emailed to yourself.',
    skills:['APIs','smtplib','scheduling','HTML email'],
    milestones:['Fetch headlines by topic from a news API','Filter and dedupe articles by keyword','Format a clean text + HTML digest','Send it to yourself with smtplib','Schedule it to run daily'],
    resources:[{label:'smtplib — official docs',url:'https://docs.python.org/3/library/smtplib.html'},{label:'Sending emails with Python (Real Python)',url:'https://realpython.com/python-send-email/'},{label:'NewsAPI',url:'https://newsapi.org/docs'}],
    yt:['python email automation tutorial','python news api project'] },
  { id:'crypto-tracker', tier:2, title:'Crypto Price Tracker with Alerts', blurb:'Watch live crypto prices, set target alerts, and get desktop notifications the moment a coin crosses your threshold.',
    skills:['APIs','polling loops','notifications','threading'],
    milestones:['Fetch live prices from the CoinGecko free API','Track a watchlist with configurable alert thresholds','Poll on an interval without blocking input','Fire desktop notifications on alert','Log price history to CSV for later charting'],
    resources:[{label:'CoinGecko API docs',url:'https://www.coingecko.com/en/api/documentation'},{label:'threading — official docs',url:'https://docs.python.org/3/library/threading.html'},{label:'plyer notifications',url:'https://plyer.readthedocs.io/en/latest/'}],
    yt:['python crypto price tracker','python threading tutorial'] },
  { id:'wiki-scraper', tier:2, title:'Wikipedia Research Assistant', blurb:'Give it a topic and it scrapes Wikipedia for the summary, key facts, and related pages — then builds a study sheet.',
    skills:['BeautifulSoup','HTML parsing','HTTP'],
    milestones:['Fetch a Wikipedia page with requests','Parse the intro, infobox, and headings with BeautifulSoup','Extract related links for further reading','Generate a Markdown study sheet','Add a search mode using the Wikipedia API'],
    resources:[{label:'Beautiful Soup docs',url:'https://www.crummy.com/software/BeautifulSoup/bs4/doc/'},{label:'Web scraping guide (Real Python)',url:'https://realpython.com/beautiful-soup-web-scraper-python/'},{label:'Wikipedia API',url:'https://www.mediawiki.org/wiki/API:Main_page'}],
    yt:['beautifulsoup tutorial python','python web scraping project'] },

  // ── Tier 3: Automation & Bots ──
  { id:'discord-bot', tier:3, title:'Discord Productivity Bot', blurb:'A real Discord bot for your server: pomodoro sessions, reminders, polls, and a leaderboard — running 24/7 logic you wrote.',
    skills:['discord.py','async/await','events','hosting'],
    milestones:['Create a bot application and invite it to a server','Respond to slash commands with discord.py','Add a pomodoro command with timed pings','Add reminders and polls','Track usage stats in a leaderboard'],
    resources:[{label:'discord.py docs',url:'https://discordpy.readthedocs.io/en/stable/'},{label:'Discord Developer Portal',url:'https://discord.com/developers/docs/intro'},{label:'asyncio — official docs',url:'https://docs.python.org/3/library/asyncio.html'}],
    yt:['discord.py bot tutorial','python async await explained'] },
  { id:'job-scraper', tier:3, title:'Job Listing Scraper', blurb:'Scrape job boards for roles matching your keywords, dedupe and score them, and export a daily spreadsheet of leads.',
    skills:['scraping','CSV/Excel','dedup logic','scheduling'],
    milestones:['Scrape listings from a job board with requests + BeautifulSoup','Extract title, company, location, link, and date','Score listings against your keyword profile','Dedupe across runs with a seen-IDs file','Export ranked results to CSV/Excel daily'],
    resources:[{label:'Beautiful Soup docs',url:'https://www.crummy.com/software/BeautifulSoup/bs4/doc/'},{label:'openpyxl docs',url:'https://openpyxl.readthedocs.io/en/stable/'},{label:'Web scraping ethics & robots.txt',url:'https://realpython.com/python-web-scraping-practical-introduction/'}],
    yt:['python job scraper project','python openpyxl tutorial'] },
  { id:'auto-backup', tier:3, title:'Automated Backup Tool', blurb:'Watches your important folders, zips changed files on a schedule, rotates old backups, and reports what it saved.',
    skills:['zipfile','hashing','scheduling','logging'],
    milestones:['Zip a target folder with timestamped archive names','Detect changed files via hashes to skip no-op backups','Rotate: keep last N daily and weekly archives','Add proper logging with the logging module','Schedule it (Task Scheduler / cron) and document setup'],
    resources:[{label:'zipfile — official docs',url:'https://docs.python.org/3/library/zipfile.html'},{label:'hashlib — official docs',url:'https://docs.python.org/3/library/hashlib.html'},{label:'logging HOWTO',url:'https://docs.python.org/3/howto/logging.html'}],
    yt:['python backup script tutorial','python logging tutorial'] },
  { id:'pdf-toolkit', tier:3, title:'PDF Toolkit', blurb:'A swiss-army CLI for PDFs: merge, split, rotate, watermark, and extract text — the utility everyone ends up needing.',
    skills:['pypdf','CLI design','file handling'],
    milestones:['Merge multiple PDFs into one','Split a PDF by page ranges','Add text watermarks to every page','Extract text to a .txt file','Wrap it all in a clean argparse CLI'],
    resources:[{label:'pypdf docs',url:'https://pypdf.readthedocs.io/en/stable/'},{label:'argparse docs',url:'https://docs.python.org/3/library/argparse.html'},{label:'Working with PDFs (Real Python)',url:'https://realpython.com/pdf-python/'}],
    yt:['python pdf manipulation pypdf','python cli tool tutorial'] },
  { id:'email-automation', tier:3, title:'Email Automation Suite', blurb:'Connect to your inbox: auto-sort newsletters, send templated replies, and get a morning summary of what matters.',
    skills:['imaplib','smtplib','email parsing','rules engine'],
    milestones:['Connect to your inbox with imaplib (app password)','Parse senders, subjects, and bodies safely','Build keyword rules that label/move messages','Send templated emails with smtplib','Generate a daily inbox summary report'],
    resources:[{label:'imaplib — official docs',url:'https://docs.python.org/3/library/imaplib.html'},{label:'email.parser docs',url:'https://docs.python.org/3/library/email.parser.html'},{label:'Sending emails (Real Python)',url:'https://realpython.com/python-send-email/'}],
    yt:['python imap email tutorial','python email automation project'] },
  { id:'reddit-digest', tier:3, title:'Reddit Digest Bot', blurb:'Compile the best posts from your favorite subreddits into a daily digest, ranked by your own scoring formula.',
    skills:['PRAW / APIs','OAuth','ranking logic'],
    milestones:['Register a Reddit app and authenticate with PRAW','Pull top posts from chosen subreddits','Score posts with your own formula (votes, comments, age)','Render a Markdown digest with links','Schedule a daily run and archive digests'],
    resources:[{label:'PRAW docs',url:'https://praw.readthedocs.io/en/stable/'},{label:'Reddit API rules',url:'https://www.reddit.com/wiki/api/'},{label:'Markdown guide',url:'https://www.markdownguide.org/basic-syntax/'}],
    yt:['praw reddit bot tutorial python','python reddit api project'] },

  // ── Tier 4: Web Apps ──
  { id:'flask-blog', tier:4, title:'Flask Blog with Auth', blurb:'A full blog platform: registration, login, posts with Markdown, comments — your first real full-stack deployment.',
    skills:['Flask','SQLite','Jinja2','sessions','auth'],
    milestones:['Set up Flask with templates and static files','Add SQLite models for users and posts','Implement register/login with hashed passwords','Create, edit, and render Markdown posts','Add comments and deploy it'],
    resources:[{label:'Flask tutorial (official)',url:'https://flask.palletsprojects.com/en/stable/tutorial/'},{label:'Jinja2 docs',url:'https://jinja.palletsprojects.com/en/stable/'},{label:'werkzeug password hashing',url:'https://werkzeug.palletsprojects.com/en/stable/utils/'}],
    yt:['flask blog tutorial','flask login authentication tutorial'] },
  { id:'url-shortener', tier:4, title:'URL Shortener Service', blurb:'Your own bit.ly: shorten links, redirect visitors, and track click analytics on a dashboard.',
    skills:['Flask','SQLite','redirects','base62'],
    milestones:['Build the shorten endpoint with base62 codes','Store mappings in SQLite','Redirect short codes and count clicks','Add a stats page per link (clicks over time)','Add custom aliases and expiry dates'],
    resources:[{label:'Flask quickstart',url:'https://flask.palletsprojects.com/en/stable/quickstart/'},{label:'sqlite3 — official docs',url:'https://docs.python.org/3/library/sqlite3.html'},{label:'HTTP redirects (MDN)',url:'https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections'}],
    yt:['flask url shortener project','flask sqlite tutorial'] },
  { id:'fastapi-notes', tier:4, title:'FastAPI Notes API', blurb:'A modern REST API with automatic interactive docs, validation, and token auth — the backend pattern startups actually use.',
    skills:['FastAPI','pydantic','REST design','JWT'],
    milestones:['Scaffold FastAPI with CRUD routes for notes','Define pydantic models for validation','Persist notes with SQLite','Add JWT token authentication','Explore the auto-generated /docs and write tests'],
    resources:[{label:'FastAPI tutorial (official)',url:'https://fastapi.tiangolo.com/tutorial/'},{label:'pydantic docs',url:'https://docs.pydantic.dev/latest/'},{label:'FastAPI security guide',url:'https://fastapi.tiangolo.com/tutorial/security/'}],
    yt:['fastapi tutorial','fastapi jwt authentication'] },
  { id:'habit-web', tier:4, title:'Habit Tracker Web App', blurb:'A web habit tracker with streaks, a GitHub-style heatmap, and weekly email summaries — satisfying to use and to demo.',
    skills:['Flask','charts','SQLite','date math'],
    milestones:['Model habits and daily check-ins in SQLite','Build the check-in UI with Flask templates','Compute streaks and completion rates','Render a calendar heatmap of progress','Send a weekly summary email'],
    resources:[{label:'Flask tutorial',url:'https://flask.palletsprojects.com/en/stable/tutorial/'},{label:'Chart.js docs',url:'https://www.chartjs.org/docs/latest/'},{label:'datetime docs',url:'https://docs.python.org/3/library/datetime.html'}],
    yt:['flask habit tracker project','chart.js tutorial'] },
  { id:'portfolio-cms', tier:4, title:'Portfolio Site with Admin Panel', blurb:'Your personal site, but dynamic: an admin dashboard where you add projects and posts without touching code.',
    skills:['Flask','auth','CRUD','file uploads','deployment'],
    milestones:['Build the public portfolio pages from database content','Create a password-protected admin panel','Add CRUD for projects with image uploads','Add a contact form with email notification','Deploy it live with a custom domain'],
    resources:[{label:'Flask file uploads',url:'https://flask.palletsprojects.com/en/stable/patterns/fileuploads/'},{label:'Flask deployment options',url:'https://flask.palletsprojects.com/en/stable/deploying/'},{label:'Render free hosting',url:'https://render.com/docs'}],
    yt:['flask portfolio website tutorial','deploy flask app'] },
  { id:'chat-app', tier:4, title:'Real-Time Chat App', blurb:'Live chat with rooms and typing indicators over WebSockets — real-time systems look great on a resume.',
    skills:['WebSockets','async','Flask-SocketIO','events'],
    milestones:['Set up Flask-SocketIO with a basic lobby','Broadcast messages to all connected users','Add named rooms and join/leave events','Show online users and typing indicators','Persist recent history per room'],
    resources:[{label:'Flask-SocketIO docs',url:'https://flask-socketio.readthedocs.io/en/latest/'},{label:'WebSockets explained (MDN)',url:'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API'},{label:'python-socketio docs',url:'https://python-socketio.readthedocs.io/en/stable/'}],
    yt:['flask socketio chat app tutorial','websockets explained'] },

  // ── Tier 5: Data & Visualization ──
  { id:'data-dashboard', tier:5, title:'Interactive Data Dashboard', blurb:'Take a real dataset and ship an interactive Streamlit dashboard with filters, charts, and insights anyone can explore.',
    skills:['pandas','Streamlit','plotly','data cleaning'],
    milestones:['Pick a Kaggle dataset and clean it with pandas','Build a Streamlit app with sidebar filters','Add interactive plotly charts','Add computed KPIs and an insights section','Deploy to Streamlit Community Cloud'],
    resources:[{label:'Streamlit docs',url:'https://docs.streamlit.io/'},{label:'pandas 10-minute intro',url:'https://pandas.pydata.org/docs/user_guide/10min.html'},{label:'Plotly Python docs',url:'https://plotly.com/python/'}],
    yt:['streamlit dashboard tutorial','pandas tutorial for beginners'] },
  { id:'stock-analyzer', tier:5, title:'Stock Data Analyzer', blurb:'Download historical market data, compute indicators like moving averages and RSI, and visualize trends — a data-engineering classic.',
    skills:['yfinance','pandas','matplotlib','time series'],
    milestones:['Download historical prices with yfinance','Compute SMA, EMA, and RSI with pandas','Plot price + indicators with matplotlib','Compare multiple tickers on one chart','Export an analysis report per ticker'],
    resources:[{label:'yfinance on PyPI',url:'https://pypi.org/project/yfinance/'},{label:'pandas time series guide',url:'https://pandas.pydata.org/docs/user_guide/timeseries.html'},{label:'matplotlib tutorials',url:'https://matplotlib.org/stable/tutorials/index.html'}],
    yt:['python stock analysis pandas','matplotlib tutorial'] },
  { id:'sentiment-analyzer', tier:5, title:'Review Sentiment Analyzer', blurb:'Feed it product reviews and it classifies sentiment, surfaces common complaints, and charts the results.',
    skills:['NLP','TextBlob/NLTK','pandas','wordclouds'],
    milestones:['Load a reviews dataset into pandas','Score sentiment per review with TextBlob','Extract the most common positive/negative phrases','Visualize sentiment distribution and trends','Build a word cloud of complaint keywords'],
    resources:[{label:'TextBlob docs',url:'https://textblob.readthedocs.io/en/dev/'},{label:'NLTK book (free)',url:'https://www.nltk.org/book/'},{label:'wordcloud on PyPI',url:'https://pypi.org/project/wordcloud/'}],
    yt:['python sentiment analysis tutorial','nltk tutorial python'] },
  { id:'image-processor', tier:5, title:'Bulk Image Processing Tool', blurb:'Batch-resize, watermark, convert, and optimize hundreds of images at once — with before/after size reports.',
    skills:['Pillow','batch processing','CLI','optimization'],
    milestones:['Resize a folder of images preserving aspect ratio','Add text or logo watermarks','Convert formats and strip metadata','Optimize file sizes and report savings','Parallelize with concurrent.futures'],
    resources:[{label:'Pillow handbook',url:'https://pillow.readthedocs.io/en/stable/handbook/index.html'},{label:'concurrent.futures docs',url:'https://docs.python.org/3/library/concurrent.futures.html'},{label:'Image processing (Real Python)',url:'https://realpython.com/image-processing-with-the-python-pillow-library/'}],
    yt:['python pillow tutorial','python batch image resize'] },
  { id:'spotify-wrapped', tier:5, title:'Personal Spotify Wrapped', blurb:'Use the Spotify API to analyze your own listening: top artists, genre shifts over time, and audio-feature trends — then chart it beautifully.',
    skills:['spotipy','OAuth','pandas','visualization'],
    milestones:['Authenticate with the Spotify API via spotipy','Pull your top tracks/artists across time ranges','Analyze genres and audio features with pandas','Build your own "Wrapped" charts','Export a shareable summary image'],
    resources:[{label:'spotipy docs',url:'https://spotipy.readthedocs.io/'},{label:'Spotify Web API docs',url:'https://developer.spotify.com/documentation/web-api'},{label:'seaborn docs',url:'https://seaborn.pydata.org/'}],
    yt:['spotipy tutorial python','python spotify api project'] },
  { id:'csv-detective', tier:5, title:'Dataset Profiler', blurb:'Drop in any CSV and get an instant profile: types, distributions, outliers, missing data, and correlations — like pandas-profiling, but yours.',
    skills:['pandas','numpy','statistics','HTML reports'],
    milestones:['Infer column types and basic stats for any CSV','Detect outliers and missing-data patterns','Compute correlations between numeric columns','Flag likely data-quality issues','Generate a styled HTML report'],
    resources:[{label:'pandas API reference',url:'https://pandas.pydata.org/docs/reference/index.html'},{label:'numpy quickstart',url:'https://numpy.org/doc/stable/user/quickstart.html'},{label:'pandas Styler',url:'https://pandas.pydata.org/docs/user_guide/style.html'}],
    yt:['pandas data analysis project','exploratory data analysis python'] },

  // ── Tier 6: AI & Advanced ──
  { id:'ml-predictor', tier:6, title:'House Price Predictor', blurb:'End-to-end machine learning: clean real housing data, engineer features, train and compare models, and serve predictions via an API.',
    skills:['scikit-learn','feature engineering','model eval','joblib'],
    milestones:['Explore and clean a housing dataset','Engineer features and encode categoricals','Train linear regression and random forest models','Evaluate with cross-validation and pick a winner','Serve predictions through a small FastAPI endpoint'],
    resources:[{label:'scikit-learn user guide',url:'https://scikit-learn.org/stable/user_guide.html'},{label:'Kaggle housing dataset',url:'https://www.kaggle.com/c/house-prices-advanced-regression-techniques'},{label:'ML crash course (Google)',url:'https://developers.google.com/machine-learning/crash-course'}],
    yt:['scikit-learn tutorial','machine learning project python'] },
  { id:'claude-chatbot', tier:6, title:'AI Assistant with the Claude API', blurb:'Build a real AI app: a chat assistant with conversation memory, tool use (it can run searches or math), and a clean web UI.',
    skills:['Claude API','streaming','tool use','prompt design'],
    milestones:['Set up the Anthropic SDK and send your first message','Build a chat loop with conversation history','Stream responses token-by-token to the UI','Add a tool the model can call (calculator or search)','Wrap it in a simple Flask/Streamlit interface'],
    resources:[{label:'Claude API docs',url:'https://docs.anthropic.com/en/api/getting-started'},{label:'Anthropic Python SDK',url:'https://github.com/anthropics/anthropic-sdk-python'},{label:'Tool use guide',url:'https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview'}],
    yt:['claude api python tutorial','build ai chatbot python'] },
  { id:'face-detection', tier:6, title:'Computer Vision Face Detector', blurb:'Detect faces in photos and live webcam video with OpenCV, blur them for privacy, and count people in frame.',
    skills:['OpenCV','numpy','video processing'],
    milestones:['Detect faces in images with OpenCV cascades or DNN','Draw bounding boxes and confidence scores','Process live webcam video in real time','Add a privacy mode that blurs detected faces','Count and log people-in-frame over time'],
    resources:[{label:'OpenCV-Python tutorials',url:'https://docs.opencv.org/4.x/d6/d00/tutorial_py_root.html'},{label:'opencv-python on PyPI',url:'https://pypi.org/project/opencv-python/'},{label:'numpy docs',url:'https://numpy.org/doc/stable/'}],
    yt:['opencv face detection python','opencv python tutorial'] },
  { id:'recommender', tier:6, title:'Movie Recommendation Engine', blurb:'Build the algorithm behind Netflix-style suggestions: content-based and collaborative filtering on a real ratings dataset.',
    skills:['pandas','cosine similarity','matrix ops','evaluation'],
    milestones:['Load the MovieLens dataset with pandas','Build content-based recommendations from genres/tags','Build collaborative filtering with cosine similarity','Blend both into a hybrid recommender','Evaluate quality and serve via CLI or API'],
    resources:[{label:'MovieLens datasets',url:'https://grouplens.org/datasets/movielens/'},{label:'scikit-learn similarity metrics',url:'https://scikit-learn.org/stable/modules/metrics.html'},{label:'pandas merge guide',url:'https://pandas.pydata.org/docs/user_guide/merging.html'}],
    yt:['movie recommendation system python','collaborative filtering explained'] },
  { id:'saas-starter', tier:6, title:'SaaS Starter Platform', blurb:'The capstone: a deployable SaaS skeleton with accounts, subscription tiers (Stripe test mode), a usage-metered API, and an admin dashboard.',
    skills:['FastAPI','Stripe API','auth','PostgreSQL/SQLite','deployment'],
    milestones:['Build user accounts with JWT auth in FastAPI','Integrate Stripe test-mode subscriptions','Meter API usage per plan tier','Build an admin dashboard with key metrics','Deploy with HTTPS and write proper docs'],
    resources:[{label:'FastAPI docs',url:'https://fastapi.tiangolo.com/'},{label:'Stripe Python SDK (test mode)',url:'https://docs.stripe.com/api?lang=python'},{label:'SQLModel docs',url:'https://sqlmodel.tiangolo.com/'}],
    yt:['fastapi stripe subscription tutorial','fastapi production deployment'] },
  { id:'game-ai', tier:6, title:'Snake Game + AI Agent', blurb:'Build Snake in pygame, then build an AI that plays it better than you — pathfinding first, then a learning agent if you dare.',
    skills:['pygame','pathfinding','algorithms','game loops'],
    milestones:['Build playable Snake with pygame','Add scoring, speed-up, and game over screens','Write an A* pathfinding agent that plays automatically','Add survival heuristics for when no safe path exists','Benchmark your AI vs your own high score'],
    resources:[{label:'pygame docs',url:'https://www.pygame.org/docs/'},{label:'A* pathfinding (Red Blob Games)',url:'https://www.redblobgames.com/pathfinding/a-star/introduction.html'},{label:'pygame newbie guide',url:'https://www.pygame.org/docs/tut/newbieguide.html'}],
    yt:['pygame snake tutorial','a star pathfinding python'] },
];

/* state */
function podToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function loadPod() {
  try { const s = JSON.parse(localStorage.getItem('cc_pod') || 'null'); if (s && s.projects) return s; } catch(e) {}
  return { startDate: podToday(), lastRollDate: null, options: [], activeId: null, focusId: null, projects: {}, completed: 0 };
}
function savePod() { try { localStorage.setItem('cc_pod', JSON.stringify(pod)); } catch(e) {} }
let pod = loadPod();

function podTier() { return Math.min(6, 1 + (pod.completed || 0)); }
function podDayNum() {
  const ms = new Date(podToday()) - new Date(pod.startDate);
  return Math.max(1, Math.round(ms / 86400000) + 1);
}
function podGet(id) { return POD_BANK.find(p => p.id === id); }

/* dice roll: 3 options from current tier, topping up from neighbors if exhausted */
function podRoll() {
  const tier = podTier();
  const done = new Set(Object.entries(pod.projects).filter(([,v]) => v.status === 'completed').map(([k]) => k));
  let pool = POD_BANK.filter(p => p.tier === tier && !done.has(p.id));
  for (let t = tier - 1; pool.length < 3 && t >= 1; t--) pool = pool.concat(POD_BANK.filter(p => p.tier === t && !done.has(p.id)));
  for (let t = tier + 1; pool.length < 3 && t <= 6; t++) pool = pool.concat(POD_BANK.filter(p => p.tier === t && !done.has(p.id)));
  const picks = [];
  pool = pool.slice();
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
  pod.options = picks;
  pod.lastRollDate = podToday();
  savePod();
}

function renderPodRoll() {
  const tier = podTier();
  document.getElementById('podHeaderMeta').textContent = `Day ${podDayNum()} · Tier ${tier} — ${POD_TIER_NAMES[tier]} · ${pod.completed || 0} shipped`;
  document.getElementById('podDayLabel').textContent = `Day ${podDayNum()} · Tier ${tier}: ${POD_TIER_NAMES[tier]}`;
  const optsEl = document.getElementById('podOptions');
  optsEl.innerHTML = '';

  // banner for project in progress
  const activeEntry = Object.entries(pod.projects).find(([,v]) => v.status === 'in-progress');
  if (activeEntry) {
    const p = podGet(activeEntry[0]);
    if (p) {
      const b = document.createElement('div');
      b.className = 'pod-active-banner';
      b.innerHTML = `<span>🚧</span><span class="pab-title">${esc(p.title)}</span><span class="pab-meta">in progress · ${activeEntry[1].pomos || 0} 🍅 · resume →</span>`;
      b.addEventListener('click', () => openPodDetail(p.id));
      optsEl.appendChild(b);
    }
  }

  const stale = pod.lastRollDate !== podToday();
  document.getElementById('podRollHint').textContent =
    !pod.options.length ? 'Roll for today\'s three Python projects'
    : stale ? 'New day — roll for fresh projects, or pick from yesterday\'s'
    : 'Pick one to build — or re-roll if none spark joy';

  pod.options.map(podGet).filter(Boolean).forEach(p => {
    const card = document.createElement('div');
    card.className = 'pod-option-card';
    card.innerHTML = `
      <span class="pod-tier-badge">Tier ${p.tier} · ${esc(POD_TIER_NAMES[p.tier])}</span>
      <div class="pod-option-title">${esc(p.title)}</div>
      <div class="pod-option-blurb">${esc(p.blurb)}</div>
      <div class="pod-skills">${p.skills.map(s => `<span class="pod-skill-chip">${esc(s)}</span>`).join('')}</div>
      <div class="pod-option-cta">Build this →</div>`;
    card.addEventListener('click', () => openPodDetail(p.id));
    optsEl.appendChild(card);
  });
}

document.getElementById('podDice')?.addEventListener('click', () => {
  const dice = document.getElementById('podDice');
  dice.classList.remove('rolling'); void dice.offsetWidth; dice.classList.add('rolling');
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  let n = 0;
  const spin = setInterval(() => { document.getElementById('podDiceCube').textContent = faces[Math.floor(Math.random()*6)]; if (++n > 7) clearInterval(spin); }, 70);
  setTimeout(() => { podRoll(); renderPodRoll(); }, 580);
});

/* ── skill tree ── */
function renderPodTree() {
  const view = document.getElementById('podTreeView');
  const tier = podTier();
  view.innerHTML = `
    <div class="pod-tree-top">
      <button class="pod-back-btn" id="podTreeBack">← Back to dice</button>
      <div class="pod-tree-title">Skill Tree</div>
      <span class="pod-pomo-count">${pod.completed || 0} / ${POD_BANK.length} shipped</span>
    </div>`;

  for (let t = 1; t <= 6; t++) {
    const unlocked = t <= tier;
    const tierEl = document.createElement('div');
    tierEl.className = 'pod-tree-tier ' + (t === tier ? 'unlocked current' : unlocked ? 'unlocked' : 'locked');

    const tierDone = POD_BANK.filter(p => p.tier === t && pod.projects[p.id]?.status === 'completed').length;
    const need = t - tier;
    const status = !unlocked
      ? `🔒 ship ${need} more project${need > 1 ? 's' : ''} to unlock`
      : t === tier ? `current tier · ${tierDone}/6 shipped` : `${tierDone}/6 shipped`;

    tierEl.innerHTML = `
      <div class="pod-tree-tier-head">
        <span class="pod-tree-tier-name">Tier ${t} — ${esc(POD_TIER_NAMES[t])}</span>
        <span class="pod-tree-tier-status">${status}</span>
      </div>
      <div class="pod-tree-nodes"></div>`;

    const nodesEl = tierEl.querySelector('.pod-tree-nodes');
    POD_BANK.filter(p => p.tier === t).forEach(p => {
      const st = pod.projects[p.id];
      const node = document.createElement('div');
      let cls = 'pod-tree-node', ico = '';
      if (st?.status === 'completed') { cls += ' done'; ico = '✓'; }
      else if (st?.status === 'in-progress') { cls += ' active'; ico = '●'; }
      else if (!unlocked) { cls += ' locked'; ico = '🔒'; }
      node.className = cls;
      node.innerHTML = `${ico ? `<span class="ptn-ico">${ico}</span>` : ''}<span>${esc(p.title)}</span>`;
      node.title = unlocked ? p.blurb : `Reach Tier ${t} to unlock`;
      if (unlocked) node.addEventListener('click', () => openPodDetail(p.id));
      nodesEl.appendChild(node);
    });
    view.appendChild(tierEl);
  }

  document.getElementById('podTreeBack').addEventListener('click', () => {
    view.style.display = 'none';
    document.getElementById('podRollView').style.display = 'flex';
    renderPodRoll();
  });
}

document.getElementById('podTreeBtn')?.addEventListener('click', () => {
  document.getElementById('podRollView').style.display = 'none';
  document.getElementById('podTreeView').style.display = 'block';
  renderPodTree();
});

/* ── detail view ── */
let podDetailId = null;

function podProj(id) {
  if (!pod.projects[id]) pod.projects[id] = { status: 'not-started', done: {}, pomos: 0 };
  return pod.projects[id];
}

function openPodDetail(id) {
  const p = podGet(id); if (!p) return;
  podDetailId = id;
  const st = podProj(id);
  if (st.status === 'not-started') { st.status = 'in-progress'; pod.activeId = id; savePod(); }
  document.getElementById('podRollView').style.display = 'none';
  document.getElementById('podTreeView').style.display = 'none';
  const view = document.getElementById('podDetailView');
  view.style.display = 'block';
  view.innerHTML = `
    <div class="pod-detail-top">
      <button class="pod-back-btn" id="podBack">← Back</button>
      <div class="pod-detail-title">${esc(p.title)}</div>
      <span class="pod-pomo-count">🍅 <span id="podPomoCount">${st.pomos || 0}</span> sessions</span>
      <select class="pod-status-sel" id="podStatusSel">
        <option value="in-progress">In progress</option>
        <option value="completed">Completed ✓</option>
      </select>
      <button class="pod-focus-btn" id="podFocusBtn">▶ Focus on this</button>
    </div>
    <span class="pod-tier-badge">Tier ${p.tier} · ${esc(POD_TIER_NAMES[p.tier])}</span>
    <div class="pod-detail-blurb">${esc(p.blurb)}</div>
    <div class="pod-detail-grid">
      <div class="pod-panel">
        <div class="pod-panel-title">Milestones</div>
        <div class="pod-progress-bar"><div class="pod-progress-fill" id="podMsFill"></div></div>
        <div id="podMilestones"></div>
      </div>
      <div class="pod-panel">
        <div class="pod-panel-title">Resources</div>
        ${p.resources.map(r => `<a class="pod-resource" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="pr-ico">↗</span>${esc(r.label)}</a>`).join('')}
      </div>
      <div class="pod-panel">
        <div class="pod-panel-title">Video Tutorials</div>
        <div class="pod-yt-player" id="podYtPlayer"><div class="pod-yt-empty"><span>▶</span><span>Pick a video from the bar below — it plays right here</span></div></div>
        <div class="pod-yt-recs" id="podYtRecs"></div>
        <div class="pod-yt-pills">${p.yt.map(q => `<button class="pod-yt-pill" data-q="${esc(q)}">🔎 ${esc(q)}</button>`).join('')}</div>
        <div class="pod-yt-row">
          <input class="pod-yt-input" id="podYtInput" placeholder="Paste a YouTube link to play it here…"/>
          <button class="pod-btn-sm" id="podYtPlay">Play</button>
        </div>
      </div>
      <div class="pod-panel">
        <div class="pod-panel-title">GitHub</div>
        <div class="pod-gh-status" id="podGhStatus">checking workspace…</div>
        <div class="pod-gh-row">
          <button class="pod-btn-sm" id="podGhInit">Init git + first commit</button>
          <a class="pod-btn-sm" style="text-decoration:none" href="https://github.com/new?name=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Create repo on GitHub ↗</a>
        </div>
        <div class="pod-gh-row">
          <input class="pod-gh-input" id="podGhUrl" placeholder="https://github.com/you/${esc(p.id)}.git"/>
          <button class="pod-btn-sm" id="podGhPush">Push</button>
        </div>
      </div>
      <div class="pod-panel pod-terminal">
        <div class="pod-panel-title">Terminal — <span style="text-transform:none;letter-spacing:0">projects/${esc(p.id)}</span></div>
        <div class="pod-term-out" id="podTermOut"></div>
        <div class="pod-term-row">
          <span class="pod-term-prompt">${esc(p.id)}&gt;</span>
          <input class="pod-term-input" id="podTermIn" placeholder='try: python main.py — or ask Claude below'/>
        </div>
        <div class="pod-term-row">
          <input class="pod-term-input" id="podClaudeIn" placeholder="Ask Claude Code about this project… (runs claude -p in the folder)"/>
          <button class="pod-btn-sm" id="podClaudeAsk">Ask Claude</button>
        </div>
      </div>
    </div>`;

  document.getElementById('podStatusSel').value = st.status === 'completed' ? 'completed' : 'in-progress';
  renderPodMilestones(p, st);

  // wiring
  document.getElementById('podBack').addEventListener('click', closePodDetail);
  document.getElementById('podStatusSel').addEventListener('change', e => {
    const was = st.status;
    st.status = e.target.value;
    if (st.status === 'completed' && was !== 'completed') { pod.completed = (pod.completed || 0) + 1; podTermPrint('dim', `🎉 Project shipped! Tier ${podTier()} unlocked.`); }
    if (st.status !== 'completed' && was === 'completed') pod.completed = Math.max(0, (pod.completed || 0) - 1);
    savePod();
  });
  document.getElementById('podFocusBtn').addEventListener('click', () => podFocus(id));
  view.querySelectorAll('.pod-yt-pill').forEach(b => b.addEventListener('click', () => {
    view.querySelectorAll('.pod-yt-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    podLoadRecs(b.dataset.q);
  }));
  // auto-load recommendations for the first topic
  const firstPill = view.querySelector('.pod-yt-pill');
  if (firstPill) { firstPill.classList.add('active'); podLoadRecs(firstPill.dataset.q); }
  const ytPlay = () => podPlayYt(document.getElementById('podYtInput').value);
  document.getElementById('podYtPlay').addEventListener('click', ytPlay);
  document.getElementById('podYtInput').addEventListener('keydown', e => { if (e.key === 'Enter') ytPlay(); });
  document.getElementById('podTermIn').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim()) { podRunCmd(id, e.target.value.trim()); e.target.value = ''; }
  });
  const askClaude = () => {
    const q = document.getElementById('podClaudeIn').value.trim();
    if (!q) return;
    document.getElementById('podClaudeIn').value = '';
    podRunCmd(id, `claude -p "${q.replace(/"/g, "'")}"`, 'claude is thinking… (this can take a minute)');
  };
  document.getElementById('podClaudeAsk').addEventListener('click', askClaude);
  document.getElementById('podClaudeIn').addEventListener('keydown', e => { if (e.key === 'Enter') askClaude(); });
  document.getElementById('podGhInit').addEventListener('click', () =>
    podRunCmd(id, 'git init -b main && git add -A && git commit -m "Initial commit"'));
  document.getElementById('podGhPush').addEventListener('click', () => {
    const url = document.getElementById('podGhUrl').value.trim();
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(url)) { podTermPrint('err', 'Enter a valid GitHub repo URL like https://github.com/you/repo.git'); return; }
    podRunCmd(id, `git remote remove origin 2>nul & git remote add origin ${url} && git push -u origin main`);
  });

  podEnsureWorkspace(p);
}

function closePodDetail() {
  podDetailId = null;
  document.getElementById('podDetailView').style.display = 'none';
  document.getElementById('podRollView').style.display = 'flex';
  renderPodRoll();
}

function renderPodMilestones(p, st) {
  const wrap = document.getElementById('podMilestones');
  wrap.innerHTML = '';
  p.milestones.forEach((m, i) => {
    const row = document.createElement('label');
    row.className = 'pod-milestone' + (st.done[i] ? ' done' : '');
    row.innerHTML = `<input type="checkbox" ${st.done[i] ? 'checked' : ''}/><span>${esc(m)}</span>`;
    row.querySelector('input').addEventListener('change', e => {
      st.done[i] = e.target.checked; savePod(); renderPodMilestones(p, st);
    });
    wrap.appendChild(row);
  });
  const doneCount = p.milestones.filter((_, i) => st.done[i]).length;
  document.getElementById('podMsFill').style.width = (doneCount / p.milestones.length * 100) + '%';
}

async function podLoadRecs(query) {
  const recs = document.getElementById('podYtRecs');
  if (!recs) return;
  recs.innerHTML = '<div class="pod-recs-msg">searching videos…</div>';
  try {
    const r = await (await fetch('/api/yt/search?q=' + encodeURIComponent(query))).json();
    if (!r.videos || !r.videos.length) { recs.innerHTML = '<div class="pod-recs-msg">no videos found — try another topic</div>'; return; }
    recs.innerHTML = '';
    r.videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'pod-yt-rec';
      card.innerHTML = `
        <div class="pyr-thumb-wrap"><img class="pyr-thumb" loading="lazy" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt=""/>${v.duration ? `<span class="pyr-dur">${esc(v.duration)}</span>` : ''}</div>
        <div class="pyr-title">${esc(v.title)}</div>
        <div class="pyr-meta">${esc(v.channel)}${v.views ? ' · ' + esc(v.views) : ''}</div>`;
      card.addEventListener('click', () => podPlayYt(v.id));
      recs.appendChild(card);
    });
  } catch (e) {
    recs.innerHTML = '<div class="pod-recs-msg">couldn\'t load videos — make sure the app is running via node server.js</div>';
  }
}

function podPlayYt(input) {
  const m = String(input || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/) ||
            String(input || '').trim().match(/^([a-zA-Z0-9_-]{11})$/);
  const player = document.getElementById('podYtPlayer');
  if (!m) { player.innerHTML = '<div class="pod-yt-empty"><span>▶</span><span>That doesn\'t look like a YouTube link</span></div>'; return; }
  player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
}

/* ── workspace + terminal (talks to server.js) ── */
function podTermPrint(cls, text) {
  const out = document.getElementById('podTermOut');
  if (!out) return;
  const line = document.createElement('div');
  if (cls) line.className = 't-' + cls;
  line.textContent = text;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

async function podEnsureWorkspace(p) {
  const status = document.getElementById('podGhStatus');
  try {
    let st = await (await fetch(`/api/pod/status?slug=${p.id}`)).json();
    if (!st.exists) {
      const readme = `# ${p.title}\n\n${p.blurb}\n\n## Milestones\n${p.milestones.map(m => `- [ ] ${m}`).join('\n')}\n\n## Skills\n${p.skills.join(', ')}\n`;
      await fetch('/api/pod/create', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: p.id, title: p.title, readme }) });
      st = await (await fetch(`/api/pod/status?slug=${p.id}`)).json();
      podTermPrint('dim', `Workspace created: ${st.path}`);
      podTermPrint('dim', 'README.md and main.py are ready. Try: python main.py');
    } else {
      podTermPrint('dim', `Workspace: ${st.path}`);
    }
    status.textContent = st.git ? 'git: initialized ✓' : 'git: not initialized yet';
  } catch (e) {
    status.textContent = 'server API unavailable';
    podTermPrint('err', 'Terminal needs the new server — restart the preview (node server.js) and reload.');
  }
}

let podTermBusy = false;
async function podRunCmd(id, cmd, busyMsg) {
  if (podTermBusy) { podTermPrint('dim', '…still running the last command'); return; }
  podTermBusy = true;
  podTermPrint('cmd', `${id}> ${cmd}`);
  if (busyMsg) podTermPrint('dim', busyMsg);
  try {
    const res = await fetch('/api/term', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: id, cmd }) });
    const r = await res.json();
    if (r.error) podTermPrint('err', r.error);
    else {
      if (r.out) podTermPrint('', r.out.trimEnd());
      if (r.err) podTermPrint('err', r.err.trimEnd());
      if (r.timedOut) podTermPrint('err', '⏱ command timed out (5 min limit)');
      podTermPrint('dim', `exit ${r.code}`);
      // refresh git status line after git commands
      if (/^git\b/.test(cmd)) {
        try { const st = await (await fetch(`/api/pod/status?slug=${id}`)).json();
          const el = document.getElementById('podGhStatus');
          if (el) el.textContent = st.git ? 'git: initialized ✓' : 'git: not initialized yet';
        } catch(e) {}
      }
    }
  } catch (e) {
    podTermPrint('err', 'Could not reach the server API — restart the preview server (node server.js).');
  }
  podTermBusy = false;
}

/* ── pomodoro link ── */
function renderPomoFocusChip() {
  const chip = document.getElementById('pomoFocusChip');
  if (!chip) return;
  const p = pod.focusId ? podGet(pod.focusId) : null;
  if (!p) { chip.style.display = 'none'; return; }
  const st = pod.projects[p.id] || {};
  chip.style.display = 'flex';
  chip.innerHTML = `<span>🎯</span><span class="pfc-title">${esc(p.title)}</span><span class="pfc-meta">${st.pomos || 0} 🍅</span><button class="pfc-x" title="Stop focusing on this project">✕</button>`;
  chip.querySelector('.pfc-title').addEventListener('click', () => {
    document.querySelector('.nav-tab[data-tab="project"]')?.click();
    openPodDetail(p.id);
  });
  chip.querySelector('.pfc-x').addEventListener('click', () => { pod.focusId = null; savePod(); renderPomoFocusChip(); });
}

function podFocus(id) {
  pod.focusId = id; savePod();
  document.querySelector('.nav-tab[data-tab="focus"]')?.click();
  renderPomoFocusChip();
  setMode('work');
  startTimer();
}

function podOnPomoComplete() {
  if (!pod.focusId || !pod.projects[pod.focusId]) return;
  pod.projects[pod.focusId].pomos = (pod.projects[pod.focusId].pomos || 0) + 1;
  savePod();
  renderPomoFocusChip();
  const el = document.getElementById('podPomoCount');
  if (el && podDetailId === pod.focusId) el.textContent = pod.projects[pod.focusId].pomos;
}

/* ─── DAILY PROTOCOL SCHEDULE ────────────────────────────── */

const SCHED_LEARNING = { 1:'AP Calc', 2:'AP Physics', 3:'Java / AP CSA', 4:'AI / Machine Learning', 5:'Anything you want to learn' };

const SCHED_WEEKDAY = [
  { id:'wake',   name:'Wake Up',      start:510,  end:540,  items:['No phone for the first 30 minutes','Shower · brush teeth · skincare','Get dressed — even if staying home','Eat breakfast'],
    goal:'Start the day feeling like you\'re going somewhere.' },
  { id:'walk',   name:'Plan + Walk',  start:540,  end:570,  items:['15–20 minute walk outside','What\'s today\'s goal?','What do I want to finish before lunch?','No doomscrolling'] },
  { id:'deep',   name:'Deep Work 1',  start:570,  end:690,  items:['Main project ONLY — FTC simulator · AI automation · Java project','No YouTube · No Discord · No Reddit','Phone stays across the room'],
    goal:'By the end, answer: “What did I build today?”' },
  { id:'guitar', name:'Guitar',       start:690,  end:720,  items:['One thing only: chords, barre chords, or one song','Consistency beats long sessions'] },
  { id:'lunch',  name:'Lunch + Break',start:720,  end:780,  items:['Guilt-free free time','YouTube / scrolling allowed — first time today'] },
  { id:'learn',  name:'Learning',     start:780,  end:840,  items:[] },   // items filled per weekday
  { id:'move',   name:'Exercise',     start:840,  end:900,  items:['Pick one: gym · home workout · basketball · long walk · bike ride','Movement resets your focus'] },
  { id:'create', name:'Creative Hour',start:900,  end:960,  items:['Tangible result: CAD · Blender · design · video editing · writing · robotics'] },
  { id:'free',   name:'Free Time',    start:960,  end:1200, items:['Hang out · games · movies · friends · family','No guilt'] },
];

const SCHED_WEEKEND = {
  6: { id:'sat', name:'Saturday', start:0, end:1440, items:['Sleep in a little','Go somewhere: mall · library · café · hike','Finish any unfinished work','Enjoy yourself'],
       goal:'Recharge — you earned it.' },
  0: { id:'sun', name:'Sunday — Planning Day', start:0, end:1440, items:['What did I finish? What am I proud of?','What am I doing next week?','Clean your room and reset','Set concrete weekly goals — outcomes, not “I\'ll code”'],
       goal:'Progress is easier to see when it\'s tied to concrete outcomes.' },
};

let schedSelectedId = null;   // null = follow the clock

function schedFmt(mins) {
  const h24 = Math.floor(mins / 60), m = mins % 60;
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2,'0')}`;
}

function schedBlocksToday() {
  const dow = new Date().getDay();
  if (SCHED_WEEKEND[dow]) return [SCHED_WEEKEND[dow]];
  return SCHED_WEEKDAY.map(b => b.id !== 'learn' ? b : {
    ...b, items: [`Today's rotation: ${SCHED_LEARNING[dow]}`, 'One focused hour — notes or practice problems'],
  });
}

function renderSchedule() {
  const strip = document.getElementById('schedStrip');
  if (!strip) return;
  const blocks = schedBlocksToday();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const weekend = blocks.length === 1;
  const active = blocks.find(b => nowMin >= b.start && nowMin < b.end) || null;
  const shown = blocks.find(b => b.id === schedSelectedId) || active || (nowMin < blocks[0].start ? blocks[0] : blocks[blocks.length - 1]);

  const dayName = now.toLocaleDateString([], { weekday: 'long' }).toUpperCase();
  strip.innerHTML = `
    <div class="sched-head">
      <span class="sched-title">Daily Protocol — ${dayName}</span>
      <div class="sched-rules">
        <span class="sched-rule">R1 · no phone in work blocks</span>
        <span class="sched-rule">R2 · no YouTube before lunch</span>
        <span class="sched-rule">R3 · one major project</span>
      </div>
    </div>
    <div class="sched-bars" id="schedBars"></div>
    <div class="sched-detail" id="schedDetail"></div>`;

  const bars = document.getElementById('schedBars');
  const t0 = blocks[0].start, t1 = blocks[blocks.length - 1].end;

  blocks.forEach(b => {
    const el = document.createElement('div');
    el.className = 'sched-block'
      + (active && b.id === active.id ? ' active' : '')
      + (b.id === shown.id ? ' selected' : '')
      + (nowMin >= b.end && !weekend ? ' done' : '');
    // width proportional to duration (free time weighted lighter so it doesn't dominate)
    const mins = b.id === 'free' ? 90 : (b.end - b.start);
    el.style.flexGrow = mins;
    el.style.flexBasis = '0';
    el.innerHTML = `<span class="sb-name">${esc(b.name)}</span>
      <span class="sb-time">${weekend ? 'ALL DAY' : (schedFmt(b.start) + (b.id === 'free' ? '+' : '–' + schedFmt(b.end)))}</span>`;
    el.addEventListener('click', () => {
      schedSelectedId = (schedSelectedId === b.id) ? null : b.id;
      renderSchedule();
    });
    bars.appendChild(el);
  });

  // live time marker
  if (!weekend && nowMin >= t0 && nowMin <= t1) {
    // account for the weighted free-time width
    const weights = blocks.map(b => b.id === 'free' ? 90 : b.end - b.start);
    const totalW = weights.reduce((a, x) => a + x, 0);
    let acc = 0, pct = null;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (nowMin >= b.start && nowMin < b.end) {
        pct = (acc + (nowMin - b.start) / (b.end - b.start) * weights[i]) / totalW * 100;
        break;
      }
      acc += weights[i];
    }
    if (pct !== null) {
      const mark = document.createElement('div');
      mark.className = 'sched-now';
      mark.style.left = pct + '%';
      bars.appendChild(mark);
    }
  }

  // detail panel
  const status = weekend ? 'TODAY'
    : (active && shown.id === active.id) ? 'NOW'
    : nowMin < shown.start ? 'UP NEXT'
    : nowMin >= shown.end ? 'DONE' : 'NOW';
  document.getElementById('schedDetail').innerHTML = `
    <span class="sd-status">${status}</span>
    <div class="sd-body">
      <div class="sd-title">${esc(shown.name)}${weekend ? '' : ` · ${schedFmt(shown.start)}${shown.id === 'free' ? ' onward' : '–' + schedFmt(shown.end)}`}</div>
      <div class="sd-items">${shown.items.map(i => `<span class="sd-item">${esc(i)}</span>`).join('')}</div>
      ${shown.goal ? `<div class="sd-goal">◆ ${esc(shown.goal)}</div>` : ''}
    </div>`;
}

setInterval(renderSchedule, 60000);   // keep NOW marker and active block live

/* ─── JARVIS DAILY BRIEFING ──────────────────────────────── */

let jarvisMuted = false;
let jarvisAbort = false;

/* Prefer a sophisticated British male voice; fall back gracefully */
function jarvisVoice() {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => /en-GB/i.test(v.lang) && /ryan|george|daniel|arthur|male/i.test(v.name))
      || vs.find(v => /en-GB/i.test(v.lang))
      || vs.find(v => /^en/i.test(v.lang))
      || null;
}
if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }

function jarvisSpeak(text) {
  return new Promise(resolve => {
    if (jarvisMuted || jarvisAbort || !('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = jarvisVoice();
    if (v) u.voice = v;
    u.rate = 0.98; u.pitch = 0.92;
    u.onend = resolve; u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

/* ── data gatherers (all free, all optional) ── */

const WMO = { 0:'clear skies',1:'mostly clear',2:'partly cloudy',3:'overcast',45:'foggy',48:'freezing fog',
  51:'light drizzle',53:'drizzle',55:'heavy drizzle',61:'light rain',63:'rain',65:'heavy rain',
  66:'freezing rain',67:'freezing rain',71:'light snow',73:'snow',75:'heavy snow',77:'snow grains',
  80:'passing showers',81:'showers',82:'heavy showers',85:'snow showers',86:'snow showers',
  95:'a thunderstorm',96:'a thunderstorm with hail',99:'a severe thunderstorm' };

function jarvisCoords() {
  return new Promise(resolve => {
    const cached = localStorage.getItem('jarvis_coords');
    if (cached) { try { return resolve(JSON.parse(cached)); } catch(e) {} }
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => { const c = { lat: p.coords.latitude, lon: p.coords.longitude };
             localStorage.setItem('jarvis_coords', JSON.stringify(c)); resolve(c); },
      () => resolve(null), { timeout: 8000 });
  });
}

async function jarvisWeather() {
  const c = await jarvisCoords();
  if (!c) return 'I was unable to obtain your location for a weather report, sir.';
  try {
    const r = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
      '&current=temperature_2m,apparent_temperature,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=auto&temperature_unit=fahrenheit')).json();
    const cur = r.current, day = r.daily;
    const desc = WMO[cur.weather_code] || 'indeterminate conditions';
    let line = `It is currently ${Math.round(cur.temperature_2m)} degrees with ${desc}, feeling like ${Math.round(cur.apparent_temperature)}. ` +
               `Expect a high of ${Math.round(day.temperature_2m_max[0])} and a low of ${Math.round(day.temperature_2m_min[0])}.`;
    const rain = day.precipitation_probability_max[0];
    if (rain >= 40) line += ` There is a ${rain} percent chance of precipitation — an umbrella would not go amiss.`;
    return line;
  } catch(e) { return 'The weather service appears to be offline at the moment.'; }
}

async function jarvisEmails() {
  if (!googleToken) return 'I do not have clearance to your inbox. Connect Google in the Calendar tab first.';
  if (!googleHasMail) return 'Mail clearance has not been granted. Press “Enable inbox briefing” in the Calendar tab and I shall report on your correspondence.';
  try {
    const h = { 'Authorization': `Bearer ${googleToken}` };
    const list = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox newer_than:1d&maxResults=12', { headers: h })).json();
    if (list.error) {
      const reason = list.error.errors?.[0]?.reason || list.error.status || '';
      if (/accessNotConfigured|SERVICE_DISABLED/i.test(JSON.stringify(list.error))) return 'The Gmail A P I is not enabled in your Google Cloud project, sir. Enable it in the console and try again.';
      if (list.error.code === 403 || list.error.code === 401) return 'Mail clearance was refused. Press “Enable inbox briefing” in the Calendar tab.';
      return 'The mail service returned an error: ' + reason;
    }
    const msgs = list.messages || [];
    if (!msgs.length) return 'Your inbox is remarkably quiet — no new messages in the last day.';
    const details = await Promise.all(msgs.slice(0, 3).map(async m => {
      const d = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: h })).json();
      const hd = Object.fromEntries((d.payload?.headers || []).map(x => [x.name, x.value]));
      const from = (hd.From || 'someone').replace(/<.*>/, '').replace(/"/g, '').trim();
      return { from, subject: hd.Subject || 'no subject' };
    }));
    const total = list.resultSizeEstimate || msgs.length;
    let line = `You have ${total} message${total === 1 ? '' : 's'} from the last day.`;
    if (details.length) line += ' Most recently: ' + details.map(d => `${d.from}, regarding “${d.subject}”`).join('; ') + '.';
    return line;
  } catch(e) { return 'I could not reach the mail service.'; }
}

async function jarvisCalendar() {
  if (!googleToken) return 'Calendar access is not connected, so your schedule is a mystery to us both.';
  try {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date();   end.setHours(23,59,59,999);
    const r = await (await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + new URLSearchParams({
      timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '10'
    }), { headers: { 'Authorization': `Bearer ${googleToken}` } })).json();
    const evs = (r.items || []).filter(e => e.status !== 'cancelled');
    if (!evs.length) return 'Your calendar is entirely clear today. How liberating.';
    const fmt = e => {
      const t = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'all day';
      return `${e.summary || 'an untitled engagement'} at ${t}`;
    };
    let line = `You have ${evs.length} engagement${evs.length === 1 ? '' : 's'} today: ` + evs.slice(0, 4).map(fmt).join('; ');
    if (evs.length > 4) line += `; and ${evs.length - 4} more`;
    return line + '.';
  } catch(e) { return 'The calendar service is not responding.'; }
}

const JARVIS_TIPS = [
  'Don\'t touch your phone for the first 30 minutes after waking up.',
  'Get dressed every morning. If you stay in pajamas, your brain stays in rest mode.',
  'Go outside before noon, even if it\'s just a 15 to 20 minute walk.',
  'Have one clear goal for the day. If someone asked what you\'re building today, you should have an answer.',
  'Finish one thing before starting another. Momentum comes from completion.',
  'Protect your first two hours of work. That\'s when your brain is freshest.',
  'Keep your phone across the room during work blocks. Make distractions inconvenient.',
  'Don\'t open YouTube, Reddit, Instagram, TikTok, or Discord until after lunch.',
  'Separate work and entertainment. Use a different browser profile for productive tasks.',
  'When you feel stuck, make the next step smaller. Don\'t think “build the project” — think “write one function.”',
  'Don\'t aim for a perfect day. Aim for one productive block at a time.',
  'The next hour matters more than the last one. If you get distracted, restart immediately instead of waiting for tomorrow.',
  'Move your body every day. Lift, run, walk, stretch — it all counts.',
  'Practice guitar even if it\'s only 15 minutes. Consistency beats occasional marathon sessions.',
  'Leave your desk after every deep work session. Your brain needs breaks to stay focused.',
  'Measure progress by what you finished, not how busy you felt.',
  'Only keep one major project at a time. Too many exciting ideas often mean none get finished.',
  'Treat your desk like an office. When you sit there, you\'re there to work, not scroll.',
  'Ask yourself every evening: what\'s one thing I accomplished today? Even a small win keeps momentum.',
  'Remember why you\'re doing this. Every hour you invest now builds skills future you will be proud of.',
  'Write tomorrow\'s first task down tonight. Starting is easier when the decision is already made.',
  'Two minutes of tidying your desk buys an hour of cleaner thinking.',
  'Boredom is fuel. Sit with it for five minutes before reaching for a screen.',
  'Ship something small every single day — a commit, a riff, a sketch. Streaks build empires.',
];

function jarvisTip() {
  const d = new Date();
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return JARVIS_TIPS[dayOfYear % JARVIS_TIPS.length];
}

const JARVIS_JOKES = [
  'I would tell you a UDP joke, but you might not get it.',
  'There are only two hard things in computer science: cache invalidation, naming things, and off-by-one errors.',
  'I asked the server for a joke. It said: 404, humour not found.',
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'A SQL query walks into a bar, approaches two tables, and asks: may I join you?',
  'I changed my password to “incorrect”, so whenever I forget it, the computer politely reminds me.',
  'Why did the developer go broke? He used up all his cache.',
];

async function jarvisJoke() {
  try {
    const r = await (await fetch('https://icanhazdadjoke.com/', { headers: { 'Accept': 'application/json' } })).json();
    if (r.joke) return r.joke;
  } catch(e) {}
  return JARVIS_JOKES[Math.floor(Math.random() * JARVIS_JOKES.length)];
}

/* ── the show ── */

function jarvisLine(tag, text, speakNow) {
  const wrap = document.getElementById('jarvisLines');
  const div = document.createElement('div');
  div.className = 'jarvis-line' + (speakNow ? ' speaking' : '');
  div.innerHTML = `<span class="jl-tag">${esc(tag)}</span><span class="jl-text">${esc(text)}</span>`;
  wrap.appendChild(div);
  wrap.parentElement.scrollTop = wrap.parentElement.scrollHeight;
  return div;
}

async function openBriefing() {
  const overlay = document.getElementById('jarvisOverlay');
  overlay.style.display = 'flex';
  document.getElementById('jarvisLines').innerHTML = '';
  jarvisAbort = false; jarvisMuted = false;
  document.getElementById('jarvisMute').textContent = 'Mute voice';
  const now = new Date();
  document.getElementById('jarvisDate').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  localStorage.setItem('jarvis_last', podToday());
  document.getElementById('btnBriefing').classList.remove('pulse');

  const hour = now.getHours();
  const daypart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const greeting = `Good ${daypart}, sir. Systems are online. Here is your briefing.`;

  // fetch everything in parallel while the greeting is being spoken
  const dataP = Promise.all([jarvisEmails(), jarvisWeather(), jarvisCalendar(), jarvisJoke()]);

  const g = jarvisLine('SYSTEM', greeting, true);
  await jarvisSpeak(greeting);
  g.classList.remove('speaking');
  if (jarvisAbort) return;

  const [emails, weather, calendar, joke] = await dataP;
  const sections = [
    ['INBOX', emails],
    ['WEATHER', weather],
    ['AGENDA', calendar],
    ['PROTOCOL', `Today's directive: ${jarvisTip()}`],
    ['LEVITY', `And finally — ${joke}`],
  ];
  for (const [tag, text] of sections) {
    if (jarvisAbort) return;
    const el = jarvisLine(tag, text, true);
    await jarvisSpeak(text);
    el.classList.remove('speaking');
  }
  if (!jarvisAbort) {
    const bye = 'That concludes the briefing. Do try to have a productive day.';
    const el = jarvisLine('SYSTEM', bye, true);
    await jarvisSpeak(bye);
    el.classList.remove('speaking');
  }
}

document.getElementById('btnBriefing')?.addEventListener('click', openBriefing);
document.getElementById('jarvisClose')?.addEventListener('click', () => {
  jarvisAbort = true;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  document.getElementById('jarvisOverlay').style.display = 'none';
});
document.getElementById('jarvisMute')?.addEventListener('click', () => {
  jarvisMuted = !jarvisMuted;
  if (jarvisMuted && 'speechSynthesis' in window) speechSynthesis.cancel();
  document.getElementById('jarvisMute').textContent = jarvisMuted ? 'Unmute voice' : 'Mute voice';
});

/* ─── BOOT ───────────────────────────────────────────────── */

initGoogleSignIn();
loadSettings();
loadTheme();
loadNotebooks();
loadYtHistory();
loadVb();
render();
renderTimer();
renderNotebooks();
if (activeNotebookId) renderNbWorkspace();
renderYtHistory();
renderVbSidebar();
renderVbCanvas();
renderPodRoll();
renderPomoFocusChip();
syncVbFromServer();
renderSchedule();
// Queue today's announcement: pulse the Brief button until it's played
// (browsers require a click before speech is allowed, so it can't auto-play)
if (localStorage.getItem('jarvis_last') !== podToday()) document.getElementById('btnBriefing')?.classList.add('pulse');

requestAnimationFrame(() => initVisualizer());
window.addEventListener('load', () => setTimeout(initGoogleAuth, 500));
handleSpotifyCallback();
if (localStorage.getItem('sp_token')){ showSpotifyPlayer(); pollNowPlaying(); }

/* ═══════════════════════════════════════════════════════════
   JOURNAL
   ═══════════════════════════════════════════════════════════ */

let journalEntries = [];   // [{ id, date:'YYYY-MM-DD', content }]  sorted newest first
let activeJournalId = null;
let journalSaveTimer = null;

function journalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function journalFmt(dateStr) {
  // "2025-06-13" → "Fri, Jun 13 2025"
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

function loadJournal() {
  try { journalEntries = JSON.parse(localStorage.getItem('journal_entries') || '[]'); } catch(e) { journalEntries = []; }
}

function saveJournal() {
  localStorage.setItem('journal_entries', JSON.stringify(journalEntries));
}

function journalOpenEntry(id) {
  activeJournalId = id;
  const entry = journalEntries.find(e => e.id === id);
  if (!entry) return;
  document.getElementById('journalEditorDate').textContent = journalFmt(entry.date);
  document.getElementById('journalTextarea').value = entry.content;
  document.getElementById('journalAutosave').textContent = '';
  renderJournalList();
}

function journalNewEntry() {
  const today = journalToday();
  let existing = journalEntries.find(e => e.date === today);
  if (existing) { journalOpenEntry(existing.id); return; }
  const entry = { id: uid(), date: today, content: '' };
  journalEntries.unshift(entry);
  saveJournal();
  renderJournalList();
  journalOpenEntry(entry.id);
}

function renderJournalList() {
  const ul = document.getElementById('journalEntryList');
  if (!ul) return;
  ul.innerHTML = journalEntries.map(e => {
    const preview = e.content.trim().slice(0,50).replace(/\n/g,' ') || 'Empty';
    const active = e.id === activeJournalId ? ' active' : '';
    return `<li class="journal-entry-item${active}" data-jid="${e.id}">
      <div class="journal-entry-date">${journalFmt(e.date)}</div>
      <div class="journal-entry-preview">${esc(preview)}</div>
    </li>`;
  }).join('');
  ul.querySelectorAll('.journal-entry-item').forEach(li => {
    li.addEventListener('click', () => journalOpenEntry(li.dataset.jid));
  });
}

function initJournal() {
  loadJournal();
  // Auto-open today's entry (create if none)
  const today = journalToday();
  if (journalEntries.length === 0 || !journalEntries.find(e => e.date === today)) {
    const entry = { id: uid(), date: today, content: '' };
    journalEntries.unshift(entry);
    saveJournal();
  }
  renderJournalList();
  journalOpenEntry(journalEntries[0].id);

  // Autosave on type
  document.getElementById('journalTextarea').addEventListener('input', () => {
    const entry = journalEntries.find(e => e.id === activeJournalId);
    if (!entry) return;
    entry.content = document.getElementById('journalTextarea').value;
    clearTimeout(journalSaveTimer);
    document.getElementById('journalAutosave').textContent = 'Saving…';
    journalSaveTimer = setTimeout(() => {
      saveJournal();
      renderJournalList();
      document.getElementById('journalAutosave').textContent = 'Saved';
      setTimeout(() => { document.getElementById('journalAutosave').textContent = ''; }, 1500);
    }, 800);
  });

  document.getElementById('btnJournalNew').addEventListener('click', journalNewEntry);

  document.getElementById('btnJournalDelete').addEventListener('click', () => {
    if (!activeJournalId) return;
    if (!confirm('Delete this entry?')) return;
    journalEntries = journalEntries.filter(e => e.id !== activeJournalId);
    saveJournal();
    activeJournalId = null;
    renderJournalList();
    if (journalEntries.length > 0) journalOpenEntry(journalEntries[0].id);
    else { document.getElementById('journalEditorDate').textContent = ''; document.getElementById('journalTextarea').value = ''; }
  });
}

/* ═══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════════════════ */

const DEFAULT_SHORTCUTS = [
  { id:'tab_focus',    label:'Go to Focus',          key:'1' },
  { id:'tab_project',  label:'Go to Project',         key:'2' },
  { id:'tab_notes',    label:'Go to Vision',          key:'3' },
  { id:'tab_calendar', label:'Go to Calendar',        key:'4' },
  { id:'tab_habits',   label:'Go to Habits',          key:'5' },
  { id:'tab_journal',  label:'Go to Journal',         key:'6' },
  { id:'tab_settings', label:'Go to Settings',        key:',' },
  { id:'new_task',     label:'New Task',              key:'n' },
  { id:'timer_toggle', label:'Start / Stop Timer',    key:'t' },
  { id:'timer_reset',  label:'Reset Timer',           key:'r' },
];

let shortcuts = [];

function loadShortcuts() {
  try {
    const saved = JSON.parse(localStorage.getItem('cc_shortcuts') || 'null');
    if (Array.isArray(saved) && saved.length === DEFAULT_SHORTCUTS.length) {
      shortcuts = saved;
    } else {
      shortcuts = DEFAULT_SHORTCUTS.map(s => ({...s}));
    }
  } catch(e) {
    shortcuts = DEFAULT_SHORTCUTS.map(s => ({...s}));
  }
}

function saveShortcuts() {
  localStorage.setItem('cc_shortcuts', JSON.stringify(shortcuts));
}

function applyShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Skip if typing in an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

    const sc = shortcuts.find(s => s.key.toLowerCase() === e.key.toLowerCase());
    if (!sc) return;

    if (sc.id.startsWith('tab_')) {
      const tabName = sc.id.replace('tab_', '');
      document.querySelector(`.nav-tab[data-tab="${tabName}"]`)?.click();
      e.preventDefault();
    } else if (sc.id === 'new_task') {
      document.querySelector('.nav-tab[data-tab="focus"]')?.click();
      setTimeout(() => document.getElementById('btnAddTask')?.click(), 50);
      e.preventDefault();
    } else if (sc.id === 'timer_toggle') {
      document.getElementById('btnPomoToggle')?.click();
      e.preventDefault();
    } else if (sc.id === 'timer_reset') {
      document.getElementById('btnPomoReset')?.click();
      e.preventDefault();
    }
  });
}

function renderShortcutsTable() {
  const table = document.getElementById('shortcutsTable');
  if (!table) return;
  table.innerHTML = shortcuts.map(sc => `
    <tr>
      <td>${sc.label}</td>
      <td><span class="shortcut-badge" data-scid="${sc.id}">${esc(sc.key)}</span></td>
    </tr>
  `).join('');

  table.querySelectorAll('.shortcut-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      if (badge.classList.contains('listening')) return;
      badge.classList.add('listening');
      const orig = badge.textContent;
      badge.textContent = '…press key';
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { badge.classList.remove('listening'); badge.textContent = orig; document.removeEventListener('keydown', handler, true); return; }
        const sc = shortcuts.find(s => s.id === badge.dataset.scid);
        if (sc) { sc.key = e.key; saveShortcuts(); }
        badge.classList.remove('listening');
        renderShortcutsTable();
        document.removeEventListener('keydown', handler, true);
      };
      document.addEventListener('keydown', handler, true);
    });
  });
}

document.getElementById('btnResetShortcuts').addEventListener('click', () => {
  shortcuts = DEFAULT_SHORTCUTS.map(s => ({...s}));
  saveShortcuts();
  renderShortcutsTable();
});

// Re-render shortcuts table when settings tab is opened
document.querySelector('.nav-tab[data-tab="settings"]').addEventListener('click', renderShortcutsTable);

// Init
loadShortcuts();
applyShortcuts();
initJournal();
