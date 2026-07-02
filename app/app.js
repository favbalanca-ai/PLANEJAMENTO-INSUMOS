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
         Object.keys(OV.opMaq).length + (OV.diesel!==6.00?1:0) +
         Object.values(OV.talhao).reduce((a,t)=>a+Object.keys(t).length,0);
}

/* ---------------- acessores (base + override) ---------------- */
const estoqueDe = p => (p in OV.estoque) ? +OV.estoque[p] : (PROD[p] ? PROD[p].estoque : 0);
const precoDe   = p => (p in OV.preco)   ? +OV.preco[p]   : (PROD[p] ? PROD[p].preco   : 0);
function areaDe(t){ const o=OV.talhao[t.id]; return o && o.area!=null ? +o.area : t.area; }
function prodvDe(t){ const o=OV.talhao[t.id]; return o && o.produtividade!=null ? +o.produtividade : t.produtividade; }
const doseKey = (tid,oi,ii)=>`${tid}|${oi}|${ii}`;
function doseDe(tid,oi,ii,base){ const k=doseKey(tid,oi,ii); return (k in OV.dose)?+OV.dose[k]:base; }
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
// sugere um conjunto pela classe predominante dos insumos da operação
function sugereMaquina(op){
  const cls = op.itens.map(i=>(i.classe||'').toUpperCase());
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
  return sugereMaquina(op);
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
  const p=DATA.planos[t.id]; if(!p) return 0; let s=0;
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
  for(const t of DATA.talhoes){
    const plan = DATA.planos[t.id]; if(!plan) continue;
    const area = areaDe(t);
    ['principal','safrinha'].forEach(seq=>{
      (plan[seq]||[]).forEach((op,oi)=>{
        const tag = seq==='safrinha'?'S':'P';
        op.itens.forEach((it,ii)=>{
          const d = doseDe(t.id, tag+oi, ii, it.dose) * area;
          dem[it.produto] = (dem[it.produto]||0) + d;
        });
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
  const plan=DATA.planos[t.id]; if(!plan) return {ha:0,total:0,area:areaDe(t)};
  const area=areaDe(t); let ha=0;
  ['principal','safrinha'].forEach(seq=>{
    (plan[seq]||[]).forEach((op,oi)=>{
      const tag=seq==='safrinha'?'S':'P';
      op.itens.forEach((it,ii)=>{ ha += doseDe(t.id,tag+oi,ii,it.dose)*precoDe(it.produto); });
    });
  });
  return {ha, total:ha*area, area};
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
  const areaTotal=DATA.talhoes.reduce((a,t)=>a+areaDe(t),0);
  const custoTotal=DATA.talhoes.reduce((a,t)=>a+custoTalhao(t).total,0);
  const totalCompra=compras.reduce((a,r)=>a+r.valor,0);
  const itensComprar=compras.filter(r=>r.comprar>0).length;
  const semPreco=compras.filter(r=>r.comprar>0&&r.preco<=0).length;
  // custo por cultura
  const porCultura={};
  DATA.talhoes.forEach(t=>{const e=t.empreendimento||'—';porCultura[e]=(porCultura[e]||0)+custoTalhao(t).total;});
  const culturas=Object.entries(porCultura).sort((a,b)=>b[1]-a[1]);
  const maxC=Math.max(1,...culturas.map(c=>c[1]));
  // custo por classe (insumo)
  const porClasse={};
  compras.forEach(r=>{porClasse[r.classe]=(porClasse[r.classe]||0)+r.valor;});
  const classes=Object.entries(porClasse).filter(c=>c[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxK=Math.max(1,...classes.map(c=>c[1]));

  return `
  <div class="kpi-grid">
    <div class="kpi"><div class="k-label">Área total</div><div class="k-value">${num(areaTotal)} ha</div><div class="k-sub">${DATA.talhoes.length} talhões</div></div>
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
  const rows=DATA.talhoes.map(t=>{
    const c=custoTalhao(t), area=areaDe(t), prodv=prodvDe(t);
    const prodTotal=area*prodv;
    return {t,area,prodv,prodTotal,custo:c.total,custoHa:c.ha};
  });
  const totArea=rows.reduce((a,r)=>a+r.area,0);
  const totCusto=rows.reduce((a,r)=>a+r.custo,0);
  return `
  <div class="toolbar"><div class="search"><input id="q-talhao" placeholder="Buscar talhão ou cultura…"></div>
    <div class="spacer"></div><span class="badge badge-muted">Edite área e produtividade — o cálculo atualiza sozinho</span></div>
  <div class="panel"><div class="table-wrap"><table id="tbl-talhoes">
    <thead><tr><th>Talhão</th><th>Nome</th><th>Cultura</th><th class="num">Área (ha)</th>
      <th class="num">Prod. (sc/ha)</th><th class="num">Produção (sc)</th><th class="num">Custo/ha</th><th class="num">Custo total</th><th></th></tr></thead>
    <tbody>${rows.map(r=>`
      <tr data-search="${esc((r.t.id+' '+r.t.nome+' '+r.t.empreendimento).toLowerCase())}">
        <td><b>${esc(r.t.id)}</b></td>
        <td><a class="link" data-go="#/talhao/${esc(r.t.id)}">${esc(r.t.nome||'—')}</a></td>
        <td><span class="classe-tag">${esc(r.t.empreendimento||'—')}</span></td>
        <td class="num"><input class="cell ${OV.talhao[r.t.id]&&OV.talhao[r.t.id].area!=null?'edited':''}" data-edit="area" data-id="${r.t.id}" value="${r.area}"></td>
        <td class="num"><input class="cell ${OV.talhao[r.t.id]&&OV.talhao[r.t.id].produtividade!=null?'edited':''}" data-edit="prodv" data-id="${r.t.id}" value="${r.prodv}"></td>
        <td class="num">${nf0.format(r.prodTotal)}</td>
        <td class="num">${brl(r.custoHa)}</td>
        <td class="num"><b>${brl0(r.custo)}</b></td>
        <td><a class="link" data-go="#/talhao/${esc(r.t.id)}">abrir ›</a></td></tr>`).join('')}</tbody>
    <tfoot class="tfoot"><tr><td colspan="3">TOTAL</td><td class="num">${num(totArea)}</td><td></td><td></td><td></td><td class="num">${brl0(totCusto)}</td><td></td></tr></tfoot>
  </table></div></div>`;
};

V.talhao = function(id){
  const t=DATA.talhoes.find(x=>x.id===id);
  if(!t) return `<div class="empty">Talhão não encontrado. <a class="link" data-go="#/talhoes">Voltar</a></div>`;
  const plan=DATA.planos[t.id]||{principal:[],safrinha:[]};
  const area=areaDe(t), c=custoTalhao(t);
  const maqHa=custoOpTalhaoHa(t), totHa=c.ha+maqHa;
  const opts=[`<option value="">— sem máquina —</option>`].concat((DATA.maquinas||[])
    .map(m=>`<option value="${esc(m.conjunto)}">${esc(m.conjunto)}</option>`)).join('');
  function opsHtml(seq,tag,titulo){
    const ops=plan[seq]||[]; if(!ops.length) return '';
    return `<div class="panel"><div class="panel-head"><h2>${titulo}</h2><span class="sub">${ops.length} operações</span></div>
    ${ops.map((op,oi)=>{
      let sub=0;
      const body=op.itens.map((it,ii)=>{
        const dose=doseDe(t.id,tag+oi,ii,it.dose), preco=precoDe(it.produto);
        const chHa=dose*preco; sub+=chHa;
        const ed=(doseKey(t.id,tag+oi,ii) in OV.dose)?'edited':'';
        return `<tr><td><span class="classe-tag">${esc(it.classe)}</span></td><td>${esc(it.produto)}</td>
          <td class="num"><input class="cell ${ed}" data-edit="dose" data-id="${t.id}" data-op="${tag+oi}" data-item="${ii}" value="${dose}"></td>
          <td>${esc(it.un)}</td><td class="num">${preco>0?brl(preco):'<span class="pill pill-noprice">s/ preço</span>'}</td>
          <td class="num">${brl(chHa)}</td><td class="num">${brl(chHa*area)}</td></tr>`;
      }).join('');
      const conj=opMaqDe(t.id,tag,oi,op), mHa=custoOpHa(t.id,tag,oi,op);
      const isOv=(opMaqKey(t.id,`${tag}${oi}`) in OV.opMaq);
      const selHtml=opts.replace(`value="${esc(conj||'')}"`,`value="${esc(conj||'')}" selected`);
      const totOp=sub+mHa;
      return `<div style="padding:10px 14px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="op-title">${esc(op.nome)}</span>
        <span style="font-size:12px;color:var(--muted)">🚜 Máquina:</span>
        <select class="sel ${isOv?'':''}" data-edit="opMaq" data-id="${t.id}" data-op="${tag+oi}" style="max-width:340px;${isOv?'border-color:var(--ink2)':''}">${selHtml}</select>
        <span style="font-size:12px;color:var(--ink2);font-weight:600">${brl(mHa)}/ha</span></div>
      <div class="table-wrap"><table><thead><tr><th>Classe</th><th>Produto</th><th class="num">Dose/ha</th><th>Un</th><th class="num">Preço</th><th class="num">Custo/ha</th><th class="num">Custo total</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot class="tfoot">
        <tr><td colspan="5">Insumos/ha</td><td class="num">${brl(sub)}</td><td class="num">${brl0(sub*area)}</td></tr>
        <tr><td colspan="5">+ Máquina/ha</td><td class="num">${brl(mHa)}</td><td class="num">${brl0(mHa*area)}</td></tr>
        <tr><td colspan="5"><b>Subtotal operação</b></td><td class="num"><b>${brl(totOp)}</b></td><td class="num"><b>${brl0(totOp*area)}</b></td></tr>
      </tfoot></table></div>`;
    }).join('')}</div>`;
  }
  return `
  <a class="link" data-go="#/talhoes">‹ Talhões</a>
  <div class="detail-head" style="margin-top:10px">
    <div class="di"><div class="l">Talhão</div><div class="v">${esc(t.id)} · ${esc(t.nome||'—')}</div></div>
    <div class="di"><div class="l">Cultura</div><div class="v" style="font-size:14px">${esc(t.empreendimento||'—')}</div></div>
    <div class="di"><div class="l">Área</div><div class="v">${num(area)} ha</div></div>
    <div class="di"><div class="l">Insumos/ha</div><div class="v">${brl(c.ha)}</div></div>
    <div class="di"><div class="l">Máquinas/ha</div><div class="v">${brl(maqHa)}</div></div>
    <div class="di"><div class="l">Custo total/ha</div><div class="v" style="color:var(--ink2)">${brl(totHa)}</div></div>
    <div class="di"><div class="l">Custo total</div><div class="v">${brl0(totHa*area)}</div></div>
  </div>
  <div class="toolbar" style="margin-top:-4px"><span class="badge badge-muted">A máquina de cada operação vem sugerida pela classe dos insumos — troque no seletor se precisar.</span></div>
  ${opsHtml('principal','P','Safra principal')}
  ${opsHtml('safrinha','S','Safrinha')||''}
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
  DATA.talhoes.forEach(t=>{
    const e=t.empreendimento||'—';
    const c=custoTalhao(t), area=areaDe(t);
    const g=emps[e]||(emps[e]={area:0,prod:0,ins:0,opDefault:0});
    g.area+=area; g.prod+=area*prodvDe(t); g.ins+=c.total;
    g.opDefault += custoOpTalhaoHa(t)*area;  // custo máquinas estimado (R$)
  });
  const list=Object.entries(emps).sort((a,b)=>b[1].area-a[1].area);
  let tA=0,tR=0,tI=0,tM=0;
  const body=list.map(([e,g])=>{
    const preco=precoCultura(e), receita=g.prod*preco;
    const opHaDefault=g.area>0?g.opDefault/g.area:0;
    const opHa=(e in OV.dreOp)?+OV.dreOp[e]:opHaDefault;
    const custoMaq=opHa*g.area, custoTot=g.ins+custoMaq, result=receita-custoTot;
    tA+=g.area;tR+=receita;tI+=g.ins;tM+=custoMaq;
    return `<tr><td><b>${esc(e)}</b></td><td class="num">${num(g.area)}</td>
      <td class="num">${nf0.format(g.prod)}</td>
      <td class="num"><input class="cell ${(e in OV.cultura)?'edited':''}" data-edit="cultura" data-emp="${esc(e)}" value="${preco}"></td>
      <td class="num">${brl0(receita)}</td>
      <td class="num">${brl0(g.ins)}</td>
      <td class="num"><input class="cell ${(e in OV.dreOp)?'edited':''}" data-edit="dreOp" data-emp="${esc(e)}" value="${opHa.toFixed(2)}"></td>
      <td class="num">${brl0(custoMaq)}</td>
      <td class="num">${brl0(custoTot)}</td>
      <td class="num"><b style="color:${result>=0?'var(--green)':'var(--red)'}">${brl0(result)}</b></td></tr>`;
  }).join('');
  const res=tR-tI-tM;
  return `
  <div class="kpi-grid">
    <div class="kpi"><div class="k-label">Receita total</div><div class="k-value">${brl0(tR)}</div></div>
    <div class="kpi"><div class="k-label">Custo insumos</div><div class="k-value">${brl0(tI)}</div></div>
    <div class="kpi"><div class="k-label">Custo máquinas</div><div class="k-value">${brl0(tM)}</div></div>
    <div class="kpi accent"><div class="k-label">Resultado</div><div class="k-value">${brl0(res)}</div><div class="k-sub">${tR>0?nf1.format(res/tR*100)+'% da receita':''}</div></div>
  </div>
  <div class="toolbar"><span class="badge badge-muted">Receita = Produção × Preço. Custo = insumos + máquinas (estimado; edite R$/ha). Preço de venda editável.</span></div>
  <div class="panel"><div class="table-wrap"><table>
    <thead><tr><th>Cultura / Empreendimento</th><th class="num">Área (ha)</th><th class="num">Produção (sc)</th>
      <th class="num">Preço (R$/sc)</th><th class="num">Receita</th><th class="num">Custo insumos</th>
      <th class="num">Máq. R$/ha</th><th class="num">Custo máquinas</th><th class="num">Custo total</th><th class="num">Resultado</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot class="tfoot"><tr><td>TOTAL</td><td class="num">${num(tA)}</td><td></td><td></td>
      <td class="num">${brl0(tR)}</td><td class="num">${brl0(tI)}</td><td></td><td class="num">${brl0(tM)}</td>
      <td class="num">${brl0(tI+tM)}</td>
      <td class="num"><b style="color:${res>=0?'var(--green)':'var(--red)'}">${brl0(res)}</b></td></tr></tfoot>
  </table></div></div>
  <p style="color:var(--muted);font-size:12px;margin-top:8px">O custo de máquinas soma o custo de cada operação (conjunto atribuído na tela do <b>Talhão</b>, com sugestão automática pela classe dos insumos). Ajuste o R$/ha por cultura se quiser sobrescrever. Arrendamento e custos fixos não estão incluídos.</p>`;
};

/* ================= ROUTER ================= */
const TITLES={dashboard:'Painel',talhoes:'Talhões',talhao:'Talhão',compras:'Demanda de Compras',cotacao:'Cotação por Fornecedor',maquinas:'Máquinas',dre:'DRE Orçada'};
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
  if(kind==='opMaq'){   // valor é o conjunto (string); "" = sem máquina
    const k=opMaqKey(el.dataset.id, el.dataset.op);
    OV.opMaq[k]=el.value; saveOverrides(); route(); return;
  }
  const val=el.value.trim().replace(',','.'), n=val===''?null:parseFloat(val);
  if(kind==='estoque'){ if(n==null||n===PROD[el.dataset.prod].estoque) delete OV.estoque[el.dataset.prod]; else OV.estoque[el.dataset.prod]=n; }
  else if(kind==='preco'){ if(n==null||n===0) delete OV.preco[el.dataset.prod]; else OV.preco[el.dataset.prod]=n; }
  else if(kind==='cultura'){ const e=el.dataset.emp; if(n==null||n===(DATA.precos_cultura[e]||0)) delete OV.cultura[e]; else OV.cultura[e]=n; }
  else if(kind==='maquina'){ const c=el.dataset.conj, m=DATA.maquinas.find(x=>x.conjunto===c); if(n==null||n===m.rs_hm) delete OV.maquina[c]; else OV.maquina[c]=n; }
  else if(kind==='diesel'){ OV.diesel = (n==null?6.00:n); }
  else if(kind==='dreOp'){ const e=el.dataset.emp; if(n==null) delete OV.dreOp[e]; else OV.dreOp[e]=n; }
  else if(kind==='dose'){ const k=doseKey(el.dataset.id,el.dataset.op,el.dataset.item); if(n==null) delete OV.dose[k]; else OV.dose[k]=n; }
  else if(kind==='area'||kind==='prodv'){
    const id=el.dataset.id, t=DATA.talhoes.find(x=>x.id===id); OV.talhao[id]=OV.talhao[id]||{};
    const base= kind==='area'?t.area:t.produtividade, key= kind==='area'?'area':'produtividade';
    if(n==null||n===base) delete OV.talhao[id][key]; else OV.talhao[id][key]=n;
    if(!Object.keys(OV.talhao[id]).length) delete OV.talhao[id];
  }
  saveOverrides(); route();
}
document.addEventListener('change',e=>{ if(e.target.matches('input.cell, select.sel')) applyEdit(e.target); });
document.addEventListener('keydown',e=>{ if(e.target.matches('input.cell')&&e.key==='Enter') e.target.blur(); });
document.addEventListener('click',e=>{
  const go=e.target.closest('[data-go]'); if(go){ e.preventDefault(); location.hash=go.dataset.go; return; }
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
