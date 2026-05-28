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

let tasks = [
  { id:uid(), title:'Plan the week ahead',       done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
  { id:uid(), title:'Review open pull requests', done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
  { id:uid(), title:'Write release notes',       done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
  { id:uid(), title:'Update project roadmap',    done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
  { id:uid(), title:'Clear email inbox',         done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
];

const DURATIONS = { work:25*60, short:5*60, long:15*60 };

const pomo = { mode:'work', timeLeft:DURATIONS.work, running:false, sessions:0, interval:null };

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
    let needsRender = false;
    tasks.forEach(t => {
      if (!t.seat || t.orbit || t.done) return;
      if (pendingLaunchTask && pendingLaunchTask.id === t.id) return; // paused for modal
      if (t.timerLeft > 0) {
        t.timerLeft--;
        needsRender = true;
        if (t.timerLeft === 0) {
          pendingLaunchTask = t;
          showLaunchModal(t);
        }
      }
    });
    if (needsRender) renderTakeoff();
  }, 1000);
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

document.getElementById('btnAddNotebook').addEventListener('click', () => {
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

document.getElementById('btnAddNbTab').addEventListener('click', () => {
  const nb = notebooks.find(n => n.id === activeNotebookId);
  if (!nb) return;
  const tab = { id: uid(), name: 'Section', tasks: [], notes: '' };
  nb.tabs.push(tab);
  activeNbTabId = tab.id;
  saveNotebooks(); renderNbWorkspace();
});

/* ─── POMODORO ───────────────────────────────────────────── */

function sandColor(p) {
  if (p > 0.50) return '#f0f0f0';
  if (p > 0.25) return '#ffcc44';
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
  pomo.running = true;
  pomo.interval = setInterval(() => {
    pomo.timeLeft--;
    renderTimer();
    if (pomo.timeLeft <= 0) {
      clearInterval(pomo.interval); pomo.running = false;
      if (pomo.mode==='work') { pomo.sessions++; setMode(pomo.sessions%4===0?'long':'short'); }
      else setMode('work');
    }
  }, 1000);
}

function pauseTimer() { clearInterval(pomo.interval); pomo.running=false; renderTimer(); }
function resetTimer() { pauseTimer(); pomo.timeLeft=DURATIONS[pomo.mode]; renderTimer(); }
function setMode(mode) {
  pauseTimer(); pomo.mode=mode; pomo.timeLeft=DURATIONS[mode];
  document.querySelectorAll('.pomo-mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  renderTimer();
}

btnStartPause.addEventListener('click', ()=>pomo.running?pauseTimer():startTimer());
btnReset.addEventListener('click', resetTimer);
document.querySelectorAll('.pomo-mode').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.mode)));

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

/* ─── SETTINGS ───────────────────────────────────────────── */

function loadSettings() {
  document.getElementById('inputGoogleClientId').value  = localStorage.getItem('googleClientId')  || '';
  document.getElementById('inputSpotifyClientId').value = localStorage.getItem('spotifyClientId') || '';
  const d=document.getElementById('redirectUriDisplay');
  if(d) d.textContent=window.location.origin+window.location.pathname.replace(/\/?$/,'/');
}

document.getElementById('btnSaveSettings').addEventListener('click',()=>{
  localStorage.setItem('googleClientId',  document.getElementById('inputGoogleClientId').value.trim());
  localStorage.setItem('spotifyClientId', document.getElementById('inputSpotifyClientId').value.trim());
  const msg=document.getElementById('settingsSavedMsg');
  msg.style.display='block'; setTimeout(()=>msg.style.display='none',2000);
});

/* ─── GOOGLE CALENDAR ────────────────────────────────────── */

let googleToken = null;
let googleTokenClient = null;
let calendarEvents = [];

function initGoogleAuth() {
  const clientId=localStorage.getItem('googleClientId');
  if (!clientId || typeof google==='undefined') return;
  googleTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    callback: async resp => {
      if (resp.error) return;
      googleToken = resp.access_token;
      await loadCalendarEvents();
    },
  });
}

document.getElementById('btnCalConnect').addEventListener('click',()=>{
  const clientId=localStorage.getItem('googleClientId');
  if (!clientId) { document.getElementById('calConfigHint').textContent='Add your Google Client ID in Settings first.'; return; }
  if (!googleTokenClient) initGoogleAuth();
  if (!googleTokenClient) return;
  googleTokenClient.requestAccessToken({prompt:'consent'});
});

document.getElementById('btnCalDisconnect').addEventListener('click',()=>{
  googleToken=null; calendarEvents=[];
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
  const{name,artists,album,duration_ms}=data.item;
  trackEl.textContent=name; artistEl.textContent=artists.map(a=>a.name).join(', ');
  artEl.src=album.images.slice(-1)[0]?.url||'';
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

/* ─── BOOT ───────────────────────────────────────────────── */

loadSettings();
loadNotebooks();
loadYtHistory();
render();
renderTimer();
renderNotebooks();
if (activeNotebookId) renderNbWorkspace();
renderYtHistory();

window.addEventListener('load', ()=>setTimeout(initGoogleAuth, 500));
handleSpotifyCallback();
if (localStorage.getItem('sp_token')){ showSpotifyPlayer(); pollNowPlaying(); }
