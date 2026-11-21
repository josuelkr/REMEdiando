"use strict";
/* =====================================================================
   Protocolo em Prática — treinamento de procedimentos em saúde
   Site estático: banco de questões em dados/*.json, progresso no navegador.
   Tipos de questão: multipla, vf, multiselect, ordenar, associar.
   ===================================================================== */

const CFG = {
  abandonHours: 72,      // não concluiu e sem atividade há mais que isso => "parou"
  rteMin: 0.90,          // esforço mínimo (Response Time Effort, Wise & Kong 2005)
  ntPct: 0.10,           // limiar normativo: 10% do tempo médio da questão (Wise & Ma 2012)
  ntMinN: 5,             // respostas mínimas na questão para usar o limiar normativo
  floorMs: 3000,         // piso do limiar de resposta rápida
  readMsPerWord: 250,    // ~240 palavras por minuto
  readFrac: 0.25,        // sem dados: rápida se < 25% do tempo estimado de leitura
  studyMinMs: 20000,     // tutorial lido em menos que isso => leitura apressada
  idleCapMs: 300000,     // cada resposta conta no máximo 5 min de tempo ativo
  ntMaxMs: 10000,        // teto do limiar de resposta rápida (Wise & Ma 2012: NT10 com máximo de 10 s)
  minRapid: 2,           // só sinaliza chute com pelo menos 2 respostas rápidas
  minN: 5,               // abaixo disso, taxa de erro aparece como "poucos dados"
  topLevel: 2,           // degraus da escada (1 básico, 2 situação real)
  evalPerRule: 2,        // questões por competência na avaliação
  respace: 1,            // competência errada volta depois de N outras questões
  pts: {acerto: 10, sequencia: 10, cadaSeq: 3, dominio: 20, aprovado: 50, dePrimeira: 50, gabarito: 30}
};
const STORE_KEY = "treinoSaude.v2";
const NIVEIS = {1: "básico", 2: "situação real"};
const TIPOS = {multipla: "Escolha a melhor resposta", vf: "Verdadeiro ou falso", multiselect: "Marque todas as corretas", ordenar: "Coloque em ordem", associar: "Associe"};

/* ---------------- Utilitários ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const words = s => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const L = "ABCDE";
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const fmtMin = ms => { if (ms == null || isNaN(ms)) return "—"; const m = ms / 60000; return m < 1 ? Math.round(ms / 1000) + " s" : (m < 10 ? m.toFixed(1).replace(".", ",") : Math.round(m)) + " min"; };
const fmtAgo = t => { if (!t) return "—"; const h = (Date.now() - t) / 3600000; if (h < 1) return "há " + Math.max(1, Math.round(h * 60)) + " min"; if (h < 48) return "há " + Math.round(h) + " h"; return "há " + Math.round(h / 24) + " dias"; };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const rc = i => `--c:var(--r${i % 5})`;
/* Intervalo de Wilson (95%) para uma proporção k/n: estável com n pequeno e sem sair de [0, 1]. */
function wilson(k, n, z = 1.96){
  if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
const MEDALHAS = {ouro: "Ouro", prata: "Prata", bronze: "Bronze"};
const medalBadge = (m, big) => m ? `<span class="medal m-${m} ${big ? "big" : ""}" title="Medalha de ${MEDALHAS[m].toLowerCase()}"><i aria-hidden="true"></i>${MEDALHAS[m]}</span>` : "";

/* ---------------- Estado ---------------- */
const App = {
  procs: [], route: "", loadErr: "",
  data: {participantes: {}, atual: null, equipe: {}},
  lr: {pid: null, q: null, t0: 0, fb: null, work: null, msg: "", studyT0: 0, replay: false},
  dash: {pid: null, sort: "status", msg: ""},
  bank: {pid: null, regra: "", nivel: "", uso: "", tipo: ""}
};
function loadData(){
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) App.data = Object.assign({participantes: {}, atual: null, equipe: {}}, JSON.parse(raw)); }
  catch(e){ App.storageErr = true; }
}
function saveData(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(App.data)); App.storageErr = false; }
  catch(e){ App.storageErr = true; }
}
async function loadProcs(){
  try {
    const idx = await (await fetch("dados/procedimentos.json", {cache: "no-store"})).json();
    const list = [];
    for (const f of idx.procedimentos){
      const p = await (await fetch("dados/" + f, {cache: "no-store"})).json();
      p.questoes.forEach(q => q.tipo = q.tipo || "multipla");
      list.push(p);
    }
    App.procs = list;
  } catch(e){
    App.loadErr = location.protocol === "file:"
      ? "O navegador bloqueia os arquivos de dados quando a página é aberta direto do disco. Publique no GitHub Pages ou rode um servidor local (python3 -m http.server) e abra http://localhost:8000."
      : "Não foi possível ler os arquivos da pasta dados/: " + (e.message || e);
  }
}

/* =====================================================================
   MOTOR DE QUESTÕES (todos os tipos)
   ===================================================================== */
function itemText(q){
  const parts = [q.enunciado];
  if (q.alternativas) parts.push(q.alternativas.join(" "));
  if (q.itens) parts.push(q.itens.join(" "));
  if (q.pares) parts.push(q.pares.map(p => p.item).join(" "), (q.opcoes || []).join(" "));
  return parts.join(" ");
}
function expectedReadMs(q){ return words(itemText(q)) * CFG.readMsPerWord * (q.tipo === "ordenar" || q.tipo === "associar" ? 1.5 : 1); }
function rapidThreshold(q, stats){
  const st = stats && stats[q.id];
  const t = st && st.n >= CFG.ntMinN ? CFG.ntPct * st.mean : CFG.readFrac * expectedReadMs(q);
  return Math.min(CFG.ntMaxMs, Math.max(CFG.floorMs, t));
}
function newWork(q){
  if (q.tipo === "multiselect") return {sel: q.alternativas.map(() => false)};
  if (q.tipo === "associar") return {sel: q.pares.map(() => null)};
  if (q.tipo === "ordenar"){
    const idx = q.itens.map((_, i) => i);
    let o = shuffle(idx); let guard = 0;
    while (o.every((v, i) => v === i) && guard++ < 10) o = shuffle(idx);
    return {order: o};
  }
  return {};
}
function grade(q, ans){
  if (q.tipo === "multipla") return ans === q.correta;
  if (q.tipo === "vf") return ans === q.correta;
  if (q.tipo === "multiselect") return q.alternativas.every((_, i) => ans.includes(i) === q.corretas.includes(i));
  if (q.tipo === "ordenar") return ans.every((v, i) => v === i);
  if (q.tipo === "associar") return q.pares.every((p, i) => ans[i] === p.resposta);
  return false;
}
function workAnswer(q, w){
  if (q.tipo === "multiselect") return w.sel.map((v, i) => v ? i : -1).filter(i => i >= 0);
  if (q.tipo === "ordenar") return [...w.order];
  if (q.tipo === "associar") return [...w.sel];
  return null;
}
function canConfirm(q, w){
  if (q.tipo === "multiselect") return w.sel.some(Boolean);
  if (q.tipo === "associar") return w.sel.every(v => v !== null);
  return q.tipo === "ordenar";
}
function wrongNote(q, ans){
  if (q.tipo === "multipla") return (q.equivocos && q.equivocos[ans]) || q.alternativas[ans];
  return q.equivoco || "";
}
/* Desenha a área de resposta. fb = {ans, ok} quando há correção visível. */
function renderInput(q, w, fb){
  const lock = fb ? "disabled" : "";
  if (q.tipo === "multipla"){
    return `<div class="opts">${q.alternativas.map((o, k) => {
      let cls = ""; let mark = "";
      if (fb){ if (k === fb.ans){ cls = fb.ok ? "is-ok" : "is-bad"; mark = fb.ok ? "Sua resposta, correta" : "Sua resposta"; } else if (k === q.correta && !fb.ok){ cls = "is-right"; mark = "Resposta correta"; } }
      return `<button class="opt ${cls}" data-act="pick" data-v="${k}" ${lock}><span class="key">${L[k]}</span><span class="txt">${esc(o)}${mark ? `<em>${mark}</em>` : ""}</span></button>`;
    }).join("")}</div>`;
  }
  if (q.tipo === "vf"){
    return `<div class="vf">${[true, false].map(v => {
      let cls = "";
      if (fb){ if (v === fb.ans) cls = fb.ok ? "is-ok" : "is-bad"; else if (v === q.correta && !fb.ok) cls = "is-right"; }
      return `<button class="opt vfbtn ${cls}" data-act="pick" data-v="${v}" ${lock}>${v ? "Verdadeiro" : "Falso"}</button>`;
    }).join("")}</div>`;
  }
  if (q.tipo === "multiselect"){
    return `<div class="opts">${q.alternativas.map((o, k) => {
      const on = fb ? fb.ans.includes(k) : w.sel[k];
      let cls = on ? "is-on" : ""; let note = "";
      if (fb){ const should = q.corretas.includes(k); cls = should ? (on ? "is-ok" : "is-miss") : (on ? "is-bad" : "");
        note = `<em>${on === should ? (should ? "Marcou, certo" : "Não marcou, certo") : (should ? "Faltou marcar" : "Não deveria marcar")}. ${esc((q.notas || [])[k] || "")}</em>`; }
      return `<button class="opt check ${cls}" data-act="tog" data-v="${k}" aria-pressed="${on}" ${lock}><span class="box" aria-hidden="true"></span><span class="txt">${esc(o)}${note}</span></button>`;
    }).join("")}</div>${fb ? "" : confirmBtn(q, w)}`;
  }
  if (q.tipo === "ordenar"){
    const order = fb ? fb.ans : w.order;
    return `<ol class="order">${order.map((it, pos) => {
      let cls = ""; let note = "";
      if (fb){ cls = it === pos ? "is-ok" : "is-bad"; note = it === pos ? "" : `<em>Posição correta: ${it + 1}</em>`; }
      return `<li class="${cls}"><span class="pos">${pos + 1}</span><span class="txt">${esc(q.itens[it])}${note}</span>
        ${fb ? "" : `<span class="mv"><button class="ic" data-act="up" data-v="${pos}" ${pos === 0 ? "disabled" : ""} aria-label="Subir">▲</button><button class="ic" data-act="down" data-v="${pos}" ${pos === order.length - 1 ? "disabled" : ""} aria-label="Descer">▼</button></span>`}</li>`;
    }).join("")}</ol>${fb ? "" : confirmBtn(q, w)}`;
  }
  if (q.tipo === "associar"){
    const cur = fb ? fb.ans : w.sel;
    return `<div class="assoc">${q.pares.map((p, i) => {
      let cls = ""; let note = "";
      if (fb){ cls = cur[i] === p.resposta ? "is-ok" : "is-bad"; if (cur[i] !== p.resposta) note = `<em>Correto: ${esc(q.opcoes[p.resposta])}</em>`; }
      const pre = commonPrefix(q.opcoes);
      return `<div class="arow ${cls}"><div class="txt">${esc(p.item)}${note}</div><div class="seg ${pre ? "seg-num" : (q.opcoes.length > 3 ? "seg-many" : "")}">${pre ? `<span class="pre">${esc(pre.trim())}</span>` : ""}${q.opcoes.map((o, j) =>
        `<button data-act="assoc" data-i="${i}" data-v="${j}" class="${cur[i] === j ? "on" : ""}" aria-label="${esc(o)}" ${lock}>${esc(pre ? o.slice(pre.length) : o)}</button>`).join("")}</div></div>`;
    }).join("")}</div>${fb ? "" : confirmBtn(q, w)}`;
  }
  return "";
}
/* "Momento 1".."Momento 5" vira o rótulo "Momento" + botões 1..5 */
function commonPrefix(opts){
  if (opts.length < 3) return "";
  const m = opts[0].match(/^(.*\s)\S+$/); if (!m) return "";
  return opts.every(o => o.startsWith(m[1]) && o.length - m[1].length <= 3) ? m[1] : "";
}
function confirmBtn(q, w){ return `<div class="actions"><button class="primary" data-act="confirm" ${canConfirm(q, w) ? "" : "disabled"}>Confirmar resposta</button></div>`; }
/* Trata cliques de montagem de resposta. Devolve a resposta final ou undefined. */
function handleInput(q, w, act, b){
  const v = b.dataset.v;
  if (act === "pick"){ return q.tipo === "vf" ? v === "true" : Number(v); }
  if (act === "tog"){ w.sel[Number(v)] = !w.sel[Number(v)]; return; }
  if (act === "up" || act === "down"){ const i = Number(v), j = act === "up" ? i - 1 : i + 1; [w.order[i], w.order[j]] = [w.order[j], w.order[i]]; return; }
  if (act === "assoc"){ w.sel[Number(b.dataset.i)] = Number(v); return; }
  if (act === "confirm" && canConfirm(q, w)) return workAnswer(q, w);
}

/* ---------------- Vídeo ---------------- */
function videoBlock(p, start){
  const v = p.video || {};
  if (v.youtube) return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.youtube)}?rel=0${start ? "&start=" + Math.floor(start) : ""}" title="Vídeo do procedimento" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  if (v.arquivo) return `<div class="video"><video controls preload="metadata" src="${esc(v.arquivo)}${start ? "#t=" + Math.floor(start) : ""}"></video></div>`;
  return `<div class="video empty"><div class="play" aria-hidden="true"></div><p>Espaço para o vídeo do procedimento</p><p class="small">${esc(v.legenda || "Defina o campo video no arquivo de dados.")}</p></div>`;
}

/* ---------------- Navegação ---------------- */
const ROUTES = [["treino", "Treinar"], ["painel", "Painel do gestor"], ["banco", "Questões"], ["metodo", "Como funciona"]];
function route(){
  let h = location.hash.slice(1);
  if (!ROUTES.some(r => r[0] === h)) h = "treino";
  App.route = h;
  $("#nav").innerHTML = ROUTES.map(r => `<a href="#${r[0]}" ${r[0] === h ? 'aria-current="page"' : ""}>${r[1]}</a>`).join("");
  document.body.dataset.route = h;
  render();
}
function render(){
  $("#banner").innerHTML = App.storageErr ? `<div class="banner">Este navegador não está salvando o progresso (modo privado?). Os dados se perdem ao fechar a aba.</div>` : "";
  const v = $("#view");
  if (App.loadErr){ v.innerHTML = `<section class="panel"><h2>Banco de questões não carregado</h2><p>${esc(App.loadErr)}</p></section>`; return; }
  if (App.route === "painel") v.innerHTML = viewDash();
  else if (App.route === "banco") v.innerHTML = viewBank();
  else if (App.route === "metodo") v.innerHTML = viewMetodo();
  else v.innerHTML = viewTreino();
}
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-act]"); if (!b || b.disabled) return;
  if (App.route === "treino") return onTreino(b.dataset.act, b);
  if (App.route === "painel") return onDash(b.dataset.act, b);
});
document.addEventListener("change", ev => {
  const id = ev.target.id;
  if (id === "d-proc"){ App.dash.pid = ev.target.value; render(); }
  if (id === "d-equipe"){ App.data.equipe[dashProc().id] = Math.max(0, parseInt(ev.target.value, 10) || 0); saveData(); render(); }
  if (id === "d-import") importFile(ev.target.files[0]);
  if (id && id.startsWith("b-")){ App.bank[id.slice(2)] = ev.target.value; render(); }
});
document.addEventListener("keydown", ev => {
  if (ev.target.id === "p-nome" && ev.key === "Enter"){ ev.preventDefault(); const b = document.querySelector('[data-act="novoPart"]'); if (b) b.click(); }
});

/* =====================================================================
   TREINAMENTO
   ===================================================================== */
const me = () => App.data.participantes[App.data.atual];
const curProc = () => App.procs.find(p => p.id === App.lr.pid);
const curRun = () => me() && me().runs[App.lr.pid];
const qById = (p, id) => p.questoes.find(q => q.id === id);
const pool = (p, uso, ri, nivel) => p.questoes.filter(q => q.uso === uso && q.regra === ri && (nivel == null || q.nivel === nivel));
function newRun(p){
  const estado = {}; p.regras.forEach((_, i) => estado[i] = {nivel: 1, dominada: false});
  return {pid: p.id, started: Date.now(), last: Date.now(), phase: "estudo", readMs: 0, estado, domEver: [],
          queue: p.regras.map((_, i) => i), seen: [], answers: [], forms: [], activeMs: 0, round: 1};
}
function persist(){ const r = curRun(); if (r) r.last = Date.now(); saveData(); }

/* ---------------- Gamificação ----------------
   Pontos só por acerto com tempo de leitura (resposta rápida demais não pontua),
   sequência de acertos, competência dominada e avaliação. Nada premia velocidade. */
function rewards(p, run){
  const P = CFG.pts; let pts = 0, streak = 0, best = 0;
  run.answers.forEach(a => {
    if (a.ph !== "t") return;
    if (a.ok && !a.rp){ pts += P.acerto; streak++; best = Math.max(best, streak); if (streak % P.cadaSeq === 0) pts += P.sequencia; }
    else if (!a.ok) streak = 0;
  });
  pts += P.dominio * (run.domEver || []).length;
  const k = run.forms.findIndex(f => f.done && f.passed);
  if (k >= 0){ pts += P.aprovado; if (k === 0) pts += P.dePrimeira; if (run.forms[k].score === 100) pts += P.gabarito; }
  return {pts, streak, best};
}
/* Bronze: concluiu. Prata: aprovado na 1ª avaliação. Ouro: 1ª avaliação com 100% e no máximo 1 resposta rápida demais. */
function medalOf(run){
  if (!run || run.phase !== "concluido") return null;
  const f0 = run.forms.find(f => f.done);
  if (!f0 || !f0.passed) return "bronze";
  return f0.score === 100 && run.answers.filter(a => a.rp).length < CFG.minRapid ? "ouro" : "prata";
}
function nextMedalHint(run){
  const m = medalOf(run);
  if (m === "ouro") return "Medalha máxima. Parabéns!";
  if (m === "prata") return "O ouro exige acertar tudo na primeira avaliação, lendo cada questão com calma.";
  return "Prata e ouro são para quem passa na primeira avaliação.";
}

function ladders(p, run, cur){
  return `<div class="ladders" style="--n:${p.regras.length}" role="list">${p.regras.map((r, i) => {
    const e = run.estado[i]; const filled = e.dominada ? CFG.topLevel : e.nivel - 1;
    const steps = [2, 1].map(n => `<i class="${n <= filled ? "on" : (n === e.nivel && !e.dominada ? "now" : "")}"></i>`).join("");
    return `<div class="ladder ${e.dominada ? "done" : ""} ${i === cur ? "cur" : ""}" style="${rc(i)}" role="listitem" title="${esc(r.nome)}: ${e.dominada ? "dominada" : "nível " + e.nivel}">
      <div class="steps">${steps}</div><span>${esc(r.nome)}</span></div>`;
  }).join("")}</div>`;
}
function gamebar(p, run){
  const R = rewards(p, run);
  const dom = p.regras.filter((_, i) => run.estado[i].dominada).length;
  return `<div class="gamebar">
    <span class="g-pts"><b>${R.pts}</b> pontos</span>
    <span class="g-streak ${R.streak >= 2 ? "hot" : ""}" title="A cada ${CFG.pts.cadaSeq} acertos seguidos, +${CFG.pts.sequencia} de bônus"><span aria-hidden="true">🔥</span> ${R.streak} ${R.streak === 1 ? "acerto seguido" : "acertos seguidos"}</span>
    <span class="g-dom">${dom} de ${p.regras.length} competências</span></div>`;
}
function viewTreino(){
  if (!me()) return viewQuemSou();
  const p = curProc();
  const top = `<div class="crumbs">${p ? `<button class="link" data-act="back">Meus treinamentos</button>` : `<span></span>`}
     <span class="who">${esc(me().nome)} <button class="link" data-act="trocar">trocar</button></span></div>`;
  if (!p) return top + viewLista();
  const run = curRun();
  const msg = App.lr.msg ? `<p class="err">${esc(App.lr.msg)}</p>` : "";
  if (!run || run.phase === "estudo") return top + viewEstudo(p) + msg;
  if (run.phase === "treino") return top + viewQuestaoTreino(p, run) + msg;
  if (run.phase === "pronto") return top + viewPronto(p, run) + msg;
  if (run.phase === "avaliacao") return top + viewQuestaoAval(p, run) + msg;
  if (run.phase === "resultado") return top + viewResultado(p, run) + msg;
  return top + viewConcluido(p, run) + msg;
}
function viewQuemSou(){
  const parts = Object.entries(App.data.participantes).filter(([, x]) => !x.demo);
  return `<section class="hero">
    <div class="mark big" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <h2>Treine em 5 minutos. Ganhe pontos e medalha.</h2>
    <p class="lead">Situações reais, correção na hora e uma avaliação curta no final. Acertar com atenção vale pontos; terminar bem vale medalha.</p>
    <div class="namebox">
      <label for="p-nome">Seu nome</label>
      <div class="inline"><input type="text" id="p-nome" placeholder="Como você quer aparecer para o gestor" autocomplete="name"><button class="primary" data-act="novoPart">Começar</button></div>
      ${parts.length ? `<p class="small">Ou continue como ${parts.map(([id, x]) => `<button class="link" data-act="usarPart" data-id="${esc(id)}">${esc(x.nome)}</button>`).join(", ")}</p>` : ""}
      <p class="small muted">Sem cadastro: seu progresso fica salvo neste navegador.</p>
    </div></section>`;
}
function phaseName(run){
  if (!run) return "Não iniciado";
  return {estudo: "Tutorial", treino: "Em prática", pronto: "Pronto para a avaliação", avaliacao: "Em avaliação", resultado: "Avaliação corrigida", concluido: "Concluído"}[run.phase] || run.phase;
}
function viewLista(){
  return `<section class="intro"><h2>Seus treinamentos</h2>
    <p class="lead">Primeiro você pratica, com correção na hora. Depois faz uma avaliação curta com questões novas.</p></section>
    ${App.procs.map(p => { const run = me().runs[p.id];
      const done = run ? p.regras.filter((_, i) => run.estado[i].dominada).length : 0;
      const m = medalOf(run); const pts = run ? rewards(p, run).pts : 0;
      return `<article class="proc">
        <div class="mark" aria-hidden="true">${p.regras.map((_, i) => `<i style="${rc(i)}" class="${run && run.estado[i].dominada ? "on" : ""}"></i>`).join("")}</div>
        <div class="grow"><h3>${esc(p.titulo)}</h3><p class="small muted">${p.regras.length} competências, cerca de 5 minutos. ${phaseName(run)}${run && run.phase !== "concluido" ? `, ${done} de ${p.regras.length} dominadas` : ""}${run ? `, ${pts} pontos` : ""}.</p></div>
        ${medalBadge(m)}
        <button class="primary" data-act="open" data-id="${esc(p.id)}">${!run ? "Começar" : run.phase === "concluido" ? "Ver resultado" : "Continuar"}</button></article>`; }).join("")}`;
}
function viewEstudo(p){
  return `<section class="panel tutorial">
    <p class="step">Etapa 1 de 3</p>
    <h2>Tutorial</h2>
    ${videoBlock(p)}
    <p class="lead">${esc(p.descricao || "")}</p>
    <ol class="rules">${p.regras.map((r, i) => `<li style="${rc(i)}"><h3>${esc(r.nome)}${r.critica ? ` <span class="tag crit">crítica</span>` : ""}</h3><p>${esc(r.texto)}</p></li>`).join("")}</ol>
    <div class="howpts"><b>Como pontuar</b>
      <span>+${CFG.pts.acerto} por acerto</span><span>+${CFG.pts.sequencia} a cada ${CFG.pts.cadaSeq} seguidos</span><span>+${CFG.pts.dominio} por competência dominada</span><span>+${CFG.pts.aprovado} na aprovação, +${CFG.pts.dePrimeira} se for de primeira</span>
      <small>Resposta dada rápido demais, sem tempo de ler, não pontua.</small></div>
    <div class="actions"><button class="primary" data-act="startTrain">Li o tutorial, começar a prática</button></div>
  </section>`;
}
function pickTrain(p, run, ri, nivel){
  let cands = pool(p, "treino", ri, nivel);
  if (!cands.length){ for (const n of [2, 1]){ cands = pool(p, "treino", ri, n); if (cands.length) break; } }
  const unseen = cands.filter(q => !run.seen.includes(q.id));
  if (unseen.length){
    const lastType = (() => { for (let k = run.answers.length - 1; k >= 0; k--){ const a = run.answers[k]; if (a.r === ri){ const q = qById(p, a.q); return q && q.tipo; } } return null; })();
    const varied = unseen.filter(q => q.tipo !== lastType);
    const set = varied.length ? varied : unseen;
    return set[Math.floor(Math.random() * set.length)];
  }
  const lastId = run.answers.length ? run.answers[run.answers.length - 1].q : null;
  const ord = id => run.seen.lastIndexOf(id);
  const c2 = cands.filter(q => q.id !== lastId);
  return (c2.length ? c2 : cands).sort((a, b) => ord(a.id) - ord(b.id))[0] || null;
}
function setQuestion(q, phase){ const lr = App.lr; lr.q = {id: q.id, phase}; lr.fb = null; lr.work = newWork(q); lr.replay = false; lr.t0 = performance.now(); }
function nextTraining(){
  const lr = App.lr, p = curProc(), run = curRun();
  const pending = p.regras.map((_, i) => i).filter(i => !run.estado[i].dominada);
  if (!pending.length){ run.phase = "pronto"; lr.q = null; persist(); return render(); }
  run.queue = run.queue.filter(i => pending.includes(i));
  pending.forEach(i => { if (!run.queue.includes(i)) run.queue.push(i); });
  const ri = run.queue[0];
  const q = pickTrain(p, run, ri, run.estado[ri].nivel);
  if (!q){ lr.msg = "Não há questões de prática para esta competência no banco."; return render(); }
  setQuestion(q, "t"); render();
  window.scrollTo({top: 0, behavior: "instant"});
}
function recordAnswer(run, q, phase, ans){
  const ms = Math.round(performance.now() - App.lr.t0);
  const ok = grade(q, ans);
  const rapid = ms < rapidThreshold(q);
  run.answers.push({q: q.id, r: q.regra, n: q.nivel, ph: phase, ok, rp: rapid, ch: ans, ms, at: Date.now()});
  run.activeMs = (run.activeMs || 0) + Math.min(ms, CFG.idleCapMs);
  if (phase === "t") run.seen.push(q.id);
  return {ok, rapid};
}
function applyLadder(run, ri, r){
  const e = run.estado[ri];
  if (r.ok && !r.rapid){
    if (e.nivel >= CFG.topLevel){ e.dominada = true; run.domEver = run.domEver || []; if (!run.domEver.includes(ri)) run.domEver.push(ri); }
    else e.nivel++;
  }
  else if (!r.ok) e.nivel = Math.max(1, e.nivel - 1);
  run.queue = run.queue.filter(i => i !== ri);
  if (!e.dominada) run.queue.splice(Math.min(CFG.respace, run.queue.length), 0, ri);
}
function qHead(p, q){
  const r = p.regras[q.regra];
  return `<div class="qmeta"><span class="tag" style="${rc(q.regra)}">${esc(r.nome)}</span><span class="small muted">Nível ${q.nivel}, ${NIVEIS[q.nivel]}</span><span class="small muted">${TIPOS[q.tipo]}</span></div>`;
}
function gainChips(g){ return g && g.length ? `<div class="gains">${g.map(x => `<span class="gain">${esc(x)}</span>`).join("")}</div>` : ""; }
function viewQuestaoTreino(p, run){
  const lr = App.lr;
  if (!lr.q || lr.q.phase !== "t"){ if (!lr.msg) setTimeout(nextTraining, 0); return lr.msg ? "" : `<section class="panel"><span class="spinner"></span>Preparando…</section>`; }
  const q = qById(p, lr.q.id);
  const fb = lr.fb;
  let fbHtml = "";
  if (fb){
    const e = run.estado[q.regra]; const r = p.regras[q.regra];
    const canReplay = p.video && p.video.youtube && r.videoInicio != null;
    if (fb.ok && fb.rapid) fbHtml = `<div class="fb warn"><h3>Certo, mas rápido demais</h3><p>Não deu tempo de ler a situação com calma, então esta resposta não pontua nem sobe de nível. A competência volta com outra situação.</p></div>`;
    else if (fb.ok) fbHtml = `<div class="fb ok"><h3>${e.dominada ? `Competência dominada: ${esc(r.nome)}` : "Certo!"}</h3>${gainChips(fb.gains)}<p>${esc(q.explicacao)}</p>${e.dominada ? "" : `<p class="small">Na próxima, uma situação real de ${esc(r.nome.toLowerCase())}.</p>`}</div>`;
    else fbHtml = `<div class="fb bad"><h3>Ainda não</h3><p>${esc(q.explicacao)}</p>
        ${q.tipo === "multipla" && q.equivocos && q.equivocos[fb.ans] ? `<p><b>Por que ${L[fb.ans]} engana:</b> ${esc(q.equivocos[fb.ans])}</p>` : (q.equivoco && q.tipo !== "multipla" ? `<p><b>Erro comum:</b> ${esc(q.equivoco)}</p>` : "")}
        <blockquote style="${rc(q.regra)}">${esc(r.texto)}</blockquote>
        <p class="small">A sequência zerou. Esta competência volta daqui a pouco, em outra situação.</p>
        ${canReplay ? (lr.replay ? videoBlock(p, r.videoInicio) : `<button class="link" data-act="replay">Rever este trecho do vídeo</button>`) : ""}</div>`;
    fbHtml += `<div class="actions"><button class="primary" data-act="next" autofocus>Próxima questão</button></div>`;
  }
  return `<section class="panel practice">
    <div class="phead"><div><p class="step">Etapa 2 de 3${run.round > 1 ? `, rodada ${run.round}` : ""}</p><h2>Prática</h2></div></div>
    ${gamebar(p, run)}
    ${ladders(p, run, q.regra)}
    <div class="question" style="${rc(q.regra)}">
      ${qHead(p, q)}
      <p class="q">${esc(q.enunciado)}</p>
      ${renderInput(q, lr.work, fb)}
      ${fbHtml}
    </div></section>`;
}
function viewPronto(p, run){
  const n = p.regras.length * CFG.evalPerRule;
  return `<section class="panel">
    <p class="step">Etapa 3 de 3</p><h2>Avaliação</h2>
    ${gamebar(p, run)}
    <p class="lead">Você dominou todas as competências. Agora, ${n} questões novas, ${CFG.evalPerRule} por competência, sem correção durante a prova.</p>
    <ul class="plain"><li>Para ser aprovado: pelo menos ${p.notaMinima}% e nenhum erro em competência crítica.</li>
    <li>Passar de primeira vale prata. Passar de primeira com 100% vale ouro.</li></ul>
    <p class="small muted">Se não passar, você pratica só o que errou e faz outra versão da prova.</p>
    <div class="actions"><button class="primary" data-act="startAval">Começar a avaliação</button></div></section>`;
}
function buildForm(p, run){
  const used = new Set(run.forms.flatMap(f => f.qids));
  const lastUse = id => { for (let j = run.forms.length - 1; j >= 0; j--) if (run.forms[j].qids.includes(id)) return j; return -1; };
  const ids = [];
  p.regras.forEach((r, ri) => {
    const all = pool(p, "avaliacao", ri); const types = {};
    for (let k = 0; k < CFG.evalPerRule; k++){
      const score = q => (ids.includes(q.id) ? 1000 : 0) + (used.has(q.id) ? 100 : 0) + (types[q.tipo] || 0) * 10 + Math.random();
      const best = [...all].sort((a, b) => score(a) - score(b) || lastUse(a.id) - lastUse(b.id))[0];
      if (best && !ids.includes(best.id)){ ids.push(best.id); types[best.tipo] = (types[best.tipo] || 0) + 1; }
    }
  });
  return shuffle(ids);
}
function viewQuestaoAval(p, run){
  const lr = App.lr;
  const f = run.forms[run.forms.length - 1];
  const k = f.ans.length;
  if (k >= f.qids.length){ setTimeout(finishForm, 0); return `<section class="panel"><span class="spinner"></span>Corrigindo…</section>`; }
  const q = qById(p, f.qids[k]);
  if (!lr.q || lr.q.id !== q.id || lr.q.phase !== "a") setQuestion(q, "a");
  return `<section class="panel">
    <div class="phead"><div><p class="step">Etapa 3 de 3${run.forms.length > 1 ? `, tentativa ${run.forms.length}` : ""}</p><h2>Avaliação</h2></div><p class="small muted">Questão ${k + 1} de ${f.qids.length}</p></div>
    <div class="bar"><div style="width:${pct(k, f.qids.length)}%"></div></div>
    <div class="question neutral">
      <div class="qmeta"><span class="small muted">${TIPOS[q.tipo]}</span></div>
      <p class="q">${esc(q.enunciado)}</p>
      ${renderInput(q, lr.work, null)}
    </div>
    <p class="small muted">Sem correção durante a avaliação.</p></section>`;
}
function scoreForm(p, f){
  const byRule = {};
  f.qids.forEach((id, k) => { const r = qById(p, id).regra; (byRule[r] = byRule[r] || []).push(f.ans[k]); });
  f.score = pct(f.ans.filter(Boolean).length, f.ans.length);
  f.missed = Object.keys(byRule).filter(i => byRule[i].includes(false)).map(Number);
  f.passed = !f.missed.some(i => p.regras[i].critica) && f.score >= p.notaMinima;
}
function finishForm(){
  const p = curProc(), run = curRun();
  const f = run.forms[run.forms.length - 1];
  if (f.done) return;
  scoreForm(p, f); f.done = Date.now();
  run.phase = "resultado"; App.lr.q = null;
  persist(); render();
}
function ruleList(p, idxs){ return `<ol class="rules compact">${idxs.map(i => `<li style="${rc(i)}"><h3>${esc(p.regras[i].nome)}${p.regras[i].critica ? ` <span class="tag crit">crítica</span>` : ""}</h3><p>${esc(p.regras[i].texto)}</p></li>`).join("")}</ol>`; }
function viewResultado(p, run){
  const f = run.forms[run.forms.length - 1];
  const nOk = f.ans.filter(Boolean).length;
  if (f.passed){
    const first = run.forms.filter(x => x.done).length === 1;
    const g = [`+${CFG.pts.aprovado} aprovação`]; if (first) g.push(`+${CFG.pts.dePrimeira} de primeira`); if (f.score === 100) g.push(`+${CFG.pts.gabarito} gabaritou`);
    return `<section class="panel result ok"><p class="score">${nOk}/${f.ans.length}</p><h2>Aprovado${first ? " de primeira" : ""}</h2>
      ${gainChips(g)}
      <p class="lead">${f.missed.length ? "Vale revisar o que você errou:" : "Tudo certo."}</p>
      ${f.missed.length ? ruleList(p, f.missed) : ""}
      <div class="actions"><button class="primary" data-act="finish">Receber a medalha</button></div></section>`;
  }
  const crit = f.missed.filter(i => p.regras[i].critica);
  return `<section class="panel result bad"><p class="score">${nOk}/${f.ans.length}</p><h2>Quase lá</h2>
    <p class="lead">${crit.length ? "Houve erro em competência crítica. " : ""}Você vai praticar só o que errou e depois fazer outra avaliação, com questões diferentes. Ainda dá bronze, e a pontuação continua.</p>
    ${ruleList(p, f.missed)}
    <div class="actions"><button class="primary" data-act="remediate">Praticar estas competências</button></div></section>`;
}
function viewConcluido(p, run){
  const f = run.forms.filter(x => x.done).slice(-1)[0];
  const m = medalOf(run); const R = rewards(p, run);
  return `<section class="panel result ok center">
    ${medalBadge(m, true)}
    <h2>Treinamento concluído</h2>
    <p class="bigpts"><b>${R.pts}</b> pontos</p>
    <p class="lead">Aprovado com ${f ? f.ans.filter(Boolean).length + " de " + f.ans.length : "—"} em ${run.forms.length} ${run.forms.length > 1 ? "tentativas" : "tentativa"}. Maior sequência: ${R.best} acertos.</p>
    <p class="small muted">${nextMedalHint(run)}</p>
    <div class="actions"><button data-act="back">Voltar</button><button class="link" data-act="refazer">Refazer do zero</button></div></section>`;
}
function onTreino(act, b){
  const lr = App.lr;
  if (act === "novoPart"){
    const nome = ($("#p-nome").value || "").trim(); if (!nome){ $("#p-nome").focus(); return; }
    const found = Object.entries(App.data.participantes).find(([, x]) => !x.demo && x.nome.toLowerCase() === nome.toLowerCase());
    const id = found ? found[0] : newId("u");
    if (!found) App.data.participantes[id] = {nome, runs: {}};
    App.data.atual = id; saveData(); return render();
  }
  if (act === "usarPart"){ App.data.atual = b.dataset.id; saveData(); return render(); }
  if (act === "trocar"){ App.data.atual = null; lr.pid = null; lr.q = null; saveData(); return render(); }
  if (act === "back"){ lr.pid = null; lr.q = null; lr.fb = null; lr.msg = ""; return render(); }
  if (act === "open"){ lr.pid = b.dataset.id; lr.q = null; lr.fb = null; lr.msg = ""; lr.studyT0 = Date.now(); return render(); }
  const p = curProc(); if (!p) return;
  if (act === "startTrain"){
    let run = curRun();
    if (!run){ run = newRun(p); me().runs[p.id] = run; }
    run.readMs = (run.readMs || 0) + (lr.studyT0 ? Date.now() - lr.studyT0 : 0);
    run.phase = "treino"; persist(); return nextTraining();
  }
  const run = curRun(); if (!run) return;
  if (run.phase === "treino" && lr.q && !lr.fb && ["pick","tog","up","down","assoc","confirm"].includes(act)){
    const q = qById(p, lr.q.id);
    const ans = handleInput(q, lr.work, act, b);
    if (ans === undefined) return render();
    const before = rewards(p, run), domBefore = (run.domEver || []).length;
    const r = recordAnswer(run, q, "t", ans);
    applyLadder(run, q.regra, r);
    const after = rewards(p, run); const gains = [];
    if (r.ok && !r.rapid){
      gains.push(`+${CFG.pts.acerto} acerto`);
      if (after.streak % CFG.pts.cadaSeq === 0) gains.push(`+${CFG.pts.sequencia} sequência de ${after.streak}`);
      if ((run.domEver || []).length > domBefore) gains.push(`+${CFG.pts.dominio} competência dominada`);
    }
    lr.fb = {ans, ok: r.ok, rapid: r.rapid, gains, delta: after.pts - before.pts};
    persist(); render();
    const fbEl = document.querySelector(".fb"); if (fbEl) fbEl.scrollIntoView({behavior: "smooth", block: "nearest"});
    return;
  }
  if (act === "replay"){ lr.replay = true; return render(); }
  if (act === "next"){ lr.q = null; lr.fb = null; return nextTraining(); }
  if (act === "startAval"){
    const qids = buildForm(p, run);
    if (qids.length < p.regras.length * CFG.evalPerRule){ lr.msg = "Faltam questões de avaliação para alguma competência no banco."; return render(); }
    run.forms.push({qids, ans: [], at: Date.now()}); run.phase = "avaliacao"; lr.q = null;
    persist(); return render();
  }
  if (run.phase === "avaliacao" && ["pick","tog","up","down","assoc","confirm"].includes(act)){
    const f = run.forms[run.forms.length - 1];
    const q = qById(p, f.qids[f.ans.length]);
    if (!lr.q || lr.q.id !== q.id) return;
    const ans = handleInput(q, lr.work, act, b);
    if (ans === undefined) return render();
    f.ans.push(recordAnswer(run, q, "a", ans).ok);
    lr.q = null; persist(); render(); window.scrollTo({top: 0, behavior: "instant"});
    return;
  }
  if (act === "remediate"){
    const f = run.forms[run.forms.length - 1];
    f.missed.forEach(i => run.estado[i] = {nivel: CFG.topLevel, dominada: false});
    run.queue = [...f.missed]; run.round = (run.round || 1) + 1; run.phase = "treino";
    persist(); return nextTraining();
  }
  if (act === "finish"){ run.phase = "concluido"; run.finished = Date.now(); persist(); return render(); }
  if (act === "refazer"){
    if (b.dataset.confirm !== "1"){ b.dataset.confirm = "1"; b.textContent = "Clique de novo para apagar seu progresso e recomeçar"; return; }
    delete me().runs[p.id]; lr.q = null; lr.studyT0 = Date.now(); persist(); return render();
  }
}

/* =====================================================================
   PAINEL DO GESTOR
   ===================================================================== */
function dashProc(){ return App.procs.find(p => p.id === App.dash.pid) || App.procs[0]; }
function computeDash(p){
  const parts = Object.entries(App.data.participantes).map(([id, x]) => ({id, ...x})).filter(x => x.runs && x.runs[p.id]);
  const runs = parts.map(x => ({part: x, run: x.runs[p.id]}));
  // tempo médio por questão (cada resposta limitada a 5 min) para o limiar normativo de resposta rápida
  const acc = {};
  runs.forEach(({run}) => run.answers.forEach(a => { const s = acc[a.q] = acc[a.q] || {n: 0, sum: 0}; s.n++; s.sum += Math.min(a.ms, CFG.idleCapMs); }));
  const stats = {}; Object.keys(acc).forEach(k => stats[k] = {n: acc[k].n, mean: acc[k].sum / acc[k].n});
  const now = Date.now();
  const finishedTimes = runs.filter(x => x.run.phase === "concluido").map(x => x.run.activeMs);
  const studyMin = Math.max(CFG.studyMinMs, words(p.regras.map(r => r.texto).join(" ")) * CFG.readMsPerWord * CFG.readFrac);
  const rows = runs.map(({part, run}) => {
    let rapid = 0;
    run.answers.forEach(a => { const q = qById(p, a.q); if (q && a.ms < rapidThreshold(q, stats)) rapid++; });
    const nAns = run.answers.length;
    const rte = nAns ? 1 - rapid / nAns : 1;
    const fastStudy = run.phase !== "estudo" && (run.readMs || 0) < studyMin;
    const guess = rapid >= CFG.minRapid && rte < CFG.rteMin;
    const concluded = run.phase === "concluido";
    const stalled = !concluded && (now - run.last) > CFG.abandonHours * 3600000;
    const doneForms = run.forms.filter(f => f.done);
    const last = doneForms[doneForms.length - 1];
    const dom = p.regras.filter((_, i) => run.estado[i] && run.estado[i].dominada).length;
    let status, sOrder;
    if (concluded){ status = "Concluiu"; sOrder = 4; }
    else if (stalled){ status = "Parou"; sOrder = 0; }
    else if (run.phase === "avaliacao" || run.phase === "pronto"){ status = "Em avaliação"; sOrder = 2; }
    else if (run.phase === "resultado" || run.round > 1){ status = "Refazendo"; sOrder = 1; }
    else { status = run.phase === "estudo" ? "No tutorial" : "Em prática"; sOrder = 3; }
    const R = rewards(p, run);
    return {id: part.id, name: part.nome, demo: !!part.demo, run, status, sOrder, stalled, concluded, rapid, nAns, rte,
      fastStudy, guess, attempts: doneForms.length, score: last ? last.score : null, firstPass: doneForms.length ? !!doneForms[0].passed : null,
      dom, last: run.last, activeMs: run.activeMs, pts: R.pts, medal: medalOf(run)};
  });
  const rules = p.regras.map((r, i) => {
    let fN = 0, fErr = 0, aN = 0, aErr = 0; const wrong = {}; let nWrong = 0;
    runs.forEach(({run}) => {
      const first = run.answers.find(a => a.r === i && a.ph === "t");
      if (first){ fN++; if (!first.ok) fErr++; }
      run.answers.filter(a => a.r === i).forEach(a => {
        if (a.ph === "a"){ aN++; if (!a.ok) aErr++; }
        if (!a.ok){ nWrong++; const q = qById(p, a.q); if (q){ const key = wrongNote(q, a.ch); if (key) wrong[key] = (wrong[key] || 0) + 1; } }
      });
    });
    const top = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
    return {i, nome: r.nome, critica: r.critica, fN, fErr, fRate: fN ? fErr / fN : 0, ci: wilson(fErr, fN), aN, aErr, aCi: wilson(aErr, aN),
      top: top ? top[0] : "", topN: top ? top[1] : 0, nWrong};
  });
  const expected = App.data.equipe[p.id] || 0;
  const medals = {ouro: 0, prata: 0, bronze: 0}; rows.forEach(r => { if (r.medal) medals[r.medal]++; });
  const reliable = rules.filter(r => r.fN >= CFG.minN).sort((a, b) => b.fRate - a.fRate);
  const focusClear = reliable.length > 1 && reliable[0].ci[0] > Math.max(...reliable.slice(1).map(r => r.ci[1]));
  return {rows, rules, medals, focus: reliable[0] || null, focusClear, tiles: {
    expected, started: rows.length, notStarted: expected ? Math.max(0, expected - rows.length) : null,
    inProgress: rows.filter(r => !r.concluded && !r.stalled).length, stalled: rows.filter(r => r.stalled).length,
    concluded: rows.filter(r => r.concluded).length, guess: rows.filter(r => r.guess || r.fastStudy).length,
    firstPass: rows.filter(r => r.firstPass === true).length, tookAval: rows.filter(r => r.firstPass !== null).length,
    medTime: median(finishedTimes), nFinished: finishedTimes.length}};
}
const pc = x => Math.round(100 * x) + "%";
const names = (list, max = 6) => list.length ? list.slice(0, max).map(r => `<b>${esc(r.name)}</b>`).join(", ") + (list.length > max ? ` e mais ${list.length - max}` : "") : "";
function viewActions(C){
  const t = C.tiles;
  const cobrar = C.rows.filter(r => r.stalled).sort((a, b) => a.last - b.last);
  const ouro = C.rows.filter(r => r.medal === "ouro").sort((a, b) => b.pts - a.pts);
  const prata = C.rows.filter(r => r.medal === "prata");
  const acomp = C.rows.filter(r => r.guess || r.fastStudy || (!r.concluded && r.attempts >= 2));
  const why = r => [r.guess ? "respostas rápidas demais" : "", r.fastStudy ? "pulou o tutorial" : "", !r.concluded && r.attempts >= 2 ? `${r.attempts} reprovações` : ""].filter(Boolean).join(", ");
  const f = C.focus;
  return `<section class="acts">
    <article class="act a-bad"><h3>Cobrar</h3>
      ${cobrar.length || t.notStarted ? `<p>${cobrar.length ? `${names(cobrar)} ${cobrar.length > 1 ? "pararam" : "parou"} há mais de ${CFG.abandonHours} h.` : ""} ${t.notStarted ? `${t.notStarted} ainda não ${t.notStarted > 1 ? "começaram" : "começou"}.` : ""}</p>` : `<p class="muted">Ninguém parado.</p>`}</article>
    <article class="act a-good"><h3>Reconhecer</h3>
      ${ouro.length ? `<p>Ouro: ${names(ouro)}.</p>` : `<p class="muted">Ninguém com ouro ainda.</p>`}
      ${prata.length ? `<p class="small">Prata: ${names(prata, 8)}.</p>` : ""}</article>
    <article class="act a-warn"><h3>Conversar</h3>
      ${acomp.length ? `<ul>${acomp.slice(0, 5).map(r => `<li><b>${esc(r.name)}</b>: ${why(r)}</li>`).join("")}</ul>${acomp.length > 5 ? `<p class="small muted">e mais ${acomp.length - 5}</p>` : ""}` : `<p class="muted">Nenhum sinal de chute ou dificuldade repetida.</p>`}</article>
    <article class="act a-info" style="${f ? rc(f.i) : ""}"><h3>Reforçar na reunião</h3>
      ${f ? `<p><b>${esc(f.nome)}</b>: ${pc(f.fRate)} erram na primeira vez (${f.fErr} de ${f.fN}).</p>
          <p class="small muted">${C.focusClear ? "Destaca-se das demais (intervalos de confiança não se sobrepõem)." : "Ainda sem diferença clara para as demais; confirme com mais dados."}</p>
          ${f.top ? `<p class="small">Erro mais comum: ${esc(f.top)}</p>` : ""}`
          : `<p class="muted">Poucos dados: espere pelo menos ${CFG.minN} pessoas por competência.</p>`}</article>
  </section>`;
}
function viewDash(){
  const p = dashProc(); if (!p) return `<section class="panel">Nenhum treinamento no banco.</section>`;
  const d = App.dash; const C = computeDash(p); const t = C.tiles;
  const hasDemo = Object.values(App.data.participantes).some(x => x.demo);
  const sorters = {status: (a, b) => a.sOrder - b.sOrder || b.last - a.last, nome: (a, b) => a.name.localeCompare(b.name),
    pts: (a, b) => b.pts - a.pts, rte: (a, b) => a.rte - b.rte, tempo: (a, b) => (a.activeMs || 0) - (b.activeMs || 0), ultimo: (a, b) => a.last - b.last};
  const rows = [...C.rows].sort(sorters[d.sort] || sorters.status);
  const stCls = {Concluiu: "s-good", Parou: "s-bad", Refazendo: "s-warn"};
  const flags = r => { const f = [];
    if (r.guess) f.push(`<span class="flag" title="${r.rapid} de ${r.nAns} respostas abaixo do tempo mínimo de leitura">${r.rapid} rápidas demais</span>`);
    if (r.fastStudy) f.push(`<span class="flag">pulou o tutorial</span>`);
    if (r.attempts > 1) f.push(`<span class="flag neutral">${r.attempts} avaliações</span>`);
    return f.join("") || `<span class="muted">—</span>`; };
  const funnel = [["Não iniciaram", t.notStarted, "neutral"], ["Em andamento", t.inProgress, "info"], ["Pararam no meio", t.stalled, "bad"], ["Concluíram", t.concluded, "good"]];
  const total = (t.notStarted || 0) + t.started;
  const rateCell = (k, n, ci) => n ? `${pc(k / n)} <small class="muted">${n >= CFG.minN ? `(${pc(ci[0])}–${pc(ci[1])})` : "poucos dados"}</small>` : "—";
  return `<section class="dhead">
      <div><h2>Painel do gestor</h2><p class="small muted">${esc(p.titulo)}</p></div>
      <div class="dtools">
        ${App.procs.length > 1 ? `<select id="d-proc">${App.procs.map(x => `<option value="${esc(x.id)}" ${x.id === p.id ? "selected" : ""}>${esc(x.titulo)}</option>`).join("")}</select>` : ""}
        <label class="inline small">Tamanho da equipe <input type="number" id="d-equipe" min="0" value="${t.expected || ""}" placeholder="0"></label>
        ${hasDemo ? `<button data-act="undemo">Remover dados fictícios</button>` : `<button data-act="demo">Gerar dados fictícios</button>`}
        <button data-act="csv">Baixar planilha</button>
        <button data-act="export">Exportar dados</button>
        <label class="btn">Importar dados<input type="file" id="d-import" accept="application/json" hidden></label>
      </div></section>
    ${d.msg ? `<p class="note">${esc(d.msg)}</p>` : ""}
    ${viewActions(C)}
    <section class="kpis">
      ${total ? `<div class="stack" role="img" aria-label="Situação da equipe">${funnel.map(([l, v, c]) => v ? `<i class="${c}" style="flex:${v}" title="${l}: ${v}"></i>` : "").join("")}</div>` : ""}
      <div class="kgrid">
        ${funnel.map(([l, v, c]) => `<div class="k"><span class="dot ${c}"></span><b>${v == null ? "—" : v}</b><span>${l}</span>${l === "Não iniciaram" && !t.expected ? `<small>informe o tamanho da equipe</small>` : ""}</div>`).join("")}
        <div class="k"><b>${t.tookAval ? pct(t.firstPass, t.tookAval) + "%" : "—"}</b><span>Aprovados de primeira</span>${t.tookAval ? `<small>${t.firstPass} de ${t.tookAval} que fizeram a avaliação</small>` : ""}</div>
        <div class="k"><span class="dot warn"></span><b>${t.guess}</b><span>Possível chute</span><small>respostas rápidas ou tutorial pulado</small></div>
        <div class="k"><b>${fmtMin(t.medTime)}</b><span>Tempo típico até concluir</span>${t.nFinished ? `<small>mediana de ${t.nFinished}</small>` : ""}</div>
        <div class="k"><b class="medals"><span class="mdot m-ouro"></span>${C.medals.ouro} <span class="mdot m-prata"></span>${C.medals.prata} <span class="mdot m-bronze"></span>${C.medals.bronze}</b><span>Medalhas</span><small>ouro, prata, bronze</small></div>
      </div></section>
    <section class="panel wide">
      <h3>Onde a equipe mais erra</h3>
      <p class="small muted">Erro na primeira questão de cada competência, antes de qualquer correção. A faixa clara é o intervalo de confiança de 95%: faixas que se sobrepõem não indicam diferença real.</p>
      <div class="hbars">${C.rules.map(r => `<div class="hb" style="${rc(r.i)}"><span class="lab">${esc(r.nome)}${r.critica ? ` <span class="tag crit">crítica</span>` : ""}</span>
        <span class="track" title="${r.fErr} de ${r.fN} erraram na 1ª vez">${r.fN >= CFG.minN ? `<span class="ci" style="left:${r.ci[0] * 100}%;width:${(r.ci[1] - r.ci[0]) * 100}%"></span>` : ""}<span class="fill" style="width:${r.fRate * 100}%"></span></span>
        <span class="val">${r.fN ? pc(r.fRate) : "—"}</span></div>`).join("")}<div class="hb axis"><span></span><span class="ticks"><i>0%</i><i>50%</i><i>100%</i></span><span></span></div></div>
      <div class="tablewrap"><table><thead><tr><th>Competência</th><th class="n">Erro na 1ª vez</th><th class="n">Erro na avaliação</th><th>Erro mais comum</th></tr></thead>
      <tbody>${C.rules.map(r => `<tr><td><span class="sw" style="${rc(r.i)}"></span>${esc(r.nome)}</td>
        <td class="n">${rateCell(r.fErr, r.fN, r.ci)}<br><small class="muted">${r.fN} pessoas</small></td>
        <td class="n">${rateCell(r.aErr, r.aN, r.aCi)}<br><small class="muted">${r.aN} respostas</small></td>
        <td>${r.top ? esc(r.top) + ` <span class="muted">(${r.topN} de ${r.nWrong} erros)</span>` : "—"}</td></tr>`).join("")}</tbody></table></div>
    </section>
    <section class="panel wide">
      <h3>Participantes</h3>
      <div class="tablewrap"><table class="people"><thead><tr>
        <th><button class="th" data-act="sort" data-k="nome">Nome</button></th><th><button class="th" data-act="sort" data-k="status">Situação</button></th><th>Medalha</th>
        <th class="n"><button class="th" data-act="sort" data-k="pts">Pontos</button></th><th>Competências</th>
        <th class="n"><button class="th" data-act="sort" data-k="tempo">Tempo</button></th><th class="n"><button class="th" data-act="sort" data-k="rte">Esforço</button></th><th class="n">Nota</th><th>Sinais</th><th><button class="th" data-act="sort" data-k="ultimo">Última atividade</button></th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(r.name)}${r.demo ? ` <span class="muted" title="Participante fictício">(fictício)</span>` : ""}</td>
        <td><span class="status ${stCls[r.status] || "s-info"}">${r.status}</span></td>
        <td>${medalBadge(r.medal) || `<span class="muted">—</span>`}</td><td class="n"><b>${r.pts}</b></td>
        <td><span class="mini">${p.regras.map((_, i) => `<i style="${rc(i)}" class="${r.concluded || (r.run.estado[i] && r.run.estado[i].dominada) ? "on" : ""}"></i>`).join("")}</span></td>
        <td class="n">${fmtMin(r.activeMs)}</td><td class="n">${r.nAns ? pc(r.rte) : "—"}</td><td class="n">${r.score == null ? "—" : r.score + "%"}</td>
        <td><div class="flags">${flags(r)}</div></td><td class="small">${fmtAgo(r.last)}</td></tr>`).join("")
        || `<tr><td colspan="10" class="muted">Ninguém começou este treinamento neste navegador. Use “Gerar dados fictícios” para ver o painel funcionando ou “Importar dados” para trazer resultados de outros aparelhos.</td></tr>`}</tbody></table></div>
      <p class="small muted">Esforço: proporção de respostas dadas com tempo para ler a questão. Pontos e medalhas não premiam velocidade.</p>
    </section>`;
}
function download(name, text, type){
  const blob = new Blob([text], {type});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function toCSV(p){
  const C = computeDash(p);
  const head = ["Nome", "Situação", "Medalha", "Pontos", "Competências dominadas", "Tempo ativo (min)", "Esforço (%)", "Nota (%)", "Avaliações", "Respostas rápidas", "Pulou tutorial", "Última atividade"];
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = C.rows.map(r => [r.name, r.status, r.medal ? MEDALHAS[r.medal] : "", r.pts, r.concluded ? p.regras.length : r.dom,
    (r.activeMs / 60000).toFixed(1).replace(".", ","), r.nAns ? Math.round(r.rte * 100) : "", r.score ?? "", r.attempts, r.rapid, r.fastStudy ? "sim" : "não",
    new Date(r.last).toLocaleString("pt-BR")].map(q).join(";"));
  return "﻿" + [head.map(q).join(";"), ...lines].join("\r\n");
}
function onDash(act, b){
  const d = App.dash; const p = dashProc();
  if (act === "sort"){ d.sort = b.dataset.k; return render(); }
  if (act === "demo"){ simulate(p).forEach(([id, part]) => App.data.participantes[id] = part); if (!App.data.equipe[p.id]) App.data.equipe[p.id] = 20; saveData(); d.msg = "16 participantes fictícios criados, numa equipe de 20."; return render(); }
  if (act === "undemo"){ Object.keys(App.data.participantes).forEach(id => { if (App.data.participantes[id].demo) delete App.data.participantes[id]; }); saveData(); d.msg = "Dados fictícios removidos."; return render(); }
  if (act === "csv") return download(`participantes-${p.id}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(p), "text/csv;charset=utf-8");
  if (act === "export") return download("resultados-treino-" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify({tipo: "treinoSaude", versao: 2, exportadoEm: new Date().toISOString(), participantes: App.data.participantes}, null, 1), "application/json");
}
function importFile(file){
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result);
      if (!j || typeof j.participantes !== "object") throw new Error("o arquivo não tem participantes");
      let n = 0;
      Object.entries(j.participantes).forEach(([id, part]) => {
        const cur = App.data.participantes[id];
        if (!cur){ App.data.participantes[id] = part; n++; return; }
        Object.entries(part.runs || {}).forEach(([pid, run]) => { if (!cur.runs[pid] || (run.last || 0) > (cur.runs[pid].last || 0)) cur.runs[pid] = run; });
        n++;
      });
      saveData(); App.dash.msg = `${n} participante(s) importado(s) ou atualizado(s).`;
    } catch(e){ App.dash.msg = "Não foi possível importar: " + e.message + "."; }
    render();
  };
  rd.readAsText(file);
}

/* ---------------- Dados fictícios (demonstração) ---------------- */
function randomAnswer(q, ok){
  if (q.tipo === "multipla"){ if (ok) return q.correta; const w = [0, 1, 2, 3].filter(k => k !== q.correta); return w[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * 3)]; }
  if (q.tipo === "vf") return ok ? q.correta : !q.correta;
  if (q.tipo === "multiselect"){ const s = [...q.corretas]; if (!ok){ const extra = q.alternativas.map((_, i) => i).filter(i => !s.includes(i)); if (extra.length) s.push(extra[0]); else s.pop(); } return s; }
  if (q.tipo === "ordenar"){ const o = q.itens.map((_, i) => i); if (!ok) [o[0], o[1]] = [o[1], o[0]]; return o; }
  if (q.tipo === "associar"){ const s = q.pares.map(p => p.resposta); if (!ok) s[0] = (s[0] + 1) % q.opcoes.length; return s; }
}
function simulate(p){
  const NAMES = ["Ana P.","Bruno S.","Carla M.","Diego R.","Elisa F.","Fábio T.","Gabriela L.","Hugo A.","Isabel C.","João V.","Karina O.","Lucas B.","Marta D.","Nilton G.","Olívia E.","Paulo H."];
  const PROFS = ["bom","bom","bom","bom","bom","medio","medio","medio","apressado","apressado","parado","parado","medio","bom","novo","novo"];
  const diff = p.regras.map((r, i) => r.critica ? 0.38 : [0.1, 0.25, 0.3][i % 3]);
  const lvlPen = {1: -0.1, 2: 0.08};
  const typePen = {multipla: 0, vf: -0.05, multiselect: 0.1, ordenar: 0.06, associar: 0.08};
  const rnd = (a, b) => a + Math.random() * (b - a);
  return NAMES.map((nome, n) => {
    const prof = PROFS[n]; const run = newRun(p);
    let t = Date.now() - (prof === "parado" ? rnd(4, 9) : rnd(0.3, 6)) * 86400000;
    run.started = t; run.readMs = prof === "apressado" ? rnd(4000, 12000) : rnd(45000, 150000); t += run.readMs; run.phase = "treino";
    const skill = prof === "bom" ? 0.12 : 0;
    const answer = (q, ph) => {
      const tries = run.answers.filter(a => a.r === q.regra).length;
      const pOk = prof === "apressado" ? 0.55 : Math.max(0.2, Math.min(0.97, 1 - diff[q.regra] - lvlPen[q.nivel] - typePen[q.tipo] + skill + tries * 0.06));
      const ok = Math.random() < pOk;
      const ms = Math.round(prof === "apressado" ? rnd(1200, 3400) : Math.max(4000, expectedReadMs(q) * rnd(0.6, 1.4)));
      const rp = ms < rapidThreshold(q);
      t += ms + rnd(2000, 8000);
      run.answers.push({q: q.id, r: q.regra, n: q.nivel, ph, ok, rp, ch: randomAnswer(q, ok), ms, at: t});
      run.activeMs += Math.min(ms, CFG.idleCapMs); if (ph === "t") run.seen.push(q.id);
      return {ok, rapid: rp};
    };
    const train = max => {
      for (let s = 0; s < max; s++){
        const pending = p.regras.map((_, i) => i).filter(i => !run.estado[i].dominada);
        if (!pending.length){ run.phase = "pronto"; return true; }
        run.queue = run.queue.filter(i => pending.includes(i)); pending.forEach(i => { if (!run.queue.includes(i)) run.queue.push(i); });
        const ri = run.queue[0]; const q = pickTrain(p, run, ri, run.estado[ri].nivel);
        applyLadder(run, ri, answer(q, "t"));
        if (prof === "apressado" && s > 5 && Math.random() < 0.35) p.regras.forEach((_, i) => run.estado[i].dominada = true);
      }
      return false;
    };
    let ok = train(prof === "parado" ? Math.floor(rnd(2, 5)) : prof === "novo" ? Math.floor(rnd(1, 3)) : 60);
    for (let k = 0; ok && k < 3; k++){
      const f = {qids: buildForm(p, run), ans: [], at: t}; run.forms.push(f);
      f.qids.forEach(id => f.ans.push(answer(qById(p, id), "a").ok));
      scoreForm(p, f); f.done = t;
      if (f.passed){ run.phase = "concluido"; run.finished = t; break; }
      f.missed.forEach(i => run.estado[i] = {nivel: CFG.topLevel, dominada: false}); run.queue = [...f.missed]; run.round++; run.phase = "treino";
      if (prof === "medio" && Math.random() < 0.3) break;
      ok = train(40);
    }
    run.last = Math.min(t, Date.now() - (prof === "parado" ? 4 * 86400000 : 60000));
    return ["demo-" + (n + 1), {nome, demo: true, runs: {[p.id]: run}}];
  });
}

/* =====================================================================
   BANCO DE QUESTÕES
   ===================================================================== */
function bankItem(q){
  let body = "";
  if (q.tipo === "multipla") body = `<ol type="A" class="bopts">${q.alternativas.map((o, k) => `<li class="${k === q.correta ? "c" : ""}">${esc(o)}${k !== q.correta && q.equivocos && q.equivocos[k] ? `<small>${esc(q.equivocos[k])}</small>` : ""}</li>`).join("")}</ol>`;
  else if (q.tipo === "vf") body = `<p class="bopts"><span class="c">${q.correta ? "Verdadeiro" : "Falso"}</span></p>`;
  else if (q.tipo === "multiselect") body = `<ul class="bopts">${q.alternativas.map((o, k) => `<li class="${q.corretas.includes(k) ? "c" : ""}">${q.corretas.includes(k) ? "☑" : "☐"} ${esc(o)}<small>${esc((q.notas || [])[k] || "")}</small></li>`).join("")}</ul>`;
  else if (q.tipo === "ordenar") body = `<ol class="bopts">${q.itens.map(o => `<li>${esc(o)}</li>`).join("")}</ol>`;
  else if (q.tipo === "associar") body = `<ul class="bopts">${q.pares.map(pr => `<li>${esc(pr.item)} <span class="c">${esc(q.opcoes[pr.resposta])}</span></li>`).join("")}</ul>`;
  return body;
}
function viewBank(){
  const B = App.bank;
  const p = App.procs.find(x => x.id === B.pid) || App.procs[0]; if (!p) return "";
  const qs = p.questoes.filter(q => (B.regra === "" || q.regra === Number(B.regra)) && (B.nivel === "" || q.nivel === Number(B.nivel)) && (B.uso === "" || q.uso === B.uso) && (B.tipo === "" || q.tipo === B.tipo));
  const cnt = (ri, uso, n) => p.questoes.filter(q => q.regra === ri && q.uso === uso && (n == null || q.nivel === n)).length;
  const tipos = {}; p.questoes.forEach(q => tipos[q.tipo] = (tipos[q.tipo] || 0) + 1);
  return `<section class="dhead"><div><h2>Questões</h2><p class="small muted">${esc(p.titulo)}: ${p.questoes.length} questões. ${Object.entries(tipos).map(([k, v]) => `${TIPOS[k]}: ${v}`).join("; ")}.</p></div></section>
  <section class="panel wide">
    <p class="small">As questões ficam em <code>dados/${esc(p.id)}.json</code>. Para criar outro treinamento, use o <code>PROMPT_GERAR_QUESTOES.md</code> com uma IA, revise o resultado e acrescente o arquivo em <code>dados/procedimentos.json</code>.</p>
    <div class="tablewrap"><table class="grid-count"><thead><tr><th>Competência</th><th class="n">Prática, nível 1</th><th class="n">Prática, nível 2</th><th class="n">Avaliação</th></tr></thead>
    <tbody>${p.regras.map((r, i) => `<tr><td><span class="sw" style="${rc(i)}"></span>${esc(r.nome)}</td><td class="n">${cnt(i, "treino", 1)}</td><td class="n">${cnt(i, "treino", 2)}</td><td class="n">${cnt(i, "avaliacao")}</td></tr>`).join("")}</tbody></table></div>
  </section>
  <section class="panel wide">
    <div class="filters">
      <select id="b-regra" aria-label="Competência"><option value="">Todas as competências</option>${p.regras.map((r, i) => `<option value="${i}" ${B.regra === String(i) ? "selected" : ""}>${esc(r.nome)}</option>`).join("")}</select>
      <select id="b-nivel" aria-label="Nível"><option value="">Todos os níveis</option>${[1, 2].map(n => `<option value="${n}" ${B.nivel === String(n) ? "selected" : ""}>Nível ${n}, ${NIVEIS[n]}</option>`).join("")}</select>
      <select id="b-tipo" aria-label="Formato"><option value="">Todos os formatos</option>${Object.keys(TIPOS).map(k => `<option value="${k}" ${B.tipo === k ? "selected" : ""}>${TIPOS[k]}</option>`).join("")}</select>
      <select id="b-uso" aria-label="Uso"><option value="">Prática e avaliação</option><option value="treino" ${B.uso === "treino" ? "selected" : ""}>Só prática</option><option value="avaliacao" ${B.uso === "avaliacao" ? "selected" : ""}>Só avaliação</option></select>
      <span class="small muted">${qs.length} questões</span>
    </div>
    ${qs.map(q => `<article class="bitem" style="${rc(q.regra)}">
      <div class="qmeta"><span class="tag">${esc(p.regras[q.regra].nome)}</span><span class="small muted">${q.uso === "avaliacao" ? "Avaliação" : "Prática"}, nível ${q.nivel}, ${TIPOS[q.tipo].toLowerCase()}</span><code class="small">${esc(q.id)}</code></div>
      <p>${esc(q.enunciado)}</p>${bankItem(q)}<p class="small muted">${esc(q.explicacao)}</p></article>`).join("")}
  </section>`;
}

/* =====================================================================
   COMO FUNCIONA
   ===================================================================== */
function viewMetodo(){
  const P = CFG.pts;
  return `<section class="panel method">
  <h2>Como funciona</h2>
  <p class="lead">Curto de propósito: três competências, cerca de 5 minutos. A prática ensina com correção na hora; a avaliação certifica com questões inéditas.</p>
  <ol class="flow">
    <li><h3>Tutorial</h3><p>As três competências, com espaço para um vídeo curto.</p></li>
    <li><h3>Prática em dois degraus</h3><p>Cada competência começa no básico. Acertou, vai para uma situação real; acertou de novo, está dominada. Errou, desce e a competência volta em outra situação.</p></li>
    <li><h3>Avaliação</h3><p>Duas questões inéditas por competência, sem correção na hora. Aprova com ${App.procs[0] ? App.procs[0].notaMinima : 80}% e nenhum erro em competência crítica.</p></li>
    <li><h3>Remediação</h3><p>Quem não passa pratica só o que errou e faz outra versão da prova.</p></li>
  </ol>
  <h3>Pontos e medalhas</h3>
  <div class="tablewrap"><table><tbody>
    <tr><td>Acerto na prática</td><td class="n">+${P.acerto}</td></tr>
    <tr><td>A cada ${P.cadaSeq} acertos seguidos</td><td class="n">+${P.sequencia}</td></tr>
    <tr><td>Competência dominada</td><td class="n">+${P.dominio}</td></tr>
    <tr><td>Aprovação / de primeira / com 100%</td><td class="n">+${P.aprovado} / +${P.dePrimeira} / +${P.gabarito}</td></tr>
    <tr><td>Resposta rápida demais (sem tempo de ler)</td><td class="n">0</td></tr></tbody></table></div>
  <p><span class="medal m-bronze"><i></i>Bronze</span> concluiu. <span class="medal m-prata"><i></i>Prata</span> aprovado na primeira avaliação. <span class="medal m-ouro"><i></i>Ouro</span> primeira avaliação com 100% e no máximo uma resposta rápida demais.</p>
  <p class="small muted">Recompensa por fazer (bronze, pontos por acerto) e por fazer bem (prata, ouro, sequência). Nada premia velocidade, para não incentivar o chute. A medalha é um critério objetivo que a empresa pode usar para reconhecimento ou bonificação.</p>
  <h3>Como ler o painel</h3>
  <dl class="defs">
    <dt>Erro na 1ª vez</dt><dd>Proporção de pessoas que erraram a primeira questão de cada competência, antes de qualquer correção. É a melhor medida do que o treinamento ou a rotina não deixam claro. Vem com intervalo de confiança de 95% (Wilson); com menos de ${CFG.minN} pessoas, aparece “poucos dados” e não entra no “Reforçar na reunião”.</dd>
    <dt>Resposta rápida demais</dt><dd>Dada antes do tempo mínimo de leitura: 10% do tempo médio da equipe naquela questão, entre 3 e 10 segundos (Wise &amp; Ma, 2012); com poucos dados, 25% do tempo estimado de leitura. “Possível chute” exige pelo menos ${CFG.minRapid} respostas rápidas e esforço abaixo de ${Math.round(CFG.rteMin * 100)}%, para uma única resposta apressada não marcar ninguém.</dd>
    <dt>Concluir rápido não é sinal ruim</dt><dd>Quem já sabe acerta de primeira e responde menos questões. Por isso o painel olha o tempo de cada resposta, não o tempo total.</dd>
    <dt>Parou</dt><dd>Começou e está há mais de ${CFG.abandonHours} horas sem atividade.</dd>
  </dl>
  <h3>Limitações</h3>
  <p class="small">Com 6 questões, a avaliação confirma o básico, mas não mede com precisão fina; para comparar pessoas, use a tendência (pontos, medalhas, erros na 1ª vez), não uma questão isolada. Sem login, o progresso fica no navegador de quem treinou: para juntar a equipe, cada aparelho usa Exportar dados e o gestor usa Importar dados.</p>
  </section>`;
}

/* ---------------- Início ---------------- */
(async function init(){
  loadData();
  window.addEventListener("hashchange", route);
  await loadProcs();
  if (App.procs[0]){ App.dash.pid = App.procs[0].id; App.bank.pid = App.procs[0].id; }
  route();
})();
