/* Planejamento de Safra 26/27 — app estático (sem backend).
   Dados base em data.json; edições do usuário ficam no localStorage. */
'use strict';

const APP_VERSION = '2026.07.06-19';   // mostrado no rodapé; ajude a confirmar se a atualização chegou
const LS_KEY = 'planejamento_safra_2627_v1';
const MOD_KEY = 'planejamento_modulo';   // 'planejamento' | 'campo' (qual módulo está ativo)
// a qual módulo cada tela pertence ('both' = aparece nos dois)
const VIEW_MOD = { inicio:'both', dashboard:'planejamento', talhoes:'planejamento', talhao:'planejamento',
  empreendimentos:'planejamento', compras:'planejamento', cotacao:'planejamento',
  maquinas:'planejamento', dre:'planejamento', campo:'campo', sync:'both' };
function currentModule(){ return localStorage.getItem(MOD_KEY)==='campo'?'campo':'planejamento'; }
function moduleHome(m){ return m==='campo'?'#/campo':'#/dashboard'; }
const MOD_INFO = { planejamento:{ico:'📋',nome:'Planejamento'}, campo:{ico:'🧑‍🌾',nome:'Campo'} };
function applyModule(){
  const m=currentModule();
  document.querySelectorAll('#nav a').forEach(a=>{ const mods=(a.dataset.mod||'').split(' '); a.hidden=!mods.includes(m); });
  const cur=document.getElementById('mod-cur');
  if(cur){ const info=MOD_INFO[m]; cur.innerHTML=`<span class="mc-ico">${info.ico}</span><span class="mc-name">${info.nome}</span>`; }
  document.body.dataset.mod=m;
}
let DATA = null;          // dados base (data.json)
let OV = null;            // overrides do usuário
let PROD = {};            // produto -> objeto do produto
const collapsedOps = new Set(); // operações recolhidas (chave "TL|tagOp"); só na sessão
const openCards = new Set();     // cartões abertos (detalhes) que devem continuar abertos após re-render

/* ---------------- persistência ---------------- */
function loadOverrides(){
  try{ OV = JSON.parse(localStorage.getItem(LS_KEY)) || {}; }catch(e){ OV = {}; }
  OV.estoque = OV.estoque || {};
  OV.pedido  = OV.pedido  || {};   // produto -> qtd já em pedido (abate da demanda; sincroniza com a coluna EM PEDIDO)
  OV.talhao  = OV.talhao  || {};   // id -> {area, produtividade}
  OV.dose    = OV.dose    || {};   // "TL|op|item" -> valor
  OV.preco   = {};   // preço não é mais editável no app — segue sempre a planilha (descarta ajustes locais antigos)
  OV.cultura = OV.cultura || {};   // empreendimento -> preço venda
  OV.maquina = OV.maquina || {};   // conjunto -> R$/HM
  OV.opMaq   = OV.opMaq   || {};   // "TL|tagOp" -> conjunto atribuído
  OV.dreOp   = OV.dreOp   || {};   // empreendimento -> custo operação R$/ha
  OV.arrend  = OV.arrend  || {};   // empreendimento -> arrendamento/outros R$/ha
  OV.itemRemoved = OV.itemRemoved || {}; // "TL|tagOp|ii" -> true (insumo base removido)
  OV.itemProd    = OV.itemProd    || {}; // "TL|tagOp|ii" -> produto (troca do insumo base)
  OV.itemAdd     = OV.itemAdd     || {}; // "TL|tagOp" -> [{produto,dose}] (insumos adicionados)
  OV.talhaoAdd     = OV.talhaoAdd     || []; // talhões criados: [{id,nome,empreendimento,produtividade,area,plano}]
  OV.talhaoRemoved = OV.talhaoRemoved || {}; // idBase -> true (talhão base ocultado)
  OV.maqAttr       = OV.maqAttr       || {}; // conjunto -> {largura,velocidade,eficiencia,l_h}
  OV.maqAdd        = OV.maqAdd        || []; // conjuntos montados: [{conjunto,maquina,implemento,largura,velocidade,eficiencia,l_h,rs_hm}]
  OV.opAdd         = {}; // operações agora são os 12 slots da planilha (por posição) — descarta operações locais antigas
  OV.realizado     = OV.realizado     || {}; // "TL|tagOp" -> {status,data,obs,doses:{iid:dose},extras:[{produto,dose}]} (modo Campo — local)
  if(OV.diesel==null) OV.diesel = 6.00; // R$/L (global)
}
function saveOverrides(){
  localStorage.setItem(LS_KEY, JSON.stringify(OV));
  if(DATA) buildMaqIndex();
  updateEditBadge();
  if(typeof scheduleAutoPush==='function') scheduleAutoPush(); // envia edições à planilha (auto, com debounce)
}
function countEdits(){
  return Object.keys(OV.estoque).length + Object.keys(OV.pedido).length + Object.keys(OV.dose).length +
         Object.keys(OV.cultura).length +
         Object.keys(OV.maquina).length + Object.keys(OV.dreOp).length +
         Object.keys(OV.opMaq).length + Object.keys(OV.arrend).length + (OV.diesel!==6.00?1:0) +
         Object.keys(OV.itemRemoved).length + Object.keys(OV.itemProd).length +
         Object.values(OV.itemAdd).reduce((a,arr)=>a+arr.length,0) +
         OV.talhaoAdd.length + Object.keys(OV.talhaoRemoved).length +
         Object.keys(OV.maqAttr).length + OV.maqAdd.length +
         Object.values(OV.opAdd).reduce((a,o)=>a+(o.P||[]).length+(o.S||[]).length,0) +
         Object.values(OV.talhao).reduce((a,t)=>a+Object.keys(t).length,0);
}

/* ---------------- acessores (base + override) ---------------- */
const estoqueDe = p => (p in OV.estoque) ? +OV.estoque[p] : (PROD[p] ? PROD[p].estoque : 0);
const pedidoDe  = p => (p in OV.pedido)  ? +OV.pedido[p]  : (PROD[p] ? (+PROD[p].pedido||0) : 0);
const precoDe   = p => (PROD[p] ? PROD[p].preco : 0);   // preço SEMPRE da planilha (lista importada)
function areaDe(t){ const o=OV.talhao[t.id]; return o && o.area!=null ? +o.area : t.area; }
function prodvDe(t){ const o=OV.talhao[t.id]; return o && o.produtividade!=null ? +o.produtividade : t.produtividade; }
const doseKey = (tid,oi,ii)=>`${tid}|${oi}|${ii}`;
function doseDe(tid,oi,ii,base){ const k=doseKey(tid,oi,ii); return (k in OV.dose)?+OV.dose[k]:base; }
// itens EFETIVOS de uma operação (base sem removidos, com trocas/doses, + adicionados)
function effItems(tid, tagoi, baseItens){
  const out=[];
  (baseItens||[]).forEach((it,ii)=>{
    const rk=`${tid}|${tagoi}|${ii}`;
    if(OV.itemRemoved[rk]) return;
    const produto=(rk in OV.itemProd)?OV.itemProd[rk]:it.produto;
    const p=PROD[produto];
    out.push({produto, classe:(p&&p.classe)||it.classe||'', un:(p&&p.un)||it.un||'',
      dose:(rk in OV.dose)?+OV.dose[rk]:it.dose, key:rk, kind:'base', ii,
      doseEdited:(rk in OV.dose), prodEdited:(rk in OV.itemProd)});
  });
  (OV.itemAdd[`${tid}|${tagoi}`]||[]).forEach((a,ai)=>{
    const p=PROD[a.produto];
    out.push({produto:a.produto||'', classe:(p&&p.classe)||'', un:(p&&p.un)||'',
      dose:+a.dose||0, key:`${tid}|${tagoi}|a${ai}`, kind:'add', ai, doseEdited:true, prodEdited:false});
  });
  return out;
}
// ---- talhões: base (não removidos, não vazios) + criados ----
// talhão "vazio" = placeholder da planilha sem cultura, sem safrinha e sem área
function talhaoVazio(t){ return !(t.empreendimento||'').trim() && !(t.emp_safrinha||'').trim() && (+t.area||0)===0; }
function talhoesAll(){ return DATA.talhoes.filter(t=>!OV.talhaoRemoved[t.id] && !talhaoVazio(t)).concat(OV.talhaoAdd); }
function findTalhao(id){ return DATA.talhoes.find(t=>t.id===id) || OV.talhaoAdd.find(t=>t.id===id); }
function planoDe(id){
  if(id in DATA.planos) return DATA.planos[id];
  const c=OV.talhaoAdd.find(t=>t.id===id);
  return (c&&c.plano)||{principal:[],safrinha:[]};
}
function nextTalhaoId(){ let n=1; while(findTalhao('NV'+n)) n++; return 'NV'+n; }
// materializa o plano EFETIVO (com edições) em estrutura simples — para duplicar
function snapshotPlano(id){
  const pl=planoDe(id), snap={principal:[],safrinha:[]};
  ['principal','safrinha'].forEach(seq=>{
    const tag=seq==='safrinha'?'S':'P';
    (pl[seq]||[]).forEach((op,oi)=>{
      const itens=effItems(id,`${tag}${oi}`,op.itens).filter(it=>it.produto)
        .map(it=>({classe:it.classe,produto:it.produto,dose:it.dose,un:it.un}));
      snap[seq].push({nome:op.nome,itens});
    });
  });
  return snap;
}
// remove todos os overrides de um talhão (ao excluí-lo)
function cleanTalhaoOverlays(id){
  const pref=id+'|';
  [OV.dose,OV.itemRemoved,OV.itemProd,OV.itemAdd,OV.opMaq].forEach(o=>{
    Object.keys(o).forEach(k=>{ if(k.startsWith(pref)) delete o[k]; });
  });
  delete OV.talhao[id];
}
// percorre todas as operações de um talhão: cb(seq, tag, oi, op, tagoi)
function eachOp(t, cb){
  ['principal','safrinha'].forEach(seq=>{
    const tag=seq==='safrinha'?'S':'P';
    opsOf(t.id,seq).forEach((op,oi)=>cb(seq,tag,oi,op,`${tag}${oi}`));
  });
}
function precoCultura(emp){ return (emp in OV.cultura)?+OV.cultura[emp]:(DATA.precos_cultura[emp]||0); }
function maquinasAll(){ return (DATA.maquinas||[]).concat(OV.maqAdd); }
function maqAttr(m,k){ const o=OV.maqAttr[m.conjunto]; return (o&&o[k]!=null)?+o[k]:(+m[k]||0); }
function rsHmDe(m){ return (m.conjunto in OV.maquina)?+OV.maquina[m.conjunto]:(+m.rs_hm||0); }
// máquina "efetiva": aplica edições de largura/velocidade/efic/L-h e recalcula ha/h, HM/ha, L/ha, custos
function effMaq(m){
  const larg=maqAttr(m,'largura'), vel=maqAttr(m,'velocidade'), efic=maqAttr(m,'eficiencia'), lh=maqAttr(m,'l_h'), rs=rsHmDe(m);
  const ha_h=larg*vel*efic/1000, hm_ha=ha_h>0?1/ha_h:0, l_ha=ha_h>0?lh/ha_h:0;
  const cmaq=hm_ha*rs, cdie=l_ha*(+OV.diesel);
  return {conjunto:m.conjunto,maquina:m.maquina,implemento:m.implemento,largura:larg,velocidade:vel,
    eficiencia:efic,l_h:lh,rs_hm:rs,ha_h:ha_h,hm_ha:hm_ha,l_ha:l_ha,custoMaqHa:cmaq,dieselHa:cdie,custoHa:cmaq+cdie};
}
// custo total por hectare de uma passada = custo hora-máquina + diesel
function custoMaqHa(m){ return effMaq(m).custoHa; }
// custo médio por passada (média das máquinas cadastradas)
function custoMedioPassada(){
  const ms=maquinasAll(); if(!ms.length) return 0;
  return ms.reduce((a,m)=>a+effMaq(m).custoHa,0)/ms.length;
}
const maqByConj = {};
function buildMaqIndex(){ for(const k in maqByConj) delete maqByConj[k]; maquinasAll().forEach(m=>maqByConj[m.conjunto]=m); }
// sugere um conjunto pela classe predominante dos insumos (recebe lista de classes)
function sugereMaquina(clsArr){
  const cls = (clsArr||[]).map(c=>(c||'').toUpperCase());
  const has = re => cls.some(c=>re.test(c));
  const find = re => maquinasAll().find(m=>re.test((m.conjunto||'').toUpperCase()));
  let m=null;
  if(has(/CORRETIVO/))            m=find(/BRUTUS|DISTRIBUID/);
  else if(has(/FERTILIZANTE|NUTRI/)) m=find(/ADUBAD|JAN 20000/);
  else if(has(/SEMENTE|^TS$|^TS /)) m=find(/PLANTADEIRA|HORSCH|ASM|JD2122|CASE 2213/);
  else if(has(/HERBICIDA|FUNGICIDA|INSETICIDA|ADJUVANTE|BIOL|NEMATIC/)) m=find(/PULVERIZADOR|JACTO|UNIPORT/);
  return m?m.conjunto:null;
}
const opMaqKey=(tid,opref)=>`${tid}|${opref}`;
// conjunto atribuído à operação (override do usuário, senão sugestão)
function opMaqDe(tid,tag,oi,op){
  const k=opMaqKey(tid,`${tag}${oi}`);
  if(k in OV.opMaq) return OV.opMaq[k];   // "" = sem máquina (usuário desmarcou)
  return sugereMaquina(effItems(tid,`${tag}${oi}`,op.itens).map(i=>i.classe));
}
// custo de máquina/ha de uma operação (conjunto atribuído; senão média por passada)
function custoOpHa(tid,tag,oi,op){
  const conj=opMaqDe(tid,tag,oi,op);
  if(conj && maqByConj[conj]) return custoMaqHa(maqByConj[conj]);
  if(conj==='') return 0;                 // explicitamente sem máquina
  return custoMedioPassada();             // fallback (sem sugestão)
}
// custo de máquinas/operação por hectare de um talhão (soma das operações)
function custoOpTalhaoHa(t){
  const p=planoDe(t.id); if(!p) return 0; let s=0;
  ['principal','safrinha'].forEach(seq=>{
    const tag=seq==='safrinha'?'S':'P';
    (p[seq]||[]).forEach((op,oi)=>{ s+=custoOpHa(t.id,tag,oi,op); });
  });
  return s;
}

/* ---------------- engine ---------------- */
// demanda total por produto = Σ talhões Σ operações (dose × área)
function calcDemanda(){
  const dem = {};
  for(const t of talhoesAll()){
    const area = areaDe(t);
    eachOp(t,(seq,tag,oi,op,tagoi)=>{
      effItems(t.id,tagoi,op.itens).forEach(it=>{
        if(!it.produto) return;
        dem[it.produto] = (dem[it.produto]||0) + it.dose*area;
      });
    });
  }
  return dem;
}
// lista de compras a partir da demanda
function calcCompras(){
  const dem = calcDemanda();
  const rows = [];
  for(const p of DATA.produtos){
    const nome=p.produto, d=dem[nome]||0, est=estoqueDe(nome), ped=pedidoDe(nome);
    if(d<=0 && est<=0 && ped<=0) continue;
    if((p.classe||'').toUpperCase().startsWith('MÁQUINA')) continue;
    const comprar=Math.max(0,d-est-ped), preco=precoDe(nome), valor=comprar*preco;
    let status = comprar>0 ? (preco>0?'COMPRAR':'SEM_PRECO') : (d>0?'ESTOQUE':'SEM_DEMANDA');
    rows.push({...p, demanda:d, estoque:est, pedido:ped, comprar, preco, valor, status});
  }
  return rows;
}
// custo de insumos por talhão (e por ha)
function custoTalhao(t){
  const plan=planoDe(t.id); if(!plan) return {ha:0,total:0,area:areaDe(t)};
  const area=areaDe(t); let ha=0;
  eachOp(t,(seq,tag,oi,op,tagoi)=>{
    effItems(t.id,tagoi,op.itens).forEach(it=>{ ha += it.dose*precoDe(it.produto); });
  });
  return {ha, total:ha*area, area};
}
// cultura de cada safra (com override do usuário)
function empDe(t){ const o=OV.talhao[t.id]; return (o&&o.empreendimento!=null)?o.empreendimento:(t.empreendimento||''); }
function empSafDe(t){ const o=OV.talhao[t.id]; return (o&&o.emp_safrinha!=null)?o.emp_safrinha:(t.emp_safrinha||''); }
const temSafrinha = t => !!String(empSafDe(t)||'').trim();
function prodSafDe(t){ const o=OV.talhao[t.id]; return o&&o.prod_safrinha!=null?+o.prod_safrinha:(t.prod_safrinha||0); }
// operações de uma safra = base (planilha) + operações criadas no app
function opsOf(tid, seq){
  // operações vêm SEMPRE da planilha (12 slots por safra, por posição); o app revela/preenche os vazios
  return (planoDe(tid)[seq]||[]).slice();
}
// quantas operações mostrar num talhão/safra: até a última com insumo + as reveladas manualmente
const revealOps = {};   // "tid|tag" -> nº de operações a exibir (sessão)
function opsShownCount(tid, tag){
  const seq=tag==='S'?'safrinha':'principal', all=(planoDe(tid)[seq]||[]);
  let lastFilled=-1;
  all.forEach((op,oi)=>{ if(effItems(tid,`${tag}${oi}`,op.itens).length) lastFilled=oi; });
  return Math.min(all.length, Math.max(lastFilled+1, revealOps[`${tid}|${tag}`]||0));
}
// custo de insumos (R$/ha) de UMA safra do talhão
function custoSeqHa(t,seq){
  const tag=seq==='safrinha'?'S':'P'; let ha=0;
  opsOf(t.id,seq).forEach((op,oi)=>effItems(t.id,`${tag}${oi}`,op.itens).forEach(it=>ha+=it.dose*precoDe(it.produto)));
  return ha;
}
// custo de máquinas (R$/ha) de UMA safra do talhão
function custoOpSeqHa(t,seq){
  const tag=seq==='safrinha'?'S':'P'; let s=0;
  opsOf(t.id,seq).forEach((op,oi)=>{ s+=custoOpHa(t.id,tag,oi,op); });
  return s;
}
// cada talhão vira 1 ou 2 "cultivos" (safra principal + safrinha)
function cultivos(){
  const out=[];
  talhoesAll().forEach(t=>{
    const area=areaDe(t);
    out.push({t,seq:'principal',tag:'P',emp:empDe(t)||'—',area,prod:area*prodvDe(t),
      ins:custoSeqHa(t,'principal')*area, maqHa:custoOpSeqHa(t,'principal')});
    if(temSafrinha(t)) out.push({t,seq:'safrinha',tag:'S',emp:empSafDe(t),area,prod:area*prodSafDe(t),
      ins:custoSeqHa(t,'safrinha')*area, maqHa:custoOpSeqHa(t,'safrinha')});
  });
  return out;
}
// pares (talhão, safra) que pertencem a um empreendimento
function cultivosDaEmp(emp){
  const out=[];
  talhoesAll().forEach(t=>{
    if((empDe(t)||'—')===emp) out.push({t,seq:'principal',tag:'P'});
    if(temSafrinha(t)&&empSafDe(t)===emp) out.push({t,seq:'safrinha',tag:'S'});
  });
  return out;
}

/* ---------------- formatação ---------------- */
const nf0=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const nf2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl=v=>'R$ '+nf2.format(v||0);
const brl0=v=>'R$ '+nf0.format(v||0);
const num=v=>nf1.format(v||0);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- UI helpers ---------------- */
const $ = s => document.querySelector(s);
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.hidden=false;
  clearTimeout(t._h); t._h=setTimeout(()=>t.hidden=true,2200);
}
function ask(m){ try{ return window.confirm(m); }catch(e){ return true; } }
function updateEditBadge(){
  const n=countEdits(), b=$('#edit-badge');
  b.hidden=n===0; b.textContent=n+(n===1?' edição':' edições');
}
const PILL={COMPRAR:['pill-buy','Comprar'],SEM_PRECO:['pill-noprice','Sem preço'],
  ESTOQUE:['pill-stock','Em estoque'],SEM_DEMANDA:['pill-none','Sem demanda']};
const pill=st=>`<span class="pill ${PILL[st][0]}">${PILL[st][1]}</span>`;

/* ================= VIEWS ================= */
const V = {};

V.dashboard = function(){
  const compras=calcCompras();
  const areaTotal=talhoesAll().reduce((a,t)=>a+areaDe(t),0);
  const custoTotal=talhoesAll().reduce((a,t)=>a+custoTalhao(t).total,0);
  const totalCompra=compras.reduce((a,r)=>a+r.valor,0);
  const itensComprar=compras.filter(r=>r.comprar>0).length;
  const semPreco=compras.filter(r=>r.comprar>0&&r.preco<=0).length;
  // custo por cultura
  const porCultura={};
  cultivos().forEach(cv=>{ porCultura[cv.emp]=(porCultura[cv.emp]||0)+cv.ins; });
  const culturas=Object.entries(porCultura).sort((a,b)=>b[1]-a[1]);
  const maxC=Math.max(1,...culturas.map(c=>c[1]));
  // custo por classe (insumo)
  const porClasse={};
  compras.forEach(r=>{porClasse[r.classe]=(porClasse[r.classe]||0)+r.valor;});
  const classes=Object.entries(porClasse).filter(c=>c[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxK=Math.max(1,...classes.map(c=>c[1]));

  return `
  <div class="kpi-grid">
    <div class="kpi"><div class="k-label">Área total</div><div class="k-value">${num(areaTotal)} ha</div><div class="k-sub">${talhoesAll().length} talhões</div></div>
    <div class="kpi accent"><div class="k-label">Demanda de compras</div><div class="k-value">${brl0(totalCompra)}</div><div class="k-sub">${itensComprar} itens a comprar</div></div>
    <div class="kpi"><div class="k-label">Custo de insumos (plano)</div><div class="k-value">${brl0(custoTotal)}</div><div class="k-sub">${areaTotal>0?brl(custoTotal/areaTotal):'—'} / ha</div></div>
    <div class="kpi"><div class="k-label">Itens sem preço</div><div class="k-value" style="color:${semPreco?'var(--red)':'var(--green)'}">${semPreco}</div><div class="k-sub">a cadastrar preço</div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><div class="panel-head"><h2>Custo por cultura</h2><span class="sub">insumos, plano</span></div>
      <div class="panel-body">${culturas.map(([n,v])=>`
        <div class="bar-row"><div class="bl" title="${esc(n)}">${esc(n)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${v/maxC*100}%"></div></div>
        <div class="bar-val">${brl0(v)}</div></div>`).join('')}</div></div>
    <div class="panel"><div class="panel-head"><h2>Compras por classe</h2><span class="sub">top 8</span></div>
      <div class="panel-body">${classes.map(([n,v])=>`
        <div class="bar-row"><div class="bl" title="${esc(n)}">${esc(n)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${v/maxK*100}%"></div></div>
        <div class="bar-val">${brl0(v)}</div></div>`).join('')||'<div class="empty">Sem dados</div>'}</div></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Maiores compras</h2><span class="sub">top 10 itens</span></div>
    <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Classe</th><th class="num">A comprar</th><th>Un</th><th class="num">Valor</th></tr></thead>
    <tbody>${compras.filter(r=>r.valor>0).sort((a,b)=>b.valor-a.valor).slice(0,10).map(r=>`
      <tr><td><b>${esc(r.produto)}</b></td><td><span class="classe-tag">${esc(r.classe)}</span></td>
      <td class="num">${num(r.comprar)}</td><td>${esc(r.un)}</td><td class="num">${brl(r.valor)}</td></tr>`).join('')}</tbody></table></div></div>`;
};

V.talhoes = function(){
  const all=talhoesAll();
  const rows=all.map(t=>{
    const c=custoTalhao(t), area=areaDe(t), prodv=prodvDe(t);
    return {t,area,prodv,prodTotal:area*prodv,custo:c.total,custoHa:c.ha,novo:!(t.id in DATA.planos)&&!DATA.talhoes.some(x=>x.id===t.id)};
  });
  const totArea=rows.reduce((a,r)=>a+r.area,0);
  const totCusto=rows.reduce((a,r)=>a+r.custo,0);
  const empOpts=empList().filter(e=>e&&e!=='—').map(e=>`<option value="${esc(e)}">`).join('');
  const copyOpts=all.map(t=>`<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.nome||'')}</option>`).join('');
  return `${prodDatalist()}
  <datalist id="emplist">${empOpts}</datalist>
  <details class="panel panel-collapse">
    <summary class="panel-head"><h2>Criar talhão</h2><span class="sub">novo talhão — em branco ou copiando o plano de outro</span><span class="panel-chevron">▸</span></summary>
    <div class="bulk-add">
      <input class="txt" id="nt-nome" placeholder="nome (ex.: Área 5)" style="min-width:150px">
      <input class="txt" list="emplist" id="nt-emp" placeholder="cultura / empreendimento" style="min-width:180px">
      <input class="cell" id="nt-area" placeholder="área (ha)" style="width:96px">
      <input class="cell" id="nt-prod" placeholder="prod. sc/ha" style="width:96px">
      <label class="mut" style="font-size:12px">copiar plano de
        <select class="sel" id="nt-copy"><option value="">— em branco —</option>${copyOpts}</select></label>
      <button class="btn btn-primary btn-sm" data-act="createtalhao">+ Criar talhão</button>
    </div>
  </details>
  <div class="toolbar"><div class="search"><input id="q-talhao" placeholder="Buscar talhão ou cultura…"></div>
    <div class="spacer"></div><span class="badge badge-muted">Edite área/produtividade; abra para editar insumos; 🗑 exclui o talhão</span></div>
  <div class="panel"><div class="table-wrap"><table id="tbl-talhoes">
    <thead><tr><th>Talhão</th><th>Nome</th><th>Cultura</th><th class="num">Área (ha)</th>
      <th class="num">Prod. (sc/ha)</th><th class="num">Produção (sc)</th><th class="num">Custo/ha</th><th class="num">Custo total</th><th></th></tr></thead>
    <tbody>${rows.map(r=>`
      <tr data-search="${esc((r.t.id+' '+(r.t.nome||'')+' '+empDe(r.t)+' '+empSafDe(r.t)).toLowerCase())}">
        <td><b>${esc(r.t.id)}</b>${r.novo?' <span class="pill pill-buy">novo</span>':''}</td>
        <td><a class="link" data-go="#/talhao/${esc(r.t.id)}">${esc(r.t.nome||'—')}</a></td>
        <td><span class="classe-tag">${esc(empDe(r.t)||'—')}</span>${temSafrinha(r.t)?` <span class="classe-tag" style="background:var(--amber-soft);color:var(--amber)">+ ${esc(empSafDe(r.t))}</span>`:''}</td>
        <td class="num"><input class="cell ${OV.talhao[r.t.id]&&OV.talhao[r.t.id].area!=null?'edited':''}" data-edit="area" data-id="${r.t.id}" value="${r.area}"></td>
        <td class="num"><input class="cell ${OV.talhao[r.t.id]&&OV.talhao[r.t.id].produtividade!=null?'edited':''}" data-edit="prodv" data-id="${r.t.id}" value="${r.prodv}"></td>
        <td class="num">${nf0.format(r.prodTotal)}</td>
        <td class="num">${brl(r.custoHa)}</td>
        <td class="num"><b>${brl0(r.custo)}</b></td>
        <td class="num"><button class="icon-btn del" title="Excluir talhão" data-act="deltalhao" data-id="${esc(r.t.id)}" data-novo="${r.novo?1:0}">🗑</button></td></tr>`).join('')}</tbody>
    <tfoot class="tfoot"><tr><td colspan="3">TOTAL</td><td class="num">${num(totArea)}</td><td></td><td></td><td></td><td class="num">${brl0(totCusto)}</td><td></td></tr></tfoot>
  </table></div></div>`;
};

function prodDatalist(){
  return `<datalist id="prodlist">${DATA.produtos.map(p=>`<option value="${esc(p.produto)}">`).join('')}</datalist>`;
}
V.talhao = function(id){
  const t=findTalhao(id);
  if(!t) return `<div class="empty">Talhão não encontrado. <a class="link" data-go="#/talhoes">Voltar</a></div>`;
  const plan=planoDe(t.id)||{principal:[],safrinha:[]};
  const area=areaDe(t), c=custoTalhao(t);
  const maqHa=custoOpTalhaoHa(t), totHa=c.ha+maqHa;
  const opts=[`<option value="">— sem máquina —</option>`].concat(maquinasAll()
    .map(m=>`<option value="${esc(m.conjunto)}">${esc(m.conjunto)}</option>`)).join('');
  function itemRow(it){
    const preco=precoDe(it.produto), chHa=it.dose*preco;
    const di=it.kind==='add'?`data-edit="doseAdd" data-op="${it.key.split('|')[1]}" data-ai="${it.ai}"`
                            :`data-edit="dose" data-op="${it.key.split('|')[1]}" data-item="${it.ii}"`;
    const pi=it.kind==='add'?`data-edit="itemProdAdd" data-op="${it.key.split('|')[1]}" data-ai="${it.ai}"`
                            :`data-edit="itemProd" data-op="${it.key.split('|')[1]}" data-item="${it.ii}"`;
    const del=`data-act="delitem" data-id="${t.id}" data-op="${it.key.split('|')[1]}" data-kind="${it.kind}" ${it.kind==='add'?`data-ai="${it.ai}"`:`data-item="${it.ii}"`}`;
    return `<tr>
      <td class="c-more" data-th="Classe">${it.classe?`<span class="classe-tag">${esc(it.classe)}</span>`:'<span class="pill pill-none">—</span>'}</td>
      <td class="c-full" data-th="Produto"><input list="prodlist" class="txt prod-in ${it.prodEdited||it.kind==='add'?'edited':''}" data-id="${t.id}" ${pi} value="${esc(it.produto)}" placeholder="escolha o insumo"></td>
      <td class="num" data-th="Dose/ha"><input class="cell ${it.doseEdited?'edited':''}" data-id="${t.id}" ${di} value="${it.dose}"></td>
      <td class="c-more" data-th="Un">${esc(it.un)}</td>
      <td class="num c-more" data-th="Preço">${preco>0?brl(preco):(it.produto?'<span class="pill pill-noprice">s/ preço</span>':'—')}</td>
      <td class="num c-more" data-th="Custo/ha">${brl(chHa)}</td><td class="num c-more" data-th="Total">${brl(chHa*area)}</td>
      <td class="c-del c-more"><button class="icon-btn del" title="Excluir insumo" ${del}>🗑</button></td></tr>`;
  }
  function opsHtml(seq,tag,titulo,show){
    const all=opsOf(t.id,seq);
    const nShow=opsShownCount(t.id,tag);
    const cnt = nShow>0 ? nShow : (show?1:0);
    if(cnt===0) return '';
    const ops=all.slice(0,cnt);
    const canReveal = cnt < all.length;
    return `<div class="panel"><div class="panel-head"><h2>${titulo}</h2><span class="sub">${cnt} de ${all.length} operações</span></div>
    ${ops.map((op,oi)=>{
      const tagoi=`${tag}${oi}`, items=effItems(t.id,tagoi,op.itens);
      let sub=0; items.forEach(it=>sub+=it.dose*precoDe(it.produto));
      const conj=opMaqDe(t.id,tag,oi,op), mHa=custoOpHa(t.id,tag,oi,op);
      const isOv=(opMaqKey(t.id,tagoi) in OV.opMaq);
      const selHtml=opts.replace(`value="${esc(conj||'')}"`,`value="${esc(conj||'')}" selected`);
      const totOp=sub+mHa;
      const okey=`${t.id}|${tagoi}`, collapsed=collapsedOps.has(okey);
      return `<div class="op-block${collapsed?' op-collapsed':''}">
      <div class="op-head">
        <span class="op-title" data-optoggle="${okey}"><span class="op-chevron">⌄</span>${esc(op.nome)}</span>
        <span class="op-sum">${items.length} insumo${items.length===1?'':'s'} · ${brl(totOp)}/ha</span>
        <span class="op-maq"><span class="mut">🚜</span>
        <select class="sel" data-edit="opMaq" data-id="${t.id}" data-op="${tagoi}" ${isOv?'style="border-color:var(--ink2)"':''}>${selHtml}</select>
        <span class="op-maqv">${brl(mHa)}/ha</span></span></div>
      <div class="op-body">
      <div class="table-wrap"><table class="cards-sm insumo-cards"><thead><tr><th>Classe</th><th>Produto</th><th class="num">Dose/ha</th><th>Un</th><th class="num">Preço</th><th class="num">Custo/ha</th><th class="num">Custo total</th><th></th></tr></thead>
      <tbody>${items.map(itemRow).join('')||'<tr><td colspan="8" class="mut" style="padding:12px 14px">Nenhum insumo. Use “+ adicionar insumo”.</td></tr>'}</tbody>
      <tfoot class="tfoot">
        <tr><td colspan="5">Insumos/ha</td><td class="num">${brl(sub)}</td><td class="num">${brl0(sub*area)}</td><td></td></tr>
        <tr><td colspan="5">+ Máquina/ha</td><td class="num">${brl(mHa)}</td><td class="num">${brl0(mHa*area)}</td><td></td></tr>
        <tr><td colspan="5"><b>Subtotal operação</b></td><td class="num"><b>${brl(totOp)}</b></td><td class="num"><b>${brl0(totOp*area)}</b></td><td></td></tr>
      </tfoot></table></div>
      <div class="op-add"><button class="btn btn-outline btn-sm" data-act="additem" data-id="${t.id}" data-op="${tagoi}">+ adicionar insumo</button></div>
      </div></div>`;
    }).join('')||'<div class="mut" style="padding:14px 18px 0">Nenhuma operação nesta safra ainda.</div>'}
    <div class="op-add">${canReveal
      ? `<button class="btn btn-primary btn-sm" data-act="addop" data-id="${t.id}" data-tag="${tag}">+ adicionar operação</button>`
      : '<span class="mut" style="font-size:12px">As 12 operações da planilha já estão em uso.</span>'}</div>
    </div>`;
  }
  const empOpts=empList().filter(e=>e&&e!=='—').map(e=>`<option value="${esc(e)}">`).join('');
  return `${prodDatalist()}<datalist id="emplist">${empOpts}</datalist>
  <a class="link" data-go="#/talhoes">‹ Talhões</a>
  <div class="detail-head" style="margin-top:10px">
    <div class="di"><div class="l">Talhão</div><div class="v">${esc(t.id)} · ${esc(t.nome||'—')}</div></div>
    <div class="di"><div class="l">Área</div><div class="v">${num(area)} ha</div></div>
    <div class="di"><div class="l">Insumos/ha</div><div class="v">${brl(c.ha)}</div></div>
    <div class="di"><div class="l">Máquinas/ha</div><div class="v">${brl(maqHa)}</div></div>
    <div class="di"><div class="l">Custo total/ha</div><div class="v" style="color:var(--ink2)">${brl(totHa)}</div></div>
    <div class="di"><div class="l">Custo total</div><div class="v">${brl0(totHa*area)}</div></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Culturas do talhão</h2><span class="sub">planeje a 1ª e a 2ª safra (safrinha) no mesmo talhão</span></div>
    <div class="bulk-add">
      <label class="mut" style="font-size:12px">1ª cultura <input class="txt" list="emplist" data-edit="emp" data-id="${t.id}" value="${esc(empDe(t))}" style="min-width:190px"></label>
      <label class="mut" style="font-size:12px">prod. <input class="cell" data-edit="prodv" data-id="${t.id}" value="${prodvDe(t)}" style="width:72px"> sc/ha</label>
      <span style="width:1px;align-self:stretch;background:var(--line);margin:0 4px"></span>
      <label class="mut" style="font-size:12px">2ª cultura <input class="txt" list="emplist" data-edit="empSaf" data-id="${t.id}" value="${esc(empSafDe(t))}" placeholder="— sem safrinha —" style="min-width:190px"></label>
      <label class="mut" style="font-size:12px">prod. <input class="cell" data-edit="prodSaf" data-id="${t.id}" value="${temSafrinha(t)?prodSafDe(t):''}" placeholder="sc/ha" style="width:72px"> sc/ha</label>
    </div>
  </div>
  <div class="toolbar" style="margin-top:-4px">
    <button class="btn btn-outline btn-sm" data-act="pdftalhao" data-id="${esc(t.id)}">🖨 Exportar PDF</button>
    <button class="btn btn-outline btn-sm" data-act="duptalhao" data-id="${esc(t.id)}">⧉ Duplicar plano</button>
    <button class="btn btn-outline btn-sm" data-act="deltalhao" data-id="${esc(t.id)}" data-novo="${DATA.talhoes.some(x=>x.id===t.id)?0:1}" style="color:var(--red)">🗑 Excluir talhão</button>
    <div class="spacer"></div>
    <span class="badge badge-muted">Edite culturas acima; nas operações: “+ adicionar insumo” e “+ adicionar operação”.</span></div>
  ${opsHtml('principal','P',temSafrinha(t)?'Safra principal · '+esc(empDe(t)||''):'Safra principal',true)}
  ${opsHtml('safrinha','S','Safrinha'+(temSafrinha(t)?' · '+esc(empSafDe(t)):''),temSafrinha(t))}`;
};

V.compras = function(){
  const all=calcCompras();
  const totalCompra=all.reduce((a,r)=>a+r.valor,0);
  const itens=all.filter(r=>r.comprar>0).length;
  const semPreco=all.filter(r=>r.comprar>0&&r.preco<=0).length;
  const valEstoque=all.reduce((a,r)=>a+r.estoque*r.preco,0);
  // agrupa por classe (grupos recolhíveis, como as operações do talhão)
  const groups={};
  all.forEach(r=>{ const k=r.classe||'(sem classe)'; (groups[k]=groups[k]||[]).push(r); });
  const classes=Object.keys(groups).sort((a,b)=>a.localeCompare(b));
  const th=`<thead><tr><th>Produto</th><th class="num">A comprar</th><th class="num">Estoque</th><th class="num">Em pedido</th><th class="num">Preço</th><th class="num">Valor</th><th class="num">Demanda</th><th>Un</th><th>Fornecedor</th><th>Status</th></tr></thead>`;
  const rowHtml=r=>`<tr data-search="${esc((r.classe+' '+r.empresa+' '+r.produto).toLowerCase())}" data-cardkey="cp|${esc(r.produto)}"${openCards.has('cp|'+r.produto)?' class="open"':''}>
    <td class="c-full"><b>${esc(r.produto)}</b></td>
    <td class="num" data-th="A comprar"><b>${num(r.comprar)}</b></td>
    <td class="num c-more" data-th="Estoque"><input class="cell ${(r.produto in OV.estoque)?'edited':''}" data-edit="estoque" data-prod="${esc(r.produto)}" value="${r.estoque}"></td>
    <td class="num c-more" data-th="Em pedido"><input class="cell ${(r.produto in OV.pedido)?'edited':''}" data-edit="pedido" data-prod="${esc(r.produto)}" value="${r.pedido>0?r.pedido:''}" placeholder="0"></td>
    <td class="num c-more" data-th="Preço">${r.preco>0?brl(r.preco):'<span class="pill pill-noprice">s/ preço</span>'}</td>
    <td class="num c-more" data-th="Valor">${r.valor>0?brl(r.valor):'—'}</td>
    <td class="num c-more" data-th="Demanda">${num(r.demanda)}</td>
    <td class="c-more" data-th="Un">${esc(r.un)}</td>
    <td class="c-more" data-th="Fornecedor">${esc(r.empresa||'—')}</td>
    <td class="c-more" data-th="Status">${pill(r.status)}</td></tr>`;
  const groupsHtml=classes.map(cl=>{
    const g=groups[cl].slice().sort((a,b)=>b.valor-a.valor||(a.produto||'').localeCompare(b.produto||''));
    const sub=g.reduce((a,r)=>a+r.valor,0), n=g.length, key=`cg|${cl}`, collapsed=collapsedOps.has(key);
    return `<div class="op-block${collapsed?' op-collapsed':''}">
      <div class="op-head">
        <span class="op-title" data-optoggle="${esc(key)}"><span class="op-chevron">⌄</span>${esc(cl)}</span>
        <span class="op-sum">${n} ${n===1?'item':'itens'} · ${brl0(sub)}</span></div>
      <div class="op-body"><div class="table-wrap"><table class="cards-sm compra-cards">${th}<tbody>${g.map(rowHtml).join('')}</tbody></table></div></div>
    </div>`;
  }).join('');
  return `
  <div class="kpi-grid">
    <div class="kpi accent"><div class="k-label">Total a comprar</div><div class="k-value">${brl0(totalCompra)}</div></div>
    <div class="kpi"><div class="k-label">Itens a comprar</div><div class="k-value">${itens}</div></div>
    <div class="kpi"><div class="k-label">Itens sem preço</div><div class="k-value" style="color:${semPreco?'var(--red)':'var(--green)'}">${semPreco}</div></div>
    <div class="kpi"><div class="k-label">Valor em estoque</div><div class="k-value">${brl0(valEstoque)}</div></div>
  </div>
  <div class="toolbar"><div class="search"><input id="q-compra" placeholder="Buscar produto, classe ou fornecedor…"></div>
    <div class="spacer"></div><span class="badge badge-muted">A comprar = máx(0; Demanda − Estoque − Em pedido). Preço se edita na aba Cotação.</span></div>
  <div id="compras-groups">${groupsHtml||'<div class="empty">Sem itens.</div>'}</div>
  <div class="compras-total"><span>TOTAL A COMPRAR</span><b>${brl0(totalCompra)}</b></div>`;
};

V.cotacao = function(){
  const rows=calcCompras().filter(r=>r.comprar>0);
  const groups={};
  rows.forEach(r=>{const k=r.empresa||'(sem fornecedor)';(groups[k]=groups[k]||[]).push(r);});
  const order=Object.keys(groups).sort((a,b)=>(a==='(sem fornecedor)')-(b==='(sem fornecedor)')||a.localeCompare(b));
  const totalGeral=rows.reduce((a,r)=>a+r.valor,0);
  return `
  <div class="toolbar"><div class="search"><input id="q-cot" placeholder="Buscar produto, classe ou fornecedor…"></div>
    <span class="badge badge-muted">${order.length} fornecedores · ${brl0(totalGeral)} — edite o <b>Preço ref.</b> aqui</span>
    <div class="spacer"></div>
    <button class="btn btn-outline btn-sm" id="btn-cot-pdf">🖨 PDF por fornecedor</button>
    <button class="btn btn-outline btn-sm" id="btn-cot-csv">⬇ CSV</button></div>
  <div id="cot-groups">${order.map(forn=>{
    const its=groups[forn].sort((a,b)=>b.valor-a.valor);
    const sub=its.reduce((a,r)=>a+r.valor,0);
    return `<div class="panel"><div class="panel-head"><h2>${esc(forn)}</h2><span class="sub">${its.length} itens · ${brl0(sub)}</span></div>
    <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Classe</th><th class="num">Qtd</th><th>Un</th><th class="num">Preço ref.</th><th class="num">Valor ref.</th></tr></thead>
    <tbody>${its.map(r=>`<tr data-search="${esc((r.produto+' '+r.classe+' '+forn).toLowerCase())}"><td><b>${esc(r.produto)}</b></td><td><span class="classe-tag">${esc(r.classe)}</span></td>
      <td class="num">${num(r.comprar)}</td><td>${esc(r.un)}</td>
      <td class="num">${r.preco>0?brl(r.preco):'<span class="pill pill-noprice">s/ preço</span>'}</td>
      <td class="num">${brl(r.valor)}</td></tr>`).join('')}</tbody>
    <tfoot class="tfoot"><tr><td colspan="5">Subtotal ${esc(forn)}</td><td class="num">${brl0(sub)}</td></tr></tfoot></table></div></div>`;
  }).join('')}</div>`;
};

V.maquinas = function(){
  const ms=maquinasAll(), medio=custoMedioPassada();
  const attrEd=(m,k)=>(OV.maqAttr[m.conjunto]&&OV.maqAttr[m.conjunto][k]!=null)?'edited':'';
  return `
  <div class="kpi-grid">
    <div class="kpi"><div class="k-label">Conjuntos</div><div class="k-value">${ms.length}</div><div class="k-sub">${OV.maqAdd.length} montados por você</div></div>
    <div class="kpi accent"><div class="k-label">Custo médio por passada</div><div class="k-value">${brl(medio)}</div><div class="k-sub">máquina + diesel, por ha</div></div>
    <div class="kpi"><div class="k-label">Preço do diesel</div>
      <div class="k-value"><input class="cell ${OV.diesel!==6?'edited':''}" data-edit="diesel" value="${OV.diesel}" style="width:110px;font-size:20px;font-weight:700"> <span style="font-size:13px;color:var(--muted)">R$/L</span></div>
      <div class="k-sub">aplicado ao consumo (L/ha)</div></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Montar conjunto</h2><span class="sub">máquina + implemento — largura e velocidade definem o rendimento</span></div>
    <div class="bulk-add">
      <input class="txt" id="mq-maq" placeholder="máquina (ex.: Trator JD 7500)" style="min-width:170px">
      <input class="txt" id="mq-imp" placeholder="implemento (ex.: Pulverizador)" style="min-width:170px">
      <input class="cell" id="mq-larg" placeholder="largura (m)" style="width:96px">
      <input class="cell" id="mq-vel" placeholder="vel. (km/h)" style="width:96px">
      <input class="cell" id="mq-efic" value="85" placeholder="efic. %" style="width:80px">
      <input class="cell" id="mq-lh" placeholder="L/h" style="width:70px">
      <input class="cell" id="mq-rs" placeholder="R$/HM" style="width:84px">
      <button class="btn btn-primary btn-sm" data-act="addmaq">+ Montar</button>
    </div>
  </div>
  <div class="toolbar"><div class="search"><input id="q-maq" placeholder="Buscar conjunto, máquina ou implemento…"></div>
    <div class="spacer"></div><span class="badge badge-muted">Edite <b>largura</b>, <b>velocidade</b>, <b>eficiência</b>, <b>L/h</b> e <b>R$/HM</b> — ha/h e custos recalculam.</span></div>
  <div class="panel"><div class="table-wrap"><table id="tbl-maq">
    <thead><tr><th>Conjunto</th><th class="num">Largura (m)</th><th class="num">Vel. (km/h)</th>
      <th class="num">Efic. %</th><th class="num">ha/h</th><th class="num">HM/ha</th><th class="num">L/h</th><th class="num">R$/HM</th>
      <th class="num">Custo máq/ha</th><th class="num">L/ha</th><th class="num">Diesel/ha</th><th class="num">Custo total/ha</th><th></th></tr></thead>
    <tbody>${ms.map(m=>{
      const e=effMaq(m), novo=OV.maqAdd.some(x=>x.conjunto===m.conjunto);
      const inp=(k,v,w)=>`<input class="cell ${attrEd(m,k)}" data-edit="maqAttr" data-conj="${esc(m.conjunto)}" data-attr="${k}" value="${v}" style="width:${w||70}px">`;
      return `<tr data-search="${esc((m.conjunto+' '+(m.maquina||'')+' '+(m.implemento||'')).toLowerCase())}"><td><b>${esc(m.conjunto)}</b>${novo?' <span class="pill pill-buy">novo</span>':''}</td>
        <td class="num">${inp('largura',m.largura!=null?maqAttr(m,'largura'):'',72)}</td>
        <td class="num">${inp('velocidade',maqAttr(m,'velocidade'),72)}</td>
        <td class="num">${inp('eficiencia',maqAttr(m,'eficiencia'),64)}</td>
        <td class="num">${num(e.ha_h)}</td><td class="num">${nf2.format(e.hm_ha)}</td>
        <td class="num">${inp('l_h',maqAttr(m,'l_h'),58)}</td>
        <td class="num"><input class="cell ${(m.conjunto in OV.maquina)?'edited':''}" data-edit="maquina" data-conj="${esc(m.conjunto)}" value="${e.rs_hm}" style="width:80px"></td>
        <td class="num">${brl(e.custoMaqHa)}</td><td class="num">${num(e.l_ha)}</td>
        <td class="num">${brl(e.dieselHa)}</td><td class="num"><b>${brl(e.custoHa)}</b></td>
        <td class="num">${novo?`<button class="icon-btn del" title="Excluir conjunto" data-act="delmaq" data-conj="${esc(m.conjunto)}">🗑</button>`:''}</td></tr>`;
    }).join('')}</tbody>
  </table></div></div>
  <p style="color:var(--muted);font-size:12px">O <b>custo médio por passada</b> alimenta a estimativa de máquinas no DRE. Cada operação do talhão usa o conjunto atribuído na tela do talhão.</p>`;
};

V.dre = function(){
  const emps={};
  cultivos().forEach(cv=>{   // 1 linha por cultura; safrinha entra como cultivo próprio
    const g=emps[cv.emp]||(emps[cv.emp]={area:0,prod:0,ins:0,opDefault:0});
    g.area+=cv.area; g.prod+=cv.prod; g.ins+=cv.ins; g.opDefault+=cv.maqHa*cv.area;
  });
  const list=Object.entries(emps).sort((a,b)=>b[1].area-a[1].area);
  // dados calculados por cultura (reaproveitados na tabela e no gráfico)
  const R=list.map(([e,g])=>{
    const preco=precoCultura(e), receita=g.prod*preco;
    const opHa=(e in OV.dreOp)?+OV.dreOp[e]:(g.area>0?g.opDefault/g.area:0);
    const arrHa=(e in OV.arrend)?+OV.arrend[e]:0;
    const custoMaq=opHa*g.area, custoArr=arrHa*g.area;
    const custoTot=g.ins+custoMaq+custoArr, result=receita-custoTot;
    return {e,g,preco,opHa,arrHa,receita,custoMaq,custoArr,custoTot,result};
  });
  const tA=R.reduce((s,r)=>s+r.g.area,0), tR=R.reduce((s,r)=>s+r.receita,0);
  const tI=R.reduce((s,r)=>s+r.g.ins,0), tM=R.reduce((s,r)=>s+r.custoMaq,0), tX=R.reduce((s,r)=>s+r.custoArr,0);
  const tCusto=tI+tM+tX, res=tR-tCusto, marg=tR>0?res/tR*100:0;
  const body=R.map(r=>{
    return `<tr><td class="c-full"><b>${esc(r.e)}</b></td>
      <td class="num" data-th="Área (ha)">${num(r.g.area)}</td>
      <td class="num" data-th="Produção (sc)">${nf0.format(r.g.prod)}</td>
      <td class="num" data-th="Preço (R$/sc)"><input class="cell ${(r.e in OV.cultura)?'edited':''}" data-edit="cultura" data-emp="${esc(r.e)}" value="${r.preco}"></td>
      <td class="num" data-th="Receita">${brl0(r.receita)}</td>
      <td class="num" data-th="Custo insumos">${brl0(r.g.ins)}</td>
      <td class="num" data-th="Máq. R$/ha"><input class="cell ${(r.e in OV.dreOp)?'edited':''}" data-edit="dreOp" data-emp="${esc(r.e)}" value="${r.opHa.toFixed(2)}"></td>
      <td class="num" data-th="Custo máquinas">${brl0(r.custoMaq)}</td>
      <td class="num" data-th="Arrend. R$/ha"><input class="cell ${(r.e in OV.arrend)?'edited':''}" data-edit="arrend" data-emp="${esc(r.e)}" value="${r.arrHa.toFixed(2)}"></td>
      <td class="num" data-th="Arrend./Outros">${brl0(r.custoArr)}</td>
      <td class="num" data-th="Custo total">${brl0(r.custoTot)}</td>
      <td class="num c-res" data-th="Resultado"><b style="color:${r.result>=0?'var(--green)':'var(--red)'}">${brl0(r.result)}</b></td></tr>`;
  }).join('');
  // gráfico por cultura: barra de receita x custo (escala comum) + resultado/margem
  const maxRef=Math.max(1,...R.map(r=>Math.max(r.receita,r.custoTot)));
  const pct=v=>Math.max(0,Math.min(100,v/maxRef*100)).toFixed(1);
  const chart=R.map(r=>{
    const m=r.receita>0?r.result/r.receita*100:0;
    return `<div class="dre-crow">
      <div class="dre-clabel">${esc(r.e)}<small>${num(r.g.area)} ha</small></div>
      <div class="dre-cbars">
        <div class="dre-barline"><span class="dre-bt rec">Receita</span><div class="dre-track"><div class="dre-fill rec" style="width:${pct(r.receita)}%"></div></div><span class="dre-bv">${brl0(r.receita)}</span></div>
        <div class="dre-barline"><span class="dre-bt cost">Custo</span><div class="dre-track"><div class="dre-fill cost" style="width:${pct(r.custoTot)}%"></div></div><span class="dre-bv">${brl0(r.custoTot)}</span></div>
      </div>
      <div class="dre-cres ${r.result>=0?'pos':'neg'}">${brl0(r.result)}<small>${r.receita>0?nf1.format(m)+'%':'—'}</small></div>
    </div>`;
  }).join('');
  // composição do custo (sempre bem definida) para a barra do resumo
  const cd=tCusto>0?tCusto:1;
  return `
  <div class="dre-hero">
    <div class="dre-hero-main">
      <div class="dre-hero-label">Resultado da safra</div>
      <div class="dre-hero-val ${res>=0?'pos':'neg'}">${brl0(res)}</div>
      <div class="dre-hero-sub">${tR>0?'<b>'+nf1.format(marg)+'%</b> da receita · ':''}Receita ${brl0(tR)} · Custo ${brl0(tCusto)} · ${num(tA)} ha</div>
    </div>
    <div class="dre-hero-split">
      <div class="dre-split-cap">Composição do custo</div>
      <div class="dre-split-bar">
        <div class="seg seg-ins" style="width:${(tI/cd*100).toFixed(1)}%"></div>
        <div class="seg seg-maq" style="width:${(tM/cd*100).toFixed(1)}%"></div>
        <div class="seg seg-arr" style="width:${(tX/cd*100).toFixed(1)}%"></div>
      </div>
      <div class="dre-split-leg">
        <span><i class="d-ins"></i>Insumos ${brl0(tI)}</span>
        <span><i class="d-maq"></i>Máquinas ${brl0(tM)}</span>
        <span><i class="d-arr"></i>Arrend./Outros ${brl0(tX)}</span>
      </div>
    </div>
  </div>
  <div class="dre-chart">
    <div class="dre-chart-head"><h3>Resultado por cultura</h3>
      <span class="dre-chart-leg"><i class="d-rec"></i>Receita <i class="d-cost"></i>Custo</span></div>
    ${chart||'<p class="mut" style="padding:0 14px 12px">Sem culturas para exibir.</p>'}
  </div>
  <div class="toolbar"><span class="badge badge-muted">Resultado = Receita − insumos − máquinas − arrendamento/outros. Campos em azul são editáveis (R$/ha ou preço).</span></div>
  <div class="panel"><div class="table-wrap"><table class="cards-sm dre-cards">
    <thead><tr><th>Cultura / Empreendimento</th><th class="num">Área (ha)</th><th class="num">Produção (sc)</th>
      <th class="num">Preço (R$/sc)</th><th class="num">Receita</th><th class="num">Custo insumos</th>
      <th class="num">Máq. R$/ha</th><th class="num">Custo máquinas</th>
      <th class="num">Arrend. R$/ha</th><th class="num">Arrend./Outros</th>
      <th class="num">Custo total</th><th class="num">Resultado</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot class="tfoot"><tr><td>TOTAL</td><td class="num">${num(tA)}</td><td></td><td></td>
      <td class="num">${brl0(tR)}</td><td class="num">${brl0(tI)}</td><td></td><td class="num">${brl0(tM)}</td>
      <td></td><td class="num">${brl0(tX)}</td>
      <td class="num">${brl0(tI+tM+tX)}</td>
      <td class="num"><b style="color:${res>=0?'var(--green)':'var(--red)'}">${brl0(res)}</b></td></tr></tfoot>
  </table></div></div>
  <p style="color:var(--muted);font-size:12px;margin-top:8px">Cada talhão com 2ª safra entra como <b>dois cultivos</b> (principal + safrinha), então a coluna Área soma a <b>área plantada</b> por cultura (a mesma terra pode aparecer em duas culturas). O custo de máquinas soma o custo de cada operação. Ajuste o R$/ha por cultura se quiser sobrescrever. Arrendamento e custos fixos são editáveis por cultura.</p>`;
};

// insumos consolidados de um empreendimento (produto -> {classe,un,qtd,doses,talhoes})
// considera a safra correta (principal ou safrinha) de cada talhão
function insumosDoEmp(emp){
  const map={};
  cultivosDaEmp(emp).forEach(({t,seq,tag})=>{
    const area=areaDe(t);
    opsOf(t.id,seq).forEach((op,oi)=>{
      effItems(t.id,`${tag}${oi}`,op.itens).forEach(it=>{
        if(!it.produto) return;
        const m=map[it.produto]||(map[it.produto]={classe:it.classe,un:it.un,qtd:0,doses:new Set(),talhoes:new Set()});
        m.qtd+=it.dose*area; m.doses.add(Math.round(it.dose*1e6)/1e6); m.talhoes.add(t.id);
      });
    });
  });
  return map;
}
function empList(){
  const s=[]; cultivos().forEach(cv=>{ if(!s.includes(cv.emp)) s.push(cv.emp); });
  return s;
}
V.empreendimentos = function(arg){
  const emps=empList();
  const sel=arg&&emps.includes(arg)?arg:emps[0];
  const chips=emps.map(e=>`<a class="chip ${e===sel?'chip-on':''}" data-go="#/empreendimentos/${encodeURIComponent(e)}">${esc(e)}</a>`).join('');
  const cvs=cultivosDaEmp(sel);
  const talhaoIds=[...new Set(cvs.map(c=>c.t.id))];
  const area=cvs.reduce((a,c)=>a+areaDe(c.t),0);
  const custo=cvs.reduce((a,c)=>a+custoSeqHa(c.t,c.seq)*areaDe(c.t),0);
  const seqSaf=cvs.length>0 && cvs.every(c=>c.seq==='safrinha');
  const map=insumosDoEmp(sel);
  const prods=Object.keys(map).sort((a,b)=>{
    const ca=map[a].classe||'', cb=map[b].classe||''; return ca.localeCompare(cb)||a.localeCompare(b);
  });
  const rows=prods.map(prod=>{
    const m=map[prod], doseCommon=m.doses.size===1?[...m.doses][0]:null, preco=precoDe(prod);
    return `<tr data-search="${esc((prod+' '+(m.classe||'')).toLowerCase())}" data-classe="${esc(m.classe||'')}" data-cardkey="ce|${esc(prod)}"${openCards.has('ce|'+prod)?' class="open"':''}>
      <td class="c-more" data-th="Classe">${m.classe?`<span class="classe-tag">${esc(m.classe)}</span>`:'—'}</td>
      <td class="c-full" data-th="Produto"><input list="prodlist" class="txt prod-in" data-edit="bulkProd" data-emp="${esc(sel)}" data-prod="${esc(prod)}" value="${esc(prod)}" title="Trocar este insumo por outro em todos os talhões desta cultura"></td>
      <td class="num" data-th="Dose/ha"><input class="cell" data-edit="bulkDose" data-emp="${esc(sel)}" data-prod="${esc(prod)}"
        value="${doseCommon!=null?doseCommon:''}" placeholder="${doseCommon!=null?'':'vários'}"></td>
      <td class="c-more" data-th="Un">${esc(m.un)}</td>
      <td class="num c-more" data-th="Qtd total">${num(m.qtd)}</td>
      <td class="num c-more" data-th="Preço">${preco>0?brl(preco):'—'}</td>
      <td class="num c-more" data-th="Nos talhões">${m.talhoes.size}</td>
      <td class="c-del c-more"><button class="icon-btn del" title="Excluir de todos os talhões desta cultura"
        data-act="bulkdel" data-emp="${esc(sel)}" data-prod="${esc(prod)}">🗑</button></td></tr>`;
  }).join('');
  return `${prodDatalist()}
  <div class="chips">${chips}</div>
  <div class="kpi-grid">
    <div class="kpi"><div class="k-label">Talhões${seqSaf?' (safrinha)':''}</div><div class="k-value">${talhaoIds.length}</div><div class="k-sub">${talhaoIds.map(esc).join(', ')}</div></div>
    <div class="kpi"><div class="k-label">Área plantada</div><div class="k-value">${num(area)} ha</div></div>
    <div class="kpi"><div class="k-label">Custo insumos</div><div class="k-value">${brl0(custo)}</div></div>
    <div class="kpi"><div class="k-label">Insumos distintos</div><div class="k-value">${prods.length}</div></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h2>Adicionar insumo em massa</h2><span class="sub">aplica a ${cvs.length} talhão(ões)${seqSaf?' na safrinha':''}</span></div>
    <div class="bulk-add">
      <input list="prodlist" class="txt" id="ba-prod" placeholder="produto (escolha da lista)">
      <input class="cell" id="ba-dose" placeholder="dose/ha" style="width:90px">
      <label class="mut" style="font-size:12px">na operação nº <input class="cell" id="ba-op" value="1" style="width:52px"></label>
      <button class="btn btn-primary btn-sm" data-act="bulkadd" data-emp="${esc(sel)}">+ Adicionar a todos</button>
    </div>
  </div>
  <div class="toolbar"><div class="search"><input id="q-emp" placeholder="Buscar insumo ou classe…"></div>
    <div class="spacer"></div><span class="badge badge-muted">troque o produto ou a dose (aplica a todos os talhões) ou exclua — em massa</span></div>
  ${(()=>{ const classes=[...new Set(prods.map(p=>map[p].classe).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    return classes.length? `<div class="classe-filter" id="emp-cfilter">
      <button class="chip-f on" data-classef="">Todas</button>
      ${classes.map(c=>`<button class="chip-f" data-classef="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>`:''; })()}
  <div class="panel"><div class="panel-head"><h2>Insumos da cultura</h2><span class="sub">${prods.length} insumos</span></div>
    <div class="table-wrap"><table id="tbl-emp" class="cards-sm insumo-cards">
      <thead><tr><th>Classe</th><th>Produto</th><th class="num">Dose/ha</th><th>Un</th>
        <th class="num">Qtd total</th><th class="num">Preço</th><th class="num">Nos talhões</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="8" class="mut" style="padding:12px 14px">Sem insumos nesta cultura.</td></tr>'}</tbody>
    </table></div></div>
  <p class="mut" style="font-size:12px">Editar a dose aqui sobrescreve o insumo em <b>todos</b> os talhões desta cultura. “Dose: vários” significa que os talhões têm doses diferentes — digite um valor para uniformizar.</p>`;
};

/* ================= TELA INICIAL (porta de entrada: Planejamento × Campo) ================= */
V.inicio = function(){
  const m=currentModule();
  const card=(mod,ico,nome,desc,itens,hoverCls)=>`
    <button class="entry-card ${hoverCls}" data-act="pickmod" data-mod="${mod}">
      <span class="ec-ico">${ico}</span>
      <span class="ec-name">${nome}</span>
      <span class="ec-desc">${desc}</span>
      <ul class="ec-list">${itens.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>
      ${m===mod?'<span class="ec-badge">último usado</span>':''}
      <span class="ec-go">Entrar →</span>
    </button>`;
  return `
  <div class="entry">
    <div class="entry-brand"><span class="entry-logo">🌱</span>
      <div><div class="entry-title">Planejamento de Safra</div><div class="entry-sub">Safra 2026/2027 · favbalança</div></div></div>
    <h1 class="entry-h">Como você vai usar agora?</h1>
    <div class="entry-cards">
      ${card('planejamento','📋','Planejamento','Monte e ajuste o plano da safra.',
        ['Painel','Talhões','Empreendimentos','Demanda de Compras','Cotação','Máquinas','DRE'],'ec-plan')}
      ${card('campo','🧑‍🌾','Campo','Execute e registre as operações na lavoura.',
        ['Operação de Campo','Recomendação de aplicação','Realizado por insumo'],'ec-campo')}
    </div>
    <p class="entry-foot">Depois é só usar o botão <b>⇄ Trocar módulo</b> no topo. <span class="mut">v${APP_VERSION}</span></p>
  </div>`;
};

/* ================= MODO CAMPO (planejado × realizado) ================= */
const REAL_ST = { pendente:{lbl:'Pendente',cls:'st-pend'}, andamento:{lbl:'Em andamento',cls:'st-and'}, concluido:{lbl:'Concluída',cls:'st-ok'} };
function opsDoTalhao(t){
  const out=[];
  ['principal','safrinha'].forEach(seq=>{ const tag=seq==='safrinha'?'S':'P';
    (opsOf(t.id,seq)||[]).forEach((op,oi)=>out.push({seq,tag,oi,op,tagoi:`${tag}${oi}`,key:`${t.id}|${tag}${oi}`,
      cultura: seq==='safrinha'?empSafDe(t):empDe(t)})); });
  return out;
}
function realOf(key){ return OV.realizado[key]||null; }
function realEnsure(key){ return OV.realizado[key] || (OV.realizado[key]={status:'pendente',data:'',obs:'',doses:{},extras:[],app:{}}); }
function appEmpty(app){ return !app || !Object.keys(app).some(k=>app[k]!=null && app[k]!==''); }
function realClean(key){ const r=OV.realizado[key]; if(r && r.status==='pendente' && !r.data && !r.obs
  && !Object.keys(r.doses||{}).length && !((r.extras||[]).some(x=>x.produto||x.dose!=null)) && appEmpty(r.app)) delete OV.realizado[key]; }
// localiza operação a partir da chave "TL|tagOp"
function opFromKey(key){ const i=key.indexOf('|'); const talId=key.slice(0,i), tagoi=key.slice(i+1);
  const tag=tagoi[0], oi=+tagoi.slice(1), seq=tag==='S'?'safrinha':'principal';
  const op=(opsOf(talId,seq)||[])[oi]; return {talId,tagoi,op}; }
// duração entre "HH:MM" e "HH:MM" (em horas, atravessa a meia-noite se fim<início)
function durHoras(a,b){ if(!a||!b) return null; const pa=a.split(':'),pb=b.split(':');
  let mi=(+pa[0])*60+(+pa[1]), mf=(+pb[0])*60+(+pb[1]); if(mf<mi) mf+=1440; return (mf-mi)/60; }
// classifica o insumo pela unidade: 'L' = líquido (vai na calda); demais = sólido (distribuição)
function isLiquido(un){ const u=(un||'').trim().toLowerCase(); return u==='l'||u==='lt'||u==='ml'||u==='litro'||u==='cc'; }
// itens efetivos da operação (dose realizada, se houver, senão a planejada) + extras
function campoItems(talId, tagoi, opItens, r){
  return effItems(talId,tagoi,opItens).map(it=>{
    const iid=it.kind==='base'?String(it.ii):'a'+it.ai;
    const dose=(r.doses&&(iid in r.doses))?+r.doses[iid]:+it.dose;
    return {produto:it.produto,un:it.un,dose};
  }).concat((r.extras||[]).filter(e=>e.produto).map(e=>({produto:e.produto,un:(PROD[e.produto]&&PROD[e.produto].un)||'',dose:+e.dose||0})))
  .filter(x=>x.produto);
}
// recomendação de aplicação: líquidos (calda/tanque) e sólidos (só total na área) separados
function campoAppOut(talId, tagoi, opItens, r){
  const t=findTalhao(talId); if(!t) return '';
  const area=areaDe(t), app=r.app||{};
  const vazao=+app.vazao||0, tanque=+app.tanque||0;
  const caldaTotal=vazao>0?vazao*area:0;
  const nT=(tanque>0&&caldaTotal>0)?Math.ceil(caldaTotal/tanque):0;
  const haPorTanque=(vazao>0&&tanque>0)?tanque/vazao:0;
  const dur=durHoras(app.hIni,app.hFim);
  const all=campoItems(talId,tagoi,opItens,r);
  const liq=all.filter(x=>isLiquido(x.un)), sol=all.filter(x=>!isLiquido(x.un));
  const stat=(lbl,val)=>`<div class="app-stat"><span>${lbl}</span><b>${val}</b></div>`;
  const liqRows=liq.map(x=>{ const total=x.dose*area, porT=x.dose*haPorTanque;
    return `<tr><td>${esc(x.produto)}</td>
      <td class="num">${num(total)}<small> ${esc(x.un)}</small></td>
      <td class="num">${haPorTanque?num(porT):'—'}${haPorTanque?`<small> ${esc(x.un)}</small>`:''}</td></tr>`; }).join('');
  const solRows=sol.map(x=>{ const total=x.dose*area;
    return `<tr><td>${esc(x.produto)}</td>
      <td class="num">${num(x.dose)}<small> ${esc(x.un)}/ha</small></td>
      <td class="num">${num(total)}<small> ${esc(x.un)}</small></td></tr>`; }).join('');
  let html=`<div class="app-stats">
      ${stat('Área do talhão',num(area)+' ha')}
      ${liq.length?stat('Calda total',caldaTotal?num(caldaTotal)+' L':'—'):''}
      ${liq.length?stat('Nº de tanques',nT?nT+' × '+num(tanque)+' L':'—'):''}
      ${stat('Duração',dur!=null?nf1.format(dur)+' h':'—')}
    </div>`;
  if(liq.length){
    html+=`<div class="app-secttl">💧 Líquidos — ${app.tipo==='aereo'?'aéreo (air tractor)':'pulverizador'}</div>
      <table class="app-ins"><thead><tr><th>Insumo</th><th class="num">Total na área</th><th class="num">Por tanque</th></tr></thead>
        <tbody>${liqRows}</tbody></table>
      ${vazao&&tanque?`<p class="app-note">1 tanque cobre <b>${nf1.format(haPorTanque)} ha</b> (tanque ÷ vazão).</p>`:'<p class="app-note mut">Informe vazão (L/ha) e volume do tanque (L) para calcular tanques e volume por tanque.</p>'}`;
  }
  if(sol.length){
    html+=`<div class="app-secttl">📦 Sólidos — distribuição</div>
      <table class="app-ins"><thead><tr><th>Insumo</th><th class="num">Dose/ha</th><th class="num">Total na área</th></tr></thead>
        <tbody>${solRows}</tbody></table>`;
  }
  if(!all.length) html+='<p class="app-note mut">Preencha as doses realizadas para ver os volumes.</p>';
  return html;
}
function fmtDataBR(s){ const p=(s||'').split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; }
// monta o texto da recomendação de aplicação (para WhatsApp)
function campoAppMsg(key){
  const fk=opFromKey(key), t=findTalhao(fk.talId); if(!t) return '';
  const r=realOf(key)||{}, app=r.app||{};
  const tag=fk.tagoi[0], cultura=tag==='S'?empSafDe(t):empDe(t);
  const area=areaDe(t), vazao=+app.vazao||0, tanque=+app.tanque||0;
  const caldaTotal=vazao>0?vazao*area:0;
  const nT=(tanque>0&&caldaTotal>0)?Math.ceil(caldaTotal/tanque):0;
  const haPorTanque=(vazao>0&&tanque>0)?tanque/vazao:0;
  const dur=durHoras(app.hIni,app.hFim);
  const all=campoItems(fk.talId,fk.tagoi,fk.op?fk.op.itens:[],r);
  const liq=all.filter(x=>isLiquido(x.un)), sol=all.filter(x=>!isLiquido(x.un));
  const L=[];
  L.push(`🚿 *Aplicação* — ${t.id}${t.nome?' '+t.nome:''} (${num(area)} ha)`);
  const l1=[]; if(cultura&&cultura!=='—') l1.push(cultura); if(fk.op) l1.push(fk.op.nome);
  if(l1.length) L.push(l1.join(' · '));
  if(app.maq) L.push(`🚜 ${app.maq}`);
  if(liq.length){
    L.push(`${app.tipo==='aereo'?'✈️ Aéreo (air tractor)':'🚿 Pulverizador'}`);
    const l2=[]; if(vazao) l2.push(`Vazão ${num(vazao)} L/ha`); if(tanque) l2.push(`Tanque ${num(tanque)} L`);
    if(l2.length) L.push('💧 '+l2.join(' · '));
    if(caldaTotal) L.push(`🧪 Calda ${num(caldaTotal)} L · ${nT} tanque(s)`);
    L.push(''); L.push(haPorTanque?'*Líquidos (por tanque):*':'*Líquidos (total):*');
    liq.forEach(x=>{ const total=x.dose*area, porT=x.dose*haPorTanque;
      L.push(`• ${x.produto}: ${haPorTanque?num(porT):num(total)} ${x.un}`); });
  }
  if(sol.length){ L.push(''); L.push('*Sólidos (total na área):*');
    sol.forEach(x=>{ const total=x.dose*area; L.push(`• ${x.produto}: ${num(total)} ${x.un}`); }); }
  if(r.obs) L.push(`\n📝 ${r.obs}`);
  // link de resposta: abre um questionário no WhatsApp para o operador informar o volume utilizado
  const q=[];
  q.push(`📋 Volume utilizado — ${t.id}${fk.op?' · '+fk.op.nome:''}`);
  q.push('(preencha e envie de volta)');
  all.forEach(x=>q.push(`${x.produto}: ___ ${x.un}`));
  if(liq.length) q.push('Nº de tanques cheios: ___');
  q.push('Sobras / obs: ___');
  const replyUrl='https://wa.me/?text='+encodeURIComponent(q.join('\n'));
  L.push('');
  L.push('📝 Responder volume utilizado (toque para preencher):');
  L.push(replyUrl);
  return L.join('\n');
}
function campoProgress(){
  let total=0, done=0, running=0;
  talhoesAll().forEach(t=>opsDoTalhao(t).forEach(o=>{ total++; const r=realOf(o.key);
    if(r){ if(r.status==='concluido') done++; else if(r.status==='andamento') running++; } }));
  return {total,done,running};
}
V.campo = function(arg){
  const all=talhoesAll();
  if(!all.length) return `<div class="empty">Nenhum talhão para operar.</div>`;
  const selId=(arg && all.some(t=>t.id===arg))?arg:all[0].id;
  const t=all.find(x=>x.id===selId);
  const prog=campoProgress(), pctDone=prog.total?Math.round(prog.done/prog.total*100):0;
  const tOpt=all.map(x=>{ const ops=opsDoTalhao(x);
    const d=ops.filter(o=>{const r=realOf(o.key);return r&&r.status==='concluido';}).length;
    return `<option value="${esc(x.id)}"${x.id===selId?' selected':''}>${esc(x.id)} · ${esc(x.nome||'')} — ${d}/${ops.length} ok</option>`; }).join('');
  const ops=opsDoTalhao(t);
  const opsHtml=ops.map(o=>{
    const r=realOf(o.key)||{status:'pendente',data:'',obs:'',doses:{},extras:[]};
    const items=effItems(t.id,o.tagoi,o.op.itens);
    const insRows=items.map(it=>{
      const iid=it.kind==='base'?String(it.ii):'a'+it.ai;
      const rv=(r.doses&&(iid in r.doses))?r.doses[iid]:'';
      const diff=rv!=='' && +rv!==+it.dose;
      return `<tr>
        <td class="ci-prod">${it.classe?`<span class="classe-tag">${esc(it.classe)}</span> `:''}<b>${esc(it.produto||'—')}</b></td>
        <td class="num ci-plan">${num(it.dose)}<small> ${esc(it.un||'')}</small></td>
        <td class="num ci-real"><input class="cell${diff?' edited':''}" inputmode="decimal" data-edit="realDose" data-key="${esc(o.key)}" data-iid="${iid}" value="${rv}" placeholder="${num(it.dose)}"></td>
      </tr>`;
    }).join('');
    const extrasRows=(r.extras||[]).map((ex,ei)=>`<tr class="ci-extra">
        <td class="ci-prod"><span class="pill pill-buy">extra</span> <input list="prodlist" class="txt prod-in" data-edit="realExtraProd" data-key="${esc(o.key)}" data-ei="${ei}" value="${esc(ex.produto||'')}" placeholder="insumo usado fora do plano"></td>
        <td class="num ci-plan mut">—</td>
        <td class="num ci-real"><input class="cell" inputmode="decimal" data-edit="realExtraDose" data-key="${esc(o.key)}" data-ei="${ei}" value="${ex.dose!=null?ex.dose:''}" placeholder="dose">
          <button class="icon-btn del" title="Remover extra" data-act="realDelExtra" data-key="${esc(o.key)}" data-ei="${ei}">🗑</button></td>
      </tr>`).join('');
    const st=REAL_ST[r.status]||REAL_ST.pendente;
    const sbtn=v=>`<button class="camp-st ${REAL_ST[v].cls}${r.status===v?' on':''}" data-act="realStatus" data-key="${esc(o.key)}" data-val="${v}">${REAL_ST[v].lbl}</button>`;
    return `<div class="camp-op ${st.cls}">
      <div class="camp-op-head">
        <div class="camp-op-title">${esc(o.op.nome)}<small>${esc(o.cultura||'')}${o.seq==='safrinha'?' · 2ª safra':''}</small></div>
        <span class="camp-badge ${st.cls}">${st.lbl}</span>
      </div>
      <div class="camp-strow">${sbtn('pendente')}${sbtn('andamento')}${sbtn('concluido')}</div>
      <div class="camp-date"><label>Data de execução</label><input type="date" data-edit="realData" data-key="${esc(o.key)}" value="${esc(r.data||'')}"></div>
      <div class="table-wrap"><table class="camp-ins">
        <thead><tr><th>Insumo</th><th class="num">Planejado</th><th class="num">Realizado</th></tr></thead>
        <tbody>${insRows||'<tr><td colspan="3" class="mut" style="padding:8px 10px">Sem insumos planejados nesta operação.</td></tr>'}${extrasRows}</tbody>
      </table></div>
      <button class="btn btn-outline btn-sm" data-act="realAddExtra" data-key="${esc(o.key)}">+ insumo extra</button>
      <details class="camp-app panel-collapse">
        <summary class="camp-app-sum"><span>🚿 Recomendação de aplicação</span><span class="panel-chevron">▸</span></summary>
        <div class="camp-app-in">
          <div class="app-grid">
            <label>Tipo (líquidos)<select class="sel" data-edit="realApp" data-field="tipo" data-key="${esc(o.key)}">
              <option value="terrestre"${(r.app&&r.app.tipo==='aereo')?'':' selected'}>Pulverizador (terrestre)</option>
              <option value="aereo"${(r.app&&r.app.tipo==='aereo')?' selected':''}>Aéreo (air tractor)</option>
            </select></label>
            <label>Máquina/aeronave<select class="sel" data-edit="realApp" data-field="maq" data-key="${esc(o.key)}">
              <option value="">— máquina —</option>
              ${maquinasAll().map(mm=>`<option value="${esc(mm.conjunto)}"${((r.app&&r.app.maq!=null?r.app.maq:(opMaqDe(t.id,o.tag,o.oi,o.op)||''))===mm.conjunto)?' selected':''}>${esc(mm.conjunto)}</option>`).join('')}
            </select></label>
            <label>Tanque (L) — líquidos<input class="cell" inputmode="decimal" data-edit="realApp" data-field="tanque" data-key="${esc(o.key)}" value="${r.app&&r.app.tanque!=null?r.app.tanque:''}" placeholder="ex.: 2000"></label>
            <label>Vazão (L/ha) — líquidos<input class="cell" inputmode="decimal" data-edit="realApp" data-field="vazao" data-key="${esc(o.key)}" value="${r.app&&r.app.vazao!=null?r.app.vazao:''}" placeholder="ex.: 100"></label>
            <label>Início<input type="time" data-edit="realApp" data-field="hIni" data-key="${esc(o.key)}" value="${esc((r.app&&r.app.hIni)||'')}"></label>
            <label>Fim<input type="time" data-edit="realApp" data-field="hFim" data-key="${esc(o.key)}" value="${esc((r.app&&r.app.hFim)||'')}"></label>
          </div>
          <div class="app-adjust">
            <span>Ajustar vazão para</span>
            <input class="cell" inputmode="numeric" data-adjust-n value="" placeholder="nº" style="width:58px">
            <span>tanque(s) cheios na área</span>
            <button class="btn btn-outline btn-sm" data-act="ajustVazao" data-key="${esc(o.key)}">Calcular vazão</button>
          </div>
          <div class="camp-appout" data-appout="${esc(o.key)}">${campoAppOut(t.id,o.tagoi,o.op.itens,r)}</div>
          <button class="btn btn-wa btn-sm" data-act="waApp" data-key="${esc(o.key)}">📲 Enviar recomendação por WhatsApp</button>
        </div>
      </details>
      <div class="camp-obs"><label>Observações do campo</label><textarea data-edit="realObs" data-key="${esc(o.key)}" rows="2" placeholder="ex.: condições do tempo, ajustes, ocorrências">${esc(r.obs||'')}</textarea></div>
    </div>`;
  }).join('') || '<div class="mut" style="padding:14px">Este talhão não tem operações planejadas.</div>';
  return `${prodDatalist()}
  <div class="camp-top">
    <div class="camp-prog">
      <div class="camp-prog-bar"><div style="width:${pctDone}%"></div></div>
      <div class="camp-prog-txt"><b>${prog.done}</b>/${prog.total} operações concluídas · ${pctDone}%${prog.running?` · ${prog.running} em andamento`:''}</div>
    </div>
    <div class="camp-sel"><label>Talhão</label><select class="sel" id="camp-talhao">${tOpt}</select></div>
  </div>
  <div class="camp-tinfo">📍 <b>${esc(t.id)}</b> ${esc(t.nome||'')} · ${esc(empDe(t)||'—')}${empSafDe(t)&&empSafDe(t)!=='—'?` / ${esc(empSafDe(t))}`:''} · ${num(areaDe(t))} ha</div>
  ${opsHtml}
  <p class="mut" style="font-size:11px;text-align:center;margin:12px 0 4px">O realizado fica salvo <b>no aparelho</b>. Digite a dose aplicada em cada insumo (deixe em branco = conforme o plano). Use “+ insumo extra” para aplicações fora do plano.</p>`;
};

V.sync = function(){
  const url=syncUrl(), eds=buildFieldEdits(), on=autoOn();
  return `
  <div class="panel"><div class="panel-head"><h2>Sincronização com a planilha</h2><span class="sub">Google Sheets — planilha como verdade</span></div>
    <div style="padding:16px 18px">
      <label class="mut" style="font-size:12px;font-weight:700">URL do Web App (Apps Script)</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        <input class="txt" id="sync-url" value="${esc(url)}" placeholder="https://script.google.com/macros/s/…/exec" style="flex:1;min-width:260px">
        <button class="btn btn-outline btn-sm" data-act="sync-save">Salvar URL</button>
      </div>
      <label class="switch" style="margin-top:16px">
        <input type="checkbox" id="sync-auto" ${on?'checked':''} data-edit="autoSync">
        <span class="track"></span>
        <span><b>Sincronização automática</b> — envia suas edições e puxa a planilha sozinho (ao abrir, ao voltar pro app e periodicamente)</span>
      </label>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary" data-act="sync-pull">⬇ Buscar última atualização</button>
        <button class="btn btn-outline" data-act="sync-push">⬆ Enviar agora (${eds.length})</button>
      </div>
      <div id="sync-last" class="sync-last">${lastSyncTxt()}</div>
      <div id="sync-log" class="sync-log"></div>
      <p class="mut" style="font-size:12px;margin-top:12px">Com a <b>sincronização automática</b> ligada e a URL salva: o app <b>puxa</b> a planilha ao abrir e periodicamente, e <b>envia</b> suas edições automaticamente pouco depois de você mexer. A <b>planilha é a verdade</b> — ela sempre vence em conflito.<br>
      <b>Vai para a planilha (nos dois sentidos):</b> dose, preço, estoque, área, produtividade, <b>1ª e 2ª cultura</b> (empreendimento/safrinha) e produtividade da safrinha, <b>troca de produto</b> de um insumo, e insumos <b>adicionados/removidos</b> de uma operação existente.<br>
      <b>Fica só no app</b> (para não quebrar as fórmulas/estrutura da planilha): operações, talhões e máquinas <b>criados</b> no app, e os ajustes de máquina (largura/velocidade, que na planilha vêm de fórmulas).<br>
      Os botões acima forçam um puxar/enviar imediato quando você quiser.</p>
    </div></div>
  <div class="panel"><div class="panel-head"><h2>Histórico de sincronização</h2><span class="sub">últimas 50</span>
      <div class="spacer"></div><button class="btn btn-ghost btn-sm" data-act="hist-clear">Limpar histórico</button></div>
    <div id="sync-hist" class="sync-hist">${histRowsHtml()}</div></div>
  <div class="panel"><div class="panel-head"><h2>Configurar (uma vez)</h2></div>
    <ol class="mut" style="font-size:13px;line-height:1.75;padding:12px 34px;margin:0">
      <li>Abra sua planilha no Google Sheets → <b>Extensões → Apps Script</b>.</li>
      <li>Cole o conteúdo de <code>sync/Code.gs</code> (do repositório) e salve.</li>
      <li><b>Implantar → Nova implantação → App da Web</b>. Executar como <b>Você</b>; acesso <b>Qualquer pessoa</b>.</li>
      <li>Copie a URL (termina em <code>/exec</code>), cole acima e <b>Salvar URL</b>.</li>
      <li>Clique em <b>Puxar da planilha</b>.</li>
    </ol>
    <p class="mut" style="font-size:12px;padding:0 18px 14px">Obs.: a sincronização funciona na versão publicada (GitHub Pages) — na pré-visualização hospedada da Claude o navegador bloqueia chamadas externas.</p>
  </div>
  <p class="mut" style="font-size:11px;text-align:center;margin:-6px 0 8px">Versão do app: <b>v${APP_VERSION}</b></p>`;
};

/* ================= ROUTER ================= */
const TITLES={inicio:'Início',dashboard:'Painel',talhoes:'Talhões',talhao:'Talhão',campo:'Operação de Campo',compras:'Demanda de Compras',cotacao:'Cotação por Fornecedor',maquinas:'Máquinas',dre:'DRE Orçada',empreendimentos:'Empreendimentos',sync:'Sincronizar'};
function route(opts){
  const keepScroll = opts && opts.keepScroll===true;   // re-render silencioso (sync) não rola pro topo
  const hash=location.hash.replace(/^#\//,'')||'dashboard';
  const [view,arg]=hash.split('/');
  const fn=V[view];
  // mantém o módulo ativo em sincronia com a tela aberta (telas exclusivas trocam o módulo)
  const vm=VIEW_MOD[view]||'planejamento';
  if(vm!=='both' && vm!==currentModule()) localStorage.setItem(MOD_KEY,vm);
  applyModule();
  document.body.dataset.view=view;   // permite esconder a navegação na tela inicial
  $('#page-title').textContent=TITLES[view]||'Painel';
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===view));
  try{ $('#content').innerHTML = fn?fn(decodeURIComponent(arg||'')):`<div class="empty">Página não encontrada.</div>`; }
  catch(e){ $('#content').innerHTML=`<div class="empty">Erro ao renderizar: ${esc(e.message)}</div>`; console.error(e); }
  if(!keepScroll){ $('.main').scrollTop=0; window.scrollTo(0,0); }
}
// está editando? (campo focado ou digitou há pouco) — usado para não puxar/re-renderizar por cima
function isEditing(){
  const a=document.activeElement;
  if(a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return true;
  return (Date.now()-lastInputTs) < 6000;
}

/* ================= EVENTOS ================= */
function applyEdit(el){
  const kind=el.dataset.edit;
  if(!kind) return;
  if(kind==='autoSync'){ setAutoOn(el.checked); syncLog(el.checked?'Sincronização automática ligada.':'Sincronização automática desligada.'); if(el.checked) toast('Sincronização automática ligada'); else{ clearInterval(pollTimer); toast('Sincronização automática desligada'); } return; }
  if(kind==='opMaq'){   // valor é o conjunto (string); "" = sem máquina
    const k=opMaqKey(el.dataset.id, el.dataset.op);
    OV.opMaq[k]=el.value; saveOverrides(); route(); return;
  }
  if(kind==='itemProd'||kind==='itemProdAdd'){   // troca de produto (string)
    const v=el.value.trim();
    if(v && !PROD[v]){ toast('Produto não encontrado na lista'); route(); return; }
    const tid=el.dataset.id, op=el.dataset.op;
    if(kind==='itemProd'){
      const seq=op[0]==='S'?'safrinha':'principal', oi=+op.slice(1), ii=+el.dataset.item;
      const base=planoDe(tid)[seq][oi].itens[ii].produto, key=`${tid}|${op}|${ii}`;
      if(!v||v===base) delete OV.itemProd[key]; else OV.itemProd[key]=v;
    } else {
      const arr=OV.itemAdd[`${tid}|${op}`]; if(arr&&arr[+el.dataset.ai]) arr[+el.dataset.ai].produto=v;
    }
    saveOverrides(); route(); return;
  }
  if(kind==='emp'||kind==='empSaf'){   // cultura (1ª/2ª) — string
    const id=el.dataset.id, tt=findTalhao(id), v=el.value.trim();
    OV.talhao[id]=OV.talhao[id]||{};
    const key=kind==='emp'?'empreendimento':'emp_safrinha';
    const base=kind==='emp'?(tt.empreendimento||''):(tt.emp_safrinha||'');
    if(v===base) delete OV.talhao[id][key]; else OV.talhao[id][key]=v;
    if(!Object.keys(OV.talhao[id]).length) delete OV.talhao[id];
    saveOverrides(); route(); return;
  }
  if(kind==='bulkProd'){   // troca de produto em massa na cultura (string)
    const v=el.value.trim(), old=el.dataset.prod;
    if(!v||!PROD[v]){ toast('Produto não encontrado na lista'); route(); return; }
    if(v===old){ return; }
    const nn=bulkSwapProd(el.dataset.emp, old, v);
    saveOverrides(); route(); toast(nn?`Insumo trocado em ${nn} local(is)`:'Nada para trocar');
    return;
  }
  if(kind==='realData'||kind==='realObs'){   // modo Campo: data / observação (string) — local
    const r=realEnsure(el.dataset.key);
    if(kind==='realData') r.data=el.value; else r.obs=el.value;
    realClean(el.dataset.key); saveOverrides();
    if(kind==='realData') route();   // obs não re-renderiza (mantém o cursor)
    return;
  }
  if(kind==='realExtraProd'){   // modo Campo: produto do insumo extra (string) — local
    const v=el.value.trim();
    if(v && !PROD[v]){ toast('Produto não encontrado na lista'); return; }
    const r=realEnsure(el.dataset.key); (r.extras[+el.dataset.ei]||(r.extras[+el.dataset.ei]={})).produto=v;
    realClean(el.dataset.key); saveOverrides(); return;
  }
  if(kind==='realApp'){   // modo Campo: recomendação de aplicação (máquina/horas/vazão/tanque) — local
    const r=realEnsure(el.dataset.key); r.app=r.app||{}; const f=el.dataset.field;
    if(f==='vazao'||f==='tanque'){ const val=el.value.trim().replace(',','.'); r.app[f]=val===''?null:parseFloat(val); }
    else { r.app[f]=el.value; }
    realClean(el.dataset.key); saveOverrides();
    // atualiza só o quadro de cálculo (sem re-render, para não rolar a tela)
    const fk=opFromKey(el.dataset.key), box=document.querySelector('[data-appout="'+el.dataset.key+'"]');
    if(box) box.innerHTML=campoAppOut(fk.talId, fk.tagoi, fk.op?fk.op.itens:[], (OV.realizado[el.dataset.key]||r));
    return;
  }
  if(kind==='realDose'||kind==='realExtraDose'){   // modo Campo: dose realizada (número) — local
    const val=el.value.trim().replace(',','.'), q=val===''?null:parseFloat(val);
    const r=realEnsure(el.dataset.key);
    if(kind==='realDose'){ if(q==null) delete r.doses[el.dataset.iid]; else r.doses[el.dataset.iid]=q; }
    else { const ex=r.extras[+el.dataset.ei]||(r.extras[+el.dataset.ei]={}); ex.dose=(q==null?null:q); }
    realClean(el.dataset.key); saveOverrides();
    el.classList.toggle('edited', q!=null);   // sem re-render: não rola a tela ao preencher várias doses
    return;
  }
  const val=el.value.trim().replace(',','.'), n=val===''?null:parseFloat(val);
  if(kind==='estoque'){ if(n==null||n===PROD[el.dataset.prod].estoque) delete OV.estoque[el.dataset.prod]; else OV.estoque[el.dataset.prod]=n; }
  else if(kind==='pedido'){ if(n==null||n===0) delete OV.pedido[el.dataset.prod]; else OV.pedido[el.dataset.prod]=n; }
  else if(kind==='cultura'){ const e=el.dataset.emp; if(n==null||n===(DATA.precos_cultura[e]||0)) delete OV.cultura[e]; else OV.cultura[e]=n; }
  else if(kind==='maquina'){ const c=el.dataset.conj, m=maqByConj[c]; if(n==null||(m&&n===m.rs_hm&&!OV.maqAdd.some(x=>x.conjunto===c))) delete OV.maquina[c]; else OV.maquina[c]=n; }
  else if(kind==='maqAttr'){ const c=el.dataset.conj, k=el.dataset.attr; OV.maqAttr[c]=OV.maqAttr[c]||{}; if(n==null) delete OV.maqAttr[c][k]; else OV.maqAttr[c][k]=n; if(!Object.keys(OV.maqAttr[c]).length) delete OV.maqAttr[c]; }
  else if(kind==='diesel'){ OV.diesel = (n==null?6.00:n); }
  else if(kind==='dreOp'){ const e=el.dataset.emp; if(n==null) delete OV.dreOp[e]; else OV.dreOp[e]=n; }
  else if(kind==='arrend'){ const e=el.dataset.emp; if(n==null||n===0) delete OV.arrend[e]; else OV.arrend[e]=n; }
  else if(kind==='prodSaf'){ const id=el.dataset.id, tt=findTalhao(id); OV.talhao[id]=OV.talhao[id]||{}; const base=(tt.prod_safrinha||0); if(n==null||n===base) delete OV.talhao[id].prod_safrinha; else OV.talhao[id].prod_safrinha=n; if(!Object.keys(OV.talhao[id]).length) delete OV.talhao[id]; }
  else if(kind==='dose'){ const k=doseKey(el.dataset.id,el.dataset.op,el.dataset.item); if(n==null) delete OV.dose[k]; else OV.dose[k]=n; }
  else if(kind==='doseAdd'){ const arr=OV.itemAdd[`${el.dataset.id}|${el.dataset.op}`]; if(arr&&arr[+el.dataset.ai]) arr[+el.dataset.ai].dose=(n==null?0:n); }
  else if(kind==='bulkDose'){ if(n!=null) bulkSetDose(el.dataset.emp, el.dataset.prod, n); }
  else if(kind==='area'||kind==='prodv'){
    const id=el.dataset.id, t=findTalhao(id); OV.talhao[id]=OV.talhao[id]||{};
    const base= kind==='area'?t.area:t.produtividade, key= kind==='area'?'area':'produtividade';
    if(n==null||n===base) delete OV.talhao[id][key]; else OV.talhao[id][key]=n;
    if(!Object.keys(OV.talhao[id]).length) delete OV.talhao[id];
  }
  saveOverrides(); route();
}
// ---- CRUD de insumos (individual + em massa) ----
function delItem(a){
  if(a.kind==='add'){ const k=`${a.id}|${a.op}`, arr=OV.itemAdd[k]; if(arr){ arr.splice(+a.ai,1); if(!arr.length) delete OV.itemAdd[k]; } }
  else { const rk=`${a.id}|${a.op}|${a.item}`; OV.itemRemoved[rk]=true; delete OV.dose[rk]; delete OV.itemProd[rk]; }
}
function eachOpSeq(t,seq,cb){
  const tag=seq==='safrinha'?'S':'P';
  opsOf(t.id,seq).forEach((op,oi)=>cb(tag,oi,op,`${tag}${oi}`));
}
function bulkSetDose(emp,prod,dose){
  cultivosDaEmp(emp).forEach(({t,seq})=>eachOpSeq(t,seq,(tag,oi,op,tagoi)=>{
    effItems(t.id,tagoi,op.itens).forEach(it=>{
      if(it.produto!==prod) return;
      if(it.kind==='base') OV.dose[it.key]=dose;
      else { const arr=OV.itemAdd[`${t.id}|${tagoi}`]; if(arr&&arr[it.ai]) arr[it.ai].dose=dose; }
    });
  }));
}
// troca de produto EM MASSA: substitui um insumo por outro em todos os talhões da cultura
function bulkSwapProd(emp, oldProd, newProd){
  if(!newProd || !PROD[newProd] || newProd===oldProd) return 0;
  let n=0;
  cultivosDaEmp(emp).forEach(({t,seq})=>eachOpSeq(t,seq,(tag,oi,op,tagoi)=>{
    effItems(t.id,tagoi,op.itens).forEach(it=>{
      if(it.produto!==oldProd) return;
      if(it.kind==='base'){
        const base=op.itens[it.ii].produto;
        if(newProd===base) delete OV.itemProd[it.key]; else OV.itemProd[it.key]=newProd;
      } else {
        const arr=OV.itemAdd[`${t.id}|${tagoi}`]; if(arr&&arr[it.ai]) arr[it.ai].produto=newProd;
      }
      n++;
    });
  }));
  return n;
}
function bulkDelProd(emp,prod){
  cultivosDaEmp(emp).forEach(({t,seq})=>eachOpSeq(t,seq,(tag,oi,op,tagoi)=>{
    const akey=`${t.id}|${tagoi}`, arr=OV.itemAdd[akey];
    if(arr){ for(let i=arr.length-1;i>=0;i--) if(arr[i].produto===prod) arr.splice(i,1); if(!arr.length) delete OV.itemAdd[akey]; }
    op.itens.forEach((bit,ii)=>{
      const rk=`${t.id}|${tagoi}|${ii}`, eff=(rk in OV.itemProd)?OV.itemProd[rk]:bit.produto;
      if(!OV.itemRemoved[rk] && eff===prod){ OV.itemRemoved[rk]=true; delete OV.dose[rk]; delete OV.itemProd[rk]; }
    });
  }));
}
function bulkAdd(emp,prod,dose,opNum){
  let n=0;
  cultivosDaEmp(emp).forEach(({t,seq,tag})=>{
    const ops=opsOf(t.id,seq); if(!ops.length) return;
    const oi=Math.max(0,Math.min(ops.length-1,(opNum|0)-1)), key=`${t.id}|${tag}${oi}`;
    (OV.itemAdd[key]=OV.itemAdd[key]||[]).push({produto:prod,dose:dose||0}); n++;
  });
  return n;
}
function copiaMaquinas(srcId,dstId,plano){
  ['P','S'].forEach(tag=>{
    (plano[tag==='S'?'safrinha':'principal']||[]).forEach((op,oi)=>{
      const k=opMaqKey(srcId,`${tag}${oi}`);
      if(k in OV.opMaq) OV.opMaq[opMaqKey(dstId,`${tag}${oi}`)]=OV.opMaq[k];
    });
  });
}

document.addEventListener('change',e=>{
  if(e.target.id==='camp-talhao'){ location.hash='#/campo/'+encodeURIComponent(e.target.value); return; }
  if(e.target.matches('input[data-edit], select[data-edit], textarea[data-edit]')) applyEdit(e.target);
});
document.addEventListener('keydown',e=>{ if(e.target.matches('input[data-edit]')&&e.key==='Enter') e.target.blur(); });
document.addEventListener('click',e=>{
  const cf=e.target.closest('#emp-cfilter .chip-f');
  if(cf){ cf.parentElement.querySelectorAll('.chip-f').forEach(bb=>bb.classList.remove('on')); cf.classList.add('on'); applyEmpFilter(); return; }
  const go=e.target.closest('[data-go]'); if(go){ e.preventDefault(); location.hash=go.dataset.go; return; }
  const act=e.target.closest('[data-act]');
  if(act){
    const a=act.dataset;
    if(a.act==='delitem'){ delItem(a); saveOverrides(); route(); }
    else if(a.act==='additem'){ const k=`${a.id}|${a.op}`; (OV.itemAdd[k]=OV.itemAdd[k]||[]).push({produto:'',dose:0}); saveOverrides(); route(); }
    else if(a.act==='addop'){ const rk=`${a.id}|${a.tag}`;
      const shown=opsShownCount(a.id,a.tag), seq=a.tag==='S'?'safrinha':'principal', total=(planoDe(a.id)[seq]||[]).length;
      if(shown>=total){ toast('As 12 operações da planilha já estão em uso'); return; }
      revealOps[rk]=shown+1; route(); }
    else if(a.act==='bulkdel'){ if(ask(`Excluir "${a.prod}" de todos os talhões de ${a.emp}?`)){ bulkDelProd(a.emp,a.prod); saveOverrides(); route(); toast('Excluído da cultura'); } }
    else if(a.act==='bulkadd'){
      const prod=($('#ba-prod').value||'').trim();
      const dose=parseFloat((($('#ba-dose').value)||'').replace(',','.'))||0;
      const opn=parseInt($('#ba-op').value)||1;
      if(!prod||!PROD[prod]){ toast('Escolha um produto válido da lista'); return; }
      const n=bulkAdd(a.emp,prod,dose,opn); saveOverrides(); route(); toast(`Adicionado em ${n} talhões`);
    }
    else if(a.act==='createtalhao'){
      const nome=($('#nt-nome').value||'').trim(), emp=($('#nt-emp').value||'').trim();
      const area=parseFloat(($('#nt-area').value||'').replace(',','.'))||0;
      const prod=parseFloat(($('#nt-prod').value||'').replace(',','.'))||0;
      const copy=$('#nt-copy').value, id=nextTalhaoId();
      const plano=copy?snapshotPlano(copy):{principal:[{nome:'OPERAÇÃO 1',itens:[]}],safrinha:[]};
      OV.talhaoAdd.push({id,nome:nome||id,empreendimento:emp,produtividade:prod,area,plano});
      if(copy) copiaMaquinas(copy,id,plano);
      saveOverrides(); toast(`Talhão ${id} criado`); location.hash='#/talhao/'+id;
    }
    else if(a.act==='pdftalhao'){ exportTalhaoPDF(a.id); }
    else if(a.act==='duptalhao'){
      const s=findTalhao(a.id); if(!s) return;
      const id=nextTalhaoId(), plano=snapshotPlano(a.id);
      OV.talhaoAdd.push({id,nome:(s.nome||a.id)+' (cópia)',empreendimento:s.empreendimento,produtividade:prodvDe(s),area:areaDe(s),plano});
      copiaMaquinas(a.id,id,plano);
      saveOverrides(); toast(`Plano duplicado em ${id}`); location.hash='#/talhao/'+id;
    }
    else if(a.act==='deltalhao'){
      if(!ask(`Excluir o talhão ${a.id}? Remove-o do plano (dá para restaurar tudo depois).`)) return;
      if(a.novo==='1'){ const i=OV.talhaoAdd.findIndex(t=>t.id===a.id); if(i>=0) OV.talhaoAdd.splice(i,1); cleanTalhaoOverlays(a.id); }
      else OV.talhaoRemoved[a.id]=true;
      saveOverrides(); toast(`Talhão ${a.id} excluído`);
      if(location.hash.startsWith('#/talhao/')) location.hash='#/talhoes'; else route();
    }
    else if(a.act==='addmaq'){
      const maq=($('#mq-maq').value||'').trim(), imp=($('#mq-imp').value||'').trim();
      const nn=id=>parseFloat(($('#'+id).value||'').replace(',','.'))||0;
      if(!maq&&!imp){ toast('Informe máquina e/ou implemento'); return; }
      let conj=(maq+(imp?' + '+imp:'')).trim(), base=conj, i=2; while(maqByConj[conj]){ conj=base+' ('+i+')'; i++; }
      OV.maqAdd.push({conjunto:conj,maquina:maq,implemento:imp,largura:nn('mq-larg'),velocidade:nn('mq-vel'),
        eficiencia:nn('mq-efic')||85,l_h:nn('mq-lh'),rs_hm:nn('mq-rs')});
      saveOverrides(); route(); toast('Conjunto montado: '+conj);
    }
    else if(a.act==='delmaq'){
      const c=a.conj, i=OV.maqAdd.findIndex(x=>x.conjunto===c); if(i>=0) OV.maqAdd.splice(i,1);
      delete OV.maqAttr[c]; delete OV.maquina[c]; saveOverrides(); route(); toast('Conjunto excluído');
    }
    else if(a.act==='sync-save'){ const u=($('#sync-url').value||'').trim(); if(u) localStorage.setItem(SYNC_KEY,u); else localStorage.removeItem(SYNC_KEY); toast('URL salva'); syncLog('URL salva.'); setSyncStatus(); startPolling(); if(u&&autoOn()) syncPull({auto:true, silentToast:true}); }
    else if(a.act==='sync-pull'){ const u=($('#sync-url').value||'').trim(); if(u) localStorage.setItem(SYNC_KEY,u); syncPull({force:true}); }
    else if(a.act==='sync-push'){ const u=($('#sync-url').value||'').trim(); if(u) localStorage.setItem(SYNC_KEY,u); syncPush(); }
    else if(a.act==='hist-clear'){ if(confirm('Limpar o histórico de sincronização?')){ localStorage.removeItem(HIST_KEY); renderHist(); toast('Histórico limpo'); } }
    else if(a.act==='realStatus'){ const r=realEnsure(a.key); r.status=a.val; realClean(a.key); saveOverrides(); route(); }
    else if(a.act==='realAddExtra'){ const r=realEnsure(a.key); r.extras.push({produto:'',dose:null}); saveOverrides(); route(); }
    else if(a.act==='realDelExtra'){ const r=realOf(a.key); if(r&&r.extras){ r.extras.splice(+a.ei,1); realClean(a.key); saveOverrides(); route(); } }
    else if(a.act==='pickmod'){ const m=a.mod; localStorage.setItem(MOD_KEY,m); location.hash=moduleHome(m); }
    else if(a.act==='ajustVazao'){
      const wrap=act.closest('.app-adjust'), nEl=wrap&&wrap.querySelector('[data-adjust-n]');
      const n=parseFloat((((nEl&&nEl.value)||'').replace(',','.')));
      const fk=opFromKey(a.key), t=findTalhao(fk.talId), area=t?areaDe(t):0;
      const r=realEnsure(a.key); r.app=r.app||{}; const tanque=+r.app.tanque||0;
      if(!n||n<=0){ toast('Informe o número de tanques'); return; }
      if(!tanque){ toast('Preencha o volume do tanque primeiro'); return; }
      if(!area){ toast('Talhão sem área'); return; }
      const vazao=Math.floor((n*tanque/area)*100)/100;   // arredonda para baixo: garante caber em n tanques
      r.app.vazao=vazao; realClean(a.key); saveOverrides();
      const vz=document.querySelector('input[data-edit="realApp"][data-field="vazao"][data-key="'+a.key+'"]'); if(vz) vz.value=vazao;
      const box=document.querySelector('[data-appout="'+a.key+'"]'); if(box) box.innerHTML=campoAppOut(fk.talId,fk.tagoi,fk.op?fk.op.itens:[],r);
      toast(`Vazão ajustada: ${nf1.format(vazao)} L/ha para ${n} tanque(s)`);
    }
    else if(a.act==='waApp'){ const txt=campoAppMsg(a.key);
      if(!txt){ toast('Nada para enviar'); return; }
      window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank'); }
    return;
  }
  if(e.target.id==='btn-cot-csv') exportCotacaoCSV();
  if(e.target.id==='btn-cot-pdf') exportCotacaoPDF();
});
document.addEventListener('input',e=>{
  lastInputTs=Date.now();   // adia o puxar automático enquanto o usuário digita
  if(e.target.id==='q-compra') filterCompras(e.target.value);
  if(e.target.id==='q-talhao') filterTable('#tbl-talhoes',e.target.value);
  if(e.target.id==='q-emp') applyEmpFilter();
  if(e.target.id==='q-maq') filterTable('#tbl-maq',e.target.value);
  if(e.target.id==='q-cot') filterCotacao(e.target.value);
});
// busca na Cotação: filtra em todos os fornecedores e esconde painéis vazios
function filterCotacao(q){
  q=(q||'').toLowerCase().trim();
  document.querySelectorAll('#cot-groups .panel').forEach(p=>{
    let any=false;
    p.querySelectorAll('tbody tr').forEach(tr=>{
      const show=!q||(tr.dataset.search||'').includes(q);
      tr.style.display=show?'':'none'; if(show) any=true;
    });
    p.style.display=any?'':'none';
  });
}
// busca na Demanda de Compras: filtra em todos os grupos e esconde grupos vazios
function filterCompras(q){
  q=(q||'').toLowerCase().trim();
  document.querySelectorAll('#compras-groups .op-block').forEach(g=>{
    let any=false;
    g.querySelectorAll('tbody tr').forEach(tr=>{
      const show=!q||(tr.dataset.search||'').includes(q);
      tr.style.display=show?'':'none'; if(show) any=true;
    });
    g.style.display=any?'':'none';
    g.classList.toggle('force-open', !!q);  // durante a busca, mostra o conteúdo mesmo se recolhido
  });
}
// celular: tocar no cartão mostra/esconde os detalhes (ignora campos editáveis)
document.addEventListener('click',e=>{
  if(!window.matchMedia('(max-width:640px)').matches) return;
  if(e.target.closest('input,select,button,a,label')) return;
  const tr=e.target.closest('.cards-sm tbody tr');
  if(!tr) return;
  tr.classList.toggle('open');
  const k=tr.getAttribute('data-cardkey');   // lembra o estado aberto p/ não fechar ao re-renderizar
  if(k){ if(tr.classList.contains('open')) openCards.add(k); else openCards.delete(k); }
});
// tocar no nome da operação recolhe/expande a lista de insumos dela (sem re-renderizar)
document.addEventListener('click',e=>{
  const tog=e.target.closest('[data-optoggle]'); if(!tog) return;
  const key=tog.getAttribute('data-optoggle'), block=tog.closest('.op-block');
  if(collapsedOps.has(key)){ collapsedOps.delete(key); block&&block.classList.remove('op-collapsed'); }
  else { collapsedOps.add(key); block&&block.classList.add('op-collapsed'); }
});
function filterTable(sel,q){
  q=q.toLowerCase().trim();
  document.querySelectorAll(sel+' tbody tr').forEach(tr=>{
    tr.style.display = !q||(tr.dataset.search||'').includes(q)?'':'none';
  });
}
// Empreendimentos: filtro por texto + classe combinados
function applyEmpFilter(){
  const qi=document.getElementById('q-emp'); const q=((qi&&qi.value)||'').toLowerCase().trim();
  const active=document.querySelector('#emp-cfilter .chip-f.on'); const cf=active?active.dataset.classef:'';
  document.querySelectorAll('#tbl-emp tbody tr').forEach(tr=>{
    const okQ=!q||(tr.dataset.search||'').includes(q);
    const okC=!cf||(tr.dataset.classe||'')===cf;
    tr.style.display=(okQ&&okC)?'':'none';
  });
}

/* export */
function download(name,content,type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function exportCotacaoCSV(){
  const rows=calcCompras().filter(r=>r.comprar>0)
    .sort((a,b)=>(a.empresa||'').localeCompare(b.empresa||'')||b.valor-a.valor);
  let csv='FORNECEDOR;PRODUTO;CLASSE;QTD;UN;PRECO_REF;VALOR_REF\n';
  rows.forEach(r=>{csv+=[r.empresa||'(sem fornecedor)',r.produto,r.classe,num(r.comprar),r.un,
    nf2.format(r.preco),nf2.format(r.valor)].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(';')+'\n';});
  download('cotacao_safra_2627.csv','﻿'+csv,'text/csv;charset=utf-8');
  toast('CSV de cotação exportado');
}
/* ---- exportar PDF (via impressão do navegador -> "Salvar como PDF") ---- */
function printDoc(html){
  let el=document.getElementById('print-area');
  if(!el){ el=document.createElement('div'); el.id='print-area'; document.body.appendChild(el); }
  el.innerHTML=html;
  setTimeout(()=>window.print(), 60);
}
// COTAÇÃO: um bloco por fornecedor (quebra de página), lista de insumo + volume
function exportCotacaoPDF(){
  const rows=calcCompras().filter(r=>r.comprar>0);
  if(!rows.length){ toast('Nada a cotar (sem itens a comprar)'); return; }
  const groups={}; rows.forEach(r=>{const k=r.empresa||'(sem fornecedor)';(groups[k]=groups[k]||[]).push(r);});
  const order=Object.keys(groups).sort((a,b)=>(a==='(sem fornecedor)')-(b==='(sem fornecedor)')||a.localeCompare(b));
  let html=`<div class="pdf-head"><h1>Cotação de insumos — Safra 2026/2027</h1>
    <div class="meta">${order.length} fornecedor(es) · gerado pelo app Planejamento</div></div>`;
  order.forEach((forn,i)=>{
    const its=groups[forn].slice().sort((a,b)=>(a.classe||'').localeCompare(b.classe||'')||a.produto.localeCompare(b.produto));
    html+=`<section class="${i>0?'pb':''}"><h2>${esc(forn)}</h2>
      <table><thead><tr><th>Insumo</th><th>Classe</th><th class="num">Volume</th><th>Un</th></tr></thead><tbody>`;
    its.forEach(r=>{ html+=`<tr><td>${esc(r.produto)}</td><td>${esc(r.classe||'—')}</td><td class="num">${num(r.comprar)}</td><td>${esc(r.un)}</td></tr>`; });
    html+=`</tbody></table>
      <div class="foot">Assinatura / condições: ______________________________________</div></section>`;
  });
  printDoc(html);
  toast('Gerando PDF da cotação — escolha "Salvar como PDF"');
}
// TALHÃO: planejamento do talhão por safra/empreendimento (operações, insumos e doses)
function exportTalhaoPDF(id){
  const t=findTalhao(id); if(!t){ toast('Talhão não encontrado'); return; }
  const area=areaDe(t), c=custoTalhao(t), maqHa=custoOpTalhaoHa(t), totHa=c.ha+maqHa;
  let html=`<div class="pdf-head"><h1>Planejamento — ${esc(t.id)} · ${esc(t.nome||'')}</h1>
    <div class="meta">Safra 2026/2027 · Área ${num(area)} ha · Custo total/ha ${brl(totHa)} · Custo total ${brl0(totHa*area)}</div></div>`;
  const seqBlock=(seq,tag,cultura,prod)=>{
    const ops=opsOf(t.id,seq); if(!ops.length) return '';
    let s=`<section><h2>${seq==='safrinha'?'2ª cultura (safrinha)':'1ª cultura'} — ${esc(cultura||'—')}${prod?` · ${num(prod)} sc/ha`:''}</h2>`;
    ops.forEach((op,oi)=>{
      const tagoi=`${tag}${oi}`, items=effItems(t.id,tagoi,op.itens);
      if(!items.length) return;   // não imprime operações vazias
      const conj=opMaqDe(t.id,tag,oi,op);
      s+=`<h3>${esc(op.nome)}${conj?` — 🚜 ${esc(conj)}`:''}</h3>
        <table><thead><tr><th>Classe</th><th>Insumo</th><th class="num">Dose/ha</th><th>Un</th><th class="num">Custo/ha</th></tr></thead><tbody>`;
      if(!items.length) s+=`<tr><td colspan="5">— sem insumos —</td></tr>`;
      items.forEach(it=>{ const p=precoDe(it.produto); s+=`<tr><td>${esc(it.classe||'—')}</td><td>${esc(it.produto)}</td><td class="num">${it.dose}</td><td>${esc(it.un)}</td><td class="num">${p>0?brl(it.dose*p):'—'}</td></tr>`; });
      s+=`</tbody></table>`;
    });
    return s+`</section>`;
  };
  html+=seqBlock('principal','P',empDe(t),prodvDe(t));
  if(temSafrinha(t)) html+=seqBlock('safrinha','S',empSafDe(t),prodSafDe(t));
  printDoc(html);
  toast('Gerando PDF do talhão — escolha "Salvar como PDF"');
}
/* ---- sincronização com a planilha (Apps Script Web App) ---- */
const SYNC_KEY='planejamento_sync_url';
const AUTO_KEY='planejamento_sync_auto';   // '0' desliga a sincronização automática
const POLL_MS=45000;                        // intervalo do puxar automático (quando a aba está visível)
const PUSH_DEBOUNCE=1500;                   // espera após a última edição antes de enviar
let syncBusy=false, pushTimer=null, pollTimer=null;
let lastPushSig='', lastRawSig='', lastInputTs=0, lastPushOk=true, pendingRerender=false;
function syncUrl(){ return localStorage.getItem(SYNC_KEY)||''; }
function autoOn(){ return localStorage.getItem(AUTO_KEY)!=='0'; }
function setAutoOn(b){ localStorage.setItem(AUTO_KEY, b?'1':'0'); if(b){ startPolling(); scheduleAutoPush(); } setSyncStatus(); }
function syncLog(msg){ const el=$('#sync-log'); if(el){ const d=document.createElement('div'); d.textContent=msg; el.appendChild(d); el.scrollTop=el.scrollHeight; } }
// histórico persistente de sincronização (data/hora, puxar/enviar, ok/falhas) — fica no localStorage
const HIST_KEY='planejamento_sync_hist';
const SYNC_LAST_KEY='planejamento_sync_last';   // timestamp da última sincronização bem-sucedida
function markSynced(){ localStorage.setItem(SYNC_LAST_KEY, String(Date.now())); const el=document.getElementById('sync-last'); if(el) el.textContent=lastSyncTxt(); }
function lastSyncTxt(){ const t=+localStorage.getItem(SYNC_LAST_KEY)||0; return t?('Última atualização: '+fmtHist(t)):'Ainda não sincronizado'; }
function syncHist(){ try{ return JSON.parse(localStorage.getItem(HIST_KEY)||'[]'); }catch(_){ return []; } }
function addHist(kind, ok, msg){
  const h=syncHist();
  h.unshift({t:Date.now(), kind:kind, ok:!!ok, msg:String(msg||'')});
  if(h.length>50) h.length=50;
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
  renderHist();
}
function fmtHist(t){
  const d=new Date(t), z=n=>String(n).padStart(2,'0');
  return `${z(d.getDate())}/${z(d.getMonth()+1)} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
function histRowsHtml(){
  const h=syncHist();
  if(!h.length) return '<div class="hist-empty mut">Nenhuma sincronização ainda.</div>';
  return h.map(e=>{
    const ic = e.kind==='pull' ? '⬇' : '⬆';
    const st = e.ok ? '✔' : '✖';
    return `<div class="hist-row ${e.ok?'is-ok':'is-err'}">`+
      `<span class="hist-when">${esc(fmtHist(e.t))}</span>`+
      `<span class="hist-kind">${ic} ${e.kind==='pull'?'Puxar':'Enviar'}</span>`+
      `<span class="hist-msg">${st} ${esc(e.msg)}</span></div>`;
  }).join('');
}
function renderHist(){ const el=$('#sync-hist'); if(el) el.innerHTML=histRowsHtml(); }
// chip de estado na barra superior: off | ok | busy | err
function setSyncStatus(state, msg){
  const el=$('#sync-status'); if(!el) return;
  if(!syncUrl()){ el.hidden=true; return; }
  el.hidden=false;
  const s = state || (syncBusy?'busy':(autoOn()?'ok':'off'));
  el.classList.remove('is-ok','is-busy','is-err','is-off');
  el.classList.add('is-'+s);
  const txt={ok:'Sincronizado',busy:'Sincronizando…',err:'Erro na sincronia',off:'Auto desligado'}[s]||'Local';
  const t=el.querySelector('.sync-status-txt'); if(t) t.textContent=msg||txt;
}
// assinatura das edições pendentes (para não reenviar/reler à toa)
function fieldSig(){ return JSON.stringify(buildFieldEdits()); }
// monta as edições de CAMPO a partir dos overrides (só talhões/produtos da planilha)
function buildFieldEdits(){
  if(!DATA) return [];
  const isBase=id=>DATA.planos.hasOwnProperty(id)||DATA.talhoes.some(t=>t.id===id);
  const eds=[];
  for(const k in OV.dose){ const p=k.split('|'); if(!isBase(p[0])) continue; if(String(p[2]).indexOf('a')===0) continue;
    eds.push({type:'dose',talhao:p[0],tag:p[1][0],op:+p[1].slice(1),item:+p[2],value:+OV.dose[k]}); }
  for(const pr in OV.estoque) eds.push({type:'estoque',produto:pr,value:+OV.estoque[pr]});
  for(const pr in OV.pedido)  eds.push({type:'pedido', produto:pr,value:+OV.pedido[pr]});
  // preço de referência: ajuste LOCAL do app (a coluna de preço da planilha é fórmula/importada) — não envia
  for(const id in OV.talhao){ if(!isBase(id)) continue; const o=OV.talhao[id];
    if(o.area!=null) eds.push({type:'area',talhao:id,value:+o.area});
    if(o.produtividade!=null) eds.push({type:'produtividade',talhao:id,value:+o.produtividade});
    if(o.empreendimento!=null) eds.push({type:'empreendimento',talhao:id,value:String(o.empreendimento)});
    if(o.emp_safrinha!=null) eds.push({type:'emp_safrinha',talhao:id,value:String(o.emp_safrinha)});
    if(o.prod_safrinha!=null) eds.push({type:'prod_safrinha',talhao:id,value:+o.prod_safrinha}); }
  // troca de produto de um insumo base -> grava classe/produto na linha (casa pelo produto ANTIGO)
  for(const rk in OV.itemProd){ const p=rk.split('|'); if(p.length<3) continue;
    const tid=p[0], tagoi=p[1], ii=+p[2]; if(!isBase(tid)) continue;
    const tag=tagoi[0], oi=+tagoi.slice(1), seq=tag==='S'?'safrinha':'principal';
    const op=(planoDe(tid)[seq]||[])[oi]; if(!op||!op.itens||!op.itens[ii]) continue;
    const from=op.itens[ii].produto, to=OV.itemProd[rk]; if(!from||!to||from===to) continue;
    const pr=PROD[to];
    eds.push({type:'itemprod',talhao:tid,tag,op:oi,from,to,classe:(pr&&pr.classe)||'',rk:rk}); }
  // insumos adicionados no app -> gravam em linhas vazias da operação (só operações-base de talhões-base)
  for(const key in OV.itemAdd){ const i=key.indexOf('|'); if(i<0) continue;
    const tid=key.slice(0,i), tagoi=key.slice(i+1);
    if(!isBase(tid)) continue;
    const tag=tagoi[0], oi=+tagoi.slice(1);
    const seq=tag==='S'?'safrinha':'principal';
    const baseLen=(planoDe(tid)[seq]||[]).length;
    if(!(oi<baseLen)) continue; // operação criada no app não existe na planilha
    OV.itemAdd[key].forEach(a=>{ if(!a.produto) return; const p=PROD[a.produto];
      eds.push({type:'additem',talhao:tid,tag,op:oi,classe:(p&&p.classe)||'',produto:a.produto,dose:+a.dose||0}); });
  }
  // insumos removidos de operações-base -> apaga a linha na planilha (casa pelo nome do produto)
  for(const rk in OV.itemRemoved){ const p=rk.split('|'); if(p.length<3) continue;
    const tid=p[0], tagoi=p[1], ii=+p[2];
    if(!isBase(tid)) continue;
    const tag=tagoi[0], oi=+tagoi.slice(1), seq=tag==='S'?'safrinha':'principal';
    const op=(planoDe(tid)[seq]||[])[oi]; if(!op||!op.itens||!op.itens[ii]) continue;
    const prod=op.itens[ii].produto; if(!prod) continue;
    eds.push({type:'delitem',talhao:tid,tag,op:oi,produto:prod,rk:rk});
  }
  return eds;
}
function applyPulledData(d){
  DATA=d; PROD={}; d.produtos.forEach(p=>PROD[p.produto]=p);
  for(const k in maqByConj) delete maqByConj[k]; buildMaqIndex();
  // NÃO apaga as edições cegamente: só descarta o override que JÁ está igual na planilha
  // (ou seja, que já foi salvo). O que ainda não foi salvo é PRESERVADO — evita "minhas edições somem".
  reconcileOverrides();
  saveOverrides();
}
const near=(a,b)=>Math.abs((+a||0)-(+b||0))<1e-4;
function baseDoseOf(tid,tagoi,ii){ const tag=tagoi[0],oi=+tagoi.slice(1),seq=tag==='S'?'safrinha':'principal';
  const op=((DATA.planos[tid]&&DATA.planos[tid][seq])||[])[oi]; return (op&&op.itens[ii])?op.itens[ii]:null; }
function reconcileOverrides(){
  // estoque / em pedido (base vem da planilha)
  for(const pr in OV.estoque){ if(PROD[pr] && near(OV.estoque[pr],PROD[pr].estoque)) delete OV.estoque[pr]; }
  for(const pr in OV.pedido){ if(PROD[pr] && near(OV.pedido[pr],PROD[pr].pedido||0)) delete OV.pedido[pr]; }
  // OV.preco NÃO entra: é ajuste local (a coluna de preço da planilha é fórmula/importada)
  // dose e troca de produto (comparam com o insumo base da planilha)
  for(const k in OV.dose){ const p=k.split('|'); if(String(p[2]).indexOf('a')===0) continue;
    const it=baseDoseOf(p[0],p[1],+p[2]); if(it && near(OV.dose[k],it.dose)) delete OV.dose[k]; }
  for(const rk in OV.itemProd){ const p=rk.split('|'); const it=baseDoseOf(p[0],p[1],+p[2]);
    if(it && String(OV.itemProd[rk])===String(it.produto)) delete OV.itemProd[rk]; }
  // culturas / área / produtividade do talhão
  Object.keys(OV.talhao).forEach(id=>{ const o=OV.talhao[id], t=DATA.talhoes.find(x=>x.id===id); if(!t) return;
    if(o.area!=null && near(o.area,t.area)) delete o.area;
    if(o.produtividade!=null && near(o.produtividade,t.produtividade)) delete o.produtividade;
    if(o.empreendimento!=null && String(o.empreendimento)===String(t.empreendimento||'')) delete o.empreendimento;
    if(o.emp_safrinha!=null && String(o.emp_safrinha)===String(t.emp_safrinha||'')) delete o.emp_safrinha;
    if(o.prod_safrinha!=null && near(o.prod_safrinha,t.prod_safrinha||0)) delete o.prod_safrinha;
    if(!Object.keys(o).length) delete OV.talhao[id]; });
  // preço de venda por cultura (DRE) — só dropa se já bater com a planilha
  for(const e in OV.cultura){ if(near(OV.cultura[e], DATA.precos_cultura[e]||0)) delete OV.cultura[e]; }
}
// PUXAR — planilha -> app. opts.auto = silencioso (não faz toast/log se nada mudou)
// fetch com timeout GENEROSO (o Apps Script lê a planilha toda e pode demorar; só aborta se travar de vez)
async function syncFetch(url, opts, ms){
  const ctrl = ('AbortController' in window) ? new AbortController() : null;
  const to = ctrl ? setTimeout(()=>ctrl.abort(), ms||120000) : null;
  try{ return await fetch(url, ctrl ? Object.assign({}, opts, {signal:ctrl.signal}) : opts); }
  finally{ if(to) clearTimeout(to); }
}
// GET com timeout longo + 1 tentativa extra (a 1ª chamada do Apps Script costuma ser lenta = "aquecimento")
async function syncGet(url, opts){
  opts=opts||{}; let lastErr;
  for(let attempt=0; attempt<2; attempt++){
    try{
      const bust=(url.indexOf('?')<0?'?':'&')+'t='+Date.now();
      const r=await syncFetch(url+bust,{method:'GET',cache:'no-store',redirect:'follow'},120000);
      return await r.json();
    }catch(e){ lastErr=e; if(attempt===0){ if(!opts.auto) syncLog('… demorou; tentando de novo'); await new Promise(res=>setTimeout(res,1800)); } }
  }
  throw lastErr;
}
async function syncPull(opts){
  opts=opts||{}; const url=syncUrl(); if(!url){ if(!opts.auto) toast('Configure a URL primeiro'); return; }
  if(syncBusy) return; syncBusy=true; setSyncStatus('busy');
  if(!opts.auto) syncLog('⏳ Puxando da planilha…');
  try{
    const d=await syncGet(url,opts);
    if(!d||!d.produtos) throw new Error('resposta inesperada da planilha');
    const raw=JSON.stringify(d);
    markSynced();
    if(raw===lastRawSig && !opts.force){          // nada mudou na planilha: não re-renderiza (evita piscar)
      if(!opts.auto){ syncLog('✔ Já estava atualizado (sem mudanças).'); toast('Já sincronizado'); addHist('pull',true,'Sem mudanças'); }
      syncBusy=false; setSyncStatus('ok'); return;
    }
    lastRawSig=raw; applyPulledData(d);   // NÃO mexe em lastPushSig: edições ainda não salvas continuam pendentes p/ reenvio
    addHist('pull',true,`${d.produtos.length} produtos, ${d.talhoes.length} talhões`);
    if(!opts.auto) syncLog(`✔ Atualizado: ${d.produtos.length} produtos, ${d.talhoes.length} talhões.`);
    if(!opts.silentToast) toast('Dados atualizados da planilha');
    syncBusy=false; setSyncStatus('ok');
    // re-render: manual = normal; automático = só se você NÃO estiver mexendo, e sem rolar a tela
    if(!opts.auto){ route(); }
    else if(!isEditing()){ pendingRerender=false; route({keepScroll:true}); }
    else { pendingRerender=true; }   // você está editando: aplica os dados agora, atualiza a tela quando parar
  }catch(e){ syncBusy=false; setSyncStatus('err');
    const aborted=/abort/i.test(e&&e.message||'');
    addHist('pull',false, aborted?'Tempo esgotado (planilha lenta)':('Erro: '+(e&&e.message||'')));
    if(!opts.auto){
      syncLog(aborted
        ? '✖ A planilha demorou demais para responder. Toque em "Puxar agora" de novo — a 1ª vez costuma ser mais lenta.'
        : '✖ Erro ao puxar: '+(e&&e.message)+'  (verifique a URL e o acesso "Qualquer pessoa")');
      toast(aborted?'Planilha lenta — tente puxar de novo':'Falha ao puxar');
    } }
}
// POST com timeout longo (120s) + 1 tentativa extra (rede instável / Apps Script lento)
async function syncPost(url, body){
  let lastErr;
  for(let attempt=0; attempt<2; attempt++){
    try{
      const r=await syncFetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body},120000);
      return await r.json();
    }catch(e){ lastErr=e; if(attempt===0) await new Promise(res=>setTimeout(res,1500)); }
  }
  throw lastErr;
}
// ENVIAR — app -> planilha. opts.auto = disparado por edição (silencioso; deduplica)
async function syncPush(opts){
  opts=opts||{}; const url=syncUrl(); if(!url){ if(!opts.auto) toast('Configure a URL primeiro'); return; }
  const eds=buildFieldEdits(), sig=JSON.stringify(eds);
  if(!eds.length){ if(!opts.auto) toast('Nenhuma edição de campo para enviar'); lastPushSig=sig; lastPushOk=true; return; }
  if(opts.auto && sig===lastPushSig && lastPushOk) return;  // já enviamos isto COM SUCESSO (se falhou, tenta de novo)
  if(syncBusy){ scheduleAutoPush(); return; }       // ocupado: tenta de novo depois
  syncBusy=true; setSyncStatus('busy');
  if(!opts.auto) syncLog(`⏳ Enviando ${eds.length} edições…`);
  try{
    // envia em lotes (cada requisição menor = mais rápida e não estoura o timeout)
    const CHUNK=40; let ok=0, fail=0, msgs=[];
    for(let i=0;i<eds.length;i+=CHUNK){
      const part=eds.slice(i,i+CHUNK);
      if(!opts.auto && eds.length>CHUNK) syncLog(`⏳ Enviando ${Math.min(i+CHUNK,eds.length)}/${eds.length}…`);
      const pr=await syncPost(url, JSON.stringify(part));
      ok+=(pr.ok||0); fail+=(pr.fail||0); if(pr.msgs&&pr.msgs.length) msgs=msgs.concat(pr.msgs);
    }
    const res={ok,fail,msgs};
    lastPushSig=sig; lastPushOk=(res.fail===0);   // se houve falha, permite novo reenvio depois
    addHist('push', res.fail===0, `${res.ok} gravadas, ${res.fail} falhas`);
    if(!opts.auto) syncLog(`✔ Enviado: ${res.ok} gravadas, ${res.fail} falhas.`+((res.msgs&&res.msgs.length)?' ['+res.msgs.slice(0,3).join(' | ')+']':''));
    if(!opts.auto) toast(`Enviado à planilha (${res.ok} ok)`);
    // mudanças estruturais (insumo adicionado/removido) agora vivem na planilha:
    // limpa os overrides correspondentes e puxa a verdade (reconcilia, evita duplicar/ressurgir)
    const adds=eds.filter(e=>e.type==='additem'), dels=eds.filter(e=>e.type==='delitem');
    if(res.fail===0 && (adds.length||dels.length)){
      adds.forEach(e=>{ const k=`${e.talhao}|${e.tag}${e.op}`, arr=OV.itemAdd[k];
        if(arr){ const i=arr.findIndex(a=>a.produto===e.produto); if(i>=0) arr.splice(i,1); if(!arr.length) delete OV.itemAdd[k]; } });
      dels.forEach(e=>{ if(e.rk) delete OV.itemRemoved[e.rk]; });
      saveOverrides();
      if(!opts.auto) syncLog('↻ Reconciliando com a planilha…');
      syncBusy=false; await syncPull({auto:true, force:true, silentToast:true}); return;
    }
    syncBusy=false; setSyncStatus('ok');
  }catch(e){ syncBusy=false; setSyncStatus('err');
    const aborted=/abort|failed to fetch/i.test(e&&e.message||'');
    addHist('push',false, aborted?'Tempo esgotado — tente enviar de novo':('Erro: '+(e&&e.message||'')));
    if(!opts.auto){
      syncLog(aborted?'✖ A planilha demorou demais para gravar. Toque em "Enviar agora" de novo — as edições que já entraram não se perdem.':'✖ Erro ao enviar: '+e.message);
      toast(aborted?'Planilha lenta — tente enviar de novo':'Falha ao enviar');
    } }
}
// agenda um envio automático (debounce) após edições
function scheduleAutoPush(){
  if(!syncUrl()||!autoOn()) return;
  clearTimeout(pushTimer);
  pushTimer=setTimeout(()=>{ if(!syncBusy) syncPush({auto:true}); else scheduleAutoPush(); }, PUSH_DEBOUNCE);
}
// puxar periódico (planilha -> app) enquanto a aba está visível
function pollTick(){
  if(!syncUrl()||!autoOn()||syncBusy) return;
  if(document.visibilityState!=='visible') return;
  if(isEditing()) return;                          // você está mexendo: não mexe na tela
  // ficou pendente uma atualização enquanto você editava? aplica agora que parou (sem rolar)
  if(pendingRerender){ pendingRerender=false; route({keepScroll:true}); }
  // com edições pendentes: só ENVIA, não puxa (evita qualquer atropelo do que ainda não foi salvo)
  if(buildFieldEdits().length>0){ scheduleAutoPush(); return; }
  syncPull({auto:true, silentToast:true});
}
function startPolling(){
  clearInterval(pollTimer);
  if(!syncUrl()||!autoOn()) return;
  // celular: puxa com menos frequência (mais leve); a volta ao app (visibilitychange) já puxa
  const ms = (window.matchMedia && window.matchMedia('(max-width:640px)').matches) ? 120000 : POLL_MS;
  pollTimer=setInterval(pollTick, ms);
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') pollTick(); });

$('#btn-export').onclick=()=>{ download('planejamento_edicoes.json',JSON.stringify(OV,null,2),'application/json'); toast('Edições exportadas'); };
$('#btn-reset').onclick=()=>{ if(confirm('Descartar todas as suas edições e voltar aos dados originais?')){ localStorage.removeItem(LS_KEY); loadOverrides(); saveOverrides(); route(); toast('Dados restaurados'); } };

/* ================= INIT ================= */
fetch('data.json').then(r=>r.json()).then(d=>{
  DATA=d; d.produtos.forEach(p=>PROD[p.produto]=p);
  loadOverrides(); buildMaqIndex(); updateEditBadge();
  { const v=$('#app-ver'); if(v) v.textContent='v'+APP_VERSION; }
  window.addEventListener('hashchange',route);
  applyModule();
  if(!location.hash) location.hash='#/inicio';   // porta de entrada: escolher o módulo
  route();
  // sincronização automática (planilha <-> app) quando a URL está configurada e o auto está ligado
  lastPushSig='';   // nada enviado ainda nesta sessão -> as edições pendentes serão reenviadas
  if(syncUrl() && autoOn()){
    if(buildFieldEdits().length===0){ syncPull({auto:true, silentToast:true}); }
    else scheduleAutoPush();   // há edições locais não salvas: envia para a planilha
    startPolling();
  }
  setSyncStatus();
}).catch(e=>{ $('#content').innerHTML=`<div class="empty">Falha ao carregar data.json.<br>Rode via servidor HTTP (não abra o arquivo direto).<br><small>${esc(e.message)}</small></div>`; });
