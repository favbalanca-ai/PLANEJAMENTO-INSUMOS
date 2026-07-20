/* Planejamento de Safra 26/27 — app estático (sem backend).
   Dados base em data.json; edições do usuário ficam no localStorage. */
'use strict';

const APP_VERSION = '2026.07.18-46';   // mostrado no rodapé; ajude a confirmar se a atualização chegou
const LS_KEY = 'planejamento_safra_2627_v1';
/* ---- Preços: composição por safra (referência por classe + % por produto) ---- */
const PRECOS_KEY = 'planejamento_precos';
const BANCO_ID = '1-pNApvSfw9oUbfec5Tm7g-DEh9xCgupAEpjsZp7EBKg';   // planilha "Banco de Preços" (p/ a fórmula IMPORTRANGE)
let PRECOS = null;
function loadPrecos(){
  let d; try{ d=JSON.parse(localStorage.getItem(PRECOS_KEY)); }catch(e){}
  if(!d||typeof d!=='object') d={atual:'2026/2027', safras:{}};
  if(!d.safras) d.safras={};
  if(!d.atual || !d.safras[d.atual]) d.atual=Object.keys(d.safras)[0]||'2026/2027';
  if(!d.safras[d.atual]) d.safras[d.atual]={refs:[], itens:[]};
  const s=d.safras[d.atual]; s.refs=s.refs||[]; s.itens=s.itens||[];
  return d;
}
function savePrecos(){ try{ localStorage.setItem(PRECOS_KEY, JSON.stringify(PRECOS)); }catch(e){}
  try{ if(typeof schedulePrecosPush==='function') schedulePrecosPush(); }catch(e){} }
function safraAtual(){ return PRECOS.safras[PRECOS.atual]; }
// fator (0,029) -> texto do campo de % (2,9), sem lixo de ponto flutuante
function pctToField(f){ if(f==null||f==='') return ''; return +((f*100).toFixed(4)); }
// preço composto de um item: preço de referência da classe × (1 + %)
function precoComposto(it, tipo){
  const s=safraAtual();
  const ref=s.refs.find(r=>(r.classe||'').toUpperCase().trim()===(it.classe||'').toUpperCase().trim());
  if(!ref) return 0;
  // % à vista usa it.pct; % a prazo usa it.pctPrazo (se não informado, cai no it.pct)
  const pct=tipo==='prazo'?(it.pctPrazo!=null?+it.pctPrazo:(+it.pct||0)):(+it.pct||0);
  return (+ref[tipo]||0)*(1+(pct||0));
}
// preço final: usa o preço DIRETO do produto (se informado); senão o composto (referência × (1+%))
function precoFinal(it, tipo){
  const d = tipo==='prazo' ? it.precoPrazo : it.precoVista;
  if(d!=null && String(d).trim()!=='' && +d>0) return +d;
  return precoComposto(it, tipo);
}
function applyPrecoEdit(el){
  const k=el.dataset.pr, i=+el.dataset.i, s=safraAtual();
  const numv=v=>{ const n=parseFloat(String(v||'').replace(',','.')); return isFinite(n)?n:0; };
  if(k==='refClasse'){ s.refs[i].classe=el.value.trim().toUpperCase(); }
  else if(k==='refProd'){ s.refs[i].produto=el.value.trim(); }
  else if(k==='refVista'){ s.refs[i].vista=numv(el.value); }
  else if(k==='refPrazo'){ s.refs[i].prazo=numv(el.value); }
  else if(k==='itEmpresa'){ s.itens[i].empresa=el.value.trim(); }
  else if(k==='itClasse'){ s.itens[i].classe=el.value.trim().toUpperCase(); }
  else if(k==='itProduto'){ s.itens[i].produto=el.value.trim(); }
  // as colunas % são percentuais no campo (2,9 = +2,9%); guardamos o fator (0,029)
  else if(k==='itPct'){ s.itens[i].pct=numv(el.value)/100; }
  else if(k==='itPctPrazo'){ s.itens[i].pctPrazo=(String(el.value).trim()===''?null:numv(el.value)/100); }
  else if(k==='itPrecoVista'){ s.itens[i].precoVista=(String(el.value).trim()===''?null:numv(el.value)); }
  else if(k==='itPrecoPrazo'){ s.itens[i].precoPrazo=(String(el.value).trim()===''?null:numv(el.value)); }
  savePrecos(); route();
}
/* ---- Importar lista de produtos de um PDF (portfólio do ano) ---- */
let _pdfjsLoading=null;
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(_pdfjsLoading) return _pdfjsLoading;
  _pdfjsLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=()=>{ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }catch(e){} res(window.pdfjsLib); };
    s.onerror=()=>{ _pdfjsLoading=null; rej(new Error('Não foi possível carregar o leitor de PDF (precisa de internet). Cole a lista manualmente.')); };
    document.head.appendChild(s);
  });
  return _pdfjsLoading;
}
// Portfólio do padrão favbalança: tabela EMPRESA · CLASSE · PRODUTO · ATIVOS · … .
// Cada produto pode ocupar várias linhas (ativos/classe quebram), mas a EMPRESA
// fica centralizada na fileira. Por isso separamos por colunas (posição X) e
// agrupamos cada célula à empresa mais próxima em Y. Retorna só "empresa\tclasse\tproduto".
const _PORT_SKIP=new Set(['EMPRESA','CLASSE','PRODUTO','ATIVOS','CONCENTRAÇÃO','EMBALAGEM','VOLUME','INDICADO','ENTREGA']);
function _isEmpresa(t){ return /^[A-ZÀ-Ú][A-ZÀ-Ú0-9/.\- ]{1,}$/.test(t) && !_PORT_SKIP.has(t); }
async function extractPortfolio(pdf){
  const out=[];
  for(let pg=1;pg<=pdf.numPages;pg++){
    const page=await pdf.getPage(pg);
    const tc=await page.getTextContent();
    // y para baixo = maior (invertemos o eixo do PDF, que cresce para cima)
    const words=tc.items.filter(it=>it.str&&it.str.trim()).map(it=>({x:it.transform[4], y:-it.transform[5], s:it.str.trim()}));
    if(!words.length) continue;
    // localiza a linha de cabeçalho (EMPRESA/CLASSE/PRODUTO) e as fronteiras de coluna
    const byline={}; words.forEach(w=>{ const k=Math.round(w.y); (byline[k]=byline[k]||[]).push(w); });
    let hy=null,b1,b2,b3;
    for(const k of Object.keys(byline).map(Number).sort((a,b)=>a-b)){
      const map={}; byline[k].forEach(w=>{ if(!(w.s in map)) map[w.s]=w.x; });
      if('EMPRESA' in map && 'CLASSE' in map && 'PRODUTO' in map){
        const eX=map.EMPRESA,cX=map.CLASSE,pX=map.PRODUTO,aX=('ATIVOS' in map)?map.ATIVOS:pX+120;
        hy=k; b1=(eX+cX)/2; b2=(cX+pX)/2; b3=(pX+aX)/2; break;
      }
    }
    if(hy==null) continue;   // página sem tabela (premissas) — ignora
    let region=words.filter(w=>w.y>hy+2 && !_PORT_SKIP.has(w.s));
    // rodapé de premissas começa na 1ª linha cujo 1º token começa com "*"
    const fl={}; region.forEach(w=>{ const k=Math.round(w.y); (fl[k]=fl[k]||[]).push(w); });
    let footerY=1e9;
    for(const k of Object.keys(fl).map(Number).sort((a,b)=>a-b)){
      const left=fl[k].reduce((m,w)=>w.x<m.x?w:m); if(left.s.charAt(0)==='*'){ footerY=k; break; }
    }
    region=region.filter(w=>w.y<footerY-2);
    const anchors=region.filter(w=>w.x<b1 && _isEmpresa(w.s)).sort((a,b)=>a.y-b.y);
    if(!anchors.length) continue;
    const ys=anchors.map(a=>a.y), recs=anchors.map(()=>({e:[],c:[],p:[]}));
    region.forEach(w=>{
      let idx=-1;
      for(let i=0;i<anchors.length;i++){
        const up=i===0?hy:(ys[i-1]+ys[i])/2, lo=i===anchors.length-1?footerY:(ys[i]+ys[i+1])/2;
        if(w.y>=up && w.y<lo){ idx=i; break; }
      }
      if(idx<0) return;
      if(w.x<b1) recs[idx].e.push(w); else if(w.x<b2) recs[idx].c.push(w); else if(w.x<b3) recs[idx].p.push(w);
    });
    const txt=ws=>ws.sort((a,b)=>Math.round(a.y)-Math.round(b.y)||a.x-b.x).map(w=>w.s).join(' ').replace(/\s+/g,' ').trim();
    recs.forEach(r=>{ const e=txt(r.e),c=txt(r.c),p=txt(r.p); if(p&&e) out.push(e+'\t'+c+'\t'+p); });
  }
  return out;
}
// reconstrução genérica linha-a-linha (para PDFs fora do padrão portfólio)
function _genericLines(tc){
  const rows={};
  tc.items.forEach(it=>{
    if(!it.str) return;
    const y=Math.round(it.transform[5]);
    (rows[y]=rows[y]||[]).push({x:it.transform[4], w:it.width||0, h:Math.abs(it.height)||8, s:it.str});
  });
  const lines=[];
  Object.keys(rows).map(Number).sort((a,b)=>b-a).forEach(y=>{
    const cells=rows[y].sort((a,b)=>a.x-b.x);
    let out='', prevEnd=null;
    cells.forEach(o=>{ if(prevEnd!=null){ const gap=o.x-prevEnd; out+=gap>o.h*0.9?'\t':(gap>0.5?' ':''); } out+=o.s; prevEnd=o.x+o.w; });
    out=out.replace(/[ \t]+$/,''); if(out.trim()) lines.push(out);
  });
  return lines;
}
async function extractPdfText(file){
  const lib=await loadPdfJs();
  const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise;
  const port=await extractPortfolio(pdf);
  if(port.length>=5) return port.join('\n');   // reconheceu o padrão portfólio
  const lines=[];
  for(let p=1;p<=pdf.numPages;p++){ const tc=await (await pdf.getPage(p)).getTextContent(); lines.push(..._genericLines(tc)); }
  return lines.join('\n');
}
async function prHandlePdf(file){
  toast('Lendo PDF…');
  try{ prImportModal(await extractPdfText(file)); }
  catch(err){ prImportModal(''); toast(err&&err.message?err.message:'Falha ao ler o PDF — cole a lista manualmente'); }
}
/* ---- Importar tabela de Excel (.xlsx/.xls) ou CSV, com preços ---- */
let _xlsxLoading=null;
function loadXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(_xlsxLoading) return _xlsxLoading;
  _xlsxLoading=new Promise((res,rej)=>{
    const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>res(window.XLSX); s.onerror=()=>{ _xlsxLoading=null; rej(new Error('Não foi possível carregar o leitor de Excel (precisa de internet).')); };
    document.head.appendChild(s);
  });
  return _xlsxLoading;
}
// linhas (matriz) -> texto do modal: Empresa\tClasse\tProduto\tPreço à vista\tPreço a prazo
function _rowsToImportText(rows){
  if(!rows||!rows.length) return '';
  const norm=s=>String(s==null?'':s).toUpperCase().replace(/\s+/g,' ').trim();
  let hIdx=-1;
  for(let i=0;i<Math.min(rows.length,10);i++){ const r=(rows[i]||[]).map(norm);
    if(r.some(c=>c.indexOf('PRODUTO')>=0) || (r.some(c=>c.indexOf('EMPRESA')>=0)&&r.some(c=>c.indexOf('CLASSE')>=0))){ hIdx=i; break; } }
  let map=null, start=0;
  if(hIdx>=0){ const H=(rows[hIdx]||[]).map(norm);
    const find=(...keys)=>H.findIndex(h=>keys.some(k=>h.indexOf(k)>=0));
    let pv=find('À VISTA','A VISTA','VISTA'); if(pv<0) pv=find('VALOR','PREÇO','PRECO','CUSTO','R$/');
    map={ emp:find('EMPRESA','FORNECEDOR','FABRICANTE'), cls:find('CLASSE','CATEGORIA','GRUPO'),
      prod:find('PRODUTO','DESCRI','MERCADORIA'), pv:pv, pp:find('A PRAZO','PRAZO') };
    start=hIdx+1;
  }
  const g=(r,idx)=> (idx>=0 && idx<r.length) ? r[idx] : '';
  const out=[];
  for(let i=start;i<rows.length;i++){ const r=rows[i]||[]; let emp,cls,prod,pv,pp;
    if(map){ emp=g(r,map.emp); cls=g(r,map.cls); prod=g(r,map.prod); pv=g(r,map.pv); pp=g(r,map.pp); }
    else { emp=r[0]; cls=r[1]; prod=r[2]; pv=r[3]; pp=r[4]; }
    if(!String(prod==null?'':prod).trim()) continue;
    out.push([emp,cls,prod,pv,pp].map(v=>String(v==null?'':v).trim()).join('\t'));
  }
  return out.join('\n');
}
async function prHandleExcel(file){
  toast('Lendo tabela…');
  try{
    let rows;
    if(/\.csv$/i.test(file.name)){
      const txt=await file.text();
      rows=txt.split(/\r?\n/).filter(l=>l.length).map(l=>{ const sep=(l.split(';').length>l.split(',').length)?';':','; return l.split(sep).map(c=>c.replace(/^"|"$/g,'').trim()); });
    } else {
      const XLSX=await loadXLSX();
      const wb=XLSX.read(await file.arrayBuffer(), {type:'array'});
      rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''});
    }
    const text=_rowsToImportText(rows);
    if(!text){ toast('Não encontrei produtos na tabela — revise/cole manualmente'); prImportModal(''); return; }
    prImportModal(text);
  }catch(err){ prImportModal(''); toast(err&&err.message?err.message:'Falha ao ler a tabela — cole manualmente'); }
}
// preço solto: "R$ 1.234,56" / "16,49" / "16.49" -> número
function _priceLoose(v){
  v=String(v==null?'':v).replace(/[^\d.,-]/g,'').trim();
  if(!v) return null;
  if(v.indexOf(',')>=0 && v.indexOf('.')>=0) v=v.replace(/\./g,'').replace(',','.');
  else if(v.indexOf(',')>=0) v=v.replace(',','.');
  const n=parseFloat(v); return isFinite(n)?n:null;
}
function prImportModal(initialText){
  const old=document.getElementById('pr-import-ov'); if(old) old.remove();
  const ov=document.createElement('div'); ov.id='pr-import-ov'; ov.className='modal-ov';
  ov.innerHTML=`<div class="modal-box">
    <div class="modal-head"><h3>Importar lista de produtos</h3><button class="icon-btn" data-act="prImpClose" title="Fechar">✕</button></div>
    <p class="mut" style="font-size:12px;margin:0 0 8px">Uma linha por produto, colunas na ordem <b>Empresa · Classe · Produto · Preço à vista · Preço a prazo</b> (TAB ou 2+ espaços). Do <b>PDF de portfólio</b> vêm só os produtos (sem preço). Da <b>tabela Excel</b> os preços já vêm juntos — revise e importe. Preço aceita <code>16,49</code>, <code>R$ 16,49</code> ou <code>16.49</code>.</p>
    <textarea id="pr-imp-txt" class="pr-imp-txt" spellcheck="false" placeholder="Empresa\tClasse\tProduto\tPreço à vista\tPreço a prazo">${esc(initialText||'')}</textarea>
    <div class="modal-foot">
      <label class="mut" style="font-size:12px;display:flex;align-items:center;gap:5px"><input type="checkbox" id="pr-imp-replace"> Substituir o portfólio atual</label>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-act="prImpClose">Cancelar</button>
      <button class="btn btn-primary btn-sm" data-act="prImpDo">Importar</button>
    </div></div>`;
  document.body.appendChild(ov);
  const ta=ov.querySelector('#pr-imp-txt'); if(ta) ta.focus();
}
function _numLoose(v){
  v=String(v==null?'':v).trim().replace('%','').trim();
  if(!v) return null;
  if(v.indexOf(',')>=0 && v.indexOf('.')>=0) v=v.replace(/\./g,'').replace(',','.');
  else if(v.indexOf(',')>=0) v=v.replace(',','.');
  const n=parseFloat(v); return isFinite(n)?n:null;
}
function _pctParse(raw){
  const hadP=/%/.test(String(raw||''));
  let n=_numLoose(raw); if(n==null) return null;
  if(hadP || Math.abs(n)>1) n=n/100;
  return n;
}
function prDoImport(){
  const ta=document.getElementById('pr-imp-txt'); if(!ta) return;
  const rep=document.getElementById('pr-imp-replace'); const replace=rep&&rep.checked;
  const items=[];
  ta.value.split('\n').forEach(l=>{
    if(!l.trim()) return;
    let cols = l.indexOf('\t')>=0 ? l.split(/\t+/) : l.split(/\s{2,}/);
    cols=cols.map(c=>c.trim());
    // ignora cabeçalho ("EMPRESA CLASSE PRODUTO …")
    if(/^empresa$/i.test(cols[0]||'') || (/classe/i.test(cols[1]||'')&&/produto/i.test(cols[2]||''))) return;
    const it={ empresa:cols[0]||'', classe:(cols[1]||'').toUpperCase(), produto:cols[2]||'',
      precoVista:_priceLoose(cols[3]), precoPrazo:_priceLoose(cols[4]) };
    if(!it.produto && !it.classe) return;
    items.push(it);
  });
  if(!items.length){ toast('Nenhuma linha reconhecida'); return; }
  const s=safraAtual();
  s.itens = replace ? items : s.itens.concat(items);
  savePrecos();
  const ov=document.getElementById('pr-import-ov'); if(ov) ov.remove();
  route(); toast((replace?'Portfólio substituído — ':'')+'Importados '+items.length+' produtos');
}
const DATA_KEY = 'planejamento_data_cache';   // últimos dados sincronizados — o app abre com eles (não com o data.json antigo)
function saveDataCache(d){ try{ localStorage.setItem(DATA_KEY, JSON.stringify(d)); }catch(e){} }
function loadDataCache(){ try{ const s=localStorage.getItem(DATA_KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }
const MOD_KEY = 'planejamento_modulo';   // 'planejamento' | 'campo' | 'precos' (qual módulo está ativo)
// a qual módulo cada tela pertence ('both' = aparece nos dois)
const VIEW_MOD = { inicio:'both', dashboard:'planejamento', talhoes:'planejamento', talhao:'planejamento',
  empreendimentos:'planejamento', compras:'planejamento', cotacao:'planejamento', precos:'precos',
  maquinas:'planejamento', dre:'planejamento', campo:'campo', monitoramento:'campo', mapa:'campo', chuva:'campo', stand:'campo', recomendacao:'campo', sync:'both' };
function currentModule(){ const m=localStorage.getItem(MOD_KEY); return (m==='campo'||m==='precos')?m:'planejamento'; }
function moduleHome(m){ return m==='campo'?'#/campo':(m==='precos'?'#/precos':'#/dashboard'); }
const MOD_INFO = { planejamento:{ico:'📋',nome:'Planejamento'}, campo:{ico:'🧑‍🌾',nome:'Campo'}, precos:{ico:'💲',nome:'Preços'} };
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
// empSet (opcional): só as culturas selecionadas; talSet (opcional): só os talhões selecionados
function calcDemanda(empSet, talSet){
  const dem = {};
  for(const t of talhoesAll()){
    if(talSet && talSet.size && !talSet.has(t.id)) continue;
    const area = areaDe(t);
    eachOp(t,(seq,tag,oi,op,tagoi)=>{
      if(empSet && empSet.size){ const cult=(seq==='safrinha'?empSafDe(t):empDe(t))||'—'; if(!empSet.has(cult)) return; }
      effItems(t.id,tagoi,op.itens).forEach(it=>{
        if(!it.produto) return;
        dem[it.produto] = (dem[it.produto]||0) + it.dose*area;
      });
    });
  }
  return dem;
}
// lista de compras a partir da demanda
function calcCompras(empSet, talSet){
  const dem = calcDemanda(empSet, talSet);
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

const cotaEmpSel = new Set();      // filtro da Cotação (vazio = todos) — sessão
const comprasEmpSel = new Set();   // filtro de empreendimento da Demanda de Compras — sessão
const comprasTalSel = new Set();   // filtro de talhão da Demanda de Compras — sessão
V.compras = function(){
  const sel=comprasEmpSel, tsel=comprasTalSel;
  const emps=empList().filter(e=>e&&e!=='—');
  const talhoes=talhoesAll();
  const all=calcCompras(sel.size?sel:null, tsel.size?tsel:null);
  const totalCompra=all.reduce((a,r)=>a+r.valor,0);
  const valDemanda=all.reduce((a,r)=>a+r.demanda*r.preco,0);
  const filtro=(sel.size||tsel.size);
  const itens=all.filter(r=>r.comprar>0).length;
  const semPreco=all.filter(r=>r.comprar>0&&r.preco<=0).length;
  const valEstoque=all.reduce((a,r)=>a+r.estoque*r.preco,0);
  // agrupa por classe (grupos recolhíveis, como as operações do talhão)
  const groups={};
  all.forEach(r=>{ const k=r.classe||'(sem classe)'; (groups[k]=groups[k]||[]).push(r); });
  const classes=Object.keys(groups).sort((a,b)=>a.localeCompare(b));
  const th=`<thead><tr><th>Produto</th><th class="num">A comprar</th><th class="num">Estoque</th><th class="num">Em pedido</th><th class="num">Preço</th><th class="num">Valor</th><th class="num">Demanda</th><th>Un</th><th>Fornecedor</th><th>Status</th></tr></thead>`;
  const rowHtml=r=>`<tr data-search="${esc((r.classe+' '+r.empresa+' '+r.produto).toLowerCase())}" data-dem="${r.demanda}" data-val="${r.demanda*r.preco}" data-buy="${r.valor}" data-un="${esc(r.un||'')}" data-cardkey="cp|${esc(r.produto)}"${openCards.has('cp|'+r.produto)?' class="open"':''}>
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
  <div class="panel" style="margin-bottom:14px"><div class="panel-head"><h2>Fracionar por empreendimento</h2>
      <span class="sub">${sel.size?`${sel.size} cultura(s)`:'todas as culturas'}</span></div>
    <div class="classe-filter" id="compras-empf" style="margin:12px 14px">
      <button class="chip-f ${sel.size===0?'on':''}" data-empf="">Todos</button>
      ${emps.map(e=>`<button class="chip-f ${sel.has(e)?'on':''}" data-empf="${esc(e)}">${esc(e)}</button>`).join('')}
    </div></div>
  <div class="panel" style="margin-bottom:14px"><div class="panel-head"><h2>Filtrar por talhão</h2>
      <span class="sub">${tsel.size?`${tsel.size} talhão(ões)`:'todos os talhões'}</span></div>
    <div class="classe-filter" id="compras-talf" style="margin:12px 14px">
      <button class="chip-f ${tsel.size===0?'on':''}" data-talf="">Todos</button>
      ${talhoes.map(t=>`<button class="chip-f ${tsel.has(t.id)?'on':''}" data-talf="${esc(t.id)}" title="${esc(t.nome||'')}">${esc(t.id)}</button>`).join('')}
    </div></div>
  <div class="dem-bar${filtro?' is-filtered':''}">
    <div class="dem-volwrap" hidden><span class="dem-lbl">Volume do insumo</span><b class="dem-vol"></b></div>
    <div><span class="dem-lbl">Valor da demanda${filtro?' (filtro)':''}</span><b class="dem-val">${brl0(valDemanda)}</b></div>
    <div class="dem-buy"><span class="dem-lbl">A comprar</span><b>${brl0(totalCompra)}</b></div>
  </div>
  <div class="toolbar"><div class="search"><input id="q-compra" placeholder="Buscar produto, classe ou fornecedor…"></div>
    <div class="spacer"></div><span class="badge badge-muted">${(sel.size||tsel.size)?'Demanda só do que foi selecionado (estoque/pedido são globais). ':''}A comprar = máx(0; Demanda − Estoque − Em pedido).</span></div>
  <div id="compras-groups">${groupsHtml||'<div class="empty">Sem itens para as culturas selecionadas.</div>'}</div>
  <div class="compras-total"><span>TOTAL A COMPRAR</span><b>${brl0(totalCompra)}</b></div>`;
};

V.cotacao = function(){
  const sel=cotaEmpSel;
  const emps=empList().filter(e=>e&&e!=='—');
  const rows=calcCompras(sel.size?sel:null).filter(r=>r.comprar>0);
  const groups={};
  rows.forEach(r=>{const k=r.empresa||'(sem fornecedor)';(groups[k]=groups[k]||[]).push(r);});
  const order=Object.keys(groups).sort((a,b)=>(a==='(sem fornecedor)')-(b==='(sem fornecedor)')||a.localeCompare(b));
  const totalGeral=rows.reduce((a,r)=>a+r.valor,0);
  return `
  <div class="panel" style="margin-bottom:14px"><div class="panel-head"><h2>Fracionar por empreendimento</h2>
      <span class="sub">${sel.size?`${sel.size} cultura(s) selecionada(s)`:'todas as culturas'}</span></div>
    <div class="classe-filter" id="cot-empf" style="margin:12px 14px">
      <button class="chip-f ${sel.size===0?'on':''}" data-empf="">Todos</button>
      ${emps.map(e=>`<button class="chip-f ${sel.has(e)?'on':''}" data-empf="${esc(e)}">${esc(e)}</button>`).join('')}
    </div></div>
  <div class="toolbar"><div class="search"><input id="q-cot" placeholder="Buscar produto, classe ou fornecedor…"></div>
    <span class="badge badge-muted">${order.length} fornecedores · ${brl0(totalGeral)}${sel.size?' · só culturas selecionadas':''} — edite o <b>Preço ref.</b> aqui</span>
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

V.precos = function(){
  const d=PRECOS, s=safraAtual();
  const safras=Object.keys(d.safras).sort();
  const refRows=s.refs.map((r,i)=>`<tr>
      <td data-th="Classe"><input class="txt" data-pr="refClasse" data-i="${i}" value="${esc(r.classe||'')}" placeholder="classe"></td>
      <td data-th="Produto de referência" class="pr-prod"><input class="txt" data-pr="refProd" data-i="${i}" value="${esc(r.produto||'')}" placeholder="produto de referência"></td>
      <td class="num" data-th="À vista (R$)"><input class="cell" inputmode="decimal" data-pr="refVista" data-i="${i}" value="${r.vista||''}" placeholder="0"></td>
      <td class="num" data-th="A prazo (R$)"><input class="cell" inputmode="decimal" data-pr="refPrazo" data-i="${i}" value="${r.prazo||''}" placeholder="0"></td>
      <td class="pr-del"><button class="icon-btn del" title="Remover" data-act="prDelRef" data-i="${i}">🗑</button></td></tr>`).join('');
  const fmtn=v=>(Math.round((+v||0)*100)/100).toFixed(2).replace('.',',');
  // lista agrupada por CLASSE (A→Z) e produtos em ordem alfabética
  const normc=x=>String(x||'').toUpperCase().trim();
  const idxed=s.itens.map((it,i)=>({it,i})).sort((a,b)=>
    normc(a.it.classe).localeCompare(normc(b.it.classe),'pt') || normc(a.it.produto).localeCompare(normc(b.it.produto),'pt'));
  const clsCount={}; idxed.forEach(({it})=>{ const c=normc(it.classe)||'—'; clsCount[c]=(clsCount[c]||0)+1; });
  let _lastCls=null, itemsList='';
  idxed.forEach(({it,i})=>{
    const c=normc(it.classe)||'—';
    if(c!==_lastCls){ _lastCls=c; itemsList+=`<div class="pr-grp">${esc(it.classe||'(sem classe)')}<span>${clsCount[c]}</span></div>`; }
    const compV=precoComposto(it,'vista'), compP=precoComposto(it,'prazo');
    itemsList+=`<div class="pr-item">
      <input class="pr-prodname" data-pr="itProduto" data-i="${i}" value="${esc(it.produto||'')}" placeholder="produto">
      <input class="pr-emp" data-pr="itEmpresa" data-i="${i}" value="${esc(it.empresa||'')}" placeholder="empresa">
      <input class="pr-cls" list="pr-classes" data-pr="itClasse" data-i="${i}" value="${esc(it.classe||'')}" placeholder="classe">
      <input class="pr-price cell${it.precoVista!=null&&it.precoVista!==''?' edited':''}" inputmode="decimal" data-pr="itPrecoVista" data-i="${i}" value="${it.precoVista!=null?it.precoVista:''}" placeholder="${compV>0?fmtn(compV):'à vista'}" title="Preço à vista">
      <input class="pr-price cell${it.precoPrazo!=null&&it.precoPrazo!==''?' edited':''}" inputmode="decimal" data-pr="itPrecoPrazo" data-i="${i}" value="${it.precoPrazo!=null?it.precoPrazo:''}" placeholder="${compP>0?fmtn(compP):'a prazo'}" title="Preço a prazo">
      <input class="pr-price cell pr-pct" inputmode="decimal" data-pr="itPct" data-i="${i}" value="${pctToField(it.pct)}" placeholder="% vista" title="% sobre a referência da classe (só usado se o preço à vista estiver vazio)">
      <input class="pr-price cell pr-pct" inputmode="decimal" data-pr="itPctPrazo" data-i="${i}" value="${pctToField(it.pctPrazo)}" placeholder="% prazo" title="% a prazo">
      <button class="icon-btn del" title="Remover" data-act="prDelItem" data-i="${i}">🗑</button></div>`;
  });
  if(!s.itens.length) itemsList='<div class="mut" style="padding:14px">Nenhum produto. Adicione abaixo.</div>';
  const temUrl=!!syncUrl();
  return `<datalist id="pr-classes">${s.refs.map(r=>`<option value="${esc(r.classe)}">`).join('')}</datalist>
  <div class="panel pr-sync">
    <div class="panel-head"><h2>Sincronização</h2><span class="sub">${temUrl?('planilha · '+lastSyncTxt()):'não configurada'}</span></div>
    <div class="bulk-add" style="align-items:center">
      ${temUrl
        ? `<button class="btn btn-outline btn-sm" data-act="prSyncPull">⬇ Puxar da planilha</button>
           <button class="btn btn-primary btn-sm" data-act="prSyncPush">⬆ Enviar para a planilha</button>
           <span class="mut" style="font-size:12px">Puxar substitui pelos preços da planilha; ${autoOn()?'com a sincronização automática ligada, o módulo puxa ao abrir e envia sozinho após editar.':'a sincronização automática está desligada.'}</span>`
        : `<span class="mut" style="font-size:12px">Configure a URL na tela <b>Sincronizar</b> (módulo Planejamento) para sincronizar os preços com a planilha.</span>`}
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Safra</h2><span class="sub">${s.itens.length} produtos · ${s.refs.length} classes</span></div>
    <div class="bulk-add">
      <label class="mut" style="font-size:12px;font-weight:700">Safra ativa
        <select class="sel" id="pr-safra">${safras.map(sf=>`<option ${sf===d.atual?'selected':''}>${esc(sf)}</option>`).join('')}</select></label>
      <button class="btn btn-outline btn-sm" data-act="prNovaSafra">+ Nova safra</button>
      <button class="btn btn-outline btn-sm" data-act="prDupSafra">⧉ Duplicar safra atual</button>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Preços de referência por classe</h2><span class="sub">1 produto de referência por classe (à vista e a prazo)</span></div>
    <div class="table-wrap"><table class="pr-tbl">
      <thead><tr><th>Classe</th><th>Produto de referência</th><th class="num">À vista (R$)</th><th class="num">A prazo (R$)</th><th></th></tr></thead>
      <tbody>${refRows||'<tr><td colspan="5" class="mut" style="padding:12px 14px">Nenhuma classe. Adicione abaixo.</td></tr>'}</tbody></table></div>
    <div class="op-add"><button class="btn btn-primary btn-sm" data-act="prAddRef">+ adicionar classe de referência</button></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Portfólio do ano</h2><span class="sub">por classe · A→Z · digite o preço à vista/a prazo</span></div>
    <div class="pr-list">${itemsList}</div>
    <div class="op-add">
      <button class="btn btn-primary btn-sm" data-act="prAddItem">+ adicionar produto</button>
      <button class="btn btn-outline btn-sm" data-act="prImportPdf">📄 Importar lista PDF</button>
      <button class="btn btn-outline btn-sm" data-act="prImportXlsx">📊 Importar tabela Excel</button>
      <button class="btn btn-ghost btn-sm" data-act="prPctToPreco" title="Se você digitou o PREÇO no campo de %, isto move os valores para a coluna Preço à vista">↦ usar % como preço</button>
      <input type="file" id="pr-pdf-file" accept="application/pdf,.pdf" hidden>
      <input type="file" id="pr-xlsx-file" accept=".xlsx,.xls,.csv" hidden>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Levar os preços ao planejamento</h2><span class="sub">recomendado: o planejamento busca por fórmula (não sobrescreve nada)</span></div>
    ${temUrl ? `
    <div class="bulk-add" style="align-items:center">
      <button class="btn btn-primary btn-sm" data-act="prPublicar">▶ Publicar preços — safra ${esc(PRECOS.atual)}</button>
      <span class="mut" style="font-size:12px">Grava a lista <b>produto → preço</b> no Banco. O planejamento atualiza sozinho pela fórmula.</span>
    </div>
    <details class="panel-collapse" style="margin-top:10px">
      <summary style="cursor:pointer;font-size:13px;font-weight:700">📋 Fórmula para colar no PORTIFÓLIO (só uma vez)</summary>
      <p class="mut" style="font-size:12px;margin:8px 0 4px">Na planilha de planejamento → aba <b>PORTIFÓLIO</b> → célula <b>S4</b> (VALOR R$/L OU KG): cole e arraste pra baixo. Preço <b>à vista</b>:</p>
      <textarea class="pr-imp-txt" style="min-height:54px" readonly onclick="this.select()">=IFERROR(VLOOKUP(C4;IMPORTRANGE("${BANCO_ID}";"PREÇOS!A:C");2;FALSO);"")</textarea>
      <p class="mut" style="font-size:12px;margin:6px 0 0">Para <b>a prazo</b>, troque o <code>2</code> por <code>3</code>. Na 1ª vez o Sheets pede para <b>Permitir acesso</b> (IMPORTRANGE) — clique em Permitir.</p>
    </details>
    <div class="bulk-add" style="align-items:center;margin-top:10px">
      <span class="mut" style="font-size:12px">Opcional — carimbar valor fixo (perde a fórmula de busca):</span>
      <button class="btn btn-ghost btn-sm" data-act="prAlimVista">à vista</button>
      <button class="btn btn-ghost btn-sm" data-act="prAlimPrazo">a prazo</button>
    </div>`
    : `<div class="bulk-add"><span class="mut" style="font-size:12px">Configure a URL na tela <b>Sincronizar</b> (módulo Planejamento) para levar os preços ao planejamento.</span></div>`}
  </div>
  <p class="mut" style="font-size:12px">Duas formas de definir o preço: <b>(1) direto</b> — digite o <b>Preço à vista/a prazo</b> de cada produto (o que você recebe pronto na cotação); ou <b>(2) composto</b> — cadastre a <b>referência por classe</b> e o <b>%</b> de cada produto (o preço aparece sozinho). Se o campo de preço estiver preenchido, ele <b>manda</b>; senão, usa o composto. Tudo é salvo por <b>safra</b>.<br>💡 Se você tinha digitado o <b>preço no campo de %</b>, clique em <b>“↦ usar % como preço”</b> para mover tudo de uma vez.</p>`;
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
        ['Operação de Campo','Monitoramento (GPS)','Recomendação de aplicação','Realizado por insumo'],'ec-campo')}
      ${card('precos','💲','Preços','Componha e mantenha os preços dos insumos.',
        ['Portfólio do ano','Preços de referência','Composição à vista e a prazo','Histórico por safra'],'ec-precos')}
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
/* ================= MONITORAMENTO DE CAMPO (scouting, estilo Aqila) ================= */
const MONIT_KEY='planejamento_monitoramento';
let MONIT=null, _monitGPS=null;
function loadMonit(){ try{ const d=JSON.parse(localStorage.getItem(MONIT_KEY)); if(d&&Array.isArray(d.registros)) return d; }catch(e){} return {registros:[]}; }
function saveMonit(){ try{ localStorage.setItem(MONIT_KEY, JSON.stringify(MONIT)); }catch(e){} }
const fmtData=s=>{ if(!s) return ''; const p=String(s).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; };
const MONIT_ALVOS=['Lagarta-do-cartucho','Lagarta-da-soja','Helicoverpa','Percevejo-marrom','Percevejo-verde','Mosca-branca','Tripes','Ácaro-rajado','Ferrugem-asiática','Mancha-alvo','Mancha-parda','Antracnose','Oídio','Cercospora','Mofo-branco','Buva','Capim-amargoso','Caruru','Corda-de-viola','Trapoeraba','Picão-preto','Falha de stand'];
const MONIT_CAT={praga:{lbl:'Praga',cls:'mc-praga'},doenca:{lbl:'Doença',cls:'mc-doenca'},daninha:{lbl:'Daninha',cls:'mc-daninha'},outro:{lbl:'Outro',cls:'mc-outro'}};
const MONIT_EFIC={'':{lbl:''},pendente:{lbl:'Pendente',cls:'ef-pend'},eficaz:{lbl:'Eficaz',cls:'ef-ok'},parcial:{lbl:'Parcial',cls:'ef-parc'},ineficaz:{lbl:'Ineficaz',cls:'ef-bad'}};
const _numc=v=>{ const n=parseFloat(String(v==null?'':v).replace(',','.')); return isFinite(n)?n:null; };
function monitCaptureGPS(){
  const st=document.getElementById('monit-gps');
  if(!('geolocation' in navigator)){ if(st) st.textContent='GPS não suportado neste aparelho'; return; }
  if(st) st.textContent='📍 obtendo localização…';
  navigator.geolocation.getCurrentPosition(p=>{
    _monitGPS={lat:+p.coords.latitude.toFixed(6), lng:+p.coords.longitude.toFixed(6), acc:Math.round(p.coords.accuracy||0)};
    if(st) st.innerHTML=`📍 <b>${_monitGPS.lat}, ${_monitGPS.lng}</b> <span class="mut">(±${_monitGPS.acc} m)</span> · <a href="https://maps.google.com/?q=${_monitGPS.lat},${_monitGPS.lng}" target="_blank" rel="noopener">ver</a>`;
  }, err=>{ if(st) st.textContent='✖ não foi possível obter o GPS ('+((err&&err.message)||'')+'). Permita o acesso à localização.'; },
  {enableHighAccuracy:true, timeout:12000, maximumAge:0});
}
function monitSave(talhao){
  const g=id=>{ const el=document.getElementById(id); return el?el.value.trim():''; };
  const alvo=g('monit-alvo');
  if(!alvo){ toast('Informe o alvo (praga/doença/daninha)'); return; }
  MONIT.registros.push({
    id:'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    talhao, data:g('monit-data')||new Date().toISOString().slice(0,10),
    categoria:g('monit-cat')||'praga', alvo,
    nivel:g('monit-nivel'), unidade:g('monit-unid'), limiar:g('monit-limiar'),
    acao:g('monit-acao'), eficacia:g('monit-efic'), obs:g('monit-obs'),
    lat:_monitGPS?_monitGPS.lat:null, lng:_monitGPS?_monitGPS.lng:null, acc:_monitGPS?_monitGPS.acc:null,
    ts:Date.now()
  });
  saveMonit(); _monitGPS=null; route(); toast('Registro salvo');
}
V.monitoramento=function(arg){
  const all=talhoesAll();
  if(!all.length) return `<div class="empty">Nenhum talhão para monitorar.</div>`;
  const selId=(arg&&all.some(t=>t.id===arg))?arg:all[0].id;
  const t=all.find(x=>x.id===selId);
  const regs=MONIT.registros.filter(r=>r.talhao===selId).sort((a,b)=>(b.ts||0)-(a.ts||0));
  const tOpt=all.map(x=>{ const n=MONIT.registros.filter(r=>r.talhao===x.id).length;
    return `<option value="${esc(x.id)}"${x.id===selId?' selected':''}>${esc(x.id)} · ${esc(x.nome||'')}${n?` — ${n} reg.`:''}</option>`; }).join('');
  const hoje=new Date().toISOString().slice(0,10);
  const cards=regs.map(r=>{
    const cat=MONIT_CAT[r.categoria]||MONIT_CAT.outro;
    const nv=_numc(r.nivel), lm=_numc(r.limiar), acima=(nv!=null&&lm!=null&&nv>=lm);
    const ef=MONIT_EFIC[r.eficacia||'']||MONIT_EFIC[''];
    const gps=(r.lat!=null&&r.lng!=null)
      ? `<a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" rel="noopener" class="monit-gpslink">📍 ${r.lat}, ${r.lng}${r.acc?` <span class="mut">(±${r.acc}m)</span>`:''}</a>`
      : '<span class="mut">sem GPS</span>';
    return `<div class="monit-card${acima?' monit-alert':''}">
      <div class="monit-card-top">
        <span class="monit-badge ${cat.cls}">${cat.lbl}</span>
        <b>${esc(r.alvo||'—')}</b>
        <span class="mut" style="font-size:12px">${esc(fmtData(r.data))}</span>
        ${ef.cls?`<span class="monit-efic ${ef.cls}">${ef.lbl}</span>`:''}
        <span class="spacer"></span>
        <button class="icon-btn del" title="Remover" data-act="monitDel" data-id="${esc(r.id)}">🗑</button>
      </div>
      <div class="monit-card-body">
        <span>Nível: <b>${esc(r.nivel||'—')}</b>${r.unidade?` ${esc(r.unidade)}`:''}</span>
        <span>Limiar: <b>${esc(r.limiar||'—')}</b></span>
        ${acima?'<span class="monit-flag">⚠️ acima do limiar</span>':''}
      </div>
      ${r.acao?`<div class="monit-acao"><b>Ação:</b> ${esc(r.acao)}</div>`:''}
      ${r.obs?`<div class="monit-obs mut">${esc(r.obs)}</div>`:''}
      <div class="monit-card-foot">${gps}</div>
    </div>`;
  }).join('')||'<div class="mut" style="padding:14px">Sem registros neste talhão ainda.</div>';
  return `<datalist id="monit-alvos">${MONIT_ALVOS.map(a=>`<option value="${esc(a)}">`).join('')}</datalist>
  <div class="camp-top"><div class="camp-sel" style="flex:1"><label>Talhão</label><select class="sel" id="monit-talhao">${tOpt}</select></div></div>
  <div class="camp-tinfo">📍 <b>${esc(t.id)}</b> ${esc(t.nome||'')} · ${esc(empDe(t)||'—')} · ${num(areaDe(t))} ha</div>
  <div class="panel"><div class="panel-head"><h2>Novo registro</h2><span class="sub">monitoramento de campo</span></div>
    <div class="app-grid" style="padding:14px 16px">
      <label>Data<input type="date" id="monit-data" value="${hoje}"></label>
      <label>Categoria<select class="sel" id="monit-cat">
        <option value="praga">Praga</option><option value="doenca">Doença</option>
        <option value="daninha">Daninha</option><option value="outro">Outro</option></select></label>
      <label>Alvo<input class="txt" id="monit-alvo" list="monit-alvos" placeholder="ex.: Lagarta-da-soja"></label>
      <label>Nível / incidência<input class="cell" inputmode="decimal" id="monit-nivel" placeholder="ex.: 4"></label>
      <label>Unidade<input class="txt" id="monit-unid" placeholder="ex.: lagartas/m · %"></label>
      <label>Limiar de ação<input class="cell" inputmode="decimal" id="monit-limiar" placeholder="ex.: 3"></label>
      <label>Ação / controle<input class="txt" id="monit-acao" placeholder="ex.: aplicar inseticida"></label>
      <label>Eficácia<select class="sel" id="monit-efic">
        <option value="">—</option><option value="pendente">Pendente</option><option value="eficaz">Eficaz</option>
        <option value="parcial">Parcial</option><option value="ineficaz">Ineficaz</option></select></label>
    </div>
    <div style="padding:0 16px 8px">
      <label style="font-size:12px;font-weight:700;color:var(--muted)">Observações</label>
      <textarea id="monit-obs" rows="2" placeholder="condições, local dentro do talhão, detalhes" style="width:100%"></textarea>
    </div>
    <div class="monit-gpsrow">
      <button class="btn btn-outline btn-sm" data-act="monitGPS">📍 Capturar GPS</button>
      <span id="monit-gps" class="mut" style="font-size:12px">GPS não capturado</span>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="monitSave" data-t="${esc(selId)}">Salvar registro</button>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Histórico</h2><span class="sub">${regs.length} registro(s)</span></div>
    <div class="monit-list">${cards}</div>
  </div>
  <p class="mut" style="font-size:11px;text-align:center;margin:10px 0 4px">Os registros ficam salvos <b>no aparelho</b>. Em breve: sincronizar com a planilha e ver no mapa.</p>`;
};

/* ================= CHUVA (registro pluviométrico) ================= */
const CHUVA_KEY='planejamento_chuva';
let CHUVA=null;
const _MESN=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const nfmm=n=>String(Math.round((+n||0)*10)/10).replace('.',',');
function loadChuva(){ try{ const d=JSON.parse(localStorage.getItem(CHUVA_KEY)); if(d&&Array.isArray(d.registros)) return d; }catch(e){} return {registros:[]}; }
function saveChuva(){ try{ localStorage.setItem(CHUVA_KEY, JSON.stringify(CHUVA)); }catch(e){} }
function chuvaSave(){
  const g=id=>{ const el=document.getElementById(id); return el?el.value.trim():''; };
  if(_numc(g('chuva-mm'))==null){ toast('Informe a chuva em mm'); return; }
  CHUVA.registros.push({ id:'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    data:g('chuva-data')||new Date().toISOString().slice(0,10), local:g('chuva-local'), mm:g('chuva-mm'), obs:g('chuva-obs'), ts:Date.now() });
  saveChuva(); route(); toast('Chuva registrada');
}
V.chuva=function(){
  const regs=CHUVA.registros.slice().sort((a,b)=>String(b.data||'').localeCompare(String(a.data||''))||(b.ts||0)-(a.ts||0));
  const hoje=new Date().toISOString().slice(0,10), mesAtual=hoje.slice(0,7);
  const somaMM=list=>list.reduce((s,r)=>s+(_numc(r.mm)||0),0);
  const totalMes=somaMM(regs.filter(r=>String(r.data||'').slice(0,7)===mesAtual)), totalGeral=somaMM(regs);
  const locais=[...new Set(talhoesAll().map(t=>`${t.id} · ${t.nome||''}`.trim()).concat(regs.map(r=>r.local).filter(Boolean)))];
  const groups={}; regs.forEach(r=>{ const k=String(r.data||'').slice(0,7)||'0000-00'; (groups[k]=groups[k]||[]).push(r); });
  const groupsHtml=Object.keys(groups).sort().reverse().map(k=>{
    const y=k.slice(0,4), m=+k.slice(5,7); const tit=(m>=1&&m<=12)?`${_MESN[m-1]}/${y}`:'sem data';
    const rows=groups[k].map(r=>`<div class="chuva-row">
      <span class="chuva-mm">${esc(r.mm||'—')}<small> mm</small></span>
      <span class="chuva-dt">${esc(fmtData(r.data))}</span>
      <span class="chuva-loc">${esc(r.local||'—')}</span>
      ${r.obs?`<span class="chuva-obs mut">${esc(r.obs)}</span>`:''}
      <span class="spacer"></span>
      <button class="icon-btn del" title="Remover" data-act="chuvaDel" data-id="${esc(r.id)}">🗑</button>
    </div>`).join('');
    return `<div class="chuva-group"><div class="chuva-ghead">${tit} <span class="mut">— ${nfmm(somaMM(groups[k]))} mm</span></div>${rows}</div>`;
  }).join('')||'<div class="mut" style="padding:14px">Nenhuma chuva registrada ainda.</div>';
  return `<datalist id="chuva-locais">${locais.map(l=>`<option value="${esc(l)}">`).join('')}</datalist>
  <div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi accent"><div class="k-label">Chuva no mês</div><div class="k-value">${nfmm(totalMes)} mm</div><div class="k-sub">${_MESN[+mesAtual.slice(5,7)-1]}/${mesAtual.slice(0,4)}</div></div>
    <div class="kpi"><div class="k-label">Acumulado registrado</div><div class="k-value">${nfmm(totalGeral)} mm</div><div class="k-sub">${regs.length} registro(s)</div></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Registrar chuva</h2><span class="sub">mm por local e data</span></div>
    <div class="app-grid" style="padding:14px 16px">
      <label>Data<input type="date" id="chuva-data" value="${hoje}"></label>
      <label>Chuva (mm)<input class="cell" inputmode="decimal" id="chuva-mm" placeholder="ex.: 24"></label>
      <label>Local<input class="txt" id="chuva-local" list="chuva-locais" placeholder="talhão, pivô, sede…"></label>
      <label>Observações<input class="txt" id="chuva-obs" placeholder="opcional"></label>
    </div>
    <div style="padding:0 16px 14px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary btn-sm" data-act="chuvaSave">Registrar chuva</button>
    </div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Histórico</h2><span class="sub">por mês</span></div>
    <div class="chuva-list">${groupsHtml}</div>
  </div>
  <p class="mut" style="font-size:11px;text-align:center;margin:10px 0 4px">Registros salvos <b>no aparelho</b>. Em breve: sincronizar com a planilha.</p>`;
};

/* ================= CONTAGEM DE STAND (população de plantas) ================= */
const STAND_KEY='planejamento_stand';
let STAND=null;
const nfpop=n=>Math.round(+n||0).toLocaleString('pt-BR');
function loadStand(){ try{ const d=JSON.parse(localStorage.getItem(STAND_KEY)); if(d&&Array.isArray(d.registros)) return d; }catch(e){} return {registros:[]}; }
function saveStand(){ try{ localStorage.setItem(STAND_KEY, JSON.stringify(STAND)); }catch(e){} }
function parsePontos(s){ return String(s||'').split(/[,;\s]+/).filter(Boolean); }
// população/ha = (média de plantas por ponto / comprimento avaliado) / espaçamento × 10000
function standCompute(esp,comp,pontos,meta){
  const nums=pontos.map(_numc).filter(n=>n!=null&&n>=0);
  esp=_numc(esp); comp=_numc(comp); meta=_numc(meta);
  if(!nums.length||!(esp>0)||!(comp>0)) return null;
  const media=nums.reduce((a,b)=>a+b,0)/nums.length, pop=(media/comp)/esp*10000;
  return {media, pop, n:nums.length, pctMeta:meta>0?pop/meta*100:null, falha:meta>0?Math.max(0,(1-pop/meta)*100):null};
}
function standPreview(){
  const g=id=>{const el=document.getElementById(id);return el?el.value:'';};
  const c=standCompute(g('stand-esp'),g('stand-comp'),parsePontos(g('stand-pontos')),g('stand-meta'));
  const el=document.getElementById('stand-prev'); if(!el) return;
  el.innerHTML=c?`População estimada: <b>${nfpop(c.pop)} plantas/ha</b>${c.pctMeta!=null?` · ${Math.round(c.pctMeta)}% da meta`:''}${c.falha!=null&&c.falha>0?` · <span style="color:var(--amber);font-weight:700">falha ${Math.round(c.falha)}%</span>`:''} <span class="mut">(média ${Math.round(c.media*10)/10} em ${c.n} ponto(s))</span>`:'';
}
function standSave(talhao){
  const g=id=>{const el=document.getElementById(id);return el?el.value.trim():'';};
  const pontos=parsePontos(g('stand-pontos'));
  const c=standCompute(g('stand-esp'),g('stand-comp'),pontos,g('stand-meta'));
  if(!c){ toast('Preencha espaçamento, comprimento e ao menos 1 ponto'); return; }
  STAND.registros.push({ id:'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), talhao,
    data:g('stand-data')||new Date().toISOString().slice(0,10), cultura:g('stand-cult'),
    esp:g('stand-esp'), comp:g('stand-comp'), meta:g('stand-meta'), pontos:pontos.join(', '),
    pop:Math.round(c.pop), pctMeta:c.pctMeta!=null?Math.round(c.pctMeta):null, falha:c.falha!=null?Math.round(c.falha):null,
    obs:g('stand-obs'), ts:Date.now() });
  saveStand(); route(); toast('Contagem salva');
}
V.stand=function(arg){
  const all=talhoesAll();
  if(!all.length) return `<div class="empty">Nenhum talhão para contar.</div>`;
  const selId=(arg&&all.some(t=>t.id===arg))?arg:all[0].id, t=all.find(x=>x.id===selId);
  const regs=STAND.registros.filter(r=>r.talhao===selId).sort((a,b)=>(b.ts||0)-(a.ts||0));
  const tOpt=all.map(x=>{ const n=STAND.registros.filter(r=>r.talhao===x.id).length;
    return `<option value="${esc(x.id)}"${x.id===selId?' selected':''}>${esc(x.id)} · ${esc(x.nome||'')}${n?` — ${n}`:''}</option>`; }).join('');
  const hoje=new Date().toISOString().slice(0,10);
  const cards=regs.map(r=>`<div class="monit-card${r.falha!=null&&r.falha>=10?' monit-alert':''}">
    <div class="monit-card-top"><b>${nfpop(r.pop)} plantas/ha</b>
      ${r.pctMeta!=null?`<span class="monit-efic ${r.falha>=10?'ef-bad':(r.falha>0?'ef-parc':'ef-ok')}">${r.pctMeta}% da meta</span>`:''}
      <span class="mut" style="font-size:12px">${esc(fmtData(r.data))}${r.cultura?` · ${esc(r.cultura)}`:''}</span>
      <span class="spacer"></span><button class="icon-btn del" data-act="standDel" data-id="${esc(r.id)}">🗑</button></div>
    <div class="monit-card-body"><span>Espaç.: <b>${esc(r.esp)}</b> m</span><span>Compr.: <b>${esc(r.comp)}</b> m</span><span>Meta: <b>${r.meta?nfpop(r.meta):'—'}</b>/ha</span>${r.falha!=null&&r.falha>0?`<span class="monit-flag">⚠️ falha ${r.falha}%</span>`:''}</div>
    <div class="monit-obs mut">Pontos: ${esc(r.pontos)}${r.obs?` · ${esc(r.obs)}`:''}</div></div>`).join('')||'<div class="mut" style="padding:14px">Sem contagens neste talhão ainda.</div>';
  return `<div class="camp-top"><div class="camp-sel" style="flex:1"><label>Talhão</label><select class="sel" id="stand-talhao">${tOpt}</select></div></div>
  <div class="camp-tinfo">📍 <b>${esc(t.id)}</b> ${esc(t.nome||'')} · ${esc(empDe(t)||'—')} · ${num(areaDe(t))} ha</div>
  <div class="panel"><div class="panel-head"><h2>Nova contagem</h2><span class="sub">população de plantas</span></div>
    <div class="app-grid" style="padding:14px 16px">
      <label>Data<input type="date" id="stand-data" value="${hoje}"></label>
      <label>Cultura/variedade<input class="txt" id="stand-cult" placeholder="opcional"></label>
      <label>Espaçamento (m)<input class="cell stand-f" inputmode="decimal" id="stand-esp" placeholder="ex.: 0,5"></label>
      <label>Comprimento avaliado (m)<input class="cell stand-f" inputmode="decimal" id="stand-comp" value="5" placeholder="ex.: 5"></label>
      <label>Meta (plantas/ha)<input class="cell stand-f" inputmode="numeric" id="stand-meta" placeholder="ex.: 300000"></label>
      <label>Plantas por ponto<input class="txt stand-f" id="stand-pontos" placeholder="ex.: 18, 20, 17, 19"></label>
    </div>
    <div style="padding:0 16px 8px"><label style="font-size:12px;font-weight:700;color:var(--muted)">Observações</label>
      <input class="txt" id="stand-obs" placeholder="opcional" style="width:100%"></div>
    <div style="padding:0 16px 6px;font-size:13px" id="stand-prev"></div>
    <div style="padding:0 16px 14px;display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" data-act="standSave" data-t="${esc(selId)}">Salvar contagem</button></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Histórico</h2><span class="sub">${regs.length} contagem(ns)</span></div>
    <div class="monit-list">${cards}</div></div>
  <p class="mut" style="font-size:11px;text-align:center;margin:10px 0 4px">População = (média de plantas ÷ comprimento ÷ espaçamento) × 10.000. Salvo <b>no aparelho</b>.</p>`;
};

/* ================= RECOMENDAÇÃO DE APLICAÇÃO (receituário) ================= */
const RECOM_KEY='planejamento_recomendacao';
let RECOM=null;
function loadRecom(){ try{ const d=JSON.parse(localStorage.getItem(RECOM_KEY)); if(d&&Array.isArray(d.registros)) return d; }catch(e){} return {registros:[]}; }
function saveRecom(){ try{ localStorage.setItem(RECOM_KEY, JSON.stringify(RECOM)); }catch(e){} }
function recomSave(talhao){
  const g=id=>{const el=document.getElementById(id);return el?el.value.trim():'';};
  if(!g('recom-produtos')){ toast('Informe ao menos um produto'); return; }
  RECOM.registros.push({ id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), talhao,
    data:g('recom-data')||new Date().toISOString().slice(0,10), janela:g('recom-janela'), alvo:g('recom-alvo'),
    produtos:g('recom-produtos'), calda:g('recom-calda'), adjuvante:g('recom-adj'), cond:g('recom-cond'),
    resp:g('recom-resp'), obs:g('recom-obs'), ts:Date.now() });
  saveRecom(); route(); toast('Recomendação salva');
}
function recomWhats(id){
  const r=RECOM.registros.find(x=>x.id===id); if(!r) return;
  const t=findTalhao(r.talhao);
  let x=`*Recomendação de aplicação*\nTalhão: ${r.talhao}${t&&t.nome?` · ${t.nome}`:''}\n`;
  if(r.data) x+=`Data: ${fmtData(r.data)}${r.janela?` · janela: ${r.janela}`:''}\n`;
  if(r.alvo) x+=`Alvo: ${r.alvo}\n`;
  x+=`\nProdutos:\n`+(r.produtos||'').split('\n').filter(Boolean).map(l=>`• ${l.trim()}`).join('\n')+'\n';
  if(r.calda) x+=`\nVolume de calda: ${r.calda} L/ha\n`;
  if(r.adjuvante) x+=`Adjuvante: ${r.adjuvante}\n`;
  if(r.cond) x+=`Condições: ${r.cond}\n`;
  if(r.resp) x+=`Responsável: ${r.resp}\n`;
  if(r.obs) x+=`Obs: ${r.obs}\n`;
  window.open('https://wa.me/?text='+encodeURIComponent(x),'_blank');
}
V.recomendacao=function(arg){
  const all=talhoesAll();
  if(!all.length) return `<div class="empty">Nenhum talhão.</div>`;
  const selId=(arg&&all.some(t=>t.id===arg))?arg:all[0].id, t=all.find(x=>x.id===selId);
  const regs=RECOM.registros.filter(r=>r.talhao===selId).sort((a,b)=>(b.ts||0)-(a.ts||0));
  const tOpt=all.map(x=>{ const n=RECOM.registros.filter(r=>r.talhao===x.id).length;
    return `<option value="${esc(x.id)}"${x.id===selId?' selected':''}>${esc(x.id)} · ${esc(x.nome||'')}${n?` — ${n}`:''}</option>`; }).join('');
  const hoje=new Date().toISOString().slice(0,10);
  const cards=regs.map(r=>`<div class="monit-card">
    <div class="monit-card-top">${r.alvo?`<span class="monit-badge mc-outro">${esc(r.alvo)}</span>`:''}
      <span class="mut" style="font-size:12px">${esc(fmtData(r.data))}${r.janela?` · ${esc(r.janela)}`:''}</span>
      <span class="spacer"></span>
      <button class="btn btn-wa btn-sm" data-act="recomWa" data-id="${esc(r.id)}">📲 WhatsApp</button>
      <button class="icon-btn del" data-act="recomDel" data-id="${esc(r.id)}">🗑</button></div>
    <div class="recom-prod">${esc(r.produtos||'').split('\n').filter(Boolean).map(l=>`• ${esc(l.trim())}`).join('<br>')}</div>
    <div class="monit-card-body">${r.calda?`<span>Calda: <b>${esc(r.calda)}</b> L/ha</span>`:''}${r.adjuvante?`<span>Adjuvante: ${esc(r.adjuvante)}</span>`:''}${r.cond?`<span>Condições: ${esc(r.cond)}</span>`:''}</div>
    ${r.obs?`<div class="monit-obs mut">${esc(r.obs)}${r.resp?` · resp.: ${esc(r.resp)}`:''}</div>`:(r.resp?`<div class="monit-obs mut">resp.: ${esc(r.resp)}</div>`:'')}</div>`).join('')||'<div class="mut" style="padding:14px">Sem recomendações neste talhão ainda.</div>';
  return `<datalist id="monit-alvos">${MONIT_ALVOS.map(a=>`<option value="${esc(a)}">`).join('')}</datalist>
  <div class="camp-top"><div class="camp-sel" style="flex:1"><label>Talhão</label><select class="sel" id="recom-talhao">${tOpt}</select></div></div>
  <div class="camp-tinfo">📍 <b>${esc(t.id)}</b> ${esc(t.nome||'')} · ${esc(empDe(t)||'—')} · ${num(areaDe(t))} ha</div>
  <div class="panel"><div class="panel-head"><h2>Nova recomendação</h2><span class="sub">produto · dose · janela · calda · condições</span></div>
    <div class="app-grid" style="padding:14px 16px">
      <label>Data<input type="date" id="recom-data" value="${hoje}"></label>
      <label>Janela / período<input class="txt" id="recom-janela" placeholder="ex.: aplicar em até 3 dias"></label>
      <label>Alvo<input class="txt" id="recom-alvo" list="monit-alvos" placeholder="ex.: Ferrugem-asiática"></label>
      <label>Volume de calda (L/ha)<input class="cell" inputmode="decimal" id="recom-calda" placeholder="ex.: 120"></label>
      <label>Adjuvante<input class="txt" id="recom-adj" placeholder="ex.: óleo mineral 0,5%"></label>
      <label>Condições<input class="txt" id="recom-cond" placeholder="ex.: vento <10 km/h, UR >55%"></label>
      <label>Responsável<input class="txt" id="recom-resp" placeholder="agrônomo"></label>
    </div>
    <div style="padding:0 16px 8px"><label style="font-size:12px;font-weight:700;color:var(--muted)">Produtos e doses (um por linha — ex.: FOX XPRO — 0,5 L/ha)</label>
      <textarea id="recom-produtos" rows="3" placeholder="FOX XPRO — 0,5 L/ha&#10;ÓLEO — 0,5 L/ha" style="width:100%"></textarea></div>
    <div style="padding:0 16px 8px"><label style="font-size:12px;font-weight:700;color:var(--muted)">Observações</label>
      <input class="txt" id="recom-obs" placeholder="opcional" style="width:100%"></div>
    <div style="padding:0 16px 14px;display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" data-act="recomSave" data-t="${esc(selId)}">Salvar recomendação</button></div>
  </div>
  <div class="panel"><div class="panel-head"><h2>Histórico</h2><span class="sub">${regs.length} recomendação(ões)</span></div>
    <div class="monit-list">${cards}</div></div>
  <p class="mut" style="font-size:11px;text-align:center;margin:10px 0 4px">Salvo <b>no aparelho</b>. Envie a recomendação pronta por WhatsApp para a equipe.</p>`;
};

/* ================= MAPA (pontos de monitoramento em satélite) ================= */
let _leafletLoading=null, _map=null;
function loadLeaflet(){
  if(window.L) return Promise.resolve(window.L);
  if(_leafletLoading) return _leafletLoading;
  _leafletLoading=new Promise((res,rej)=>{
    const css=document.createElement('link'); css.rel='stylesheet'; css.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload=()=>res(window.L); s.onerror=()=>{ _leafletLoading=null; rej(new Error('sem internet')); };
    document.head.appendChild(s);
  });
  return _leafletLoading;
}
const MONIT_CATCOLOR={praga:'#b7791f',doenca:'#b00020',daninha:'#2e7d32',outro:'#64757d'};
async function mapaInit(){
  const el=document.getElementById('mapa-canvas'); if(!el) return;
  let L; try{ L=await loadLeaflet(); }catch(e){
    el.innerHTML='<div class="mut" style="padding:26px;text-align:center">🌐 O mapa precisa de internet para carregar. Sem conexão, use os links 📍 de cada registro na tela de Monitoramento.</div>'; return; }
  const pts=MONIT.registros.filter(r=>r.lat!=null&&r.lng!=null);
  if(_map){ try{ _map.remove(); }catch(e){} _map=null; }
  _map=L.map(el).setView(pts.length?[pts[0].lat,pts[0].lng]:[-15.78,-47.93], pts.length?14:4);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {maxZoom:19, attribution:'Esri World Imagery'}).addTo(_map);
  const bounds=[];
  pts.forEach(r=>{
    const c=MONIT_CATCOLOR[r.categoria]||'#64757d';
    L.circleMarker([r.lat,r.lng],{radius:8,color:'#fff',weight:2,fillColor:c,fillOpacity:.9}).addTo(_map)
      .bindPopup(`<b>${esc(r.alvo||'—')}</b><br>${esc((MONIT_CAT[r.categoria]||{}).lbl||'')} · ${esc(fmtData(r.data))}<br>Nível ${esc(r.nivel||'—')} · limiar ${esc(r.limiar||'—')}`);
    bounds.push([r.lat,r.lng]);
  });
  if(bounds.length>1){ try{ _map.fitBounds(bounds,{padding:[30,30]}); }catch(e){} }
  setTimeout(()=>{ try{ _map.invalidateSize(); }catch(e){} }, 120);
}
function mapaLocate(){
  if(!_map||!navigator.geolocation){ toast('Mapa/GPS indisponível'); return; }
  navigator.geolocation.getCurrentPosition(p=>{
    const ll=[p.coords.latitude,p.coords.longitude];
    window.L.circleMarker(ll,{radius:7,color:'#fff',weight:2,fillColor:'#1e88e5',fillOpacity:1}).addTo(_map).bindPopup('Você').openPopup();
    _map.setView(ll,15);
  }, ()=>toast('Não foi possível obter o GPS'), {enableHighAccuracy:true,timeout:12000});
}
V.mapa=function(){
  const n=MONIT.registros.filter(r=>r.lat!=null&&r.lng!=null).length;
  return `<div class="panel"><div class="panel-head"><h2>Mapa</h2><span class="sub">${n} ponto(s) de monitoramento com GPS</span>
      <div class="spacer"></div><button class="btn btn-outline btn-sm" data-act="mapaLoc">📍 Minha localização</button></div>
    <div id="mapa-canvas" class="mapa-canvas"></div>
    <div class="mapa-leg">
      <span><i style="background:#b7791f"></i>Praga</span><span><i style="background:#b00020"></i>Doença</span>
      <span><i style="background:#2e7d32"></i>Daninha</span><span><i style="background:#64757d"></i>Outro</span>
    </div>
    <p class="mut" style="font-size:12px;padding:10px 16px">Mostra os pontos do <b>Monitoramento</b> com GPS, sobre imagem de satélite (precisa de internet). <br><b>Em breve:</b> desenhar o <b>contorno dos talhões</b> colorido por cultura — pra isso eu preciso do arquivo de contorno (KML/KMZ/GeoJSON), que dá pra exportar do Aqila ou do SICAR/CAR.</p>
  </div>`;
};

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
const TITLES={inicio:'Início',dashboard:'Painel',talhoes:'Talhões',talhao:'Talhão',campo:'Operação de Campo',monitoramento:'Monitoramento',mapa:'Mapa',chuva:'Chuva (pluviômetro)',stand:'Contagem de Stand',recomendacao:'Recomendação de Aplicação',compras:'Demanda de Insumos',cotacao:'Cotação por Fornecedor',precos:'Preços — composição por safra',maquinas:'Máquinas',dre:'DRE Orçada',empreendimentos:'Empreendimentos',sync:'Sincronizar'};
function route(opts){
  // por padrão MANTÉM a posição da tela (edições não pulam pro topo);
  // só rola pro topo em navegação de verdade (toTop:true — troca de página)
  const toTop = opts && opts.toTop===true;
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
  if(toTop){ $('.main').scrollTop=0; window.scrollTo(0,0); }
  // ao ENTRAR no módulo Preços: puxa a última versão da planilha (fonte da verdade)
  if(view==='precos' && _lastView!=='precos' && syncUrl() && autoOn()){ precosPull({auto:true}); }
  if(view==='mapa'){ setTimeout(mapaInit, 40); }   // inicializa o Leaflet após o HTML entrar no DOM
  _lastView=view;
}
let _lastView=null;
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
  if(e.target.id==='monit-talhao'){ _monitGPS=null; location.hash='#/monitoramento/'+encodeURIComponent(e.target.value); return; }
  if(e.target.id==='stand-talhao'){ location.hash='#/stand/'+encodeURIComponent(e.target.value); return; }
  if(e.target.id==='recom-talhao'){ location.hash='#/recomendacao/'+encodeURIComponent(e.target.value); return; }
  if(e.target.id==='pr-safra'){ PRECOS.atual=e.target.value; savePrecos(); route(); return; }
  if(e.target.id==='pr-pdf-file'){ const f=e.target.files&&e.target.files[0]; e.target.value=''; if(f) prHandlePdf(f); return; }
  if(e.target.id==='pr-xlsx-file'){ const f=e.target.files&&e.target.files[0]; e.target.value=''; if(f) prHandleExcel(f); return; }
  if(e.target.matches('input[data-pr]')){ applyPrecoEdit(e.target); return; }
  if(e.target.matches('input[data-edit], select[data-edit], textarea[data-edit]')) applyEdit(e.target);
});
document.addEventListener('keydown',e=>{ if(e.target.matches('input[data-edit]')&&e.key==='Enter') e.target.blur(); });
document.addEventListener('input',e=>{ if(e.target.classList&&e.target.classList.contains('stand-f')) standPreview(); });
document.addEventListener('click',e=>{
  const cf=e.target.closest('#emp-cfilter .chip-f');
  if(cf){ cf.parentElement.querySelectorAll('.chip-f').forEach(bb=>bb.classList.remove('on')); cf.classList.add('on'); applyEmpFilter(); return; }
  const ef=e.target.closest('#cot-empf .chip-f, #compras-empf .chip-f');
  if(ef){ const v=ef.dataset.empf, setSel=ef.closest('#compras-empf')?comprasEmpSel:cotaEmpSel;
    if(v===''){ setSel.clear(); } else if(setSel.has(v)){ setSel.delete(v); } else { setSel.add(v); }
    route(); return; }
  const tf=e.target.closest('#compras-talf .chip-f');
  if(tf){ const v=tf.dataset.talf;
    if(v===''){ comprasTalSel.clear(); } else if(comprasTalSel.has(v)){ comprasTalSel.delete(v); } else { comprasTalSel.add(v); }
    route(); return; }
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
    else if(a.act==='prAddRef'){ safraAtual().refs.push({classe:'',produto:'',vista:0,prazo:0}); savePrecos(); route(); }
    else if(a.act==='prDelRef'){ safraAtual().refs.splice(+a.i,1); savePrecos(); route(); }
    else if(a.act==='prAddItem'){ safraAtual().itens.push({empresa:'',classe:'',produto:'',pct:0}); savePrecos(); route(); }
    else if(a.act==='prDelItem'){ safraAtual().itens.splice(+a.i,1); savePrecos(); route(); }
    else if(a.act==='prNovaSafra'){ const nome=(prompt('Nome da nova safra (ex.: 2027/2028):')||'').trim();
      if(nome){ if(!PRECOS.safras[nome]) PRECOS.safras[nome]={refs:[],itens:[]}; PRECOS.atual=nome; savePrecos(); route(); toast('Safra '+nome+' criada'); } }
    else if(a.act==='prDupSafra'){ const nome=(prompt('Duplicar a safra '+PRECOS.atual+' para (nome):')||'').trim();
      if(nome){ PRECOS.safras[nome]=JSON.parse(JSON.stringify(safraAtual())); PRECOS.atual=nome; savePrecos(); route(); toast('Duplicado em '+nome); } }
    else if(a.act==='prSyncPull'){ precosPull({}); }
    else if(a.act==='prSyncPush'){ precosPush({}); }
    else if(a.act==='monitGPS'){ monitCaptureGPS(); }
    else if(a.act==='monitSave'){ monitSave(a.t); }
    else if(a.act==='monitDel'){ if(ask('Remover este registro de monitoramento?')){ MONIT.registros=MONIT.registros.filter(r=>r.id!==a.id); saveMonit(); route(); toast('Registro removido'); } }
    else if(a.act==='mapaLoc'){ mapaLocate(); }
    else if(a.act==='chuvaSave'){ chuvaSave(); }
    else if(a.act==='chuvaDel'){ if(ask('Remover este registro de chuva?')){ CHUVA.registros=CHUVA.registros.filter(r=>r.id!==a.id); saveChuva(); route(); toast('Registro removido'); } }
    else if(a.act==='standSave'){ standSave(a.t); }
    else if(a.act==='standDel'){ if(ask('Remover esta contagem?')){ STAND.registros=STAND.registros.filter(r=>r.id!==a.id); saveStand(); route(); toast('Removido'); } }
    else if(a.act==='recomSave'){ recomSave(a.t); }
    else if(a.act==='recomWa'){ recomWhats(a.id); }
    else if(a.act==='recomDel'){ if(ask('Remover esta recomendação?')){ RECOM.registros=RECOM.registros.filter(r=>r.id!==a.id); saveRecom(); route(); toast('Removido'); } }
    else if(a.act==='prPublicar'){ publicarPlanejamento(); }
    else if(a.act==='prAlimVista'){ _alimPrev=alimentarPreview('vista'); prAlimModal(_alimPrev); }
    else if(a.act==='prAlimPrazo'){ _alimPrev=alimentarPreview('prazo'); prAlimModal(_alimPrev); }
    else if(a.act==='prAlimClose'){ const ov=document.getElementById('pr-alim-ov'); if(ov) ov.remove(); }
    else if(a.act==='prAlimGo'){ prAlimRun('upd'); }
    else if(a.act==='prAlimNovos'){ prAlimRun('novos'); }
    else if(a.act==='prImportPdf'){ const fi=$('#pr-pdf-file'); if(fi) fi.click(); }
    else if(a.act==='prImportXlsx'){ const fi=$('#pr-xlsx-file'); if(fi) fi.click(); }
    else if(a.act==='prPctToPreco'){
      if(!ask('Usar o número da coluna % como PREÇO do produto?\n\nUse isto se você digitou o preço no campo de %. O valor vai para a coluna "Preço à vista" (e "a prazo").')) return;
      let n=0; safraAtual().itens.forEach(it=>{
        if((it.precoVista==null||it.precoVista==='') && it.pct!=null){ it.precoVista=+(+it.pct*100).toFixed(2); it.pct=null; n++; }
        if((it.precoPrazo==null||it.precoPrazo==='') && it.pctPrazo!=null){ it.precoPrazo=+(+it.pctPrazo*100).toFixed(2); it.pctPrazo=null; }
      });
      savePrecos(); route(); toast(n+' preços convertidos'); }
    else if(a.act==='prImpClose'){ const ov=document.getElementById('pr-import-ov'); if(ov) ov.remove(); }
    else if(a.act==='prImpDo'){ prDoImport(); }
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
  let val=0, buy=0, dem=0, n=0; const uns=new Set();
  document.querySelectorAll('#compras-groups .op-block').forEach(g=>{
    let any=false;
    g.querySelectorAll('tbody tr').forEach(tr=>{
      const show=!q||(tr.dataset.search||'').includes(q);
      tr.style.display=show?'':'none';
      if(show){ any=true;
        if(tr.dataset.val!=null){ val+=+tr.dataset.val||0; buy+=+tr.dataset.buy||0; dem+=+tr.dataset.dem||0; uns.add(tr.dataset.un||''); n++; } }
    });
    g.style.display=any?'':'none';
    g.classList.toggle('force-open', !!q);  // durante a busca, mostra o conteúdo mesmo se recolhido
  });
  // atualiza o destaque com o insumo/itens filtrados (valor sempre; volume só se a unidade for única)
  const dv=document.querySelector('.dem-bar .dem-val'); if(dv) dv.textContent=brl0(val);
  const db=document.querySelector('.dem-bar .dem-buy b'); if(db) db.textContent=brl0(buy);
  const volw=document.querySelector('.dem-volwrap'), vol=document.querySelector('.dem-vol');
  if(volw&&vol){
    if(q && uns.size===1){ vol.innerHTML=`${num(dem)} <small>${esc([...uns][0]||'')}</small>`; volw.hidden=false; }
    else if(q && n>0){ vol.innerHTML=`${n} <small>itens</small>`; volw.hidden=false; }
    else volw.hidden=true;
  }
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
  const rows=calcCompras(cotaEmpSel.size?cotaEmpSel:null).filter(r=>r.comprar>0)
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
  const rows=calcCompras(cotaEmpSel.size?cotaEmpSel:null).filter(r=>r.comprar>0);
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
let lastPushSig='', lastRawSig='', lastInputTs=0, lastPushOk=true, pendingRerender=false, lastServerHash='';
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
  saveDataCache(d);   // guarda p/ abrir com o dado mais recente na próxima vez
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
// checagem leve: pergunta só o "hash" dos dados (resposta minúscula, servidor usa cache)
async function getServerHash(url){
  try{
    const bust=(url.indexOf('?')<0?'?':'&')+'h=1&t='+Date.now();
    const r=await syncFetch(url+bust,{method:'GET',cache:'no-store',redirect:'follow'},30000);
    const j=await r.json(); return (j&&j.hash)||null;
  }catch(e){ return null; }
}
async function syncPull(opts){
  opts=opts||{}; const url=syncUrl(); if(!url){ if(!opts.auto) toast('Configure a URL primeiro'); return; }
  if(syncBusy) return; syncBusy=true; setSyncStatus('busy');
  // automático: se nada mudou na planilha (mesmo hash), nem baixa o pacote grande
  if(opts.auto && !opts.force && lastServerHash){
    const h=await getServerHash(url);
    if(h && h===lastServerHash){ syncBusy=false; setSyncStatus('ok'); markSynced(); return; }
  }
  if(!opts.auto) syncLog('⏳ Puxando da planilha…');
  try{
    const d=await syncGet(url,opts);
    if(!d||!d.produtos) throw new Error('resposta inesperada da planilha');
    getServerHash(url).then(h=>{ if(h) lastServerHash=h; });   // registra o hash atual p/ as próximas checagens
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
/* ---- Sincronização do módulo PREÇOS (troca a aba "PREÇOS APP" inteira) ----
   Modelo simples e seguro: PUXAR substitui os preços locais pela planilha (fonte
   da verdade), ENVIAR grava o conjunto local na planilha. Auto: puxa ao abrir o
   módulo e envia (debounce) após editar, quando a sincronização automática está ligada. */
let precosPushTimer=null, lastPrecosPushSig='';
function precosApplyPulled(pa){
  if(!pa||!pa.safras) return false;
  const keys=Object.keys(pa.safras);
  const hasContent=keys.some(k=>{ const s=pa.safras[k]||{}; return (s.refs&&s.refs.length)||(s.itens&&s.itens.length); });
  if(!hasContent) return false;            // planilha ainda sem preços: não apaga o que é local
  Object.keys(pa.safras).forEach(k=>{ const s=pa.safras[k]; s.refs=s.refs||[]; s.itens=s.itens||[]; });
  const sig=JSON.stringify({atual:PRECOS.atual,safras:pa.safras});
  if(sig===JSON.stringify({atual:PRECOS.atual,safras:PRECOS.safras})) { lastPrecosPushSig=JSON.stringify(PRECOS); return false; }
  PRECOS.safras=pa.safras;
  if(!PRECOS.atual||!PRECOS.safras[PRECOS.atual]) PRECOS.atual=keys.sort()[0];
  savePrecos(); lastPrecosPushSig=JSON.stringify(PRECOS);   // evita reenviar o que acabou de chegar
  return true;
}
async function precosPull(opts){
  opts=opts||{}; const url=syncUrl(); if(!url){ if(!opts.auto) toast('Configure a URL de sincronização (tela Sincronizar do Planejamento)'); return; }
  if(syncBusy){ if(!opts.auto) toast('Sincronização ocupada — tente de novo'); return; }
  syncBusy=true; setSyncStatus('busy');
  try{
    const d=await syncGet(url,{auto:opts.auto});
    const changed=precosApplyPulled(d&&d.precos_app);
    syncBusy=false; setSyncStatus('ok'); markSynced();
    if(changed){ if(!opts.auto) toast('Preços atualizados da planilha'); route({keepScroll:true}); }
    else if(!opts.auto){ toast('Sem mudanças na planilha'); }
  }catch(e){ syncBusy=false; setSyncStatus('err'); if(!opts.auto){ toast('Falha ao puxar preços'); addHist('pull',false,'Preços: '+(e&&e.message||'')); } }
}
async function precosPush(opts){
  opts=opts||{}; const url=syncUrl(); if(!url){ if(!opts.auto) toast('Configure a URL de sincronização (tela Sincronizar do Planejamento)'); return; }
  if(syncBusy){ if(opts.auto) schedulePrecosPush(); else toast('Sincronização ocupada — tente de novo'); return; }
  const sig=JSON.stringify(PRECOS);
  if(opts.auto && sig===lastPrecosPushSig) return;
  syncBusy=true; setSyncStatus('busy'); if(!opts.auto) toast('Enviando preços…');
  try{
    const r=await syncPost(url, JSON.stringify({__precos:PRECOS}));
    lastPrecosPushSig=sig; syncBusy=false; setSyncStatus('ok'); markSynced();
    addHist('push', !(r&&r.fail), 'Preços: '+((r&&r.ok)||0)+' linhas');
    if(!opts.auto) toast('Preços enviados à planilha ('+((r&&r.ok)||0)+' linhas)');
  }catch(e){ syncBusy=false; setSyncStatus('err'); if(!opts.auto){ toast('Falha ao enviar preços'); addHist('push',false,'Preços: '+(e&&e.message||'')); } }
}
function schedulePrecosPush(){
  if(!syncUrl()||!autoOn()) return;
  clearTimeout(precosPushTimer);
  precosPushTimer=setTimeout(()=>{ if(JSON.stringify(PRECOS)===lastPrecosPushSig) return;
    if(!syncBusy) precosPush({auto:true}); else schedulePrecosPush(); }, PUSH_DEBOUNCE);
}
/* ---- Alimentar planejamento: leva os preços compostos da safra p/ o PORTIFÓLIO ---- */
async function sendEdits(edits){
  const url=syncUrl(); if(!url) throw new Error('sem URL');
  const CHUNK=40; let ok=0, fail=0, msgs=[];
  for(let i=0;i<edits.length;i+=CHUNK){
    const pr=await syncPost(url, JSON.stringify(edits.slice(i,i+CHUNK)));
    ok+=(pr.ok||0); fail+=(pr.fail||0); if(pr.msgs&&pr.msgs.length) msgs=msgs.concat(pr.msgs);
  }
  return {ok,fail,msgs};
}
const normKey=s=>String(s||'').toUpperCase().replace(/\s+/g,' ').trim();
let _alimPrev=null;
function alimentarPreview(tipo){
  const s=safraAtual(), comp={};                 // normKey -> {price, it}
  s.itens.forEach(it=>{ if(!it.produto) return; comp[normKey(it.produto)]={price:precoFinal(it,tipo), it}; });
  const planNorm={};                             // normKey -> nome exato no planejamento
  (DATA.produtos||[]).forEach(pp=>{ if(pp.produto) planNorm[normKey(pp.produto)]=pp.produto; });
  const upd=[], semRef=[], orf=[], novos=[];
  Object.keys(planNorm).forEach(k=>{ const c=comp[k], nome=planNorm[k];
    if(c){ if(c.price>0) upd.push({produto:nome, price:c.price}); else semRef.push(nome); }
    else orf.push(nome); });
  s.itens.forEach(it=>{ if(it.produto && !(normKey(it.produto) in planNorm)) novos.push(it); });
  return {tipo, upd, semRef, orf, novos};
}
function prAlimModal(pv){
  const old=document.getElementById('pr-alim-ov'); if(old) old.remove();
  const nomeTipo=pv.tipo==='prazo'?'a prazo':'à vista';
  const li=arr=>arr.map(x=>`<span class="chip-f" style="cursor:default">${esc(typeof x==='string'?x:x.produto)}</span>`).join(' ');
  const ov=document.createElement('div'); ov.id='pr-alim-ov'; ov.className='modal-ov';
  ov.innerHTML=`<div class="modal-box">
    <div class="modal-head"><h3>Alimentar planejamento — ${esc(PRECOS.atual)} · preço ${nomeTipo}</h3><button class="icon-btn" data-act="prAlimClose" title="Fechar">✕</button></div>
    <div style="overflow:auto;max-height:58vh">
      <p style="font-size:13px;margin:0 0 6px"><b>✅ ${pv.upd.length}</b> produto(s) do planejamento terão o preço ${nomeTipo} atualizado.</p>
      ${pv.semRef.length?`<p class="mut" style="font-size:12px;margin:6px 0">⚠️ ${pv.semRef.length} casaram, mas sem preço (falta a referência da classe): ${li(pv.semRef)}</p>`:''}
      ${pv.orf.length?`<div style="margin:10px 0"><div style="font-size:12px;font-weight:700;color:var(--amber)">⚠️ ${pv.orf.length} no planejamento SEM preço nesta safra — podem ter saído de linha (troque ou remova):</div><div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:5px">${li(pv.orf)}</div></div>`:''}
      ${pv.novos.length?`<div style="margin:10px 0"><div style="font-size:12px;font-weight:700;color:var(--ink2)">➕ ${pv.novos.length} novos disponíveis nesta safra (ainda fora do planejamento):</div><div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:5px">${li(pv.novos)}</div></div>`:''}
    </div>
    <div class="modal-foot">
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-act="prAlimClose">Cancelar</button>
      ${pv.novos.length?`<button class="btn btn-outline btn-sm" data-act="prAlimNovos">+ Adicionar ${pv.novos.length} novos</button>`:''}
      <button class="btn btn-primary btn-sm" data-act="prAlimGo"${pv.upd.length?'':' disabled'}>Atualizar ${pv.upd.length} preços</button>
    </div></div>`;
  document.body.appendChild(ov);
}
// Publica a lista plana "produto -> preço" da safra atual no Banco (aba PREÇOS).
// O PORTIFÓLIO do planejamento busca por fórmula (IMPORTRANGE), sem sobrescrever nada.
async function publicarPlanejamento(){
  const url=syncUrl(); if(!url){ toast('Configure a URL de sincronização primeiro'); return; }
  if(syncBusy){ toast('Sincronização ocupada — tente de novo'); return; }
  const s=safraAtual();
  const flat=s.itens.map(it=>({p:it.produto, v:+precoFinal(it,"vista").toFixed(2), z:+precoFinal(it,"prazo").toFixed(2)}))
                    .filter(x=>x.p && (x.v>0||x.z>0));
  if(!flat.length){ toast('Nenhum preço composto para publicar — defina as referências das classes'); return; }
  syncBusy=true; setSyncStatus('busy'); toast('Publicando preços da safra '+PRECOS.atual+'…');
  try{
    const r=await syncPost(url, JSON.stringify({__flatPrecos:flat, safra:PRECOS.atual}));
    syncBusy=false; setSyncStatus('ok'); markSynced();
    addHist('push', !(r&&r.fail), 'Publicar preços: '+((r&&r.ok)||0)+' produtos');
    toast('Publicado: '+((r&&r.ok)||0)+' preços (safra '+PRECOS.atual+'). O planejamento busca pela fórmula.');
  }catch(e){ syncBusy=false; setSyncStatus('err'); toast('Falha ao publicar os preços'); }
}
async function prAlimRun(kind){
  const pv=_alimPrev; if(!pv) return;
  if(!syncUrl()){ toast('Configure a URL de sincronização primeiro'); return; }
  if(syncBusy){ toast('Sincronização ocupada — tente de novo'); return; }
  let edits;
  if(kind==='novos') edits=pv.novos.map(it=>{ const p=precoFinal(it,pv.tipo); return {type:'addprod',empresa:it.empresa,classe:it.classe,produto:it.produto,value:p>0?+p.toFixed(2):''}; });
  else edits=pv.upd.map(u=>({type:'preco',produto:u.produto,value:+u.price.toFixed(2)}));
  if(!edits.length){ toast('Nada para enviar'); return; }
  syncBusy=true; setSyncStatus('busy'); toast('Enviando ao planejamento…');
  try{
    const r=await sendEdits(edits);
    syncBusy=false; setSyncStatus('ok'); markSynced();
    addHist('push', !r.fail, 'Alimentar: '+r.ok+' ok, '+r.fail+' falhas');
    toast((kind==='novos'?'Produtos adicionados: ':'Preços atualizados: ')+r.ok+(r.fail?(' · '+r.fail+' falhas'):''));
    const ov=document.getElementById('pr-alim-ov'); if(ov) ov.remove();
    await syncPull({auto:true, force:true, silentToast:true});   // traz o planejamento já atualizado
  }catch(e){ syncBusy=false; setSyncStatus('err'); toast('Falha ao alimentar o planejamento'); }
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
function boot(d){
  DATA=d; PROD={}; d.produtos.forEach(p=>PROD[p.produto]=p);
  loadOverrides(); PRECOS=loadPrecos(); MONIT=loadMonit(); CHUVA=loadChuva(); STAND=loadStand(); RECOM=loadRecom(); buildMaqIndex(); updateEditBadge();
  { const v=$('#app-ver'); if(v) v.textContent='v'+APP_VERSION; }
  window.addEventListener('hashchange',()=>route({toTop:true}));   // trocar de página rola pro topo; edições não
  applyModule();
  if(!location.hash) location.hash='#/inicio';   // porta de entrada: escolher o módulo
  route();
  // sincronização automática (planilha <-> app) quando a URL está configurada e o auto está ligado
  lastPushSig='';   // nada enviado ainda nesta sessão -> as edições pendentes serão reenviadas
  if(syncUrl() && autoOn()){
    // ao ABRIR: força buscar a última atualização da planilha (mesmo já tendo dado em cache)
    if(buildFieldEdits().length===0){ syncPull({auto:true, force:true, silentToast:true}); }
    else scheduleAutoPush();   // há edições locais não salvas: envia para a planilha
    startPolling();
  }
  setSyncStatus();
}
// abre JÁ com os últimos dados sincronizados (cache local); se não houver, usa o data.json embutido
(function(){
  const cached=loadDataCache();
  if(cached && cached.produtos){ boot(cached); return; }
  fetch('data.json').then(r=>r.json()).then(boot)
    .catch(e=>{ $('#content').innerHTML=`<div class="empty">Falha ao carregar os dados.<br><small>${esc(e.message)}</small></div>`; });
})();
