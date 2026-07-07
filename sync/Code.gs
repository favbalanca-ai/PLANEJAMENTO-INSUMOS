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
function N(v){ var n = parseFloat(v); return isFinite(n) ? Math.round(n * 1e4) / 1e4 : 0; }

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
      var t = av[j], id = S(t[0]);
      if (id.toUpperCase().indexOf('TL') !== 0) continue;
      talhoes.push({ id:id, nome:S(t[1]), empreendimento:S(t[2]), produtividade:N(t[3]),
        area:N(t[4]), emp_safrinha:S(t[7]), prod_safrinha:N(t[8]) });
    }
  }

  var planos = {};
  talhoes.forEach(function(t){
    var s = sh(t.id); if (!s) return;
    var n = Math.min(451, s.getMaxRows());               // 1 leitura por aba (em vez de 4)
    var big = s.getRange(1, 1, n, 9).getValues();        // 0-based: linha L -> big[L-1]
    planos[t.id] = { area:N(big[1][1]), empreendimento:S(big[2][1]),
      principal: readOpsArr(big, 10, Math.min(224, n)), safrinha: readOpsArr(big, 238, Math.min(451, n)) };
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
    precos_cultura:precos, maquinas:maquinas };
}

// operações (com itens) de uma faixa de linhas — lê de um array já carregado (big[L-1])
function readOpsArr(big, r0, r1){
  var ops = [], cur = null;
  for (var L = r0; L <= r1; L++){
    var row = big[L - 1]; if (!row) continue;
    var a = S(row[0]), prod = S(row[2]);
    if (a.toUpperCase().indexOf('OPERA') === 0){ cur = { nome:a, itens:[] }; ops.push(cur); }
    if (prod && cur) cur.itens.push({ classe:S(row[1]), produto:prod, dose:N(row[8]), un:S(row[5]) });
  }
  return ops;   // TODAS as operações (por posição) — inclusive as vazias; o app revela/preenche os slots livres
}

/* ----------------------------- ESCRITA (EM LOTE) -----------------------------
   Agrupa as edições por aba e faz 1 leitura + escrita em bloco por aba, em vez
   de reler a aba e gravar célula por célula a cada edição. Bem mais rápido.
   Não toca em colunas de fórmula (D na aba do talhão; B2/B3; preço na PORTIFÓLIO). */
function applyEditsBatch(edits, out){
  var byTalhao = {}, port = [], area = [];
  edits.forEach(function(ed){
    var t = ed.type;
    if (t === 'estoque' || t === 'preco' || t === 'pedido') port.push(ed);
    else if (t === 'area' || t === 'produtividade' || t === 'empreendimento' || t === 'emp_safrinha' || t === 'prod_safrinha') area.push(ed);
    else if (ed.talhao) { (byTalhao[ed.talhao] = byTalhao[ed.talhao] || []).push(ed); }
    else { out.fail++; if (out.msgs.length < 10) out.msgs.push('tipo/sem talhão: ' + t); }
  });
  if (port.length) applyPortifolio(port, out);
  if (area.length) applyAreaPlantio(area, out);
  for (var tid in byTalhao) applyTalhao(tid, byTalhao[tid], out);
}

// PORTIFÓLIO: estoque (T=20) e EM PEDIDO em bloco; preço (S=19) individual (é fórmula/import)
function applyPortifolio(edits, out){
  var P = sh('PORTIFÓLIO');
  if (!P){ edits.forEach(function(){ out.fail++; }); if (out.msgs.length < 10) out.msgs.push('aba PORTIFÓLIO não encontrada'); return; }
  var pcol = pedidoColOf(P), r0 = 4, r1 = 433, nn = r1 - r0 + 1;
  var cvals = P.getRange(r0, 3, nn, 1).getValues();     // C = produto (mapa)
  var map = {};
  for (var i = 0; i < nn; i++){ var pr = S(cvals[i][0]); if (pr && !(pr in map)) map[pr] = r0 + i; }
  var est = P.getRange(r0, 20, nn, 1).getValues(), estDirty = false;
  var ped = P.getRange(r0, pcol, nn, 1).getValues(), pedDirty = false;
  edits.forEach(function(ed){
    try {
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
  var dirty = false;
  edits.forEach(function(ed){
    try {
      var faixa = ed.tag === 'S' ? [238, Math.min(451, n)] : [10, Math.min(224, n)];
      var op = opByIndex(vals, faixa[0], faixa[1], ed.op);
      if (ed.type === 'dose'){
        if (!op) throw 'operação não encontrada (dose)';
        var prodRows = op.body.filter(function(L){ return S(vals[L - 1][2]); });
        var Ld = prodRows[ed.item]; if (!Ld) throw 'insumo não localizado (dose, item ' + ed.item + ')';
        vals[Ld - 1][8] = ed.value; dirty = true; out.ok++;                 // I (col 9)
      } else if (ed.type === 'itemprod'){
        if (!op) throw 'operação não encontrada (troca)';
        var Lp = findInOp(vals, op, ed.from); if (!Lp) throw 'insumo não localizado (troca): ' + ed.from;
        vals[Lp - 1][2] = S(ed.to);                                         // C
        if (ed.classe) vals[Lp - 1][1] = S(ed.classe);                      // B
        dirty = true; out.ok++;
      } else if (ed.type === 'additem'){
        if (!op) throw 'operação não encontrada (add)';
        var La = findInOp(vals, op, ed.produto) || firstEmptyInOp(vals, op);
        if (!La) throw 'sem linha vazia na operação';
        vals[La - 1][2] = S(ed.produto);                                    // C
        vals[La - 1][8] = N(ed.dose);                                       // I
        if (ed.classe) vals[La - 1][1] = S(ed.classe);                      // B
        dirty = true; out.ok++;
      } else if (ed.type === 'delitem'){
        if (op){ var Lx = findInOp(vals, op, ed.produto);
          if (Lx){ vals[Lx - 1][1] = ''; vals[Lx - 1][2] = ''; vals[Lx - 1][8] = ''; dirty = true; } }
        out.ok++;                                                           // idempotente
      } else { throw 'tipo desconhecido p/ talhão: ' + ed.type; }
    } catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push(String(err)); }
  });
  if (dirty){
    var wr0 = 10, wn = n - wr0 + 1;                 // só as faixas das operações (não toca em B2/B3)
    var bc = [], ii = [];
    for (var L = wr0; L <= n; L++){ bc.push([vals[L - 1][1], vals[L - 1][2]]); ii.push([vals[L - 1][8]]); }
    s.getRange(wr0, 2, wn, 2).clearDataValidations();   // tira validações de B:C do bloco de uma vez
    s.getRange(wr0, 2, wn, 2).setValues(bc);            // B:C
    s.getRange(wr0, 9, wn, 1).setValues(ii);            // I (dose) — D fica intacta (fórmula)
  }
}

// operação opIdx (por POSIÇÃO — inclui as vazias, igual ao app) dentro da faixa, no array em memória
function opByIndex(vals, r0, r1, opIdx){
  var blocks = [], cur = null;
  for (var L = r0; L <= r1; L++){ var row = vals[L - 1]; if (!row) continue;
    var a = S(row[0]);
    if (a.toUpperCase().indexOf('OPERA') === 0){ cur = { body: [], has: false }; blocks.push(cur); }
    else if (cur){ cur.body.push(L); if (S(row[2])) cur.has = true; }
  }
  return blocks[opIdx] || null;
}
function findInOp(vals, op, produto){
  for (var j = 0; j < op.body.length; j++){ var L = op.body[j]; if (S(vals[L - 1][2]) === S(produto)) return L; }
  return 0;
}
function firstEmptyInOp(vals, op){
  for (var j = 0; j < op.body.length; j++){ var L = op.body[j]; if (!S(vals[L - 1][2])) return L; }
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
    var edits = JSON.parse(e.postData.contents);
    applyEditsBatch(edits, out);      // grava em lote (rápido)
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
