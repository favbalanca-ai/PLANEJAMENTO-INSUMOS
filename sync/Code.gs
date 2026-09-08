// Planejamento Safra 26/27 - Sincronizacao App <-> Planilha (Google Sheets)
//
// Vincule este script a SUA planilha (a "verdade"):
//   Extensoes > Apps Script > selecione tudo, apague e cole este arquivo > Salvar
//   Implantar > Nova implantacao > Tipo: App da Web
//     Executar como: Voce | Quem tem acesso: Qualquer pessoa
//   Copie a URL (termina em /exec) e cole na tela "Sincronizar" do app.
//
// doGet  -> devolve os dados da planilha em JSON (mesmo formato do app).
// doPost -> grava de volta campos e insumos (add/remove/troca).

function ss(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sh(n){ return ss().getSheetByName(n); }
function S(v){ return v == null ? '' : String(v).trim(); }
// número tolerante a texto no padrão BR: "0,04" -> 0.04 ; "1.234,56" -> 1234.56
function N(v){
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0;
  var s = String(v == null ? '' : v).trim(); if (!s) return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');   // vírgula = decimal; ponto = milhar
  var n = parseFloat(s); return isFinite(n) ? Math.round(n * 1e4) / 1e4 : 0;
}

/* ----------------------------- LEITURA ----------------------------- */
function readData(){
  var produtos = [], P = sh('PORTIFÓLIO');
  if (P){
    var pcol = pedidoColOf(P);                       // coluna "EM PEDIDO" (acha pelo cabeçalho; cria se não existir)
    var pv = P.getRange(4, 1, 412, 20).getValues();  // linhas 4..415, colunas A..T
    var ped = P.getRange(4, pcol, 412, 1).getValues();
    for (var i = 0; i < pv.length; i++){
      var r = pv[i], prod = S(r[2]);            // C = produto
      if (!prod) continue;
      produtos.push({ empresa:S(r[0]), classe:S(r[1]), produto:prod, ativos:S(r[3]),
        un:S(r[5]), preco:N(r[18]), estoque:N(r[19]), pedido:N(ped[i][0]) }); // S=preço(19), T=estoque(20), EM PEDIDO
    }
  }

  var talhoes = [], A = sh('ÁREA PLANTIO');
  if (A){
    var av = A.getRange(2, 1, Math.max(1, A.getLastRow() - 1), 9).getValues();
    for (var j = 0; j < av.length; j++){
      var t = av[j], id = S(t[0]), up = id.toUpperCase();
      if (up.indexOf('TL') !== 0 && up.indexOf('NV') !== 0) continue;   // TL* da planilha + NV* criados no app
      talhoes.push({ id:id, nome:S(t[1]), empreendimento:S(t[2]), produtividade:N(t[3]),
        area:N(t[4]), emp_safrinha:S(t[7]), prod_safrinha:N(t[8]) });
    }
  }

  var planos = {};
  talhoes.forEach(function(t){
    var s = sh(t.id); if (!s) return;
    var n = Math.min(451, s.getMaxRows());               // 1 leitura por aba (em vez de 4)
    var big = s.getRange(1, 1, n, 9).getValues();        // 0-based: linha L -> big[L-1]
    var m = talColMap(big[8]);                           // colunas detectadas pelo cabeçalho (linha 9)
    var split = findSafraSplit(big, n, m);               // linha do 2º cabeçalho = início da safrinha
    var pR1 = (split > 0) ? split - 1 : Math.min(224, n);
    var sR0 = (split > 0) ? split + 1 : 238;
    var plantioSaf = '';
    if (split > 0){ for (var L = Math.max(5, split - 6); L < split; L++){ var rr = big[L - 1];
      if (rr && S(rr[0]).toUpperCase().indexOf('PLANTIO') >= 0){ plantioSaf = S(rr[1]); break; } } }
    planos[t.id] = { area:N(big[1][1]), empreendimento:S(big[2][1]), plantio:S(big[3][1]), plantio_safrinha:plantioSaf,
      principal: readOpsArr(big, 10, pR1, m), safrinha: readOpsArr(big, sR0, Math.min(451, n), m) };
  });

  var precos = {}, D = sh('DRE ORÇADA');
  if (D){
    var dv = D.getRange(2, 1, 6, 15).getValues(); // linhas 2..7
    for (var c = 1; c < 15; c++){ var emp = S(dv[0][c]), pr = N(dv[5][c]); if (emp && pr) precos[emp] = pr; }
  }

  var maquinas = [], C = sh('CUSTO OPERAÇÃO');
  if (C){
    var cv = C.getRange(2, 1, 40, 13).getValues();
    for (var k = 0; k < cv.length; k++){
      var m = cv[k], conj = S(m[3]);
      if (!conj || conj === '+' || typeof m[4] !== 'number') continue;
      maquinas.push({ conjunto:conj, maquina:S(m[1]), implemento:S(m[2]), largura:N(m[4]),
        velocidade:N(m[5]), eficiencia:N(m[6]), ha_h:N(m[7]), l_h:N(m[8]), hm_ha:N(m[9]),
        l_ha:N(m[10]), custo_hm_ha:N(m[11]), rs_hm:N(m[12]) });
    }
  }

  return { safra:'2026/2027', produtos:produtos, talhoes:talhoes, planos:planos,
    precos_cultura:precos, maquinas:maquinas, precos_app:readPrecosSheet(), retornos:readRetornos() };
}

/* --------- RETORNOS DE APLICAÇÃO (baixa do operador pela página retorno.html) ---------
   O operador abre o link do WhatsApp, dosa no tanque e informa o volume TOTAL usado de
   cada produto. Isso cai aqui via doPost ({__retorno:{...}}) e vira 1 linha por produto
   na aba "RETORNOS APP". O app puxa esses retornos, preenche o "Utilizado" da recomendação
   (casando pelo id) e o Adm aprova para o histórico. */
var RETORNOS_SHEET = 'RETORNOS APP';
var MOV_SHEET = 'MOVIMENTAÇÃO ESTOQUE';   // razão de estoque: entradas (módulo futuro) e saídas (recomendações)
// registra 1 linha no razão de estoque (cria a aba se faltar). "when" opcional (data do movimento)
function logMovimentacao(tipo, produto, un, qtd, origem, obs, when){
  var s = ss().getSheetByName(MOV_SHEET);
  if (!s){ s = ss().insertSheet(MOV_SHEET);
    s.appendRow(['DATA/HORA','TIPO','PRODUTO','UN','QTD','ORIGEM','OBS']); s.setFrozenRows(1); }
  s.appendRow([when || new Date(), S(tipo), S(produto), S(un), N(qtd), S(origem), S(obs)]);
}
// ENTRADA de estoque (compra registrada no app): 1 linha por produto na MOVIMENTAÇÃO ESTOQUE
function writeEntrada(ent){
  var itens = (ent && ent.itens) || [], n = 0;
  var when = new Date();
  if (ent && ent.data && /^\d{4}-\d{2}-\d{2}/.test(String(ent.data))) when = new Date(String(ent.data).slice(0,10) + 'T12:00:00');
  var origem = 'Compra' + (ent.nf ? ' NF ' + S(ent.nf) : '') + (ent.fornecedor ? ' · ' + S(ent.fornecedor) : '');
  for (var i = 0; i < itens.length; i++){ var it = itens[i]; if (!S(it.produto)) continue;
    logMovimentacao('ENTRADA', it.produto, it.un, it.qtd, origem, S(ent.obs), when); n++; }
  return { rows:n };
}
function retornosSheet(){
  var s = ss().getSheetByName(RETORNOS_SHEET);
  if (!s){ s = ss().insertSheet(RETORNOS_SHEET);
    s.appendRow(['DATA/HORA','RECOM_ID','TALHÃO','OPERADOR','PRODUTO','UN','PLANEJADO','UTILIZADO','OBS']);
    s.setFrozenRows(1);
  }
  return s;
}
function readRetornos(){
  var s = ss().getSheetByName(RETORNOS_SHEET); if (!s) return [];
  var last = s.getLastRow(); if (last < 2) return [];
  var v = s.getRange(2, 1, last - 1, 9).getValues(), out = [];
  for (var i = 0; i < v.length; i++){
    var r = v[i], id = S(r[1]); if (!id) continue;
    out.push({ ts:(r[0] instanceof Date)?r[0].getTime():N(r[0]), id:id, talhao:S(r[2]), operador:S(r[3]),
      produto:S(r[4]), un:S(r[5]), plan:N(r[6]), real:N(r[7]), obs:S(r[8]) });
  }
  return out;
}
function writeRetorno(ret){
  var s = retornosSheet(), when = new Date(), n = 0, itens = (ret && ret.itens) || [];
  var origem = 'Recom ' + S(ret.id) + (ret.talhao ? ' · ' + S(ret.talhao) : '');
  for (var i = 0; i < itens.length; i++){
    var it = itens[i];
    s.appendRow([when, S(ret.id), S(ret.talhao), S(ret.operador), S(it.produto), S(it.un), N(it.plan), N(it.real), S(ret.obs)]);
    // saída de estoque pela recomendação (só produtos com volume utilizado)
    if (S(it.produto) && N(it.real) > 0) logMovimentacao('SAÍDA', it.produto, it.un, it.real, origem, S(ret.operador));
    n++;
  }
  if (!n){ s.appendRow([when, S(ret.id), S(ret.talhao), S(ret.operador), '', '', 0, 0, S(ret.obs)]); }
  return { rows:n };
}

/* --------- MÓDULO PREÇOS (composição de preços por safra do app) ---------
   Guarda numa aba "PREÇOS APP" (criada automaticamente) uma tabela legível:
   SAFRA | TIPO(REF/ITEM) | EMPRESA | CLASSE | PRODUTO | VISTA_RS | PRAZO_RS | PCT_VISTA | PCT_PRAZO
   REF  = 1 produto de referência por classe (preço à vista/à prazo).
   ITEM = produto do portfólio (% em relação à referência da classe; em PORCENTAGEM).
   O app envia o objeto inteiro ({__precos:{...}}) e regravamos a aba (fonte da verdade). */
var PRECOS_SHEET = 'PREÇOS APP';
// ID da planilha PERMANENTE "Banco de Preços" (guarda os portfólios ano a ano,
// independente do planejamento, que é trocado a cada safra). Deixe '' para usar
// a própria planilha de planejamento (comportamento antigo). NÃO mude ao criar
// um planejamento novo: assim o histórico de preços é sempre o mesmo.
var PRECOS_DB_ID = '1-pNApvSfw9oUbfec5Tm7g-DEh9xCgupAEpjsZp7EBKg';
function precosSS(){ if (PRECOS_DB_ID){ try { return SpreadsheetApp.openById(PRECOS_DB_ID); } catch(e){} } return ss(); }
function precosSheet(){ var b = precosSS(), s = b.getSheetByName(PRECOS_SHEET); if (!s) s = b.insertSheet(PRECOS_SHEET); return s; }
function readPrecosSheet(){
  var s = precosSS().getSheetByName(PRECOS_SHEET); if (!s) return { safras:{} };
  var last = s.getLastRow(); if (last < 2) return { safras:{} };
  var v = s.getRange(2, 1, last - 1, 9).getValues(), safras = {};
  for (var i = 0; i < v.length; i++){
    var r = v[i], safra = S(r[0]), tipo = S(r[1]).toUpperCase();
    if (!safra) continue;
    var sf = safras[safra] || (safras[safra] = { refs:[], itens:[] });
    if (tipo === 'REF'){
      if (!S(r[3]) && !S(r[4])) continue;
      sf.refs.push({ classe:S(r[3]), produto:S(r[4]), vista:N(r[5]), prazo:N(r[6]) });
    } else if (tipo === 'ITEM'){
      if (!S(r[4]) && !S(r[3])) continue;
      var dv = (r[5] === '' || r[5] == null) ? null : N(r[5]);         // preço à vista direto
      var dz = (r[6] === '' || r[6] == null) ? null : N(r[6]);         // preço a prazo direto
      var pv = (r[7] === '' || r[7] == null) ? null : N(r[7]) / 100;   // % -> fator
      var pp = (r[8] === '' || r[8] == null) ? null : N(r[8]) / 100;
      sf.itens.push({ empresa:S(r[2]), classe:S(r[3]), produto:S(r[4]), precoVista:dv, precoPrazo:dz, pct:pv, pctPrazo:pp });
    }
  }
  return { safras:safras };
}
function writePrecosSheet(precos){
  var s = precosSheet();
  s.clearContents();
  var rows = [['SAFRA','TIPO','EMPRESA','CLASSE','PRODUTO','VISTA_RS','PRAZO_RS','PCT_VISTA','PCT_PRAZO']];
  var safras = (precos && precos.safras) || {};
  Object.keys(safras).forEach(function(nm){
    var sf = safras[nm] || {};
    (sf.refs || []).forEach(function(r){
      rows.push([nm, 'REF', '', S(r.classe), S(r.produto),
        r.vista == null ? '' : N(r.vista), r.prazo == null ? '' : N(r.prazo), '', '']);
    });
    (sf.itens || []).forEach(function(it){
      rows.push([nm, 'ITEM', S(it.empresa), S(it.classe), S(it.produto),
        (it.precoVista == null || it.precoVista === '') ? '' : N(it.precoVista),
        (it.precoPrazo == null || it.precoPrazo === '') ? '' : N(it.precoPrazo),
        it.pct == null ? '' : N(it.pct * 100), it.pctPrazo == null ? '' : N(it.pctPrazo * 100)]);
    });
  });
  s.getRange(1, 1, rows.length, 9).setValues(rows);
  try { s.setFrozenRows(1); } catch (e) {}
  return { rows: rows.length - 1 };
}
// Aba plana "PREÇOS" no Banco: PRODUTO | À VISTA | A PRAZO | SAFRA.
// É a lista que o PORTIFÓLIO do planejamento busca por VLOOKUP+IMPORTRANGE.
function writeFlatPrecos(list, safra){
  var b = precosSS(), s = b.getSheetByName('PREÇOS'); if (!s) s = b.insertSheet('PREÇOS');
  s.clearContents();
  var rows = [['PRODUTO', 'À VISTA', 'A PRAZO', 'SAFRA']];
  (list || []).forEach(function(it){
    rows.push([S(it.p), (it.v == null || it.v === '') ? '' : N(it.v), (it.z == null || it.z === '') ? '' : N(it.z), S(safra)]);
  });
  s.getRange(1, 1, rows.length, 4).setValues(rows);
  try { s.setFrozenRows(1); } catch (e) {}
  return { rows: rows.length - 1 };
}

// mapa das colunas da tabela do talhão, detectado pelo cabeçalho (linha 9), 0-based.
// Suporta o layout NOVO (igual ao app) e o ORIGINAL (retrocompatível: Classe=B, Produto=C, Un=F, Dose=I).
function talColMap(headerRow){
  var m = { op:0, dap:-1, classe:1, produto:2, un:5, dose:8 };   // padrão = layout original
  if (headerRow && headerRow.length){
    for (var c = 0; c < headerRow.length; c++){
      var h = S(headerRow[c]).toUpperCase();
      if (h === 'CLASSE') m.classe = c;
      else if (h === 'PRODUTO') m.produto = c;
      else if (h === 'UN' || h === 'UNIDADE') m.un = c;
      else if (h.indexOf('DOSE') === 0) m.dose = c;           // "DOSE" ou "DOSE/HA"
      else if (h === 'DAP (DIAS)' || h === 'DAP') m.dap = c;  // dias após plantio (op)
    }
  }
  return m;
}
// acha o INÍCIO da safrinha = 2º cabeçalho da tabela (linha com "PRODUTO" na coluna de produto),
// depois do cabeçalho da 1ª safra (linha 9). Retorna a linha (1-based) ou -1 se não houver safrinha.
function findSafraSplit(big, n, m){
  for (var L = 11; L <= n; L++){ var row = big[L - 1]; if (!row) continue;
    if (S(row[m.produto]).toUpperCase() === 'PRODUTO') return L;
  }
  return -1;
}
// operações (com itens) de uma faixa de linhas — lê de um array já carregado (big[L-1])
function readOpsArr(big, r0, r1, m){
  m = m || { op:0, dap:-1, classe:1, produto:2, un:5, dose:8 };
  var ops = [], cur = null;
  for (var L = r0; L <= r1; L++){
    var row = big[L - 1]; if (!row) continue;
    var a = S(row[m.op]), prod = S(row[m.produto]);
    if (a.toUpperCase().indexOf('OPERA') === 0){
      cur = { nome:a, itens:[] };
      if (m.dap >= 0){ var d = N(row[m.dap]); if (d > 0) cur.dap = d; }   // dias após plantio
      ops.push(cur);
    }
    if (prod && cur) cur.itens.push({ classe:S(row[m.classe]), produto:prod, dose:N(row[m.dose]), un:S(row[m.un]) });
  }
  return ops;   // TODAS as operações (por posição) — inclusive as vazias; o app revela/preenche os slots livres
}

/* ----------------------------- ESCRITA (EM LOTE) -----------------------------
   Agrupa as edições por aba e faz 1 leitura + escrita em bloco por aba, em vez
   de reler a aba e gravar célula por célula a cada edição. Bem mais rápido.
   Não toca em colunas de fórmula (D na aba do talhão; B2/B3; preço na PORTIFÓLIO). */
function applyEditsBatch(edits, out){
  var byTalhao = {}, port = [], area = [], novos = [], remove = [];
  edits.forEach(function(ed){
    var t = ed.type;
    if (t === 'addtalhao') novos.push(ed);
    else if (t === 'deltalhao') remove.push(ed);
    else if (t === 'estoque' || t === 'preco' || t === 'pedido' || t === 'addprod') port.push(ed);
    else if (t === 'area' || t === 'produtividade' || t === 'empreendimento' || t === 'emp_safrinha' || t === 'prod_safrinha') area.push(ed);
    else if (ed.talhao) { (byTalhao[ed.talhao] = byTalhao[ed.talhao] || []).push(ed); }
    else { out.fail++; if (out.msgs.length < 10) out.msgs.push('tipo/sem talhão: ' + t); }
  });
  novos.forEach(function(ed){ applyAddTalhao(ed, out); });   // cria talhões antes das demais edições
  if (port.length) applyPortifolio(port, out);
  if (area.length) applyAreaPlantio(area, out);
  for (var tid in byTalhao) applyTalhao(tid, byTalhao[tid], out);
  remove.forEach(function(ed){ applyDelTalhao(ed, out); });  // exclusões por último
}

// exclui um talhão: remove a linha na ÁREA PLANTIO e a aba do talhão
function applyDelTalhao(ed, out){
  try {
    var id = S(ed.talhao); if (!id) throw 'deltalhao sem id';
    var A = sh('ÁREA PLANTIO');
    if (A){ var last = A.getLastRow();
      if (last >= 2){ var idv = A.getRange(2, 1, last - 1, 1).getValues();
        for (var i = idv.length - 1; i >= 0; i--){ if (S(idv[i][0]) === id) A.deleteRow(2 + i); } } }
    var s = ss().getSheetByName(id); if (s) ss().deleteSheet(s);
    out.ok++;
  } catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push(String(err)); }
}

// cria (ou atualiza) um talhão criado no app: linha na ÁREA PLANTIO + aba do talhão com o plano
function applyAddTalhao(ed, out){
  try {
    var id = S(ed.talhao); if (!id) throw 'addtalhao sem id';
    var A = sh('ÁREA PLANTIO'); if (!A) throw 'aba ÁREA PLANTIO não encontrada';
    var last = A.getLastRow(), L = 0;
    if (last >= 2){ var idv = A.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < idv.length; i++){ if (S(idv[i][0]) === id){ L = 2 + i; break; } } }
    if (!L) L = Math.max(last, 1) + 1;
    A.getRange(L, 1, 1, 9).clearDataValidations();
    A.getRange(L, 1, 1, 9).setValues([[id, S(ed.nome), S(ed.empreendimento), N(ed.produtividade), N(ed.area), '', '', S(ed.emp_safrinha), N(ed.prod_safrinha)]]);
    A.getRange(1, 10).setValue('CUSTO R$/ha'); A.getRange(1, 11).setValue('CUSTO TOTAL R$');
    A.getRange(L, 10).setFormula(custoHaFormula(L)); A.getRange(L, 11).setFormula(custoTotalFormula(L));
    A.getRange(L, 10, 1, 2).setNumberFormat('R$ #,##0.00');
    var s = ss().getSheetByName(id) || ss().insertSheet(id);
    var t = { id:id, nome:S(ed.nome), area:N(ed.area), empreendimento:S(ed.empreendimento), produtividade:N(ed.produtividade),
      emp_safrinha:S(ed.emp_safrinha), prod_safrinha:N(ed.prod_safrinha), plantio:'', plantio_safrinha:'' };
    escreveAbaTalhao(s, t, ed.plano || { principal:[], safrinha:[] });
    out.ok++;
  } catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push(String(err)); }
}

// PORTIFÓLIO: estoque (T=20) e EM PEDIDO em bloco; preço (S=19) individual (é fórmula/import)
function applyPortifolio(edits, out){
  var P = sh('PORTIFÓLIO');
  if (!P){ edits.forEach(function(){ out.fail++; }); if (out.msgs.length < 10) out.msgs.push('aba PORTIFÓLIO não encontrada'); return; }
  var pcol = pedidoColOf(P), r0 = 4, r1 = 433, nn = r1 - r0 + 1;
  var cvals = P.getRange(r0, 3, nn, 1).getValues();     // C = produto (mapa)
  var map = {}, emptyRows = [];
  for (var i = 0; i < nn; i++){ var pr = S(cvals[i][0]); if (pr){ if (!(pr in map)) map[pr] = r0 + i; } else emptyRows.push(r0 + i); }
  var ei = 0;
  var est = P.getRange(r0, 20, nn, 1).getValues(), estDirty = false;
  var ped = P.getRange(r0, pcol, nn, 1).getValues(), pedDirty = false;
  edits.forEach(function(ed){
    try {
      if (ed.type === 'addprod'){                              // novo produto do portfólio -> 1ª linha vazia
        if (map[S(ed.produto)]){ out.ok++; return; }           // já existe: não duplica
        var La = emptyRows[ei++]; if (!La) throw 'PORTIFÓLIO sem linha vazia p/ ' + ed.produto;
        P.getRange(La, 1, 1, 3).clearDataValidations();
        P.getRange(La, 1, 1, 3).setValues([[S(ed.empresa), S(ed.classe), S(ed.produto)]]);
        if (ed.value !== '' && ed.value != null) P.getRange(La, 19).setValue(ed.value);
        map[S(ed.produto)] = La; out.ok++; return;
      }
      var L = map[S(ed.produto)]; if (!L) throw 'produto não encontrado: ' + ed.produto;
      var idx = L - r0;
      if (ed.type === 'estoque'){ est[idx][0] = ed.value; estDirty = true; }
      else if (ed.type === 'pedido'){ ped[idx][0] = ed.value; pedDirty = true; }
      else if (ed.type === 'preco'){ P.getRange(L, 19).setValue(ed.value); }
      out.ok++;
    } catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push(String(err)); }
  });
  if (estDirty) P.getRange(r0, 20, nn, 1).setValues(est);
  if (pedDirty) P.getRange(r0, pcol, nn, 1).setValues(ped);
}

// ÁREA PLANTIO: poucas edições (por talhão) — grava individual, mas lê o índice de IDs 1 vez
function applyAreaPlantio(edits, out){
  var A = sh('ÁREA PLANTIO');
  if (!A){ edits.forEach(function(){ out.fail++; }); if (out.msgs.length < 10) out.msgs.push('aba ÁREA PLANTIO não encontrada'); return; }
  var last = A.getLastRow(), idv = A.getRange(2, 1, Math.max(1, last - 1), 1).getValues(), map = {};
  for (var i = 0; i < idv.length; i++){ var id = S(idv[i][0]); if (id && !(id in map)) map[id] = 2 + i; }
  edits.forEach(function(ed){
    try {
      var L = map[S(ed.talhao)]; if (!L) throw 'talhão não encontrado: ' + ed.talhao;
      if (ed.type === 'area') A.getRange(L, 5).setValue(N(ed.value));
      else if (ed.type === 'produtividade') A.getRange(L, 4).setValue(N(ed.value));
      else if (ed.type === 'empreendimento') A.getRange(L, 3).setValue(S(ed.value));
      else if (ed.type === 'emp_safrinha') A.getRange(L, 8).setValue(S(ed.value));
      else if (ed.type === 'prod_safrinha') A.getRange(L, 9).setValue(N(ed.value));
      out.ok++;
    } catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push(String(err)); }
  });
}

// aba do talhão: 1 leitura do bloco (1..9), aplica tudo em memória, grava B:C e I de volta
function applyTalhao(tid, edits, out){
  var s = sh(tid);
  if (!s){ edits.forEach(function(){ out.fail++; }); if (out.msgs.length < 10) out.msgs.push('aba não encontrada: ' + tid); return; }
  var n = Math.min(451, s.getMaxRows());
  var vals = s.getRange(1, 1, n, 9).getValues();   // 0-based: linha L -> vals[L-1]
  var m = talColMap(vals[8]);                      // colunas detectadas pelo cabeçalho
  var split = findSafraSplit(vals, n, m);          // fronteira 1ª safra / safrinha
  var pR1 = (split > 0) ? split - 1 : Math.min(224, n);
  var sR0 = (split > 0) ? split + 1 : 238;
  var dirty = false;
  edits.forEach(function(ed){
    try {
      var faixa = ed.tag === 'S' ? [sR0, Math.min(451, n)] : [10, pR1];
      var op = opByIndex(vals, faixa[0], faixa[1], ed.op, m);
      if (ed.type === 'dose'){
        if (!op) throw 'operação não encontrada (dose)';
        var prodRows = op.body.filter(function(L){ return S(vals[L - 1][m.produto]); });
        var Ld = prodRows[ed.item]; if (!Ld) throw 'insumo não localizado (dose, item ' + ed.item + ')';
        vals[Ld - 1][m.dose] = ed.value; dirty = true; out.ok++;
      } else if (ed.type === 'itemprod'){
        if (!op) throw 'operação não encontrada (troca)';
        var Lp = findInOp(vals, op, ed.from, m); if (!Lp) throw 'insumo não localizado (troca): ' + ed.from;
        vals[Lp - 1][m.produto] = S(ed.to);
        if (ed.classe) vals[Lp - 1][m.classe] = S(ed.classe);
        dirty = true; out.ok++;
      } else if (ed.type === 'additem'){
        if (!op) throw 'operação não encontrada (add)';
        var La = findInOp(vals, op, ed.produto, m) || firstEmptyInOp(vals, op, m);
        if (!La) throw 'sem linha vazia na operação';
        vals[La - 1][m.produto] = S(ed.produto);
        vals[La - 1][m.dose] = N(ed.dose);
        if (ed.classe) vals[La - 1][m.classe] = S(ed.classe);
        dirty = true; out.ok++;
      } else if (ed.type === 'delitem'){
        if (op){ var Lx = findInOp(vals, op, ed.produto, m);
          if (Lx){ vals[Lx - 1][m.classe] = ''; vals[Lx - 1][m.produto] = ''; vals[Lx - 1][m.dose] = ''; dirty = true; } }
        out.ok++;                                                           // idempotente
      } else { throw 'tipo desconhecido p/ talhão: ' + ed.type; }
    } catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push(String(err)); }
  });
  if (dirty){
    // grava só nas FAIXAS DE OPERAÇÃO (pula o resumo da safrinha, que tem fórmulas)
    escreveColsTalhao(s, vals, 10, pR1, m);
    escreveColsTalhao(s, vals, sR0, Math.min(451, n), m);
  }
}
// grava Classe/Produto (contíguas: produto = classe+1) e Dose de uma faixa — não toca em outras colunas/fórmulas
function escreveColsTalhao(s, vals, r0, r1, m){
  if (r1 < r0) return;
  var wn = r1 - r0 + 1, cCla = m.classe + 1, cDose = m.dose + 1, cp = [], dz = [];
  for (var L = r0; L <= r1; L++){ cp.push([vals[L - 1][m.classe], vals[L - 1][m.produto]]); dz.push([vals[L - 1][m.dose]]); }
  s.getRange(r0, cCla, wn, 2).clearDataValidations();
  s.getRange(r0, cCla, wn, 2).setValues(cp);
  s.getRange(r0, cDose, wn, 1).setValues(dz);
}

// operação opIdx (por POSIÇÃO — inclui as vazias, igual ao app) dentro da faixa, no array em memória
function opByIndex(vals, r0, r1, opIdx, m){
  m = m || { op:0, produto:2 };
  var blocks = [], cur = null;
  for (var L = r0; L <= r1; L++){ var row = vals[L - 1]; if (!row) continue;
    var a = S(row[m.op]);
    if (a.toUpperCase().indexOf('OPERA') === 0){ cur = { body: [], has: false }; blocks.push(cur); }
    else if (cur){ cur.body.push(L); if (S(row[m.produto])) cur.has = true; }
  }
  return blocks[opIdx] || null;
}
function findInOp(vals, op, produto, m){
  for (var j = 0; j < op.body.length; j++){ var L = op.body[j]; if (S(vals[L - 1][m.produto]) === S(produto)) return L; }
  return 0;
}
function firstEmptyInOp(vals, op, m){
  for (var j = 0; j < op.body.length; j++){ var L = op.body[j]; if (!S(vals[L - 1][m.produto])) return L; }
  return 0;
}

// coluna "EM PEDIDO" na PORTIFÓLIO: acha pelo cabeçalho (linha 3); se não existir, cria em W (23)
function pedidoColOf(P){
  var last = Math.max(23, P.getLastColumn());
  var hdr = P.getRange(3, 1, 1, last).getValues()[0];
  for (var c = 0; c < hdr.length; c++){
    var h = S(hdr[c]).toUpperCase();
    if (h.indexOf('EM PEDIDO') === 0 || h === 'PEDIDO' || h === 'PEDIDOS' || h.indexOf('INSUMOS EM PEDIDO') === 0) return c + 1;
  }
  P.getRange(3, 23).setValue('EM PEDIDO'); // cria o cabeçalho em W3 (você pode mover a coluna; é achada pelo nome)
  return 23;
}

/* ----------------------------- ENDPOINTS ----------------------------- */
function json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function jsonStr(s){ return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }

/* Cache dos dados (CacheService) — a leitura pesada roda no máx. 1x a cada CACHE_TTL s;
   os demais celulares recebem instantâneo. Como o valor pode passar de 100KB, é fatiado. */
var CACHE_TTL = 45;
function cacheGet(){
  var c = CacheService.getScriptCache(), meta = c.get('pd_meta');
  if (!meta) return null;
  var n = parseInt(meta, 10), keys = [];
  for (var i = 0; i < n; i++) keys.push('pd_' + i);
  var got = c.getAll(keys), parts = [];
  for (var j = 0; j < n; j++){ var v = got['pd_' + j]; if (v == null) return null; parts.push(v); }
  return parts.join('');
}
function cachePut(str){
  var c = CacheService.getScriptCache(), size = 90000, n = Math.ceil(str.length / size), obj = {};
  for (var i = 0; i < n; i++) obj['pd_' + i] = str.substr(i * size, size);
  obj['pd_meta'] = String(n);
  c.putAll(obj, CACHE_TTL);
}
function cacheClear(){ try { CacheService.getScriptCache().remove('pd_meta'); } catch (e) {} }
// JSON atual dos dados (do cache; senão lê a planilha e cacheia)
function currentJson(){
  var cached = cacheGet();
  if (cached) return cached;
  var str = JSON.stringify(readData());
  cachePut(str);
  return str;
}

function doGet(e){
  var str = currentJson();
  // ?h=1 -> devolve só o "hash" (resposta minúscula) para o app checar se mudou antes de baixar tudo
  if (e && e.parameter && e.parameter.h){
    var dig = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str, Utilities.Charset.UTF_8);
    var hash = Utilities.base64Encode(dig);
    return jsonStr(JSON.stringify({ hash: hash }));
  }
  return jsonStr(str);
}

function doPost(e){
  var out = { ok:0, fail:0, msgs:[] };
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload && payload.__precos){         // módulo Preços: regrava a aba de histórico inteira
      var pr = writePrecosSheet(payload.__precos); out.ok = pr.rows;
    } else if (payload && payload.__flatPrecos){   // publica a lista plana produto->preço (p/ o planejamento buscar)
      var fr = writeFlatPrecos(payload.__flatPrecos, payload.safra); out.ok = fr.rows;
    } else if (payload && payload.__retorno){       // baixa do operador (página retorno.html)
      var rr = writeRetorno(payload.__retorno); out.ok = rr.rows;
    } else if (payload && payload.__entrada){        // compra do app -> entrada no razão de estoque
      var en = writeEntrada(payload.__entrada); out.ok = en.rows;
    } else {
      applyEditsBatch(payload, out);           // grava em lote (rápido)
    }
  } catch(err){ out.msgs.push('payload inválido: ' + err); }
  cacheClear();                       // invalida o cache: o próximo puxar traz o dado fresco
  return json(out);
}

/* ------------------------- MANUTENÇÃO (rodar à mão) -------------------------
   Remove as REGRAS de validação de dados (listas suspensas / "rejeitar entrada")
   de TODAS as abas. NÃO apaga valores nem fórmulas — só tira as regras que fazem
   a planilha recusar o que o app grava. Rode UMA vez pelo editor do Apps Script:
   selecione "limparValidacoes" no menu de funções e clique em Executar
   (autorize o acesso na 1ª vez). Não precisa reimplantar o Web App. */
function limparValidacoes(){
  var sheets = ss().getSheets(), n = 0, nomes = [];
  sheets.forEach(function(s){
    var rng = s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns());
    rng.clearDataValidations();
    n++; nomes.push(s.getName());
  });
  var msg = 'Validações removidas de ' + n + ' aba(s): ' + nomes.join(', ');
  Logger.log(msg);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Pronto', 8); } catch (e) {}
  return msg;
}

/* Versão só das abas que o app grava (talhões TL*, PORTIFÓLIO e ÁREA PLANTIO),
   caso queira manter as listas das demais abas. */
function limparValidacoesApp(){
  var sheets = ss().getSheets(), n = 0, nomes = [];
  sheets.forEach(function(s){
    var nome = s.getName(), up = nome.toUpperCase();
    if (up.indexOf('TL') === 0 || up === 'PORTIFÓLIO' || up === 'ÁREA PLANTIO') {
      s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).clearDataValidations();
      n++; nomes.push(nome);
    }
  });
  var msg = 'Validações removidas de ' + n + ' aba(s): ' + nomes.join(', ');
  Logger.log(msg);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Pronto', 8); } catch (e) {}
  return msg;
}

/* ------------------------- AUDITORIA (rodar à mão) -------------------------
   Cria/atualiza a aba "AUDITORIA APP" com um raio-x da planilha, para enxugá-la
   COM SEGURANÇA: cada aba, seu tamanho, quantas fórmulas tem, se o APP usa, e
   quais abas são citadas nas fórmulas das outras (para não apagar nada que
   alimenta o app). NÃO apaga nem altera nada — só relata.
   No editor do Apps Script, selecione "auditarPlanilha" e clique em Executar.
   Não precisa reimplantar o Web App. */
function auditarPlanilha(){
  var sheets = ss().getSheets();
  function usoApp(nome){
    var up = nome.toUpperCase();
    if (up.indexOf('TL') === 0) return 'LÊ + GRAVA (talhão)';
    if (up === 'PORTIFÓLIO') return 'LÊ + GRAVA (produtos)';
    if (up === 'ÁREA PLANTIO') return 'LÊ + GRAVA (talhões)';
    if (up === 'DRE ORÇADA') return 'LÊ (culturas / preço de venda)';
    if (up === 'CUSTO OPERAÇÃO') return 'LÊ (máquinas)';
    if (up === RETORNOS_SHEET) return 'GRAVA (retornos)';
    if (up === PRECOS_SHEET || up === 'PREÇOS') return 'Preços (Banco à parte)';
    if (up === 'AUDITORIA APP') return '(este relatório)';
    return '';
  }
  // 1 leitura por aba: dimensões + fórmulas da região usada
  var info = sheets.map(function(s){
    var lastR = s.getLastRow(), lastC = s.getLastColumn(), nForm = 0, forms = '';
    if (lastR > 0 && lastC > 0){
      var f = s.getRange(1, 1, lastR, lastC).getFormulas();
      for (var i = 0; i < f.length; i++) for (var j = 0; j < f[i].length; j++){ if (f[i][j]){ nForm++; forms += f[i][j] + '\n'; } }
    }
    return { name:s.getName(), maxR:s.getMaxRows(), maxC:s.getMaxColumns(),
      lastR:lastR, lastC:lastC, nForm:nForm, forms:forms.toUpperCase(), uso:usoApp(s.getName()) };
  });
  // detecta quem é citado nas fórmulas de quais abas (só referências LOCAIS)
  info.forEach(function(a){
    var refBy = [], n1 = a.name.toUpperCase();
    info.forEach(function(b){
      if (b.name === a.name || !b.forms) return;
      if (b.forms.indexOf("'" + n1 + "'!") >= 0 || b.forms.indexOf(n1 + '!') >= 0) refBy.push(b.name);
    });
    a.refBy = refBy;
  });
  var rows = [['ABA','Linhas (máx)','Colunas (máx)','Dados até lin.','Dados até col.','Fórmulas','Uso no APP','Citada nas fórmulas de','Sugestão']];
  info.forEach(function(a){
    var sug = a.uso ? 'MANTER (app usa)'
      : (a.refBy.length ? 'MANTER (alimenta: ' + a.refBy.join(', ') + ')' : '⚠ CANDIDATA A REMOVER — conferir');
    rows.push([a.name, a.maxR, a.maxC, a.lastR, a.lastC, a.nForm, a.uso || '—', a.refBy.join(', ') || '—', sug]);
  });
  var out = ss().getSheetByName('AUDITORIA APP') || ss().insertSheet('AUDITORIA APP');
  out.clear();
  out.getRange(1, 1, rows.length, 9).setValues(rows);
  out.setFrozenRows(1);
  try { out.autoResizeColumns(1, 9); } catch (e) {}
  try { ss().toast('Auditoria pronta na aba "AUDITORIA APP" (' + (rows.length - 1) + ' abas).', 'Pronto', 8); } catch (e) {}
  return 'ok';
}

/* ------------------------- ENXUGAR LINHAS/COLUNAS VAZIAS (rodar à mão) -------------------------
   Remove as linhas e colunas VAZIAS que sobram ao final de cada aba (deixa uma
   folga de segurança). Reduz o tamanho do arquivo sem apagar dado nem fórmula.
   Respeita o piso das abas de faixa fixa: talhões TL* até a linha 451 e
   PORTIFÓLIO até a 433 (que o app usa por posição). NÃO apaga abas.
   No editor, selecione "enxugarVazios" e Executar. Não precisa reimplantar. */
function enxugarVazios(){
  var sheets = ss().getSheets(), tocou = [];
  sheets.forEach(function(s){
    var up = s.getName().toUpperCase();
    var pisoLin = (up.indexOf('TL') === 0) ? 451 : (up === 'PORTIFÓLIO' ? 433 : 0);
    var lastR = Math.max(s.getLastRow(), pisoLin, 1) + 20;   // folga de 20 linhas
    var lastC = Math.max(s.getLastColumn(), 1) + 3;          // folga de 3 colunas
    var delR = 0, delC = 0;
    if (s.getMaxRows() > lastR){ delR = s.getMaxRows() - lastR; s.deleteRows(lastR + 1, delR); }
    if (s.getMaxColumns() > lastC){ delC = s.getMaxColumns() - lastC; s.deleteColumns(lastC + 1, delC); }
    if (delR || delC) tocou.push(s.getName() + ' (-' + delR + ' lin, -' + delC + ' col)');
  });
  var msg = tocou.length ? ('Enxugado: ' + tocou.join(' · ')) : 'Nada a enxugar.';
  Logger.log(msg);
  try { ss().toast(msg, 'Pronto', 8); } catch (e) {}
  return msg;
}

/* ------------------------- GERAR PLANILHA LIMPA (rodar à mão) -------------------------
   Cria uma planilha NOVA, enxuta e 100% no formato do app, já preenchida com os dados
   ATUAIS (produtos, talhões, planos, máquinas, preços de venda). Fica só com as abas que
   o app usa e nas posições certas.

   Como usar:
   1) No editor do Apps Script, selecione "gerarPlanilhaLimpa" e clique em Executar.
      (autorize na 1ª vez). O link da nova planilha aparece no Log e num aviso (toast).
   2) Abra a nova planilha > Extensões > Apps Script > cole ESTE MESMO Code.gs > Salvar.
   3) Implantar > Nova implantação > App da Web (Executar como: Você | Acesso: Qualquer
      pessoa) > copie a URL /exec.
   4) No app, tela Sincronizar, troque a URL. Pronto.

   Preço AUTOMÁTICO: a coluna VALOR do PORTIFÓLIO puxa o preço do "Banco de Preços"
   por fórmula (VLOOKUP + IMPORTRANGE). Na 1ª vez o Google mostra "#REF! — Permitir
   acesso" numa célula: clique em Permitir uma vez e os preços aparecem.

   Controle de estoque (base pronta):
   - PORTIFÓLIO ganha ESTOQUE (entradas/manual), CONSUMO (soma das saídas das
     recomendações) e SALDO (= ESTOQUE - CONSUMO).
   - Aba "MOVIMENTAÇÃO ESTOQUE" = razão de entradas/saídas. As SAÍDAS já entram
     sozinhas quando o operador dá baixa numa recomendação. As ENTRADAS ficam para
     o módulo de compras (futuro) — a estrutura já está pronta. */
function gerarPlanilhaLimpa(){
  var D = readData();
  var nb = SpreadsheetApp.create('Planejamento Safra ' + (D.safra || '') + ' — LIMPA');
  var lixo = nb.getSheets()[0];   // aba padrão, removida no final

  // ---- MOVIMENTAÇÃO ESTOQUE (razão de entradas/saídas) — criada antes p/ as fórmulas do PORTIFÓLIO ----
  var MV = nb.insertSheet(MOV_SHEET);
  MV.getRange(1, 1, 1, 7).setValues([['DATA/HORA','TIPO','PRODUTO','UN','QTD','ORIGEM','OBS']]);
  MV.setFrozenRows(1);

  // ---- PORTIFÓLIO (cabeçalho na linha 3; dados a partir da 4) ----
  // S=VALOR (preço automático, do Banco de Preços) · T=ESTOQUE (entradas/manual) ·
  // U=EM PEDIDO · V=CONSUMO (saídas somadas das recomendações) · W=SALDO (T-V)
  var P = nb.insertSheet('PORTIFÓLIO');
  P.getRange(1, 1).setValue('PORTIFÓLIO — produtos');
  var phdr = blank(23);
  phdr[0]='EMPRESA'; phdr[1]='CLASSE'; phdr[2]='PRODUTO'; phdr[3]='ATIVO'; phdr[5]='UN';
  phdr[18]='VALOR'; phdr[19]='ESTOQUE'; phdr[20]='EM PEDIDO'; phdr[21]='CONSUMO (recom.)'; phdr[22]='SALDO';
  P.getRange(3, 1, 1, 23).setValues([phdr]);
  var prods = produtosMerged(D), prows = [];
  prods.forEach(function(p, i){
    var L = 4 + i;                              // linha 1-based na planilha
    var row = blank(23);
    row[0]=p.empresa||''; row[1]=p.classe||''; row[2]=p.produto||''; row[3]=p.ativos||''; row[5]=p.un||'';
    row[18]=precoFormula(L);                    // S VALOR — fórmula (preço automático)
    row[19]=p.estoque||0;                       // T ESTOQUE
    row[20]=p.pedido||0;                        // U EM PEDIDO
    row[21]=consumoFormula(L);                  // V CONSUMO (saídas das recomendações)
    row[22]='=$T'+L+'-$V'+L;                    // W SALDO = estoque - consumo
    prows.push(row);
  });
  if (prows.length) P.getRange(4, 1, prows.length, 23).setValues(prows);
  P.setFrozenRows(3);

  // ---- ÁREA PLANTIO (cabeçalho na linha 1; dados a partir da 2) ----
  var A = nb.insertSheet('ÁREA PLANTIO');
  A.getRange(1, 1, 1, 9).setValues([['ID','NOME','CULTURA','PRODUTIV.','ÁREA (ha)','','','CULTURA SAFRINHA','PROD. SAFRINHA']]);
  var arows = [];
  (D.talhoes || []).forEach(function(t){
    arows.push([t.id, t.nome||'', t.empreendimento||'', t.produtividade||0, t.area||0, '', '', t.emp_safrinha||'', t.prod_safrinha||0]);
  });
  if (arows.length) A.getRange(2, 1, arows.length, 9).setValues(arows);
  A.setFrozenRows(1);

  // ---- ABAS DOS TALHÕES (layout do original; B2=área, B3=cultura; operações 10..224 e 238..451) ----
  (D.talhoes || []).forEach(function(t){
    var s = nb.insertSheet(t.id);
    var plano = (D.planos && D.planos[t.id]) || { principal:[], safrinha:[] };
    var t2 = { id:t.id, nome:t.nome, area:t.area, empreendimento:t.empreendimento, produtividade:t.produtividade,
      emp_safrinha:t.emp_safrinha, prod_safrinha:t.prod_safrinha, plantio:plano.plantio || '', plantio_safrinha:plano.plantio_safrinha || '' };
    escreveAbaTalhao(s, t2, plano);
  });
  garantirCustoAreaPlantioIn(A);   // custo R$/ha por talhão na ÁREA PLANTIO

  // ---- DRE ORÇADA (o app só lê: nomes na linha 2, preço de venda na linha 7) ----
  var DR = nb.insertSheet('DRE ORÇADA');
  DR.getRange(2, 1).setValue('CULTURA');
  DR.getRange(7, 1).setValue('PREÇO VENDA');
  var emps = Object.keys(D.precos_cultura || {});
  for (var i = 0; i < emps.length && i < 14; i++){
    DR.getRange(2, 2 + i).setValue(emps[i]);
    DR.getRange(7, 2 + i).setValue(D.precos_cultura[emps[i]] || 0);
  }

  // ---- CUSTO OPERAÇÃO (máquinas; cabeçalho na 1, dados a partir da 2) ----
  var C = nb.insertSheet('CUSTO OPERAÇÃO');
  C.getRange(1, 1, 1, 13).setValues([['','MÁQUINA','IMPLEMENTO','CONJUNTO','LARGURA','VELOC.','EFIC.','HA/H','L/H','HM/HA','L/HA','CUSTO HM/HA','R$/HM']]);
  var crows = [];
  (D.maquinas || []).forEach(function(m){
    crows.push(['', m.maquina||'', m.implemento||'', m.conjunto||'', m.largura||0, m.velocidade||0, m.eficiencia||0,
      m.ha_h||0, m.l_h||0, m.hm_ha||0, m.l_ha||0, m.custo_hm_ha||0, m.rs_hm||0]);
  });
  if (crows.length) C.getRange(2, 1, crows.length, 13).setValues(crows);
  C.setFrozenRows(1);

  try { nb.deleteSheet(lixo); } catch (e) {}

  var url = nb.getUrl();
  Logger.log('Planilha limpa criada: ' + url);
  try { ss().toast('Planilha limpa criada! Link no Log (menu Execuções) ou abra: ' + url, 'Pronto', 20); } catch (e) {}
  return url;
}

/* ------------------------- PREENCHER PORTIFÓLIO (rodar à mão) -------------------------
   Preenche a aba PORTIFÓLIO desta planilha com os produtos do planejamento + do módulo
   Preços (Banco de Preços). Use quando a PORTIFÓLIO estiver vazia (os produtos estavam
   só no módulo Preços). Preserva estoque/pedido dos produtos já existentes.
   No editor, selecione "preencherPortifolio" e Executar. */
function preencherPortifolio(){
  var D = readData(), prods = produtosMerged(D);
  var P = ss().getSheetByName('PORTIFÓLIO') || ss().insertSheet('PORTIFÓLIO');
  if (P.getMaxColumns() < 23) P.insertColumnsAfter(P.getMaxColumns(), 23 - P.getMaxColumns());
  P.getRange(1, 1).setValue('PORTIFÓLIO — produtos');
  var phdr = blank(23);
  phdr[0]='EMPRESA'; phdr[1]='CLASSE'; phdr[2]='PRODUTO'; phdr[3]='ATIVO'; phdr[5]='UN';
  phdr[18]='VALOR'; phdr[19]='ESTOQUE'; phdr[20]='EM PEDIDO'; phdr[21]='CONSUMO (recom.)'; phdr[22]='SALDO';
  P.getRange(3, 1, 1, 23).setValues([phdr]);
  var maxLimpar = Math.max(P.getLastRow() - 3, prods.length, 1);
  P.getRange(4, 1, maxLimpar, 23).clearContent();
  var prows = [];
  prods.forEach(function(p, i){
    var L = 4 + i, row = blank(23);
    row[0]=p.empresa||''; row[1]=p.classe||''; row[2]=p.produto||''; row[3]=p.ativos||''; row[5]=p.un||'';
    row[18]=precoFormula(L); row[19]=p.estoque||0; row[20]=p.pedido||0; row[21]=consumoFormula(L); row[22]='=$T'+L+'-$V'+L;
    prows.push(row);
  });
  if (prows.length) P.getRange(4, 1, prows.length, 23).setValues(prows);
  P.setFrozenRows(3);
  var msg = 'PORTIFÓLIO preenchida com ' + prods.length + ' produto(s).';
  Logger.log(msg); try { ss().toast(msg, 'Pronto', 10); } catch (e) {}
  return msg;
}

/* ------------------------- REFORMATAR TALHÕES (rodar à mão) -------------------------
   Reaplica o layout bonito (resumo no topo, cabeçalho azul, colunas e fórmulas de
   custo, subtotais) em TODAS as abas de talhão desta planilha, sem criar outra.
   Use na planilha limpa que já está em uso. Preserva os dados (lê o plano de cada
   aba antes de reescrever). No editor, selecione "reformatarTalhoes" e Executar. */
function reformatarTalhoes(){
  var D = readData(), n = 0, nomes = [];
  (D.talhoes || []).forEach(function(t){
    var s = ss().getSheetByName(t.id); if (!s) return;
    var plano = (D.planos && D.planos[t.id]) || { principal:[], safrinha:[] };
    escreveAbaTalhao(s, t, plano); n++; nomes.push(t.id);
  });
  garantirCustoAreaPlantio();   // custo R$/ha por talhão na ÁREA PLANTIO
  var msg = 'Reformatado(s) ' + n + ' talhão(ões): ' + nomes.join(', ');
  Logger.log(msg);
  try { ss().toast(msg, 'Pronto', 10); } catch (e) {}
  return msg;
}

/* ------------------------- CORRIGIR DOSES (rodar à mão) -------------------------
   Converte para NÚMERO as doses que ficaram como TEXTO (ex.: "0,04" ao colar da
   planilha antiga), em todas as abas de talhão. Resolve o #VALUE! do Total/Custo e
   faz o app ler a dose certa. Não reescreve a aba (mexe só na coluna Dose).
   No editor, selecione "corrigirDoses" e Executar. */
function corrigirDoses(){
  var sheets = ss().getSheets(), total = 0, tocou = [];
  sheets.forEach(function(s){ var up = s.getName().toUpperCase();
    if (up.indexOf('TL') !== 0 && up.indexOf('NV') !== 0) return;
    var c = corrigeColunaDose(s, 10, 224) + corrigeColunaDose(s, 238, 451);
    if (c){ total += c; tocou.push(s.getName() + ' (' + c + ')'); }
  });
  var msg = total ? ('Doses corrigidas (texto→número): ' + total + ' — ' + tocou.join(', ')) : 'Nenhuma dose em texto encontrada.';
  Logger.log(msg); try { ss().toast(msg, 'Pronto', 10); } catch (e) {}
  return msg;
}
function corrigeColunaDose(s, r0, r1){
  var top = Math.min(r1, s.getMaxRows()); if (top < r0) return 0;
  var rng = s.getRange(r0, 9, top - r0 + 1, 1), vals = rng.getValues(), changed = 0, dirty = false;
  for (var i = 0; i < vals.length; i++){
    var v = vals[i][0];
    if (typeof v === 'string' && v.trim() !== ''){
      var t = v.trim(), num = N(t);
      if (num !== 0 || t === '0' || t === '0,0' || t === '0.0'){ vals[i][0] = num; changed++; dirty = true; }
    }
  }
  if (dirty) rng.setValues(vals);
  return changed;
}
// lista de produtos combinando o PORTIFÓLIO do planejamento + o portfólio do módulo
// Preços (Banco de Preços). Assim a aba PORTIFÓLIO não fica vazia quando os produtos
// estão cadastrados só no módulo Preços.
function produtosMerged(D){
  var map = {}, ordem = [];
  function add(p){ var nome = S(p.produto); if (!nome || map[nome]) return;
    map[nome] = { empresa:S(p.empresa), classe:S(p.classe), produto:nome, ativos:S(p.ativos), un:S(p.un),
      estoque:N(p.estoque), pedido:N(p.pedido) }; ordem.push(nome); }
  (D.produtos || []).forEach(add);
  var pa = D.precos_app && D.precos_app.safras;
  if (pa) Object.keys(pa).forEach(function(sf){ var s = pa[sf] || {};
    (s.refs  || []).forEach(function(r){ add({ produto:r.produto, classe:r.classe }); });
    (s.itens || []).forEach(function(it){ add({ produto:it.produto, classe:it.classe, empresa:it.empresa }); });
  });
  return ordem.map(function(k){ return map[k]; });
}
// array de n posições em branco
function blank(n){ var a = []; for (var i = 0; i < n; i++) a.push(''); return a; }
// fórmula do preço automático (busca o produto no Banco de Preços; 0 se não achar)
function precoFormula(L){
  var faixa = PRECOS_DB_ID
    ? 'IMPORTRANGE("' + PRECOS_DB_ID + '","PREÇOS!$A:$B")'
    : "'PREÇOS'!$A:$B";
  return '=IFERROR(VLOOKUP($C' + L + ',' + faixa + ',2,FALSE),0)';
}
// fórmula do consumo (soma as SAÍDAS do razão de estoque para o produto da linha)
function consumoFormula(L){
  var t = "'" + MOV_SHEET + "'!";
  return '=SUMIFS(' + t + '$E:$E,' + t + '$C:$C,$C' + L + ',' + t + '$B:$B,"SAÍDA")';
}
// converte uma célula em número tolerando texto no padrão BR (fragmento de fórmula)
function numCell(ref){
  return '(IFERROR(VALUE(' + ref + '),IFERROR(VALUE(SUBSTITUTE(TO_TEXT(' + ref + '),".",",")),0)))';
}
// custo R$/ha do talhão da linha L da ÁREA PLANTIO (puxa o D1 da aba do talhão pelo id em A)
function custoHaFormula(L){ return '=IFERROR(INDIRECT("\'"&$A' + L + '&"\'!$D$1"),0)'; }
function custoTotalFormula(L){ return '=IFERROR($J' + L + '*$E' + L + ',0)'; }
// garante as colunas de custo (J=CUSTO R$/ha, K=CUSTO TOTAL R$) numa aba ÁREA PLANTIO
function garantirCustoAreaPlantioIn(A){
  if (!A) return;
  A.getRange(1, 10).setValue('CUSTO R$/ha');
  A.getRange(1, 11).setValue('CUSTO TOTAL R$');
  var last = A.getLastRow(); if (last < 2) return;
  var ids = A.getRange(2, 1, last - 1, 1).getValues(), jf = [], kf = [];
  for (var i = 0; i < ids.length; i++){ var L = 2 + i, id = S(ids[i][0]);
    jf.push([id ? custoHaFormula(L) : '']); kf.push([id ? custoTotalFormula(L) : '']); }
  A.getRange(2, 10, jf.length, 1).setFormulas(jf);
  A.getRange(2, 11, kf.length, 1).setFormulas(kf);
  A.getRange(2, 10, jf.length, 2).setNumberFormat('R$ #,##0.00');
}
// versão para a planilha em uso (bound)
function garantirCustoAreaPlantio(){ garantirCustoAreaPlantioIn(sh('ÁREA PLANTIO')); }
/* Monta a aba de um talhão com as MESMAS colunas do app + resumo e custos:
   A=OPERAÇÃO · B=DAP (dias) · C=CLASSE · D=PRODUTO · E=DOSE/HA · F=UN ·
   G=PREÇO · H=CUSTO/HA · I=CUSTO TOTAL.
   Resumo no topo (Área, Produtividade, Cultura, Data de plantio, Custo R$/ha e R$/Sc).
   O app lê pelo cabeçalho (talColMap): B2=área, B3=cultura, B4=plantio, A=operação,
   B(op)=DAP, C=classe, D=produto, E=dose, F=unidade. */
var TAL_COLS = 9;
function escreveAbaTalhao(s, t, plano){
  if (s.getMaxRows() < 451) s.insertRowsAfter(s.getMaxRows(), 451 - s.getMaxRows());
  if (s.getMaxColumns() < TAL_COLS) s.insertColumnsAfter(s.getMaxColumns(), TAL_COLS - s.getMaxColumns());
  s.getRange(1, 1, 451, TAL_COLS).clearContent();
  s.getRange(1, 1, 451, TAL_COLS).setValues(talhaoMatrix(t, plano));
  estilizarTalhao(s);
}
function talhaoMatrix(t, plano){
  var N = 451, v = [];
  for (var i = 0; i < N; i++) v.push(blank(TAL_COLS));
  // ---- 1ª safra: resumo (linhas 1-4, o app lê B2/B3/B4), cabeçalho (9) e operações (10-224) ----
  resumoBloco(v, 1, (t.nome || t.id), t.area || 0, t.produtividade || 0, t.empreendimento || '', t.plantio || '', 10, 224);
  hdrRow(v, 9);
  preencheOps(v, plano.principal || [], 10, 17);
  // ---- safrinha: resumo (231-234), cabeçalho (237) e operações (238-451) ----
  resumoBloco(v, 231, (t.nome || t.id) + ' — Safrinha', t.area || 0, t.prod_safrinha || 0, t.emp_safrinha || '', t.plantio_safrinha || '', 238, 451);
  hdrRow(v, 237);
  preencheOps(v, plano.safrinha || [], 238, 17);
  return v;
}
// bloco de resumo do talhão a partir da linha r (1-based): título, área, produtividade, cultura, plantio + custos
function resumoBloco(v, r, titulo, area, prod, cultura, plantio, opR0, opR1){
  v[r - 1][1] = titulo;                              // B{r} título
  v[r - 1][2] = 'Custo estimado R$/ha';              // C{r}
  v[r - 1][3] = '=IFERROR(SUMIF($A' + opR0 + ':$A' + opR1 + ',"OPERA*",$H' + opR0 + ':$H' + opR1 + '),0)';  // D{r} total R$/ha
  v[r][0]     = 'Área:';                    v[r][1]     = area;                            // A{r+1} · B{r+1} (área)
  v[r][2]     = 'Produtividade estimada Sc/ha'; v[r][3] = prod;                            // C{r+1} · D{r+1}
  v[r + 1][0] = 'Empreendimento:';          v[r + 1][1] = cultura;                         // A{r+2} · B{r+2} (cultura)
  v[r + 1][2] = 'Custo estimado por Sc';    v[r + 1][3] = '=IFERROR($D' + r + '/$D' + (r + 1) + ',0)';  // C{r+2} · D{r+2}
  v[r + 2][0] = 'Data de plantio:';         v[r + 2][1] = plantio;                         // A{r+3} · B{r+3} (plantio)
}
// cabeçalho da tabela (mesmas colunas do app) na linha row
function hdrRow(v, row){
  var hdr = ['OPERAÇÃO','DAP (dias)','CLASSE','PRODUTO','DOSE/HA','UN','PREÇO','CUSTO/HA','CUSTO TOTAL'];
  for (var c = 0; c < TAL_COLS; c++) v[row - 1][c] = hdr[c];
}
// 12 operações a cada BLK linhas; cabeçalho "OPERAÇÃO n" (+DAP) + itens + fórmulas de custo
function preencheOps(v, ops, base, BLK){
  for (var k = 0; k < 12; k++){
    var r = base + k * BLK, first = r + 1, last = r + BLK - 1;   // linhas 1-based
    var op = ops[k];
    var nome = (op && op.nome) ? String(op.nome) : '';
    if (nome.toUpperCase().indexOf('OPERA') !== 0) nome = 'OPERAÇÃO ' + (k + 1);
    v[r - 1][0] = nome;                                           // A operação
    v[r - 1][1] = (op && op.dap) ? op.dap : '';                   // B DAP (dias após plantio)
    v[r - 1][7] = '=SUM($H' + first + ':$H' + last + ')';         // H subtotal custo/ha
    v[r - 1][8] = '=SUM($I' + first + ':$I' + last + ')';         // I subtotal custo total
    var itens = (op && op.itens) || [];
    for (var i = 0; i < itens.length && i < BLK - 1; i++){
      var it = itens[i], rr = r + 1 + i;
      v[rr - 1][2] = it.classe || '';   // C classe
      v[rr - 1][3] = it.produto || '';  // D produto
      v[rr - 1][4] = it.dose || 0;      // E dose/ha
      v[rr - 1][5] = it.un || '';       // F unidade
    }
    // fórmulas nas linhas de item (guardadas por D vazio; dose/área tolerantes a texto)
    for (var L = first; L <= last; L++){
      var dose = numCell('$E' + L), area = numCell('$B$2');
      v[L - 1][6] = '=IF($D' + L + '="","",IFERROR(VLOOKUP($D' + L + ',PORTIFÓLIO!$C:$S,17,0),0))';   // G preço unit.
      v[L - 1][7] = '=IF($D' + L + '="","",' + dose + '*$G' + L + ')';                                // H custo/ha = dose × preço
      v[L - 1][8] = '=IF($D' + L + '="","",$H' + L + '*' + area + ')';                                // I custo total = custo/ha × área
    }
  }
}
// visual: cabeçalho azul, moldura, formatos R$ e realce das operações (1ª safra + safrinha)
function estilizarTalhao(s){
  var AZUL = '#1f3864', CINZA = '#c9d3dd';
  // resumos (1ª safra: 1-4 · safrinha: 231-234)
  s.getRange('B1').setFontWeight('bold').setFontSize(12);
  s.getRange('B231').setFontWeight('bold').setFontSize(12);
  s.getRange('A2:A4').setFontWeight('bold');
  s.getRange('A232:A234').setFontWeight('bold');
  s.getRange('C1:C3').setFontWeight('bold').setFontColor('#5a6f75');
  s.getRange('C231:C233').setFontWeight('bold').setFontColor('#5a6f75');
  s.getRange('D1').setNumberFormat('R$ #,##0.00').setFontWeight('bold');
  s.getRange('D231').setNumberFormat('R$ #,##0.00').setFontWeight('bold');
  s.getRange('D3').setNumberFormat('R$ #,##0.00');
  s.getRange('D233').setNumberFormat('R$ #,##0.00');
  // cabeçalhos azuis (linha 9 e 237)
  s.getRange('A9:I9').setBackground(AZUL).setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setWrap(true);
  s.getRange('A237:I237').setBackground(AZUL).setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center').setWrap(true);
  // formatos de número em toda a faixa de operações
  s.getRange('B10:B451').setNumberFormat('0');           // DAP (inteiro)
  s.getRange('E10:E451').setNumberFormat('#,##0.00');    // dose/ha
  s.getRange('G10:I451').setNumberFormat('R$ #,##0.00'); // preço / custo/ha / custo total
  s.getRange('A9:I224').setBorder(true, true, true, true, true, true, CINZA, SpreadsheetApp.BorderStyle.SOLID);
  s.getRange('A237:I451').setBorder(true, true, true, true, true, true, CINZA, SpreadsheetApp.BorderStyle.SOLID);
  try { s.setColumnWidth(4, 240); } catch (e) {}
  s.setFrozenRows(9);
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=REGEXMATCH($A10,"^OPERA")')
    .setBackground('#dce6f4').setBold(true).setRanges([s.getRange('A10:I451')]).build();
  s.setConditionalFormatRules([rule]);
}
