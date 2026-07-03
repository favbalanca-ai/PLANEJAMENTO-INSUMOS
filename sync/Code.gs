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
    var pv = P.getRange(4, 1, 412, 20).getValues(); // linhas 4..415, colunas A..T
    for (var i = 0; i < pv.length; i++){
      var r = pv[i], prod = S(r[2]);            // C = produto
      if (!prod) continue;
      produtos.push({ empresa:S(r[0]), classe:S(r[1]), produto:prod, ativos:S(r[3]),
        un:S(r[5]), preco:N(r[18]), estoque:N(r[19]) }); // S=preço(19), T=estoque(20)
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
  return ops.filter(function(o){ return o.itens.length; });
}

/* ----------------------------- ESCRITA ----------------------------- */
function applyEdit(ed){
  if (ed.type === 'estoque' || ed.type === 'preco'){
    var P = sh('PORTIFÓLIO'), col = ed.type === 'estoque' ? 20 : 19;
    var rr = findRow(P, 3, 4, 433, ed.produto);
    if (!rr) throw 'produto não encontrado: ' + ed.produto;
    P.getRange(rr, col).setValue(ed.value);
  } else if (ed.type === 'area' || ed.type === 'produtividade'){
    var A = sh('ÁREA PLANTIO'), col2 = ed.type === 'area' ? 5 : 4;
    var rr2 = findRow(A, 1, 2, A.getLastRow(), ed.talhao);
    if (!rr2) throw 'talhão não encontrado: ' + ed.talhao;
    A.getRange(rr2, col2).setValue(ed.value);
  } else if (ed.type === 'empreendimento' || ed.type === 'emp_safrinha' || ed.type === 'prod_safrinha'){
    var Ae = sh('ÁREA PLANTIO');
    var re = findRow(Ae, 1, 2, Ae.getLastRow(), ed.talhao);
    if (!re) throw 'talhão não encontrado: ' + ed.talhao;
    var colE = ed.type === 'empreendimento' ? 3 : (ed.type === 'emp_safrinha' ? 8 : 9); // C / H / I
    Ae.getRange(re, colE).setValue(ed.type === 'prod_safrinha' ? N(ed.value) : S(ed.value));
    // obs.: a aba do talhão (B3) costuma referenciar 'ÁREA PLANTIO'!C por fórmula — não sobrescrever
  } else if (ed.type === 'itemprod'){
    var si = sh(ed.talhao); if (!si) throw 'aba não encontrada: ' + ed.talhao;
    var fi = ed.tag === 'S' ? [238, 451] : [10, 224];
    var ri = itemRowByName(si, fi[0], fi[1], ed.op, ed.from);
    if (!ri) throw 'insumo não localizado (troca): ' + ed.from;
    si.getRange(ri, 3).setValue(S(ed.to));                    // C = produto novo
    setClasseSafe(si, ri, S(ed.classe));                      // B = classe (best-effort; pode ter validação)
  } else if (ed.type === 'dose'){
    var s = sh(ed.talhao); if (!s) throw 'aba não encontrada: ' + ed.talhao;
    var faixa = ed.tag === 'S' ? [238, 451] : [10, 224];
    var row = itemRow(s, faixa[0], faixa[1], ed.op, ed.item);
    if (!row) throw 'insumo não localizado em ' + ed.talhao + ' (op ' + ed.op + ', item ' + ed.item + ')';
    s.getRange(row, 9).setValue(ed.value); // I = dose/ha
  } else if (ed.type === 'additem'){
    var sa = sh(ed.talhao); if (!sa) throw 'aba não encontrada: ' + ed.talhao;
    var fa = ed.tag === 'S' ? [238, 451] : [10, 224];
    // idempotente: se o produto já existe na operação, atualiza a linha dele; senão usa a 1ª vazia
    var nr = itemRowByName(sa, fa[0], fa[1], ed.op, ed.produto);
    if (!nr) nr = emptyItemRow(sa, fa[0], fa[1], ed.op);
    if (!nr) throw 'sem linha vazia na operação ' + ed.op + ' de ' + ed.talhao;
    sa.getRange(nr, 3).setValue(S(ed.produto)); // C = produto
    sa.getRange(nr, 9).setValue(N(ed.dose));    // I = dose/ha
    setClasseSafe(sa, nr, S(ed.classe));        // B = classe (best-effort; a coluna pode ter validação)
  } else if (ed.type === 'delitem'){
    var sx = sh(ed.talhao); if (!sx) throw 'aba não encontrada: ' + ed.talhao;
    var fx = ed.tag === 'S' ? [238, 451] : [10, 224];
    var dr = itemRowByName(sx, fx[0], fx[1], ed.op, ed.produto);
    if (dr){ sx.getRange(dr, 2).clearContent(); sx.getRange(dr, 3).clearContent(); sx.getRange(dr, 9).clearContent(); }
    // se não achou (já removido), não falha — o objetivo (insumo ausente) já está atendido
  } else {
    throw 'tipo desconhecido: ' + ed.type;
  }
}

// grava a classe (coluna B) sem falhar se a célula tiver validação de dados que recuse o valor
function setClasseSafe(sheet, row, classe){
  if (!classe) return;
  try { sheet.getRange(row, 2).setValue(classe); }
  catch (e) { /* B tem validação e recusou a classe — mantém o insumo (produto/dose já gravados) */ }
}

// linha do insumo (pela classe/produto) dentro do bloco da operação opIdx
function itemRowByName(s, r0, r1, opIdx, produto){
  var rows = s.getRange(r0, 1, r1 - r0 + 1, 3).getValues(), blocks = [], cur = null;
  for (var i = 0; i < rows.length; i++){
    var a = S(rows[i][0]);
    if (a.toUpperCase().indexOf('OPERA') === 0){ cur = { body: [], has: false }; blocks.push(cur); }
    else if (cur){ cur.body.push(i); if (S(rows[i][2])) cur.has = true; }
  }
  var withItems = blocks.filter(function(b){ return b.has; });
  var b = withItems[opIdx];
  if (!b) return 0;
  for (var j = 0; j < b.body.length; j++){ if (S(rows[b.body[j]][2]) === S(produto)) return r0 + b.body[j]; }
  return 0;
}

// primeira linha vazia (coluna C) dentro do bloco da operação opIdx (blocos contam só operações com itens — igual ao app)
function emptyItemRow(s, r0, r1, opIdx){
  var rows = s.getRange(r0, 1, r1 - r0 + 1, 3).getValues(), blocks = [], cur = null;
  for (var i = 0; i < rows.length; i++){
    var a = S(rows[i][0]);
    if (a.toUpperCase().indexOf('OPERA') === 0){ cur = { body: [], has: false }; blocks.push(cur); }
    else if (cur){ cur.body.push(i); if (S(rows[i][2])) cur.has = true; }
  }
  var withItems = blocks.filter(function(b){ return b.has; });
  var b = withItems[opIdx];
  if (!b) return 0;
  for (var j = 0; j < b.body.length; j++){ if (!S(rows[b.body[j]][2])) return r0 + b.body[j]; }
  return 0; // bloco cheio (sem linha livre)
}

function findRow(s, col, r0, r1, alvo){
  var vals = s.getRange(r0, col, r1 - r0 + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++){ if (S(vals[i][0]) === S(alvo)) return r0 + i; }
  return 0;
}

// linha da célula de dose do item (opIdx/itemIdx contam só operações com itens — igual ao app)
function itemRow(s, r0, r1, opIdx, itemIdx){
  var rows = s.getRange(r0, 1, r1 - r0 + 1, 3).getValues(), ops = [], cur = null;
  for (var i = 0; i < rows.length; i++){
    var a = S(rows[i][0]), prod = S(rows[i][2]);
    if (a.toUpperCase().indexOf('OPERA') === 0){ cur = []; ops.push(cur); }
    if (prod && cur) cur.push(r0 + i);
  }
  var f = ops.filter(function(o){ return o.length; });
  return (f[opIdx] && f[opIdx][itemIdx] != null) ? f[opIdx][itemIdx] : 0;
}

/* ----------------------------- ENDPOINTS ----------------------------- */
function json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e){ return json(readData()); }

function doPost(e){
  var out = { ok:0, fail:0, msgs:[] };
  try {
    var edits = JSON.parse(e.postData.contents);
    edits.forEach(function(ed){
      try { applyEdit(ed); out.ok++; }
      catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push(String(err)); }
    });
  } catch(err){ out.msgs.push('payload inválido: ' + err); }
  return json(out);
}
