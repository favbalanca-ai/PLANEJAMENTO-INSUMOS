/* Planejamento de Safra 26/27 — app estático (sem backend).
   Dados base em data.json; edições do usuário ficam no localStorage. */
'use strict';

const LS_KEY = 'planejamento_safra_2627_v1';
let DATA = null;          // dados base (data.json)
let OV = null;            // overrides do usuário
let PROD = {};            // produto -> objeto do produto

/* ---------------- persistência ---------------- */
function loadOverrides(){
  try{ OV = JSON.parse(localStorage.getItem(LS_KEY)) || {}; }catch(e){ OV = {}; }
  OV.estoque = OV.estoque || {};
  OV.talhao  = OV.talhao  || {};   // id -> {area, produtividade}
  OV.dose    = OV.dose    || {};   // "TL|op|item" -> valor
  OV.preco   = OV.preco   || {};   // produto -> preço
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
  if(OV.diesel==null) OV.diesel = 6.00; // R$/L (global)
}
function saveOverrides(){
  localStorage.setItem(LS_KEY, JSON.stringify(OV));
  updateEditBadge();
}
function countEdits(){
  return Object.keys(OV.estoque).length + Object.keys(OV.dose).length +
         Object.keys(OV.preco).length + Object.keys(OV.cultura).length +
         Object.keys(OV.maquina).length + Object.keys(OV.dreOp).length +
         Object.keys(OV.opMaq).length + Object.keys(OV.arrend).length + (OV.diesel!==6.00?1:0) +
         Object.keys(OV.itemRemoved).length + Object.keys(OV.itemProd).length +
         Object.values(OV.itemAdd).reduce((a,arr)=>a+arr.length,0) +
         OV.talhaoAdd.length + Object.keys(OV.talhaoRemoved).length +
         Object.values(OV.talhao).reduce((a,t)=>a+Object.keys(t).length,0);
}

/* ---------------- acessores (base + override) ---------------- */
const estoqueDe = p => (p in OV.estoque) ? +OV.estoque[p] : (PROD[p] ? PROD[p].estoque : 0);
const precoDe   = p => (p in OV.preco)   ? +OV.preco[p]   : (PROD[p] ? PROD[p].preco   : 0);
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
// ---- talhões: base (não removidos) + criados ----
function talhoesAll(){ return DATA.talhoes.filter(t=>!OV.talhaoRemoved[t.id]).concat(OV.talhaoAdd); }
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
  const p=planoDe(t.id); if(!p) return;
  ['principal','safrinha'].forEach(seq=>{
    const tag=seq==='safrinha'?'S':'P';
    (p[seq]||[]).forEach((op,oi)=>cb(seq,tag,oi,op,`${tag}${oi}`));
  });
}
function precoCultura(emp){ return (emp in OV.cultura)?+OV.cultura[emp]:(DATA.precos_cultura[emp]||0); }
function rsHmDe(m){ return (m.conjunto in OV.maquina)?+OV.maquina[m.conjunto]:m.rs_hm; }
// custo total por hectare de uma passada da máquina = custo hora-máquina + diesel
function custoMaqHa(m){ return m.hm_ha*rsHmDe(m) + m.l_ha*(+OV.diesel); }
// custo médio por passada (média das máquinas cadastradas)
function custoMedioPassada(){
  const ms=DATA.maquinas||[]; if(!ms.length) return 0;
  return ms.reduce((a,m)=>a+custoMaqHa(m),0)/ms.length;
}
const maqByConj = {};
function buildMaqIndex(){ (DATA.maquinas||[]).forEach(m=>maqByConj[m.conjunto]=m); }
// sugere um conjunto pela classe predominante dos insumos (recebe lista de classes)
function sugereMaquina(clsArr){
  const cls = (clsArr||[]).map(c=>(c||'').toUpperCase());
  const has = re => cls.some(c=>re.test(c));
  const find = re => (DATA.maquinas||[]).find(m=>re.test(m.conjunto.toUpperCase()));
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
    const nome=p.produto, d=dem[nome]||0, est=estoqueDe(nome);
    if(d<=0 && est<=0) continue;
    if((p.classe||'').toUpperCase().startsWith('MÁQUINA')) continue;
    const comprar=Math.max(0,d-est), preco=precoDe(nome), valor=comprar*preco;
    let status = comprar>0 ? (preco>0?'COMPRAR':'SEM_PRECO') : (d>0?'ESTOQUE':'SEM_DEMANDA');
    rows.push({...p, demanda:d, estoque:est, comprar, preco, valor, status});
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
// custo de insumos (R$/ha) de UMA safra do talhão
function custoSeqHa(t,seq){
  const p=planoDe(t.id); if(!p) return 0; const tag=seq==='safrinha'?'S':'P'; let ha=0;
  (p[seq]||[]).forEach((op,oi)=>effItems(t.id,`${tag}${oi}`,op.itens).forEach(it=>ha+=it.dose*precoDe(it.produto)));
  return ha;
}
// custo de máquinas (R$/ha) de UMA safra do talhão
function custoOpSeqHa(t,seq){
  const p=planoDe(t.id); if(!p) return 0; const tag=seq==='safrinha'?'S':'P'; let s=0;
  (p[seq]||[]).forEach((op,oi)=>{ s+=custoOpHa(t.id,tag,oi,op); });
  return s;
}
const temSafrinha = t => !!(t.emp_safrinha && String(t.emp_safrinha).trim());
function prodSafDe(t){ const o=OV.talhao[t.id]; return o&&o.prod_safrinha!=null?+o.prod_safrinha:(t.prod_safrinha||0); }
// cada talhão vira 1 ou 2 "cultivos" (safra principal + safrinha)
function cultivos(){
  const out=[];
  talhoesAll().forEach(t=>{
    const area=areaDe(t);
    out.push({t,seq:'principal',tag:'P',emp:t.empreendimento||'—',area,prod:area*prodvDe(t),
      ins:custoSeqHa(t,'principal')*area, maqHa:custoOpSeqHa(t,'principal')});
    if(temSafrinha(t)) out.push({t,seq:'safrinha',tag:'S',emp:t.emp_safrinha,area,prod:area*prodSafDe(t),
      ins:custoSeqHa(t,'safrinha')*area, maqHa:custoOpSeqHa(t,'safrinha')});
  });
  return out;
}
// pares (talhão, safra) que pertencem a um empreendimento
function cultivosDaEmp(emp){
  const out=[];
  talhoesAll().forEach(t=>{
    if((t.empreendimento||'—')===emp) out.push({t,seq:'principal',tag:'P'});
    if(temSafrinha(t)&&t.emp_safrinha===emp) out.push({t,seq:'safrinha',tag:'S'});
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
  <div class="panel"><div class="panel-head"><h2>Criar talhão</h2><span class="sub">novo talhão — em branco ou copiando o plano de outro</span></div>
    <div class="bulk-add">
      <input class="txt" id="nt-nome" placeholder="nome (ex.: Área 5)" style="min-width:150px">
      <input class="txt" list="emplist" id="nt-emp" placeholder="cultura / empreendimento" style="min-width:180px">
      <input class="cell" id="nt-area" placeholder="área (ha)" style="width:96px">
      <input class="cell" id="nt-prod" placeholder="prod. sc/ha" style="width:96px">
      <label class="mut" style="font-size:12px">copiar plano de
        <select class="sel" id="nt-copy"><option value="">— em branco —</option>${copyOpts}</select></label>
      <button class="btn btn-primary btn-sm" data-act="createtalhao">+ Criar talhão</button>
    </div>
  </div>
  <div class="toolbar"><div class="search"><input id="q-talhao" placeholder="Buscar talhão ou cultura…"></div>
    <div class="spacer"></div><span class="badge badge-muted">Edite área/produtividade; abra para editar insumos; 🗑 exclui o talhão</span></div>
  <div class="panel"><div class="table-wrap"><table id="tbl-talhoes">
    <thead><tr><th>Talhão</th><th>Nome</th><th>Cultura</th><th class="num">Área (ha)</th>
      <th class="num">Prod. (sc/ha)</th><th class="num">Produção (sc)</th><th class="num">Custo/ha</th><th class="num">Custo total</th><th></th></tr></thead>
    <tbody>${rows.map(r=>`
      <tr data-search="${esc((r.t.id+' '+(r.t.nome||'')+' '+(r.t.empreendimento||'')).toLowerCase())}">
        <td><b>${esc(r.t.id)}</b>${r.novo?' <span class="pill pill-buy">novo</span>':''}</td>
        <td><a class="link" data-go="#/talhao/${esc(r.t.id)}">${esc(r.t.nome||'—')}</a></td>
        <td><span class="classe-tag">${esc(r.t.empreendimento||'—')}</span></td>
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
  const opts=[`<option value="">— sem máquina —</option>`].concat((DATA.maquinas||[])
    .map(m=>`<option value="${esc(m.conjunto)}">${esc(m.conjunto)}</option>`)).join('');
  function itemRow(it){
    const preco=precoDe(it.produto), chHa=it.dose*preco;
    const di=it.kind==='add'?`data-edit="doseAdd" data-op="${it.key.split('|')[1]}" data-ai="${it.ai}"`
                            :`data-edit="dose" data-op="${it.key.split('|')[1]}" data-item="${it.ii}"`;
    const pi=it.kind==='add'?`data-edit="itemProdAdd" data-op="${it.key.split('|')[1]}" data-ai="${it.ai}"`
                            :`data-edit="itemProd" data-op="${it.key.split('|')[1]}" data-item="${it.ii}"`;
    const del=`data-act="delitem" data-id="${t.id}" data-op="${it.key.split('|')[1]}" data-kind="${it.kind}" ${it.kind==='add'?`data-ai="${it.ai}"`:`data-item="${it.ii}"`}`;
    return `<tr>
      <td>${it.classe?`<span class="classe-tag">${esc(it.classe)}</span>`:'<span class="pill pill-none">—</span>'}</td>
      <td><input list="prodlist" class="txt prod-in ${it.prodEdited||it.kind==='add'?'edited':''}" data-id="${t.id}" ${pi} value="${esc(it.produto)}" placeholder="escolha o insumo"></td>
      <td class="num"><input class="cell ${it.doseEdited?'edited':''}" data-id="${t.id}" ${di} value="${it.dose}"></td>
      <td>${esc(it.un)}</td>
      <td class="num">${preco>0?brl(preco):(it.produto?'<span class="pill pill-noprice">s/ preço</span>':'—')}</td>
      <td class="num">${brl(chHa)}</td><td class="num">${brl(chHa*area)}</td>
      <td class="num"><button class="icon-btn del" title="Excluir insumo" ${del}>🗑</button></td></tr>`;
  }
  function opsHtml(seq,tag,titulo){
    const ops=plan[seq]||[]; if(!ops.length) return '';
    return `<div class="panel"><div class="panel-head"><h2>${titulo}</h2><span class="sub">${ops.length} operações</span></div>
    ${ops.map((op,oi)=>{
      const tagoi=`${tag}${oi}`, items=effItems(t.id,tagoi,op.itens);
      let sub=0; items.forEach(it=>sub+=it.dose*precoDe(it.produto));
      const conj=opMaqDe(t.id,tag,oi,op), mHa=custoOpHa(t.id,tag,oi,op);
      const isOv=(opMaqKey(t.id,tagoi) in OV.opMaq);
      const selHtml=opts.replace(`value="${esc(conj||'')}"`,`value="${esc(conj||'')}" selected`);
      const totOp=sub+mHa;
      return `<div class="op-head">
        <span class="op-title">${esc(op.nome)}</span>
        <span class="op-maq"><span class="mut">🚜</span>
        <select class="sel" data-edit="opMaq" data-id="${t.id}" data-op="${tagoi}" ${isOv?'style="border-color:var(--ink2)"':''}>${selHtml}</select>
        <span class="op-maqv">${brl(mHa)}/ha</span></span></div>
      <div class="table-wrap"><table><thead><tr><th>Classe</th><th>Produto</th><th class="num">Dose/ha</th><th>Un</th><th class="num">Preço</th><th class="num">Custo/ha</th><th class="num">Custo total</th><th></th></tr></thead>
      <tbody>${items.map(itemRow).join('')||'<tr><td colspan="8" class="mut" style="padding:12px 14px">Nenhum insumo. Use “+ adicionar insumo”.</td></tr>'}</tbody>
      <tfoot class="tfoot">
        <tr><td colspan="5">Insumos/ha</td><td class="num">${brl(sub)}</td><td class="num">${brl0(sub*area)}</td><td></td></tr>
        <tr><td colspan="5">+ Máquina/ha</td><td class="num">${brl(mHa)}</td><td class="num">${brl0(mHa*area)}</td><td></td></tr>
        <tr><td colspan="5"><b>Subtotal operação</b></td><td class="num"><b>${brl(totOp)}</b></td><td class="num"><b>${brl0(totOp*area)}</b></td><td></td></tr>
      </tfoot></table></div>
      <div class="op-add"><button class="btn btn-outline btn-sm" data-act="additem" data-id="${t.id}" data-op="${tagoi}">+ adicionar insumo</button></div>`;
    }).join('')}</div>`;
  }
  return `${prodDatalist()}
  <a class="link" data-go="#/talhoes">‹ Talhões</a>
  <div class="detail-head" style="margin-top:10px">
    <div class="di"><div class="l">Talhão</div><div class="v">${esc(t.id)} · ${esc(t.nome||'—')}</div></div>
    <div class="di"><div class="l">${temSafrinha(t)?'1ª cultura':'Cultura'}</div><div class="v" style="font-size:14px">${esc(t.empreendimento||'—')}</div></div>
    ${temSafrinha(t)?`<div class="di"><div class="l">2ª cultura (safrinha)</div><div class="v" style="font-size:14px">${esc(t.emp_safrinha)} · ${num(prodSafDe(t))} sc/ha</div></div>`:''}
    <div class="di"><div class="l">Área</div><div class="v">${num(area)} ha</div></div>
    <div class="di"><div class="l">Insumos/ha</div><div class="v">${brl(c.ha)}</div></div>
    <div class="di"><div class="l">Máquinas/ha</div><div class="v">${brl(maqHa)}</div></div>
    <div class="di"><div class="l">Custo total/ha</div><div class="v" style="color:var(--ink2)">${brl(totHa)}</div></div>
    <div class="di"><div class="l">Custo total</div><div class="v">${brl0(totHa*area)}</div></div>
  </div>
  <div class="toolbar" style="margin-top:-4px">
    <button class="btn btn-outline btn-sm" data-act="duptalhao" data-id="${esc(t.id)}">⧉ Duplicar plano</button>
    <button class="btn btn-outline btn-sm" data-act="deltalhao" data-id="${esc(t.id)}" data-novo="${DATA.talhoes.some(x=>x.id===t.id)?0:1}" style="color:var(--red)">🗑 Excluir talhão</button>
    <div class="spacer"></div>
    <span class="badge badge-muted">Toque no produto para trocar, na dose para editar, no 🗑 para excluir — ou “+ adicionar insumo”.</span></div>
  ${opsHtml('principal','P',temSafrinha(t)?'Safra principal · '+esc(t.empreendimento||''):'Safra principal')}
  ${opsHtml('safrinha','S','Safrinha'+(temSafrinha(t)?' · '+esc(t.emp_safrinha):''))||''}
  ${(!plan.principal.length&&!plan.safrinha.length)?'<div class="empty">Sem operações cadastradas para este talhão.</div>':''}`;
};

V.compras = function(){
  const rows=calcCompras().sort((a,b)=>(a.classe||'').localeCompare(b.classe||'')||(a.produto||'').localeCompare(b.produto||''));
  const totalCompra=rows.reduce((a,r)=>a+r.valor,0);
  const itens=rows.filter(r=>r.comprar>0).length;
  const semPreco=rows.filter(r=>r.comprar>0&&r.preco<=0).length;
  const valEstoque=rows.reduce((a,r)=>a+r.estoque*r.preco,0);
  return `
  <div class="kpi-grid">
    <div class="kpi accent"><div class="k-label">Total a comprar</div><div class="k-value">${brl0(totalCompra)}</div></div>
    <div class="kpi"><div class="k-label">Itens a comprar</div><div class="k-value">${itens}</div></div>
    <div class="kpi"><div class="k-label">Itens sem preço</div><div class="k-value" style="color:${semPreco?'var(--red)':'var(--green)'}">${semPreco}</div></div>
    <div class="kpi"><div class="k-label">Valor em estoque</div><div class="k-value">${brl0(valEstoque)}</div></div>
  </div>
  <div class="toolbar"><div class="search"><input id="q-compra" placeholder="Buscar produto, classe ou fornecedor…"></div>
    <div class="spacer"></div><span class="badge badge-muted">A comprar = máx(0; Demanda − Estoque) — edite o estoque</span></div>
  <div class="panel"><div class="table-wrap"><table id="tbl-compras">
    <thead><tr><th>Classe</th><th>Fornecedor</th><th>Produto</th><th>Un</th>
      <th class="num">Demanda</th><th class="num">Estoque</th><th class="num">A comprar</th>
      <th class="num">Preço</th><th class="num">Valor</th><th>Status</th></tr></thead>
    <tbody>${rows.map(r=>`
      <tr data-search="${esc((r.classe+' '+r.empresa+' '+r.produto).toLowerCase())}">
        <td><span class="classe-tag">${esc(r.classe)}</span></td>
        <td>${esc(r.empresa||'—')}</td><td><b>${esc(r.produto)}</b></td><td>${esc(r.un)}</td>
        <td class="num">${num(r.demanda)}</td>
        <td class="num"><input class="cell ${(r.produto in OV.estoque)?'edited':''}" data-edit="estoque" data-prod="${esc(r.produto)}" value="${r.estoque}"></td>
        <td class="num"><b>${num(r.comprar)}</b></td>
        <td class="num">${r.preco>0?brl(r.preco):`<input class="cell ${(r.produto in OV.preco)?'edited':''}" data-edit="preco" data-prod="${esc(r.produto)}" value="" placeholder="preço">`}</td>
        <td class="num">${r.valor>0?brl(r.valor):'—'}</td>
        <td>${pill(r.status)}</td></tr>`).join('')}</tbody>
    <tfoot class="tfoot"><tr><td colspan="8">TOTAL</td><td class="num">${brl0(totalCompra)}</td><td></td></tr></tfoot>
  </table></div></div>`;
};

V.cotacao = function(){
  const rows=calcCompras().filter(r=>r.comprar>0);
  const groups={};
  rows.forEach(r=>{const k=r.empresa||'(sem fornecedor)';(groups[k]=groups[k]||[]).push(r);});
  const order=Object.keys(groups).sort((a,b)=>(a==='(sem fornecedor)')-(b==='(sem fornecedor)')||a.localeCompare(b));
  const totalGeral=rows.reduce((a,r)=>a+r.valor,0);
  return `
  <div class="toolbar"><span class="badge badge-muted">Itens a comprar agrupados por fornecedor — ${order.length} fornecedores · ${brl0(totalGeral)}</span>
    <div class="spacer"></div><button class="btn btn-outline btn-sm" id="btn-cot-csv">⬇ Exportar CSV</button></div>
  ${order.map(forn=>{
    const its=groups[forn].sort((a,b)=>b.valor-a.valor);
    const sub=its.reduce((a,r)=>a+r.valor,0);
    return `<div class="panel"><div class="panel-head"><h2>${esc(forn)}</h2><span class="sub">${its.length} itens · ${brl0(sub)}</span></div>
    <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Classe</th><th class="num">Qtd</th><th>Un</th><th class="num">Preço ref.</th><th class="num">Valor ref.</th></tr></thead>
    <tbody>${its.map(r=>`<tr><td><b>${esc(r.produto)}</b></td><td><span class="classe-tag">${esc(r.classe)}</span></td>
      <td class="num">${num(r.comprar)}</td><td>${esc(r.un)}</td>
      <td class="num">${r.preco>0?brl(r.preco):'<span class="pill pill-noprice">s/ preço</span>'}</td>
      <td class="num">${brl(r.valor)}</td></tr>`).join('')}</tbody>
    <tfoot class="tfoot"><tr><td colspan="5">Subtotal ${esc(forn)}</td><td class="num">${brl0(sub)}</td></tr></tfoot></table></div></div>`;
  }).join('')}`;
};

V.maquinas = function(){
  const ms=DATA.maquinas||[];
  const medio=custoMedioPassada();
  return `
  <div class="kpi-grid">
    <div class="kpi"><div class="k-label">Conjuntos cadastrados</div><div class="k-value">${ms.length}</div></div>
    <div class="kpi accent"><div class="k-label">Custo médio por passada</div><div class="k-value">${brl(medio)}</div><div class="k-sub">máquina + diesel, por ha</div></div>
    <div class="kpi"><div class="k-label">Preço do diesel</div>
      <div class="k-value"><input class="cell ${OV.diesel!==6?'edited':''}" data-edit="diesel" value="${OV.diesel}" style="width:110px;font-size:20px;font-weight:700"> <span style="font-size:13px;color:var(--muted)">R$/L</span></div>
      <div class="k-sub">aplicado ao consumo (L/ha)</div></div>
  </div>
  <div class="toolbar"><span class="badge badge-muted">Edite o <b>R$/HM</b> (custo hora-máquina) e o preço do diesel — o custo por hectare recalcula.</span></div>
  <div class="panel"><div class="table-wrap"><table>
    <thead><tr><th>Conjunto (máquina + implemento)</th><th class="num">Largura</th><th class="num">Vel.</th>
      <th class="num">Efic. %</th><th class="num">ha/h</th><th class="num">HM/ha</th><th class="num">R$/HM</th>
      <th class="num">Custo máq/ha</th><th class="num">L/ha</th><th class="num">Diesel/ha</th><th class="num">Custo total/ha</th></tr></thead>
    <tbody>${ms.map(m=>{
      const rs=rsHmDe(m), cmaq=m.hm_ha*rs, cdie=m.l_ha*(+OV.diesel), tot=cmaq+cdie;
      return `<tr><td><b>${esc(m.conjunto)}</b></td>
        <td class="num">${num(m.largura)}</td><td class="num">${num(m.velocidade)}</td>
        <td class="num">${nf0.format(m.eficiencia)}</td><td class="num">${num(m.ha_h)}</td>
        <td class="num">${nf2.format(m.hm_ha)}</td>
        <td class="num"><input class="cell ${(m.conjunto in OV.maquina)?'edited':''}" data-edit="maquina" data-conj="${esc(m.conjunto)}" value="${rs}"></td>
        <td class="num">${brl(cmaq)}</td><td class="num">${num(m.l_ha)}</td>
        <td class="num">${brl(cdie)}</td><td class="num"><b>${brl(tot)}</b></td></tr>`;
    }).join('')}</tbody>
  </table></div></div>
  <p style="color:var(--muted);font-size:12px">O <b>custo médio por passada</b> alimenta a estimativa de custo de máquinas no DRE (nº de operações do talhão × custo médio).</p>`;
};

V.dre = function(){
  const emps={};
  cultivos().forEach(cv=>{   // 1 linha por cultura; safrinha entra como cultivo próprio
    const g=emps[cv.emp]||(emps[cv.emp]={area:0,prod:0,ins:0,opDefault:0});
    g.area+=cv.area; g.prod+=cv.prod; g.ins+=cv.ins; g.opDefault+=cv.maqHa*cv.area;
  });
  const list=Object.entries(emps).sort((a,b)=>b[1].area-a[1].area);
  let tA=0,tR=0,tI=0,tM=0,tX=0;
  const body=list.map(([e,g])=>{
    const preco=precoCultura(e), receita=g.prod*preco;
    const opHaDefault=g.area>0?g.opDefault/g.area:0;
    const opHa=(e in OV.dreOp)?+OV.dreOp[e]:opHaDefault;
    const arrHa=(e in OV.arrend)?+OV.arrend[e]:0;
    const custoMaq=opHa*g.area, custoArr=arrHa*g.area;
    const custoTot=g.ins+custoMaq+custoArr, result=receita-custoTot;
    tA+=g.area;tR+=receita;tI+=g.ins;tM+=custoMaq;tX+=custoArr;
    return `<tr><td><b>${esc(e)}</b></td><td class="num">${num(g.area)}</td>
      <td class="num">${nf0.format(g.prod)}</td>
      <td class="num"><input class="cell ${(e in OV.cultura)?'edited':''}" data-edit="cultura" data-emp="${esc(e)}" value="${preco}"></td>
      <td class="num">${brl0(receita)}</td>
      <td class="num">${brl0(g.ins)}</td>
      <td class="num"><input class="cell ${(e in OV.dreOp)?'edited':''}" data-edit="dreOp" data-emp="${esc(e)}" value="${opHa.toFixed(2)}"></td>
      <td class="num">${brl0(custoMaq)}</td>
      <td class="num"><input class="cell ${(e in OV.arrend)?'edited':''}" data-edit="arrend" data-emp="${esc(e)}" value="${arrHa.toFixed(2)}"></td>
      <td class="num">${brl0(custoArr)}</td>
      <td class="num">${brl0(custoTot)}</td>
      <td class="num"><b style="color:${result>=0?'var(--green)':'var(--red)'}">${brl0(result)}</b></td></tr>`;
  }).join('');
  const res=tR-tI-tM-tX;
  return `
  <div class="kpi-grid">
    <div class="kpi"><div class="k-label">Receita total</div><div class="k-value">${brl0(tR)}</div></div>
    <div class="kpi"><div class="k-label">Custo insumos</div><div class="k-value">${brl0(tI)}</div></div>
    <div class="kpi"><div class="k-label">Custo máquinas</div><div class="k-value">${brl0(tM)}</div></div>
    <div class="kpi"><div class="k-label">Arrend./Outros</div><div class="k-value">${brl0(tX)}</div></div>
    <div class="kpi accent"><div class="k-label">Resultado</div><div class="k-value">${brl0(res)}</div><div class="k-sub">${tR>0?nf1.format(res/tR*100)+'% da receita':''}</div></div>
  </div>
  <div class="toolbar"><span class="badge badge-muted">Resultado = Receita − insumos − máquinas − arrendamento/outros. Campos em azul são editáveis (R$/ha ou preço).</span></div>
  <div class="panel"><div class="table-wrap"><table>
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
    const area=areaDe(t), p=planoDe(t.id);
    (p[seq]||[]).forEach((op,oi)=>{
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
    return `<tr>
      <td>${m.classe?`<span class="classe-tag">${esc(m.classe)}</span>`:'—'}</td>
      <td><b>${esc(prod)}</b></td>
      <td class="num"><input class="cell" data-edit="bulkDose" data-emp="${esc(sel)}" data-prod="${esc(prod)}"
        value="${doseCommon!=null?doseCommon:''}" placeholder="${doseCommon!=null?'':'vários'}"></td>
      <td>${esc(m.un)}</td>
      <td class="num">${num(m.qtd)}</td>
      <td class="num">${preco>0?brl(preco):'—'}</td>
      <td class="num">${m.talhoes.size}</td>
      <td class="num"><button class="icon-btn del" title="Excluir de todos os talhões desta cultura"
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
  <div class="panel"><div class="panel-head"><h2>Insumos da cultura</h2>
    <span class="sub">edite a dose (aplica a todos) ou exclua — em massa</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Classe</th><th>Produto</th><th class="num">Dose/ha</th><th>Un</th>
        <th class="num">Qtd total</th><th class="num">Preço</th><th class="num">Nos talhões</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="8" class="mut" style="padding:12px 14px">Sem insumos nesta cultura.</td></tr>'}</tbody>
    </table></div></div>
  <p class="mut" style="font-size:12px">Editar a dose aqui sobrescreve o insumo em <b>todos</b> os talhões desta cultura. “Dose: vários” significa que os talhões têm doses diferentes — digite um valor para uniformizar.</p>`;
};

/* ================= ROUTER ================= */
const TITLES={dashboard:'Painel',talhoes:'Talhões',talhao:'Talhão',compras:'Demanda de Compras',cotacao:'Cotação por Fornecedor',maquinas:'Máquinas',dre:'DRE Orçada',empreendimentos:'Empreendimentos'};
function route(){
  const hash=location.hash.replace(/^#\//,'')||'dashboard';
  const [view,arg]=hash.split('/');
  const fn=V[view];
  $('#page-title').textContent=TITLES[view]||'Painel';
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===view));
  try{ $('#content').innerHTML = fn?fn(decodeURIComponent(arg||'')):`<div class="empty">Página não encontrada.</div>`; }
  catch(e){ $('#content').innerHTML=`<div class="empty">Erro ao renderizar: ${esc(e.message)}</div>`; console.error(e); }
  $('.main').scrollTop=0; window.scrollTo(0,0);
}

/* ================= EVENTOS ================= */
function applyEdit(el){
  const kind=el.dataset.edit;
  if(!kind) return;
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
  const val=el.value.trim().replace(',','.'), n=val===''?null:parseFloat(val);
  if(kind==='estoque'){ if(n==null||n===PROD[el.dataset.prod].estoque) delete OV.estoque[el.dataset.prod]; else OV.estoque[el.dataset.prod]=n; }
  else if(kind==='preco'){ if(n==null||n===0) delete OV.preco[el.dataset.prod]; else OV.preco[el.dataset.prod]=n; }
  else if(kind==='cultura'){ const e=el.dataset.emp; if(n==null||n===(DATA.precos_cultura[e]||0)) delete OV.cultura[e]; else OV.cultura[e]=n; }
  else if(kind==='maquina'){ const c=el.dataset.conj, m=DATA.maquinas.find(x=>x.conjunto===c); if(n==null||n===m.rs_hm) delete OV.maquina[c]; else OV.maquina[c]=n; }
  else if(kind==='diesel'){ OV.diesel = (n==null?6.00:n); }
  else if(kind==='dreOp'){ const e=el.dataset.emp; if(n==null) delete OV.dreOp[e]; else OV.dreOp[e]=n; }
  else if(kind==='arrend'){ const e=el.dataset.emp; if(n==null||n===0) delete OV.arrend[e]; else OV.arrend[e]=n; }
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
  const p=planoDe(t.id); if(!p) return; const tag=seq==='safrinha'?'S':'P';
  (p[seq]||[]).forEach((op,oi)=>cb(tag,oi,op,`${tag}${oi}`));
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
    const ops=(planoDe(t.id)||{})[seq]||[]; if(!ops.length) return;
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

document.addEventListener('change',e=>{ if(e.target.matches('input.cell, select.sel, input.prod-in')) applyEdit(e.target); });
document.addEventListener('keydown',e=>{ if(e.target.matches('input.cell, input.prod-in')&&e.key==='Enter') e.target.blur(); });
document.addEventListener('click',e=>{
  const go=e.target.closest('[data-go]'); if(go){ e.preventDefault(); location.hash=go.dataset.go; return; }
  const act=e.target.closest('[data-act]');
  if(act){
    const a=act.dataset;
    if(a.act==='delitem'){ delItem(a); saveOverrides(); route(); }
    else if(a.act==='additem'){ const k=`${a.id}|${a.op}`; (OV.itemAdd[k]=OV.itemAdd[k]||[]).push({produto:'',dose:0}); saveOverrides(); route(); }
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
    return;
  }
  if(e.target.id==='btn-cot-csv') exportCotacaoCSV();
});
document.addEventListener('input',e=>{
  if(e.target.id==='q-compra') filterTable('#tbl-compras',e.target.value);
  if(e.target.id==='q-talhao') filterTable('#tbl-talhoes',e.target.value);
});
function filterTable(sel,q){
  q=q.toLowerCase().trim();
  document.querySelectorAll(sel+' tbody tr').forEach(tr=>{
    tr.style.display = !q||(tr.dataset.search||'').includes(q)?'':'none';
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
$('#btn-export').onclick=()=>{ download('planejamento_edicoes.json',JSON.stringify(OV,null,2),'application/json'); toast('Edições exportadas'); };
$('#btn-reset').onclick=()=>{ if(confirm('Descartar todas as suas edições e voltar aos dados originais?')){ localStorage.removeItem(LS_KEY); loadOverrides(); saveOverrides(); route(); toast('Dados restaurados'); } };

/* ================= INIT ================= */
fetch('data.json').then(r=>r.json()).then(d=>{
  DATA=d; d.produtos.forEach(p=>PROD[p.produto]=p);
  buildMaqIndex(); loadOverrides(); updateEditBadge();
  window.addEventListener('hashchange',route);
  if(!location.hash) location.hash='#/dashboard';
  route();
}).catch(e=>{ $('#content').innerHTML=`<div class="empty">Falha ao carregar data.json.<br>Rode via servidor HTTP (não abra o arquivo direto).<br><small>${esc(e.message)}</small></div>`; });
