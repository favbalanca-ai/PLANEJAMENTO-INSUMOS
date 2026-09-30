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
// Os dados saem em DUAS partes, cada uma com seu cache (ver currentJson):
//  BASE = portfólio, talhões e planos (lê as ~20 abas de talhão), DRE, máquinas, preços, equipe (planilhas externas)
//         -> pesada; só muda quando alguém edita a planilha ou o app grava dose/estoque/preço etc.
//  APP  = compras, saídas, tarefas, execução, resultados, limites, NF-e... -> leve; muda a toda hora pelo app.
function readData(){
  var b = readBase_(), a = readAppPart_();
  for (var k in a) b[k] = a[k];
  return b;
}
function readBase_(){
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
    var n = s.getMaxRows();                              // sem teto: a aba cresce quando há mais de 12 operações
    var big = s.getRange(1, 1, n, 9).getValues();        // 0-based: linha L -> big[L-1]
    var m = talColMap(big[8]);                           // colunas detectadas pelo cabeçalho (linha 9)
    var split = findSafraSplit(big, n, m);               // linha do 2º cabeçalho = início da safrinha
    var pR1 = (split > 0) ? split - 1 : Math.min(224, n);
    var sR0 = (split > 0) ? split + 1 : 238;
    var psr = plantioSafRow(big, n, split);                               // MESMA regra da escrita (rótulo ou linha padrão)
    var plantioSaf = (psr > 0 && big[psr - 1]) ? dateISO(big[psr - 1][1]) : '';
    var cicloSaf = (split > 0) ? N(resumoVal(big, Math.max(5, split - 8), split - 1, 'CICLO')) : 0;
    planos[t.id] = { area:N(big[1][1]), empreendimento:S(big[2][1]), plantio:dateISO(big[3][1]), plantio_safrinha:plantioSaf,
      ciclo:N(resumoVal(big, 1, 8, 'CICLO')), ciclo_safrinha:cicloSaf,                       // ciclo da cultura (dias) -> colheita estimada
      principal: readOpsArr(big, 10, pR1, m), safrinha: readOpsArr(big, sR0, n, m) };
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
    precos_cultura:precos, maquinas:maquinas, precos_app:readPrecosSheet(), equipe_sst:readEquipeSST() };
}
function readAppPart_(){
  try {
    if (sh(NFE_IDX_SHEET)) _CTR_MEMO_ = nfeContratos_();   // contratos: calcula 1x só (resumo e estados usam)
    return { retornos:readRetornos(), movimentacao:readMovimentacao(), tarefas_app:readTarefasApp(), realizado_app:readRealizadoApp(),
      result_app:readMapApp('RESULTADO APP'), opplan_app:readMapApp('PLANO OPS APP'),
      limites_app:readMapApp('LIMITES APP'), compras_app:readMapApp('COMPRAS APP'), depara_nfe:readDeParaNfe(), nfe_resumo:nfeResumo_(), nfe_estados:nfeEstados_() };
  } finally { _CTR_MEMO_ = null; }
}
// ---- Equipe puxada do sistema de RH / SST (planilha SEPARADA) ----
// Cole o ID **ou** a URL da planilha de RH (a "SST_GoogleSheets_BancoDeDados").
// O ID é a parte entre /d/ e /edit — ex.: https://docs.google.com/spreadsheets/d/AQUI_O_ID/edit
// (pode colar a URL inteira que o código extrai o ID). NÃO é a URL do Web App (/exec).
// Deixe '' para procurar uma aba SST/EQUIPE dentro da própria planilha de planejamento.
var SST_DB_ID = '1y-lZPzzJkj-F2at99XrEpCeUJ2MYjA1Ddf3sgzeYXGw';
// extrai o ID de uma URL de planilha; ignora URLs de Web App (/exec) e outras
function _sstId(){
  var v = String(SST_DB_ID||'').trim(); if (!v) return '';
  var m = v.match(/\/d\/([a-zA-Z0-9_-]{20,})/); if (m) return m[1];   // URL de planilha
  if (/^https?:/i.test(v)) return '';                                 // qualquer outra URL: inválida aqui
  return v;                                                           // já é o ID puro
}
function sstSS(){
  var id = _sstId();
  if (id){ try { return SpreadsheetApp.openById(id); } catch(e){ return null; } }  // ID externo: não cai na planilha local
  return ss();                                                        // sem ID: procura aba na própria planilha
}
// abas internas do app que NUNCA são equipe (evita ler "EQUIPE APP", "TAREFAS APP"...)
function _isAppTab(nm){ nm = String(nm||'').toUpperCase(); return / APP$/.test(nm) || nm.indexOf('MOVIMENTA')>=0 || nm.indexOf(' APP ')>=0; }
// Detecta a aba (FUNCIONARIOS / BancoDeDados / SST / EQUIPE / RH...) e as colunas
// (nome, função, setor/unidade, status) pelo cabeçalho. Retorna só quem está ATIVO.
function readEquipeSST(){
  var b = sstSS(); if (!b) return [];               // ID configurado mas ilegível
  var all = b.getSheets();
  var pref = ['FUNCIONARIOS','FUNCIONÁRIOS','BANCODEDADOS','BANCO DE DADOS','SST','EQUIPE SST','EQUIPE','01_RH_MESTRE','RH_MESTRE','COLABORADORES','PESSOAL'];
  var ordered = [];
  for (var p=0;p<pref.length;p++){ for (var i=0;i<all.length;i++){ var nm=all[i].getName().toUpperCase().trim();
    if (_isAppTab(nm)) continue;
    if (nm===pref[p] || (pref[p].length>=4 && nm.indexOf(pref[p])>=0)) { if (ordered.indexOf(all[i])<0) ordered.push(all[i]); } } }
  for (var j=0;j<all.length;j++){ if (!_isAppTab(all[j].getName()) && ordered.indexOf(all[j])<0) ordered.push(all[j]); }
  for (var s=0;s<ordered.length;s++){
    var got = _parseEquipeSheet(ordered[s]);
    if (got && got.length) return got;   // primeira aba que tem gente vence
  }
  return [];
}
function _parseEquipeSheet(sh){
  if (!sh) return []; var last = sh.getLastRow(); if (last < 1) return [];
  var lastCol = Math.max(2, Math.min(30, sh.getLastColumn()));
  var grid = sh.getRange(1, 1, last, lastCol).getValues();
  var hdrRow=-1, cFull=-1, cShort=-1, cFunc=-1, cSetor=-1, cUnid=-1, cStatus=-1, cId=-1;
  for (var h=0; h<Math.min(grid.length, 10); h++){
    var row = grid[h]; var full=-1, sht=-1, fun=-1, set=-1, uni=-1, sta=-1, idc=-1;
    for (var c=0;c<row.length;c++){
      var t = S(row[c]).toUpperCase().replace(/_/g,' ');
      if (full<0 && t.indexOf('NOME COMPLETO')>=0) full=c;
      if (sht<0 && (t==='NOME CURTO' || t==='NOME'|| t.indexOf('NOME CURTO')>=0)) sht=c;
      if (full<0 && sht<0 && (t.indexOf('FUNCIONÁRIO')>=0 || t.indexOf('FUNCIONARIO')>=0 || t.indexOf('COLABORADOR')>=0)) full=c;
      if (fun<0 && (t==='FUNCAO' || t==='FUNÇÃO' || t.indexOf('FUNCAO')>=0 || t.indexOf('FUNÇÃO')>=0 || t==='CARGO' || t.indexOf('CARGO')>=0)) fun=c;
      if (set<0 && (t==='SETOR' || t.indexOf('SETOR')>=0)) set=c;
      if (uni<0 && (t==='UNIDADE' || t.indexOf('UNIDADE')>=0 || t.indexOf('FAZENDA')>=0)) uni=c;
      if (sta<0 && (t==='STATUS' || t.indexOf('STATUS')>=0 || t==='SITUACAO' || t.indexOf('SITUAÇÃO')>=0)) sta=c;
      if (idc<0 && (t==='ID' || t==='ID FUNC' || t.indexOf('ID FUNC')>=0 || t==='MATRICULA' || t.indexOf('MATRÍCULA')>=0)) idc=c;
    }
    if (full>=0 || sht>=0){ hdrRow=h; cFull=full; cShort=sht; cFunc=fun; cSetor=set; cUnid=uni; cStatus=sta; cId=idc; break; }
  }
  var cSet = cSetor>=0 ? cSetor : cUnid;               // sem SETOR? usa UNIDADE (fazenda)
  var out=[], seen={};
  if (hdrRow < 0){
    // sem cabeçalho reconhecido: col A = nome, col B = função
    for (var r0=0; r0<grid.length; r0++){
      var nm0=S(grid[r0][0]); if(!nm0) continue; var up0=nm0.toUpperCase();
      if (up0==='NOME'||up0.indexOf('FUNCION')>=0||up0.indexOf('COLABORADOR')>=0) continue;
      var k0=up0; if(seen[k0]) continue; seen[k0]=1;
      out.push({ id:'sst:'+nm0, nome:nm0, funcao:(lastCol>=2?S(grid[r0][1]):''), setor:'', sst:true });
    }
    return out;
  }
  for (var r=hdrRow+1; r<grid.length; r++){
    var full = cFull>=0 ? S(grid[r][cFull]) : '';
    var sh1  = cShort>=0 ? S(grid[r][cShort]) : '';
    var nome = full || sh1; if (!nome) continue;
    var status = cStatus>=0 ? S(grid[r][cStatus]).toUpperCase() : '';
    if (status && (status.indexOf('DESLIG')>=0 || status.indexOf('DEMIT')>=0 || status.indexOf('EX-')>=0 || status.indexOf('EX ')>=0 || status.indexOf('INATIV')>=0 || status.indexOf('AFAST')>=0)) continue; // fora: só time ativo
    var idf = cId>=0 ? S(grid[r][cId]) : '';
    var display = sh1 || full;                          // nome curto é melhor no quadro
    var key = (idf||display).toUpperCase(); if (seen[key]) continue; seen[key]=1;
    out.push({ id:'sst:'+(idf||display), nome:display, nomeCompleto:full||display,
      funcao: cFunc>=0 ? S(grid[r][cFunc]) : '', setor: cSet>=0 ? S(grid[r][cSet]) : '', sst:true });
  }
  return out;
}
// ---- Execução das operações de campo (OV.realizado): sincroniza status entre aparelhos ----
var REALIZADO_SHEET_APP = 'REALIZADO APP';
function readRealizadoApp(){
  var b = ss(), s = b.getSheetByName(REALIZADO_SHEET_APP), out = {};
  if (!s) return out; var last = s.getLastRow(); if (last < 2) return out;
  var v = s.getRange(2,1,last-1,2).getValues();
  for (var i=0;i<v.length;i++){ var k=S(v[i][0]); if(!k) continue; try { out[k]=JSON.parse(v[i][1]); } catch(e){} }
  return out;
}
function writeRealizadoApp(map){
  map = map || {}; var b = ss(), s = b.getSheetByName(REALIZADO_SHEET_APP) || b.insertSheet(REALIZADO_SHEET_APP);
  var cur = readRealizadoApp();                       // merge por chave: mantém o mais recente (_u)
  for (var k in map){ var inc = map[k]; if(!inc || typeof inc!=='object') continue;
    var iu = +inc._u||0, lu = (cur[k] && +cur[k]._u)||0; if(!cur[k] || iu>=lu) cur[k]=inc; }
  var rows = [['KEY','JSON','ATUALIZADO']];
  for (var kk in cur){ rows.push([kk, JSON.stringify(cur[kk]), (cur[kk] && cur[kk]._u)||'']); }
  s.clearContents(); s.getRange(1,1,rows.length,3).setValues(rows); try { s.setFrozenRows(1); } catch(e){}
  return { rows: rows.length-1 };
}
// mapa genérico chave->JSON (merge por chave pelo _u) numa aba KEY|JSON|ATUALIZADO — usado por Resultados
function readMapApp(name){
  var b = ss(), s = b.getSheetByName(name), out = {};
  if (!s) return out; var last = s.getLastRow(); if (last < 2) return out;
  var v = s.getRange(2,1,last-1,2).getValues();
  for (var i=0;i<v.length;i++){ var k=S(v[i][0]); if(!k) continue; try { out[k]=JSON.parse(v[i][1]); } catch(e){} }
  return out;
}
function writeMapApp(name, map){
  map = map || {}; var b = ss(), s = b.getSheetByName(name) || b.insertSheet(name);
  var cur = readMapApp(name);
  for (var k in map){ var inc = map[k]; if(!inc || typeof inc!=='object') continue;
    var iu = +inc._u||0, lu = (cur[k] && +cur[k]._u)||0; if(!cur[k] || iu>=lu) cur[k]=inc; }
  var rows = [['KEY','JSON','ATUALIZADO']];
  for (var kk in cur){ rows.push([kk, JSON.stringify(cur[kk]), (cur[kk] && cur[kk]._u)||'']); }
  s.clearContents(); s.getRange(1,1,rows.length,3).setValues(rows); try { s.setFrozenRows(1); } catch(e){}
  return { rows: rows.length-1 };
}
// ---- Módulo Tarefas: equipe + tarefas (sincroniza entre aparelhos) ----
var EQUIPE_SHEET = 'EQUIPE APP', TAREFAS_SHEET_APP = 'TAREFAS APP';
function _fmtISO(v){ if (v instanceof Date){ return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } return S(v).slice(0,10); }
function readTarefasApp(){
  var b = ss(), out = { funcionarios:[], tarefas:[] };
  var se = b.getSheetByName(EQUIPE_SHEET);
  if (se){ var l1 = se.getLastRow(); if (l1 >= 2){ var v1 = se.getRange(2,1,l1-1,3).getValues();
    for (var i=0;i<v1.length;i++){ var r=v1[i]; if(!S(r[0])) continue; out.funcionarios.push({ id:S(r[0]), nome:S(r[1]), funcao:S(r[2]) }); } } }
  var st = b.getSheetByName(TAREFAS_SHEET_APP);
  if (st){ var l2 = st.getLastRow(); if (l2 >= 2){ var v2 = st.getRange(2,1,l2-1,9).getValues();
    for (var j=0;j<v2.length;j++){ var t=v2[j]; if(!S(t[0])) continue;
      out.tarefas.push({ id:S(t[0]), titulo:S(t[1]), talhaoId:S(t[2]), funcionarioId:S(t[3]), inicio:_fmtISO(t[4]), dias:N(t[5])||1, status:S(t[6])||'afazer', obs:S(t[7]), opKey:S(t[8]) }); } } }
  return out;
}
function writeTarefasApp(obj){
  obj = obj || {}; var eq = obj.funcionarios || [], tf = obj.tarefas || [], b = ss();
  var se = b.getSheetByName(EQUIPE_SHEET) || b.insertSheet(EQUIPE_SHEET);
  se.clearContents();
  var er = [['ID','NOME','FUNCAO']];
  eq.forEach(function(f){ er.push([S(f.id), S(f.nome), S(f.funcao)]); });
  se.getRange(1,1,er.length,3).setValues(er); try { se.setFrozenRows(1); } catch(e){}
  var st = b.getSheetByName(TAREFAS_SHEET_APP) || b.insertSheet(TAREFAS_SHEET_APP);
  st.clearContents();
  var tr = [['ID','TITULO','TALHAO','RESPONSAVEL_ID','INICIO','DIAS','STATUS','OBS','OPKEY']];
  tf.forEach(function(t){ tr.push([S(t.id), S(t.titulo), S(t.talhaoId), S(t.funcionarioId), S(t.inicio), N(t.dias)||1, S(t.status), S(t.obs), S(t.opKey)]); });
  if (tf.length) st.getRange(2,5,tf.length,1).setNumberFormat('@');   // coluna INICIO como texto (não vira data)
  st.getRange(1,1,tr.length,9).setValues(tr); try { st.setFrozenRows(1); } catch(e){}
  return { rows: eq.length + tf.length };
}

/* --------- RETORNOS DE APLICAÇÃO (baixa do operador pela página retorno.html) ---------
   O operador abre o link do WhatsApp, dosa no tanque e informa o volume TOTAL usado de
   cada produto. Isso cai aqui via doPost ({__retorno:{...}}) e vira 1 linha por produto
   na aba "RETORNOS APP". O app puxa esses retornos, preenche o "Utilizado" da recomendação
   (casando pelo id) e o Adm aprova para o histórico. */
var RETORNOS_SHEET = 'RETORNOS APP';
var MOV_SHEET = 'MOVIMENTAÇÃO ESTOQUE';   // razão de estoque: entradas (módulo futuro) e saídas (recomendações)
// registra 1 linha no razão de estoque (cria a aba se faltar). "when" opcional (data do movimento)
function movSheet_(){
  var s = ss().getSheetByName(MOV_SHEET);
  if (!s){ s = ss().insertSheet(MOV_SHEET);
    s.appendRow(['DATA/HORA','TIPO','PRODUTO','UN','QTD','ORIGEM','OBS']); s.setFrozenRows(1); }
  return s;
}
function logMovimentacao(tipo, produto, un, qtd, origem, obs, when){
  movSheet_().appendRow([when || new Date(), S(tipo), S(produto), S(un), N(qtd), S(origem), S(obs)]);
}
// grava VÁRIAS linhas no razão de uma vez (1 escrita em vez de 1 por linha — bem mais rápido)
function movAppendRows_(rows){
  if (!rows.length) return 0;
  var s = movSheet_(), last = s.getLastRow(), falta = last + rows.length - s.getMaxRows();
  if (falta > 0) s.insertRowsAfter(s.getMaxRows(), falta);
  s.getRange(last + 1, 1, rows.length, 7).setValues(rows);
  return rows.length;
}
// apaga do razão as linhas de VÁRIOS ids [#id] numa passada (linhas seguidas saem juntas)
function movDeleteBySources_(ids){
  var s = ss().getSheetByName(MOV_SHEET); if (!s || !ids.length) return;
  var last = s.getLastRow(); if (last < 2) return;
  var set = {}; ids.forEach(function(id){ set[S(id)] = 1; });
  var org = s.getRange(2, 6, last - 1, 1).getValues(), fim = -1;
  for (var i = org.length - 1; i >= -1; i--){
    var mt = i >= 0 ? S(org[i][0]).match(/\[#([^\]]+)\]/) : null, del = !!(mt && set[mt[1]]);
    if (del && fim < 0) fim = i;
    if (!del && fim >= 0){ s.deleteRows(i + 3, fim - i); fim = -1; }   // bloco i+1..fim (0-based) = linhas i+3..fim+2
  }
}
// soma ENTRADA e SAÍDA por produto no razão (fonte COMPARTILHADA entre aparelhos: todo
// aparelho puxa isto e vê o mesmo saldo, não importa quem registrou a compra/aprovou a recom).
function readMovimentacao(){
  var s = ss().getSheetByName(MOV_SHEET), ent = {}, sai = {}, nfe = {};
  if (!s) return { entradas:ent, saidas:sai, nfe:nfe };
  var last = s.getLastRow(); if (last < 2) return { entradas:ent, saidas:sai, nfe:nfe };
  var v = s.getRange(2, 1, last - 1, 6).getValues();   // DATA/HORA, TIPO, PRODUTO, UN, QTD, ORIGEM
  for (var i = 0; i < v.length; i++){
    var tipo = S(v[i][1]).toUpperCase(), prod = S(v[i][2]), qtd = N(v[i][4]);
    // NF-e que já deu entrada: etiqueta [#chave de 44 dígitos] no ORIGEM (o app bloqueia importar de novo)
    var mk = S(v[i][5]).match(/\[#(\d{44})\]/);
    if (mk && tipo.indexOf('ENTRADA') === 0 && !nfe[mk[1]]) nfe[mk[1]] = (v[i][0] instanceof Date) ? Utilities.formatDate(v[i][0], Session.getScriptTimeZone(), 'yyyy-MM-dd') : S(v[i][0]).slice(0,10);
    if (!prod || !qtd) continue;
    if (tipo.indexOf('ENTRADA') === 0) ent[prod] = (ent[prod] || 0) + qtd;
    else if (tipo.indexOf('SA') === 0) sai[prod] = (sai[prod] || 0) + qtd;   // SAÍDA / SAIDA
  }
  return { entradas:ent, saidas:sai, nfe:nfe };
}
// remove do razão as linhas cujo ORIGEM contenha a etiqueta [#id] (idempotência: reenviar não duplica)
function movDeleteBySource(id){ movDeleteBySources_([id]); }
// ENTRADA de estoque (compra registrada no app): 1 linha por produto na MOVIMENTAÇÃO ESTOQUE.
// Idempotente pelo id da compra (etiqueta [#id] no ORIGEM): reenviar a mesma compra não duplica.
function writeEntrada(ent){
  if (ent && ent.id) movDeleteBySources_([ent.id]);
  return { rows:movAppendRows_(entradaRows_(ent)) };
}
// linhas de ENTRADA de uma compra (sem gravar)
function entradaRows_(ent){
  var itens = (ent && ent.itens) || [], rows = [];
  var when = new Date();
  if (ent && ent.data && /^\d{4}-\d{2}-\d{2}/.test(String(ent.data))) when = new Date(String(ent.data).slice(0,10) + 'T12:00:00');
  var ehNfe = /^\d{44}$/.test(S(ent && ent.id));
  var origem = (ehNfe ? 'NF-e' : 'Compra') + (ent.nf ? (ehNfe ? ' ' : ' NF ') + S(ent.nf) : '') + (ent.fornecedor ? ' · ' + S(ent.fornecedor) : '') + (ent.id ? ' [#' + S(ent.id) + ']' : '');
  for (var i = 0; i < itens.length; i++){ var it = itens[i]; if (!S(it.produto)) continue;
    rows.push([when, 'ENTRADA', S(it.produto), S(it.un), N(it.qtd), origem, S(ent.obs)]); }
  return rows;
}
// Lista "Compras registradas" do app, compartilhada entre aparelhos: aba COMPRAS APP (KEY|JSON|ATUALIZADO,
// merge pelo _u). Grava a entrada no razão E guarda o registro inteiro. del:true = compra excluída:
// tira as linhas [#id] do razão e deixa uma "lápide" {id,del,_u} para os outros aparelhos apagarem também.
// Várias compras numa requisição só ({__entradas:[…]}): 1 leitura/escrita do razão e da COMPRAS APP.
function writeComprasApp(lista){
  lista = lista || []; var cur = readMapApp('COMPRAS APP'), m = {}, del = [], rows = [], ids = [];
  lista.forEach(function(ent){ ent = ent || {}; var id = S(ent.id), u = +ent._u || Date.now(); if (!id) return;
    ids.push(id);                                                        // confirmado (gravado ou já tinha mais novo)
    if (cur[id] && (+cur[id]._u || 0) > u) return;                       // já existe versão mais nova (ex.: excluída em outro aparelho)
    del.push(id);
    if (!ent.del) rows = rows.concat(entradaRows_(ent));
    m[id] = ent.del ? { id:id, del:true, _u:u }
      : { id:id, fornecedor:S(ent.fornecedor), data:S(ent.data), nf:S(ent.nf), obs:S(ent.obs), itens:ent.itens || [],
          nfe:ent.nfe || null, ts:ent.ts || null, _u:u }; });
  movDeleteBySources_(del);
  var n = movAppendRows_(rows);
  if (Object.keys(m).length) writeMapApp('COMPRAS APP', m);
  return { rows:n, ids:ids };
}
function writeCompraApp(ent){ return writeComprasApp([ent || {}]); }
// ---- NF-e (fase 1): memória de-para de produtos da nota -> produto do app ----
// Aba "DE-PARA NFE" (criada se faltar). Uma linha por CNPJ do emitente + código do produto na nota (cProd).
// Colunas localizadas PELO CABEÇALHO (pode reordenar/adicionar colunas na planilha sem quebrar).
var DEPARA_SHEET = 'DE-PARA NFE';
var DEPARA_COLS = ['CNPJ EMITENTE','CPROD','XPROD','PRODUTO APP','FATOR','IGNORAR','ÚLTIMO CUSTO','CONFIRMADO POR','DATA'];
function _hkey(t){ return S(t).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,''); }
function deParaSheet_(){
  var s = sh(DEPARA_SHEET);
  if (!s){ s = ss().insertSheet(DEPARA_SHEET); s.getRange(1,1,1,DEPARA_COLS.length).setValues([DEPARA_COLS]); s.setFrozenRows(1);
    s.getRange('A:B').setNumberFormat('@'); }   // CNPJ e código como TEXTO (não perde zero à esquerda)
  var lastC = Math.max(1, s.getLastColumn()), head = s.getRange(1,1,1,lastC).getValues()[0], idx = {};
  for (var c = 0; c < head.length; c++){ var k = _hkey(head[c]); if (k && !(k in idx)) idx[k] = c; }
  DEPARA_COLS.forEach(function(h){ var k = _hkey(h); if (!(k in idx)){ lastC++; s.getRange(1,lastC).setValue(h); idx[k] = lastC - 1; } });
  return { s:s, idx:idx, ncol:lastC };
}
function readDeParaNfe(){
  var out = {}, s = sh(DEPARA_SHEET); if (!s) return out;
  var last = s.getLastRow(); if (last < 2) return out;
  var d = deParaSheet_(), ix = d.idx, v = s.getRange(2,1,last-1,d.ncol).getValues();
  var g = function(r,h){ return r[ix[_hkey(h)]]; };
  for (var i = 0; i < v.length; i++){ var r = v[i], cnpj = S(g(r,'CNPJ EMITENTE')).replace(/\D/g,''), cprod = S(g(r,'CPROD'));
    if (!cnpj || !cprod) continue;
    var ig = S(g(r,'IGNORAR')).toUpperCase();
    out[cnpj + '|' + cprod] = { cnpj:cnpj, cprod:cprod, xprod:S(g(r,'XPROD')), produto:S(g(r,'PRODUTO APP')), fator:N(g(r,'FATOR')) || 1,
      ignorar:(ig === 'SIM' || ig === 'TRUE' || ig === 'X' || ig === '1'), custo:N(g(r,'ÚLTIMO CUSTO')), por:S(g(r,'CONFIRMADO POR')),
      data:(g(r,'DATA') instanceof Date) ? Utilities.formatDate(g(r,'DATA'), Session.getScriptTimeZone(), 'yyyy-MM-dd') : S(g(r,'DATA')).slice(0,10) }; }
  return out;
}
// grava/atualiza o de-para (chave CNPJ + CPROD): atualiza a linha existente ou acrescenta no fim
function writeDeParaNfe(itens){
  itens = itens || []; if (!itens.length) return { rows:0 };
  var d = deParaSheet_(), s = d.s, ix = d.idx, last = s.getLastRow(), rows = {}, n = 0;
  if (last >= 2){ var v = s.getRange(2,1,last-1,d.ncol).getValues();
    for (var i = 0; i < v.length; i++){ var k = S(v[i][ix[_hkey('CNPJ EMITENTE')]]).replace(/\D/g,'') + '|' + S(v[i][ix[_hkey('CPROD')]]); if (k !== '|') rows[k] = i + 2; } }
  var hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  itens.forEach(function(it){
    var cnpj = S(it.cnpj).replace(/\D/g,''), cprod = S(it.cprod); if (!cnpj || !cprod) return;
    var vals = {}; vals['CNPJ EMITENTE'] = cnpj; vals['CPROD'] = cprod; vals['XPROD'] = S(it.xprod); vals['PRODUTO APP'] = it.ignorar ? '' : S(it.produto);
    vals['FATOR'] = N(it.fator) || 1; vals['IGNORAR'] = it.ignorar ? 'SIM' : ''; vals['ÚLTIMO CUSTO'] = N(it.custo) || '';
    vals['CONFIRMADO POR'] = S(it.por) || 'app'; vals['DATA'] = hoje;
    var row = rows[cnpj + '|' + cprod];
    if (!row){ row = s.getLastRow() + 1; rows[cnpj + '|' + cprod] = row; s.getRange(row, ix[_hkey('CNPJ EMITENTE')] + 1).setNumberFormat('@'); s.getRange(row, ix[_hkey('CPROD')] + 1).setNumberFormat('@'); }
    Object.keys(vals).forEach(function(h){ s.getRange(row, ix[_hkey(h)] + 1).setValue(vals[h]); });
    n++; });
  return { rows:n };
}
/* =====================================================================================
   NF-e — FASE 2: captura automática dos XMLs (Gmail + pasta do Drive), índice das notas,
   endpoints com token e cancelamento. Ver docs/NFE_RECEBIMENTO.md (seções 4, 5 e 11).
   ► Rode setupNfe() UMA vez pelo editor (autoriza Gmail/Drive, cria pastas/abas/token/gatilho).
   ===================================================================================== */
var NFE_CONFIG_SHEET = 'CONFIG NFE', NFE_IDX_SHEET = 'NFE RECEBIDAS', NFE_ITENS_SHEET = 'NFE ITENS', NFE_LABEL = 'NFE-OK';
var NFE_CONFIG_COLS = ['CHAVE','VALOR','OBS'];
var NFE_IDX_COLS = ['CHAVE','PRODUTOR','CNPJ EMITENTE','FORNECEDOR','Nº','SÉRIE','EMISSÃO','VALOR','TIPO','CHAVE REFERENCIADA','STATUS',
  'FILE ID','CLASSIFICADA EM','RECEBIDA EM','RECEBIDA POR','ORIGEM','OBS','CAPTURADA EM','FOTO CANHOTO'];
var NFE_ITENS_COLS = ['CHAVE','Nº ITEM','CPROD','XPROD','CFOP','UCOM','QCOM','PRODUTO APP','FATOR','QTD APP','UN APP','CUSTO UNIT. REAL','QTD RECEBIDA','IGNORAR'];
var NFE_TEXTO = ['CHAVE','PRODUTOR','CNPJ EMITENTE','Nº','SÉRIE','CHAVE REFERENCIADA','CPROD','CFOP'];   // colunas guardadas como texto

// aba com colunas achadas PELO CABEÇALHO (cria a aba/colunas que faltarem; colunas de texto não perdem zero à esquerda)
function sheetCols_(name, cols){
  var s = sh(name), novas = [];
  if (!s){ s = ss().insertSheet(name); s.getRange(1,1,1,cols.length).setValues([cols]); s.setFrozenRows(1); novas = cols.slice(); }
  var lastC = Math.max(1, s.getLastColumn()), head = s.getRange(1,1,1,lastC).getValues()[0], idx = {};
  for (var c = 0; c < head.length; c++){ var k = _hkey(head[c]); if (k && !(k in idx)) idx[k] = c; }
  cols.forEach(function(h){ var k = _hkey(h); if (!(k in idx)){ lastC++; s.getRange(1,lastC).setValue(h); idx[k] = lastC - 1; novas.push(h); } });
  // colunas de texto (chave, CNPJ, código): formato texto só quando a coluna é criada (não perde zero à esquerda)
  novas.forEach(function(h){ if (NFE_TEXTO.indexOf(h) >= 0) s.getRange(1, idx[_hkey(h)] + 1, s.getMaxRows(), 1).setNumberFormat('@'); });
  return { s:s, idx:idx, ncol:lastC, col:function(h){ return idx[_hkey(h)]; } };
}
function _rowObj(t, r){ var o = {}; Object.keys(t.idx).forEach(function(k){ o[k] = r[t.idx[k]]; }); return o; }
function _fmtD(v){ return (v instanceof Date) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : S(v).slice(0,10); }
function _fmtDT(v){ return (v instanceof Date) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : S(v); }

// ---- configuração (aba CONFIG NFE: CHAVE | VALOR | OBS) ----
// Durante a captura, config e pastas são lidas 1x só (_NFE_MEMO_); antes eram relidas a cada XML (lento no Drive).
var _NFE_MEMO_ = null;
function nfeConfig_(){
  if (_NFE_MEMO_ && _NFE_MEMO_.cfg) return _NFE_MEMO_.cfg;
  var cfg = nfeConfigLer_(); if (_NFE_MEMO_) _NFE_MEMO_.cfg = cfg; return cfg;
}
function nfeConfigLer_(){
  var s = sh(NFE_CONFIG_SHEET), cfg = { token:'', pasta:'', produtores:[], diasParado:30, email:false }; if (!s) return cfg;
  var last = s.getLastRow(); if (last < 2) return cfg;
  var v = s.getRange(2,1,last-1,2).getValues();
  var ant = '';
  v.forEach(function(r){ var k = _hkey(r[0]), val = S(r[1]);
    if (!k && ant === 'PRODUTOR') k = 'PRODUTOR';   // CPF/CNPJ na linha de baixo sem "PRODUTOR" na coluna A: continua a lista
    ant = k;
    if (k === 'TOKEN') cfg.token = val; else if (k === 'PASTANFE') cfg.pasta = val;
    else if (k === 'PRODUTOR' && val) cfg.produtores.push(_doc_(r[1]));
    else if (k === 'DIASCONTRATOPARADO' && val !== '') cfg.diasParado = N(val);
    else if (k === 'LEREMAIL') cfg.email = /^(SIM|S|1|TRUE|X)$/i.test(val); });
  return cfg;
}
function nfeTokenOk_(tk){ var t = nfeConfig_().token; return !!t && S(tk) === t; }
function _pasta(parent, nome){ var it = parent.getFoldersByName(nome); return it.hasNext() ? it.next() : parent.createFolder(nome); }
function nfePastas_(cfg){
  if (_NFE_MEMO_ && _NFE_MEMO_.pastas) return _NFE_MEMO_.pastas;
  var raiz = DriveApp.getFolderById(cfg.pasta);
  var p = { raiz:raiz, entrada:_pasta(raiz,'Entrada'), xml:_pasta(raiz,'XML'), rejeitados:_pasta(raiz,'Rejeitados') };
  if (_NFE_MEMO_) _NFE_MEMO_.pastas = p; return p;
}
// Rode UMA vez pelo editor do Apps Script (menu de funções → setupNfe → Executar). Pode rodar de novo sem problema.
function setupNfe(){
  var t = sheetCols_(NFE_CONFIG_SHEET, NFE_CONFIG_COLS), cfg = nfeConfig_(), s = t.s;
  var add = function(k, v, obs){ s.appendRow([k, v, obs]); };
  if (!cfg.token){ add('TOKEN', Utilities.getUuid().replace(/-/g,''), 'Cole este token no app: Sincronizar → Token da NF-e (uma vez por aparelho). Não compartilhe.'); }
  var pasta = null; try { if (cfg.pasta) pasta = DriveApp.getFolderById(cfg.pasta); } catch (e) { pasta = null; }
  if (!pasta){ pasta = _pasta(DriveApp.getRootFolder(), 'NFe'); add('PASTA NFE', pasta.getId(), 'Pasta NFe no Drive (Entrada / XML / Rejeitados). Jogue XML manual em NFe/Entrada.'); }
  var temProd = s.getLastRow() >= 2 && s.getRange(2,1,s.getLastRow()-1,1).getValues().some(function(r){ return _hkey(r[0]) === 'PRODUTOR'; });
  var temDias = s.getLastRow() >= 2 && s.getRange(2,1,s.getLastRow()-1,1).getValues().some(function(r){ return _hkey(r[0]) === 'DIASCONTRATOPARADO'; });
  if (!temDias) add('DIAS CONTRATO PARADO', 30, 'Alerta quando um contrato de entrega futura fica esse nº de dias sem remessa.');
  if (!temProd) add('PRODUTOR', '', 'Coloque aqui o CPF ou CNPJ de cada produtor (uma linha PRODUTOR por produtor). Só notas para eles entram.');
  nfePastas_(nfeConfig_());
  sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS); sheetCols_(NFE_ITENS_SHEET, NFE_ITENS_COLS);
  var tem = ScriptApp.getProjectTriggers().some(function(g){ return g.getHandlerFunction() === 'capturarNfe'; });
  if (!tem) ScriptApp.newTrigger('capturarNfe').timeBased().everyMinutes(15).create();
  var temEmail = s.getLastRow() >= 2 && s.getRange(2,1,s.getLastRow()-1,1).getValues().some(function(r){ return _hkey(r[0]) === 'LEREMAIL'; });
  if (!temEmail) add('LER E-MAIL', 'NÃO', 'SIM = também busca os XML no Gmail. NÃO = só a pasta NFe/Entrada do Drive (você coloca os XML lá).');
  return 'NF-e configurada: pastas, abas, token e gatilho de 15 min (lê a pasta NFe/Entrada).';
}

// ---- leitura do XML (XmlService; procura pelo NOME local, com ou sem namespace) ----
function _xfirst(el, name){ if (!el) return null; var k = el.getChildren();
  for (var i = 0; i < k.length; i++) if (k[i].getName() === name) return k[i];
  for (var j = 0; j < k.length; j++){ var r = _xfirst(k[j], name); if (r) return r; } return null; }
function _xall(el, name, out){ out = out || []; if (!el) return out; el.getChildren().forEach(function(c){ if (c.getName() === name) out.push(c); else _xall(c, name, out); }); return out; }
function _xt(el, name){ var x = _xfirst(el, name); return x ? S(x.getText()) : ''; }
function nfeTipoCfopGs_(cfop){ var c = S(cfop).replace(/\D/g,''), f = c.slice(1);
  if (/^[567]\d{3}$/.test(c)){ if (f === '922') return 'FATURAMENTO'; if (f === '116' || f === '117') return 'REMESSA'; if (/^1(0[1-9]|1[0-9]|2[0-4])$/.test(f)) return 'VENDA'; }
  return 'OUTRA'; }
function nfeLerGs_(txt){
  var root = XmlService.parse(txt).getRootElement();
  var ev = _xfirst(root, 'infEvento') || (root.getName() === 'infEvento' ? root : null);
  if (ev && !_xfirst(root, 'infNFe')){
    var ret = _xfirst(root, 'retEvento');
    return { evento:true, tp:_xt(ev,'tpEvento'), chave:_xt(ev,'chNFe'), cstat:ret ? _xt(ret,'cStat') : '', data:_xt(ev,'dhEvento').slice(0,10) };
  }
  var inf = _xfirst(root, 'infNFe'); if (!inf) return { erro:'não é XML de NF-e' };
  var prot = _xfirst(root, 'infProt'), ide = _xfirst(inf,'ide'), emit = _xfirst(inf,'emit'), dest = _xfirst(inf,'dest');
  var tipos = _xall(inf,'det').map(function(d){ return nfeTipoCfopGs_(_xt(d,'CFOP')); });
  var tipo = tipos.indexOf('FATURAMENTO')>=0 ? 'FATURAMENTO' : tipos.indexOf('REMESSA')>=0 ? 'REMESSA' : tipos.indexOf('VENDA')>=0 ? 'VENDA' : 'OUTRA';
  var idAttr = inf.getAttribute('Id');
  return { chave:(prot && _xt(prot,'chNFe')) || (idAttr ? S(idAttr.getValue()).replace(/^NFe/,'') : ''), temProt:!!prot, cstat:prot ? _xt(prot,'cStat') : '',
    nNF:_xt(ide,'nNF'), serie:_xt(ide,'serie'), emissao:(_xt(ide,'dhEmi') || _xt(ide,'dEmi')).slice(0,10),
    cnpj:(_xt(emit,'CNPJ') || _xt(emit,'CPF')).replace(/\D/g,''), fornecedor:_xt(emit,'xNome'),
    dest:(_xt(dest,'CNPJ') || _xt(dest,'CPF')).replace(/\D/g,''), vNF:parseFloat(_xt(_xfirst(inf,'ICMSTot'),'vNF')) || 0,
    ref:_xt(ide,'refNFe'), tipo:tipo, itens:tipos.length };
}
// texto do arquivo respeitando a codificação declarada (UTF-8 ou ISO-8859-1)
function _blobTxt(b){ var t = b.getDataAsString('UTF-8'); if (/encoding=["']ISO-8859-1["']/i.test(t.slice(0,120))) t = b.getDataAsString('ISO-8859-1'); return t.replace(/^﻿/,''); }
// arquivos XML dentro de um anexo/arquivo (abre .zip)
function _nfeBlobs(b){ var n = S(b.getName()).toLowerCase(), ct = S(b.getContentType()).toLowerCase();
  if (/\.zip$/.test(n) || ct.indexOf('zip') >= 0){ try { return Utilities.unzip(b).filter(function(x){ return /\.xml$/i.test(x.getName()); }); } catch (e) { return []; } }
  if (/\.xml$/.test(n) || ct.indexOf('xml') >= 0) return [b];
  return []; }
function _nfeLinha_(t, chave){ var s = t.s, last = s.getLastRow(); if (last < 2) return 0;
  var v = s.getRange(2, t.col('CHAVE') + 1, last - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (S(v[i][0]) === chave) return i + 2; return 0; }
// grava células pelo cabeçalho. Chave, CPF/CNPJ e códigos vão SEMPRE como TEXTO: sem isso o Sheets transforma
// os 44 dígitos da chave em número (5,2E+43), perde dígitos e a nota não é mais achada (duplica, não reabre…).
function _setCells_(t, row, vals){ Object.keys(vals).forEach(function(h){ var rg = t.s.getRange(row, t.col(h) + 1);
  if (NFE_TEXTO.indexOf(h) >= 0 || h === 'ID'){ rg.setNumberFormat('@'); rg.setValue(S(vals[h])); } else rg.setValue(vals[h]); }); }
// linha NOVA no fim da aba. ATENÇÃO: appendRow de uma linha VAZIA não conta para o getLastRow do Google —
// o jeito antigo (appendRow vazio + getLastRow) escrevia POR CIMA da última linha (e, na 1ª nota, do cabeçalho).
function _novaLinha_(s){ var r = s.getLastRow() + 1, mx = s.getMaxRows(); if (r > mx) s.insertRowsAfter(mx, r - mx); return r; }
// CONSERTO das abas que o erro acima estragou: se a linha 1 (cabeçalho) tem DADOS (chave de 44 dígitos),
// a aba é renomeada para "… (COM ERRO dd/mm)" (fica guardada) e nasce uma nova, limpa, na próxima leitura.
// A NFE RECEBIDAS é refeita relendo os XML já guardados em NFe/XML (nada se perde).
function _cabecalhoEstragado_(s){
  if (!s || s.getLastRow() < 1) return false;
  return s.getRange(1, 1, 1, Math.max(1, s.getLastColumn())).getValues()[0].some(function(v){
    return (typeof v === 'number' && Math.abs(v) > 1e30) || /\d{44}/.test(S(v)); });
}
function nfeRepararAbas_(){
  var feito = [];
  [[NFE_IDX_SHEET, NFE_IDX_COLS], [NFE_ITENS_SHEET, NFE_ITENS_COLS], [NFE_PEND_SHEET, NFE_PEND_COLS]].forEach(function(a){
    var s = sh(a[0]); if (!_cabecalhoEstragado_(s)) return;
    s.setName(a[0] + ' (COM ERRO ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM HH:mm') + ')');
    sheetCols_(a[0], a[1]); feito.push(a[0]); });
  if (feito.indexOf(NFE_IDX_SHEET) >= 0){   // refaz o índice das notas a partir dos XML guardados (notas antes, cancelamentos depois)
    var cfg = nfeConfig_(); if (cfg.pasta){ var xml = nfePastas_(cfg).xml, arqs = [], it = xml.getFolders();
      while (it.hasNext()){ var fi = it.next().getFiles(); while (fi.hasNext()) arqs.push(fi.next()); }
      arqs.sort(function(a, b){ return (/-canc\.xml$/.test(a.getName()) ? 1 : 0) - (/-canc\.xml$/.test(b.getName()) ? 1 : 0); });
      arqs.forEach(function(f){ try { processarXmlNfe(_blobTxt(f.getBlob()), 'refeita (conserto)'); } catch (e) {} }); } }
  return feito;
}
// CPF/CNPJ só com dígitos; se a planilha guardou como número e comeu o zero da frente, devolve (11 = CPF, 14 = CNPJ)
function _doc_(v){ var d = S(v).replace(/\D/g, ''); if (typeof v === 'number' && d){ while (d.length < 11) d = '0' + d; if (d.length > 11 && d.length < 14) while (d.length < 14) d = '0' + d; } return d; }
// CONSERTO: linhas da NFE RECEBIDAS cuja CHAVE virou número. Relê a chave (e CNPJ/destinatário) do XML guardado
// (FILE ID) e regrava como texto; depois tira as linhas repetidas da mesma nota que ainda não andaram.
function nfeRepararChaves_(){
  try { nfeRepararAbas_(); } catch (e) {}
  var s = sh(NFE_IDX_SHEET); if (!s || s.getLastRow() < 2) return 0;
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), v = s.getRange(2, 1, s.getLastRow() - 1, t.ncol).getValues(), n = 0;
  v.forEach(function(r, i){ var ch = r[t.col('CHAVE')], id = S(r[t.col('FILE ID')]);
    if (typeof ch === 'string' && /^\d{44}$/.test(ch.trim())) return;
    if (!id || (ch === '' || ch == null)) return;
    try { var x = nfeLerGs_(_blobTxt(DriveApp.getFileById(id).getBlob())); if (!/^\d{44}$/.test(S(x.chave))) return;
      _setCells_(t, i + 2, { 'CHAVE':x.chave, 'CNPJ EMITENTE':x.cnpj, 'PRODUTOR':x.dest }); v[i][t.col('CHAVE')] = x.chave; n++; } catch (e) {} });
  if (n){   // linhas repetidas da mesma nota: fica a MAIS ADIANTADA (recebida/em trânsito… > a classificar > ignorada)
    var peso = function(st){ return st === 'IGNORADA' ? 0 : st === '' ? 1 : st === 'A CLASSIFICAR' ? 2 : 3; };
    var fica = {}, apagar = [];
    v.forEach(function(r, i){ var ch = S(r[t.col('CHAVE')]), st = S(r[t.col('STATUS')]).toUpperCase(); if (!/^\d{44}$/.test(ch)) return;
      var f = fica[ch]; if (!f){ fica[ch] = { i:i, p:peso(st) }; return; }
      if (peso(st) > f.p && f.p < 3){ apagar.push(f.i + 2); fica[ch] = { i:i, p:peso(st) }; }       // esta é mais adiantada: troca
      else if (peso(st) < 3) apagar.push(i + 2); });                                                  // só apaga as que não andaram
    apagar.sort(function(a, b){ return b - a; }).forEach(function(r){ s.deleteRow(r); }); }
  return n;
}
// "Cadastrar como produtor" (app): nova linha PRODUTOR na CONFIG NFE + reabre as notas IGNORADAS desse destinatário
function nfeAddProdutor_(p){
  var doc = _doc_(p && p.doc); if (!/^(\d{11}|\d{14})$/.test(doc)) return { rows:0, erro:'CPF/CNPJ inválido' };
  var c = sheetCols_(NFE_CONFIG_SHEET, NFE_CONFIG_COLS);
  if (nfeConfig_().produtores.indexOf(doc) < 0){ var r = _novaLinha_(c.s);
    _setCells_(c, r, { 'CHAVE':'PRODUTOR', 'OBS':'cadastrado pelo app' }); var vr = c.s.getRange(r, c.col('VALOR') + 1); vr.setNumberFormat('@'); vr.setValue(doc); }
  nfeRepararChaves_();
  return { rows:nfeReavaliarIgnoradas_() };
}
// notas IGNORADAS só por "destinatário fora da lista" cujo CPF/CNPJ JÁ está na lista PRODUTOR → voltam para A CLASSIFICAR
function nfeReavaliarIgnoradas_(){
  var s = sh(NFE_IDX_SHEET); if (!s || s.getLastRow() < 2) return 0;
  var prod = nfeConfig_().produtores; if (!prod.length) return 0;
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), n = 0;
  s.getRange(2, 1, s.getLastRow() - 1, t.ncol).getValues().forEach(function(r, i){
    if (S(r[t.col('STATUS')]).toUpperCase() === 'IGNORADA' && /fora da lista/.test(S(r[t.col('OBS')])) && prod.indexOf(_doc_(r[t.col('PRODUTOR')])) >= 0){
      _setCells_(t, i + 2, { 'STATUS':'A CLASSIFICAR', 'OBS':'' }); n++; } });
  return n;
}
function _salvaXml_(pastas, chave, emissao, txt, sufixo){
  var mes = _pasta(pastas.xml, S(emissao).slice(0,7) || 'sem-data'), nome = chave + '-' + (sufixo || 'nfe') + '.xml', it = mes.getFilesByName(nome);
  return it.hasNext() ? it.next().getId() : mes.createFile(nome, txt, 'application/xml').getId(); }   // (MimeType.XML não existe no Apps Script)
// PROCESSA 1 XML: valida → (cancelamento) → sem duplicar → salva no Drive → linha na NFE RECEBIDAS
// devolve {status:'nova'|'duplicada'|'ignorada'|'cancelada'|'rejeitada', chave, motivo}
function processarXmlNfe(txt, origem){
  var cfg = nfeConfig_(); if (!cfg.pasta) return { status:'rejeitada', motivo:'NF-e não configurada (rode setupNfe)' };
  var n; try { n = nfeLerGs_(txt); } catch (e) { return { status:'rejeitada', motivo:'XML inválido' }; }
  if (n.erro) return { status:'rejeitada', motivo:n.erro };
  var pastas = nfePastas_(cfg), t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), agora = new Date();
  if (n.evento){   // eventos: só o CANCELAMENTO (110111) muda algo
    if (n.tp !== '110111') return { status:'rejeitada', chave:n.chave, motivo:'evento ' + n.tp + ' não tratado' };
    if (['135','136','155'].indexOf(n.cstat) < 0) return { status:'rejeitada', chave:n.chave, motivo:'cancelamento não homologado (cStat ' + n.cstat + ')' };
    _salvaXml_(pastas, n.chave, n.data, txt, 'canc');
    var rc = _nfeLinha_(t, n.chave);
    if (!rc){ rc = _novaLinha_(t.s);
      _setCells_(t, rc, { 'CHAVE':n.chave, 'STATUS':'CANCELADA', 'ORIGEM':origem, 'OBS':'cancelamento chegou antes da nota', 'CAPTURADA EM':agora }); return { status:'cancelada', chave:n.chave }; }
    var st = S(t.s.getRange(rc, t.col('STATUS') + 1).getValue()).toUpperCase();
    if (st === 'CANCELADA') return { status:'duplicada', chave:n.chave };
    var obs = (st === 'RECEBIDA' || st === 'RECEBIDA SEM XML') ? '⚠ CANCELADA DEPOIS DA ENTRADA NO ESTOQUE — conferir com o fornecedor e ajustar o estoque' : 'cancelada pelo emitente em ' + n.data;
    _setCells_(t, rc, { 'STATUS':'CANCELADA', 'OBS':obs });
    var refC = S(t.s.getRange(rc, t.col('CHAVE REFERENCIADA') + 1).getValue()); if (refC) _atualizaContrato_(refC);   // remessa cancelada devolve o saldo ao contrato
    return { status:'cancelada', chave:n.chave, alerta:(st === 'RECEBIDA' || st === 'RECEBIDA SEM XML') };
  }
  if (!n.temProt) return { status:'rejeitada', chave:n.chave, motivo:'XML sem protocolo de autorização' };
  if (n.cstat !== '100') return { status:'rejeitada', chave:n.chave, motivo:'nota não autorizada (cStat ' + n.cstat + ')' };
  if (!/^\d{44}$/.test(n.chave)) return { status:'rejeitada', motivo:'chave inválida' };
  var row = _nfeLinha_(t, n.chave);
  if (row && S(t.s.getRange(row, t.col('FILE ID') + 1).getValue()))   // mesma nota 2× não duplica
    return { status:'duplicada', chave:n.chave, motivo:'já estava na planilha (' + (S(t.s.getRange(row, t.col('STATUS') + 1).getValue()) || '—') + ')' };
  var fora = cfg.produtores.length && cfg.produtores.indexOf(n.dest) < 0;
  var fileId = _salvaXml_(pastas, n.chave, n.emissao, txt, 'nfe');
  var vals = { 'CHAVE':n.chave, 'PRODUTOR':n.dest, 'CNPJ EMITENTE':n.cnpj, 'FORNECEDOR':n.fornecedor, 'Nº':n.nNF, 'SÉRIE':n.serie,
    'EMISSÃO':n.emissao, 'VALOR':n.vNF, 'TIPO':n.tipo, 'CHAVE REFERENCIADA':n.ref, 'FILE ID':fileId, 'ORIGEM':origem, 'CAPTURADA EM':agora };
  var stRow = row ? S(t.s.getRange(row, t.col('STATUS') + 1).getValue()).toUpperCase() : '';
  if (row && stRow === 'RECEBIDA SEM XML'){            // caminhão chegou antes do XML: a nota casa sozinha com o recebimento
    vals['STATUS'] = 'RECEBIDA'; vals['OBS'] = 'XML chegou depois do recebimento na fazenda — conferir de-para e custo';
    _setCells_(t, row, vals); if (n.ref) _atualizaContrato_(n.ref);
    return { status:'casada', chave:n.chave, motivo:vals['OBS'] }; }
  if (row){ vals['OBS'] = 'cancelamento recebido antes da nota'; }           // já estava CANCELADA: completa os dados, mantém o status
  else { vals['STATUS'] = fora ? 'IGNORADA' : 'A CLASSIFICAR';
    vals['OBS'] = fora ? 'destinatário ' + n.dest + ' fora da lista de produtores (CONFIG NFE)' : (cfg.produtores.length ? '' : 'lista de produtores vazia na CONFIG NFE — conferir destinatário');
    row = _novaLinha_(t.s); }
  _setCells_(t, row, vals);
  return { status: !vals['STATUS'] ? 'cancelada' : (vals['STATUS'] === 'IGNORADA' ? 'ignorada' : 'nova'), chave:n.chave, motivo:vals['OBS'] || '', dest:fora ? n.dest : '' };
}
// GATILHO (a cada 15 min): Gmail + pasta NFe/Entrada. Também roda pelo botão "Atualizar" do app (?acao=capturar).
// - Um e-mail/arquivo com problema NÃO trava os outros: o erro fica anotado e o resto segue.
// - A TRAVA da planilha é pega por ARQUIVO (poucos segundos), não pela busca inteira: as gravações do app
//   (compras, execução…) passam no meio da busca em vez de ficar esperando / dar "planilha ocupada".
// - Tem limite de tempo (maxMs): o que faltar fica para a próxima busca (e-mail sem o rótulo NFe é relido;
//   arquivo continua na Entrada). Gatilho: ~4 min (o Google corta em 6). Botão Atualizar: ~25 s.
// O resultado da última busca fica guardado (propriedade NFE_CAPTURA) e aparece no app.
function capturarNfe(maxMs){
  maxMs = +maxMs || 240000;
  var t0 = Date.now(), pr = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  // só UMA busca por vez (gatilho × botão): marca "capturando" (vale 6 min, caso uma busca morra no meio)
  if (!lock.tryLock(30000)) return 'ocupado';
  try { var em = +pr.getProperty('NFE_CAPTURANDO') || 0; if (Date.now() - em < 360000) return 'ocupado'; pr.setProperty('NFE_CAPTURANDO', String(Date.now())); }
  finally { lock.releaseLock(); }
  var res = [], erros = [], parcial = false;
  var passo = function(fn){ if (!lock.tryLock(30000)) throw new Error('planilha ocupada'); try { return fn(); } finally { lock.releaseLock(); } };
  var fimTempo = function(){ if (Date.now() - t0 > maxMs){ parcial = true; return true; } return false; };
  _NFE_MEMO_ = {};
  try {
    var cfg = nfeConfig_(); if (!cfg.pasta){ _nfeCapturaSalva_(res, ['NF-e não configurada (rode setupNfe)']); return 'NF-e não configurada (rode setupNfe)'; }
    try { passo(function(){ nfeRepararChaves_(); nfeReavaliarIgnoradas_(); }); } catch (e){ erros.push('conserto das chaves: ' + e); }
    // pasta primeiro (é o que a pessoa acabou de pôr lá); depois o Gmail
    var p = nfePastas_(cfg), it = p.entrada.getFiles();
    while (it.hasNext() && !fimTempo()){ var f = it.next();
      try {
        var bs = _nfeBlobs(f.getBlob()), ok = bs.length > 0;
        if (!bs.length) res.push({ status:'rejeitada', arq:f.getName(), motivo:'não é arquivo .xml nem .zip' });
        bs.forEach(function(b){ var r = passo(function(){ return processarXmlNfe(_blobTxt(b), 'pasta'); }); r.arq = S(f.getName()); res.push(r); if (r.status === 'rejeitada') ok = false; });
        if (ok) f.setTrashed(true); else f.moveTo(p.rejeitados);   // processado: a cópia padronizada está em NFe/XML/AAAA-MM
      } catch (e){ erros.push('arquivo "' + f.getName() + '": ' + e); } }   // fica na Entrada: tenta de novo na próxima
    // e-mail DESLIGADO por padrão: as notas entram só pela pasta NFe/Entrada (a pessoa alimenta à mão).
    // Para voltar a ler o Gmail: na CONFIG NFE, linha "LER E-MAIL" = SIM.
    if (cfg.email && !fimTempo()) try {
      var label = GmailApp.getUserLabelByName(NFE_LABEL) || GmailApp.createLabel(NFE_LABEL);
      var ths = GmailApp.search('has:attachment (filename:xml OR filename:zip) newer_than:7d -label:' + NFE_LABEL, 0, 50);
      for (var i = 0; i < ths.length; i++){ var th = ths[i]; if (fimTempo()) break;
        try {
          th.getMessages().forEach(function(m){ m.getAttachments().forEach(function(a){ _nfeBlobs(a).forEach(function(b){
            var r = passo(function(){ return processarXmlNfe(_blobTxt(b), 'e-mail'); }); r.arq = S(b.getName()); res.push(r); }); }); });
          th.addLabel(label);
        } catch (e){ erros.push('e-mail "' + S(th.getFirstMessageSubject()).slice(0,60) + '": ' + e); } }
    } catch (e){ erros.push('Gmail: ' + e); }
  } finally {
    _NFE_MEMO_ = null;
    _nfeCapturaSalva_(res, erros, parcial);
    try { pr.deleteProperty('NFE_CAPTURANDO'); } catch (e) {}
    cacheClearApp_(); }   // NF-e: só a parte APP do cache
  return res;
}
function _nfeCapturaSalva_(res, erros, parcial){
  try {
    var c = { em:Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm"), lidas:res.length, novas:0, repetidas:0, ignoradas:0, rejeitadas:[], erros:(erros || []).slice(0,10), parcial:!!parcial };
    res.forEach(function(r){ if (r.status === 'nova' || r.status === 'casada') c.novas++; else if (r.status === 'duplicada') c.repetidas++;
      else if (r.status === 'ignorada') c.ignoradas++; else if (r.status === 'rejeitada') c.rejeitadas.push((r.arq ? r.arq + ': ' : '') + (r.motivo || '')); });
    c.rejeitadas = c.rejeitadas.slice(0,10);
    var pr = PropertiesService.getScriptProperties();
    pr.setProperty('NFE_CAPTURA', JSON.stringify(c));
    // histórico dos últimos 30 arquivos lidos (não some quando a busca seguinte não acha nada)
    if (res.length){ var h = nfeCapturaHist_();
      h = res.map(function(r){ return { em:c.em, arq:S(r.arq).slice(0,120), status:r.status, motivo:S(r.motivo).slice(0,200), chave:S(r.chave), dest:S(r.dest) }; }).concat(h).slice(0,30);
      pr.setProperty('NFE_CAPTURA_HIST', JSON.stringify(h)); }
  } catch (e) {}
}
function nfeCapturaInfo_(){ try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('NFE_CAPTURA') || 'null'); } catch (e) { return null; } }
function nfeCapturaHist_(){ try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('NFE_CAPTURA_HIST') || '[]'); } catch (e) { return []; } }
// nota IGNORADA (ex.: destinatário fora da lista PRODUTOR) volta para "A CLASSIFICAR" pelo app
function nfeReabrir_(r){
  try { nfeRepararChaves_(); } catch (e) {}
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), row = _nfeLinha_(t, S(r && r.chave)); if (!row) return { rows:0, erro:'nota não encontrada' };
  var st = S(t.s.getRange(row, t.col('STATUS') + 1).getValue()).toUpperCase();
  if (st !== 'IGNORADA') return { rows:0, erro:'a nota está ' + (st || 'sem status') + ', não IGNORADA' };
  var obs = S(t.s.getRange(row, t.col('OBS') + 1).getValue());
  _setCells_(t, row, { 'STATUS':'A CLASSIFICAR', 'OBS':'reaberta no app' + (obs ? ' (antes: ' + obs + ')' : '') });
  return { rows:1 };
}
// ---- endpoints (todos exigem o token da CONFIG NFE) ----
// conserto rápido antes de ler (lista / Receber nota) — só se a planilha estiver livre (não briga com a captura)
function _nfeConsertoLeve_(){
  var lk = LockService.getScriptLock(); if (!lk.tryLock(3000)) return;
  try { nfeRepararChaves_(); nfeReavaliarIgnoradas_(); } catch (e) {} finally { lk.releaseLock(); }
}
function nfeLista_(status){
  _nfeConsertoLeve_();
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), s = t.s, last = s.getLastRow(), out = [], alertas = [], cont = {}, ign = [];
  var quer = S(status || 'A CLASSIFICAR').toUpperCase().split(',').map(S);
  if (last >= 2) s.getRange(2,1,last-1,t.ncol).getValues().forEach(function(r){ var o = _rowObj(t, r), st = S(o[_hkey('STATUS')]).toUpperCase();
    if (!S(o[_hkey('CHAVE')])) return; cont[st] = (cont[st] || 0) + 1;
    var nota = { chave:S(o[_hkey('CHAVE')]), fornecedor:S(o[_hkey('FORNECEDOR')]), cnpj:S(o[_hkey('CNPJ EMITENTE')]), nNF:S(o[_hkey('Nº')]), serie:S(o[_hkey('SÉRIE')]),
      emissao:_fmtD(o[_hkey('EMISSÃO')]), valor:N(o[_hkey('VALOR')]), tipo:S(o[_hkey('TIPO')]), status:st, origem:S(o[_hkey('ORIGEM')]), obs:S(o[_hkey('OBS')]),
      capturada:_fmtDT(o[_hkey('CAPTURADA EM')]), recebida:_fmtD(o[_hkey('RECEBIDA EM')]) };
    if (quer.indexOf(st) >= 0 || quer.indexOf('TODAS') >= 0) out.push(nota);
    if (st === 'IGNORADA') ign.push(nota.chave);
    if (S(nota.obs).indexOf('⚠') === 0) alertas.push(nota); });
  return { ok:true, notas:out, alertas:alertas, contagem:cont, captura:nfeCapturaInfo_(), historico:nfeCapturaHist_(), ignoradas:ign };
}
function nfeUma_(chave){
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), row = _nfeLinha_(t, S(chave)); if (!row) return { ok:false, erro:'nota não encontrada' };
  var o = _rowObj(t, t.s.getRange(row,1,1,t.ncol).getValues()[0]), id = S(o[_hkey('FILE ID')]);
  if (!id) return { ok:false, erro:'XML da nota ainda não chegou' };
  return { ok:true, status:S(o[_hkey('STATUS')]), xml:_blobTxt(DriveApp.getFileById(id).getBlob()) };
}
// classifica/recebe (RECEBIDA) ou ignora (IGNORADA) uma nota: status + NFE ITENS + de-para
function nfeClassifica_(c){
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), row = _nfeLinha_(t, S(c.chave)); if (!row) return { rows:0, erro:'nota não encontrada' };
  var atual = S(t.s.getRange(row, t.col('STATUS') + 1).getValue()).toUpperCase();
  if (atual === 'CANCELADA') return { rows:0, erro:'nota cancelada' };
  // fase 3: EM TRÂNSITO (venda/remessa) · A ENTREGAR (faturamento = contrato) · RECEBIDA (entrada direta) · IGNORADA
  var st = S(c.status || 'RECEBIDA').toUpperCase(), agora = new Date(), vals = { 'STATUS':st, 'CLASSIFICADA EM':agora };
  if (st === 'RECEBIDA'){ vals['RECEBIDA EM'] = c.data ? new Date(S(c.data).slice(0,10) + 'T12:00:00') : agora; vals['RECEBIDA POR'] = S(c.por) || 'app'; }
  if (c.ref != null) vals['CHAVE REFERENCIADA'] = S(c.ref);            // remessa → contrato (faturamento)
  if (c.obs) vals['OBS'] = S(c.obs);
  _setCells_(t, row, vals);
  var n = 0;
  if (c.itens && c.itens.length){
    var ti = sheetCols_(NFE_ITENS_SHEET, NFE_ITENS_COLS), s = ti.s, last = s.getLastRow();
    if (last >= 2){ var v = s.getRange(2, ti.col('CHAVE') + 1, last - 1, 1).getValues(); for (var i = v.length - 1; i >= 0; i--) if (S(v[i][0]) === S(c.chave)) s.deleteRow(i + 2); }
    c.itens.forEach(function(it){ var r = _novaLinha_(s);
      _setCells_(ti, r, { 'CHAVE':S(c.chave), 'Nº ITEM':S(it.n), 'CPROD':S(it.cprod), 'XPROD':S(it.xprod), 'CFOP':S(it.cfop), 'UCOM':S(it.ucom), 'QCOM':N(it.qcom),
        'PRODUTO APP':it.ignorar ? '' : S(it.produto), 'FATOR':N(it.fator) || 1, 'QTD APP':it.ignorar ? '' : N(it.qtd), 'UN APP':S(it.un), 'CUSTO UNIT. REAL':it.ignorar ? '' : N(it.custo),
        'QTD RECEBIDA':(it.ignorar || st !== 'RECEBIDA') ? '' : N(it.qtd), 'IGNORAR':it.ignorar ? 'SIM' : '' }); n++; });
  }
  if (c.depara && c.depara.length) writeDeParaNfe(c.depara);
  // contrato afetado: o próprio (faturamento) ou o da remessa
  var ref = S(t.s.getRange(row, t.col('CHAVE REFERENCIADA') + 1).getValue());
  if (st === 'A ENTREGAR') _atualizaContrato_(S(c.chave)); else if (ref) _atualizaContrato_(ref);
  return { rows:n + 1 };
}
// ---- FASE 3: entrega futura (contratos = notas de FATURAMENTO) ----
function _ler_(name, cols){ var t = sheetCols_(name, cols), s = t.s, last = s.getLastRow(), out = [];
  if (last < 2) return out;
  s.getRange(2,1,last-1,t.ncol).getValues().forEach(function(r, i){ var o = { __r:i + 2 }; cols.forEach(function(h){ o[h] = r[t.col(h)]; }); if (S(o[cols[0]])) out.push(o); });
  return out; }
var NFE_ATIVAS = ['EM TRÂNSITO','RECEBIDA','RECEBIDA SEM XML'];   // remessas que já abatem o contrato
// contratos de entrega futura: faturado × entregue (remessas vinculadas) × saldo por produto
var _CTR_MEMO_ = null;
function nfeContratos_(){
  if (_CTR_MEMO_) return _CTR_MEMO_;
  var idx = _ler_(NFE_IDX_SHEET, NFE_IDX_COLS), itens = _ler_(NFE_ITENS_SHEET, NFE_ITENS_COLS), porChave = {}, cfg = nfeConfig_(), hoje = new Date();
  itens.forEach(function(i){ (porChave[S(i['CHAVE'])] = porChave[S(i['CHAVE'])] || []).push(i); });
  var out = [];
  idx.forEach(function(n){
    var st = S(n['STATUS']).toUpperCase(); if (S(n['TIPO']) !== 'FATURAMENTO' || ['A ENTREGAR','ENTREGUE'].indexOf(st) < 0) return;
    var ch = S(n['CHAVE']), its = {}, ult = n['CLASSIFICADA EM'] instanceof Date ? n['CLASSIFICADA EM'] : null;
    (porChave[ch] || []).forEach(function(i){ var p = S(i['PRODUTO APP']); if (S(i['IGNORAR']) || !p) return;
      var x = its[p] || (its[p] = { produto:p, un:S(i['UN APP']), faturado:0, entregue:0, custo:N(i['CUSTO UNIT. REAL']) }); x.faturado += N(i['QTD APP']); });
    var rem = idx.filter(function(r){ return S(r['CHAVE REFERENCIADA']) === ch && NFE_ATIVAS.indexOf(S(r['STATUS']).toUpperCase()) >= 0; });
    rem.forEach(function(r){ (porChave[S(r['CHAVE'])] || []).forEach(function(i){ var p = S(i['PRODUTO APP']); if (S(i['IGNORAR']) || !its[p]) return; its[p].entregue += N(i['QTD APP']); });
      var d = r['CLASSIFICADA EM']; if (d instanceof Date && (!ult || d > ult)) ult = d; });
    var lista = Object.keys(its).map(function(p){ var x = its[p]; x.saldo = Math.max(0, Math.round((x.faturado - x.entregue) * 1e4) / 1e4); x.valorSaldo = x.saldo * x.custo; x.excesso = Math.max(0, x.entregue - x.faturado); return x; });
    var saldo = lista.reduce(function(a, x){ return a + x.saldo; }, 0), dias = ult ? Math.floor((hoje - ult) / 86400000) : null;
    out.push({ chave:ch, fornecedor:S(n['FORNECEDOR']), cnpj:S(n['CNPJ EMITENTE']), nNF:S(n['Nº']), serie:S(n['SÉRIE']), emissao:_fmtD(n['EMISSÃO']), valor:N(n['VALOR']),
      status:st, itens:lista, remessas:rem.map(function(r){ return { chave:S(r['CHAVE']), nNF:S(r['Nº']), status:S(r['STATUS']) }; }),
      saldoTotal:saldo, valorSaldo:lista.reduce(function(a, x){ return a + x.valorSaldo; }, 0), diasParado:dias, parado:saldo > 0 && dias != null && dias >= cfg.diasParado });
  });
  return out;
}
// contrato totalmente entregue vira ENTREGUE (e volta para A ENTREGAR se uma remessa for cancelada)
function _atualizaContrato_(chave){
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), row = _nfeLinha_(t, chave); if (!row) return;
  var st = S(t.s.getRange(row, t.col('STATUS') + 1).getValue()).toUpperCase(); if (['A ENTREGAR','ENTREGUE'].indexOf(st) < 0) return;
  var c = nfeContratos_().filter(function(x){ return x.chave === chave; })[0]; if (!c) return;
  var novo = (c.itens.length && c.saldoTotal <= 0.0001) ? 'ENTREGUE' : 'A ENTREGAR';
  if (novo !== st) t.s.getRange(row, t.col('STATUS') + 1).setValue(novo);
}
// estados por PRODUTO (sem dados da nota) para a conta do "a comprar": a entregar · em trânsito · pendências · avariado
function nfeEstados_(){
  var out = { aEntregar:{}, emTransito:{}, pendencias:{}, avariado:{} };
  if (!sh(NFE_IDX_SHEET)) return out;
  var add = function(m, p, q){ if (p && q) m[p] = Math.round(((m[p] || 0) + q) * 1e4) / 1e4; };
  nfeContratos_().forEach(function(c){ if (c.status === 'A ENTREGAR') c.itens.forEach(function(x){ add(out.aEntregar, x.produto, x.saldo); }); });
  var idx = _ler_(NFE_IDX_SHEET, NFE_IDX_COLS), trans = {};
  idx.forEach(function(n){ if (S(n['STATUS']).toUpperCase() === 'EM TRÂNSITO') trans[S(n['CHAVE'])] = 1; });
  _ler_(NFE_ITENS_SHEET, NFE_ITENS_COLS).forEach(function(i){ if (trans[S(i['CHAVE'])] && !S(i['IGNORAR'])) add(out.emTransito, S(i['PRODUTO APP']), N(i['QTD APP'])); });
  if (typeof nfePendEstados_ === 'function') nfePendEstados_(out, add);   // fase 5
  return out;
}
// ---- FASE 4: recebimento na fazenda (tela Receber nota) ----
// consulta pela chave lida na câmera: status + itens já classificados (NFE ITENS)
function nfeChave_(chave){
  _nfeConsertoLeve_();
  chave = S(chave); var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), row = _nfeLinha_(t, chave);
  if (!row) return { ok:true, encontrada:false };
  var o = {}; var r = t.s.getRange(row,1,1,t.ncol).getValues()[0]; NFE_IDX_COLS.forEach(function(h){ o[h] = r[t.col(h)]; });
  var itens = _ler_(NFE_ITENS_SHEET, NFE_ITENS_COLS).filter(function(i){ return S(i['CHAVE']) === chave; }).map(function(i){
    return { n:S(i['Nº ITEM']), cprod:S(i['CPROD']), xprod:S(i['XPROD']), ucom:S(i['UCOM']), qcom:N(i['QCOM']), produto:S(i['PRODUTO APP']), fator:N(i['FATOR']) || 1,
      qtd:N(i['QTD APP']), un:S(i['UN APP']), custo:N(i['CUSTO UNIT. REAL']), ignorar:!!S(i['IGNORAR']), recebida:S(i['QTD RECEBIDA']) === '' ? null : N(i['QTD RECEBIDA']) }; });
  return { ok:true, encontrada:true, nota:{ chave:chave, status:S(o['STATUS']).toUpperCase(), tipo:S(o['TIPO']), fornecedor:S(o['FORNECEDOR']), cnpj:S(o['CNPJ EMITENTE']),
    nNF:S(o['Nº']), serie:S(o['SÉRIE']), emissao:_fmtD(o['EMISSÃO']), valor:N(o['VALOR']), ref:S(o['CHAVE REFERENCIADA']), obs:S(o['OBS']),
    recebida:_fmtD(o['RECEBIDA EM']), recebidaPor:S(o['RECEBIDA POR']), temXml:!!S(o['FILE ID']) }, itens:itens };
}
// recebimento conferido: status RECEBIDA, QTD RECEBIDA por item e (fase 5) pendências. Sem XML: cria a nota
// "RECEBIDA SEM XML" com os dados da própria chave e os itens informados; quando o XML chegar, casa sozinho.
// A ENTRADA no estoque vai pelo __entrada normal do app (id = chave) — reenviar não duplica.
function nfeRecebimento_(r){
  var chave = S(r.chave); if (!/^\d{44}$/.test(chave)) return { rows:0, erro:'chave inválida' };
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), row = _nfeLinha_(t, chave), agora = new Date();
  var quando = r.data ? new Date(S(r.data).slice(0,10) + 'T12:00:00') : agora;
  if (!row){
    if (!r.semXml) return { rows:0, erro:'nota não encontrada' };
    row = _novaLinha_(t.s);
    _setCells_(t, row, { 'CHAVE':chave, 'CNPJ EMITENTE':chave.slice(6,20), 'Nº':String(+chave.slice(25,34)), 'SÉRIE':String(+chave.slice(22,25)),
      'FORNECEDOR':S(r.semXml.fornecedor), 'STATUS':'RECEBIDA SEM XML', 'ORIGEM':'recebimento', 'CAPTURADA EM':agora,
      'OBS':'recebida antes do XML — o XML casa sozinho quando chegar' });
  } else {
    var st = S(t.s.getRange(row, t.col('STATUS') + 1).getValue()).toUpperCase();
    if (st === 'CANCELADA') return { rows:0, erro:'nota cancelada' };
    if (['EM TRÂNSITO','RECEBIDA','RECEBIDA SEM XML'].indexOf(st) < 0) return { rows:0, erro:'nota ' + st.toLowerCase() + ' — não pode ser recebida' };
    if (st === 'EM TRÂNSITO') t.s.getRange(row, t.col('STATUS') + 1).setValue('RECEBIDA');
  }
  _setCells_(t, row, { 'RECEBIDA EM':quando, 'RECEBIDA POR':S(r.por) || 'app' });
  if (r.canhoto) _setCells_(t, row, { 'FOTO CANHOTO':S(r.canhoto) });
  var ti = sheetCols_(NFE_ITENS_SHEET, NFE_ITENS_COLS), s = ti.s, n = 0, itens = r.itens || [];
  if (r.semXml){   // itens informados na fazenda
    var last = s.getLastRow(); if (last >= 2){ var v = s.getRange(2, ti.col('CHAVE') + 1, last - 1, 1).getValues(); for (var i = v.length - 1; i >= 0; i--) if (S(v[i][0]) === chave) s.deleteRow(i + 2); }
    itens.forEach(function(it, k){ var rr = _novaLinha_(s);
      _setCells_(ti, rr, { 'CHAVE':chave, 'Nº ITEM':S(it.n || k + 1), 'PRODUTO APP':S(it.produto), 'QTD APP':N(it.qtdRecebida), 'UN APP':S(it.un), 'QTD RECEBIDA':N(it.qtdRecebida), 'FATOR':1 }); n++; });
  } else {
    var lin = _ler_(NFE_ITENS_SHEET, NFE_ITENS_COLS).filter(function(i){ return S(i['CHAVE']) === chave; });
    itens.forEach(function(it){ var m = lin.filter(function(i){ return S(i['Nº ITEM']) === S(it.n); })[0];
      if (m){ s.getRange(m.__r, ti.col('QTD RECEBIDA') + 1).setValue(N(it.qtdRecebida)); n++; } });
  }
  if (typeof nfeGravaPendencias_ === 'function') nfeGravaPendencias_(chave, r, t, row);   // fase 5
  var ref = S(t.s.getRange(row, t.col('CHAVE REFERENCIADA') + 1).getValue()); if (ref) _atualizaContrato_(ref);
  return { rows:n + 1 };
}
// ---- FASE 5: divergências na conferência (aba PENDÊNCIAS RECEBIMENTO) ----
var NFE_PEND_SHEET = 'PENDÊNCIAS RECEBIMENTO';
var NFE_PEND_COLS = ['ID','CHAVE','Nº','FORNECEDOR','PRODUTO','TIPO','QTD','UN','FICOU NA FAZENDA','FOTO','CONFERIDO POR','DATA','STATUS','SOLUÇÃO','OBS'];
// grava as divergências de um recebimento (reenviar o mesmo recebimento troca as ABERTAS, não duplica)
function nfeGravaPendencias_(chave, r, t, row){
  var lista = r.pendencias || []; var ps = sheetCols_(NFE_PEND_SHEET, NFE_PEND_COLS), s = ps.s, last = s.getLastRow();
  if (last >= 2){ var v = s.getRange(2,1,last-1,ps.ncol).getValues();
    for (var i = v.length - 1; i >= 0; i--) if (S(v[i][ps.col('CHAVE')]) === chave && S(v[i][ps.col('STATUS')]).toUpperCase() === 'ABERTA') s.deleteRow(i + 2); }
  if (!lista.length) return 0;
  var nNF = S(t.s.getRange(row, t.col('Nº') + 1).getValue()), forn = S(t.s.getRange(row, t.col('FORNECEDOR') + 1).getValue()), hoje = new Date();
  lista.forEach(function(pd){ var rr = _novaLinha_(s);
    _setCells_(ps, rr, { 'ID':chave + '-' + S(pd.n) + '-' + S(pd.tipo).toUpperCase(), 'CHAVE':chave, 'Nº':nNF, 'FORNECEDOR':forn, 'PRODUTO':S(pd.produto),
      'TIPO':S(pd.tipo).toUpperCase(), 'QTD':N(pd.qtd), 'UN':S(pd.un), 'FICOU NA FAZENDA':pd.ficou ? 'SIM' : '', 'FOTO':S(pd.foto),
      'CONFERIDO POR':S(r.por) || 'app', 'DATA':hoje, 'STATUS':'ABERTA', 'OBS':S(pd.obs) }); });
  return lista.length;
}
// pendência aberta/cobrada continua abatendo o "a comprar" (falta, avaria, troca); avaria que ficou = saldo avariado
function nfePendEstados_(out, add){
  if (!sh(NFE_PEND_SHEET)) return;
  _ler_(NFE_PEND_SHEET, NFE_PEND_COLS).forEach(function(p){ var st = S(p['STATUS']).toUpperCase(), tp = S(p['TIPO']).toUpperCase();
    if (st === 'RESOLVIDA') return;
    if (['FALTA','AVARIA','TROCADO'].indexOf(tp) >= 0) add(out.pendencias, S(p['PRODUTO']), N(p['QTD']));
    if (tp === 'AVARIA' && S(p['FICOU NA FAZENDA'])) add(out.avariado, S(p['PRODUTO']), N(p['QTD'])); });
}
function nfePendenciasLista_(status){
  var quer = S(status || 'ABERTA,COBRADA').toUpperCase().split(',').map(S), out = [];
  if (!sh(NFE_PEND_SHEET)) return { ok:true, pendencias:[] };
  _ler_(NFE_PEND_SHEET, NFE_PEND_COLS).forEach(function(p){ var st = S(p['STATUS']).toUpperCase();
    if (quer.indexOf(st) < 0 && quer.indexOf('TODAS') < 0) return;
    out.push({ id:S(p['ID']), chave:S(p['CHAVE']), nNF:S(p['Nº']), fornecedor:S(p['FORNECEDOR']), produto:S(p['PRODUTO']), tipo:S(p['TIPO']), qtd:N(p['QTD']), un:S(p['UN']),
      ficou:!!S(p['FICOU NA FAZENDA']), foto:S(p['FOTO']), por:S(p['CONFERIDO POR']), data:_fmtD(p['DATA']), status:st, solucao:S(p['SOLUÇÃO']), obs:S(p['OBS']) }); });
  return { ok:true, pendencias:out };
}
// escritório acompanha a pendência: ABERTA → COBRADA → RESOLVIDA (solução: REPOSIÇÃO / DESCONTO / DEVOLUÇÃO)
function nfePendencia_(u){
  var ps = sheetCols_(NFE_PEND_SHEET, NFE_PEND_COLS), row = 0, last = ps.s.getLastRow();
  if (last >= 2){ var v = ps.s.getRange(2, ps.col('ID') + 1, last - 1, 1).getValues(); for (var i = 0; i < v.length; i++) if (S(v[i][0]) === S(u.id)){ row = i + 2; break; } }
  if (!row) return { rows:0, erro:'pendência não encontrada' };
  var vals = {}; if (u.status) vals['STATUS'] = S(u.status).toUpperCase(); if (u.solucao != null) vals['SOLUÇÃO'] = S(u.solucao).toUpperCase(); if (u.obs != null) vals['OBS'] = S(u.obs);
  _setCells_(ps, row, vals); return { rows:1 };
}
// foto da divergência/canhoto → pasta NFe/Fotos (link fica na pendência)
function nfeFoto_(f){
  var cfg = nfeConfig_(); if (!cfg.pasta || !f || !f.b64) return { url:'' };
  var pasta = _pasta(DriveApp.getFolderById(cfg.pasta), 'Fotos');
  var blob = Utilities.newBlob(Utilities.base64Decode(S(f.b64)), S(f.mime) || 'image/jpeg', S(f.nome) || ('foto-' + Date.now() + '.jpg'));
  var file = pasta.createFile(blob); return { url:file.getUrl(), id:file.getId() };
}
// resumo SEM dados da nota (só contagens) — vai no puxar normal, para o contador do app
function nfeResumo_(){ var s = sh(NFE_IDX_SHEET), out = { aClassificar:0, alertas:0, pendAbertas:0 }; if (!s) return out;
  var t = sheetCols_(NFE_IDX_SHEET, NFE_IDX_COLS), last = s.getLastRow(); if (last < 2) return out;
  s.getRange(2,1,last-1,t.ncol).getValues().forEach(function(r){ var st = S(r[t.col('STATUS')]).toUpperCase();
    if (st === 'A CLASSIFICAR') out.aClassificar++; if (S(r[t.col('OBS')]).indexOf('⚠') === 0) out.alertas++; });
  out.contratosParados = nfeContratos_().filter(function(c){ return c.parado; }).length;
  if (sh(NFE_PEND_SHEET)) out.pendAbertas = _ler_(NFE_PEND_SHEET, NFE_PEND_COLS).filter(function(p){ return S(p['STATUS']).toUpperCase() === 'ABERTA'; }).length;
  return out; }

// SAÍDA de estoque por recomendação APROVADA (o app envia na aprovação). Idempotente pelo id:
// reprovar/reabrir envia itens vazio e limpa as linhas dessa recom, sem afetar as outras.
function writeSaida(sd){
  var itens = (sd && sd.itens) || [], n = 0;
  if (!sd || !sd.id) return { rows:0 };
  movDeleteBySource(sd.id);                            // limpa saídas anteriores dessa recom
  var when = new Date();
  if (sd.data && /^\d{4}-\d{2}-\d{2}/.test(String(sd.data))) when = new Date(String(sd.data).slice(0,10) + 'T12:00:00');
  var origem = 'Recom' + (sd.talhao ? ' · ' + S(sd.talhao) : '') + ' [#' + S(sd.id) + ']';
  for (var i = 0; i < itens.length; i++){ var it = itens[i];
    if (!S(it.produto) || !(N(it.real) > 0)) continue;
    logMovimentacao('SAÍDA', it.produto, it.un, it.real, origem, S(sd.operador), when); n++; }
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
  for (var i = 0; i < itens.length; i++){
    var it = itens[i];
    s.appendRow([when, S(ret.id), S(ret.talhao), S(ret.operador), S(it.produto), S(it.un), N(it.plan), N(it.real), S(ret.obs)]);
    n++;
  }
  if (!n){ s.appendRow([when, S(ret.id), S(ret.talhao), S(ret.operador), '', '', 0, 0, S(ret.obs)]); }
  // A SAÍDA de estoque NÃO é lançada aqui: o retorno do operador é só a informação do volume.
  // A baixa no estoque é lançada quando o Adm APROVA a recomendação (writeSaida), ponto único
  // de commit — assim não conta duas vezes e sincroniza entre aparelhos.
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
  var ncol = Math.min(10, s.getLastColumn());                         // 10ª coluna = UN (retrocompatível: 9 antes)
  var v = s.getRange(2, 1, last - 1, ncol).getValues(), safras = {};
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
      sf.itens.push({ empresa:S(r[2]), classe:S(r[3]), produto:S(r[4]), un:S(r[9]||''), precoVista:dv, precoPrazo:dz, pct:pv, pctPrazo:pp });
    }
  }
  return { safras:safras };
}
function writePrecosSheet(precos){
  var s = precosSheet();
  s.clearContents();
  var rows = [['SAFRA','TIPO','EMPRESA','CLASSE','PRODUTO','VISTA_RS','PRAZO_RS','PCT_VISTA','PCT_PRAZO','UN']];
  var safras = (precos && precos.safras) || {};
  Object.keys(safras).forEach(function(nm){
    var sf = safras[nm] || {};
    (sf.refs || []).forEach(function(r){
      rows.push([nm, 'REF', '', S(r.classe), S(r.produto),
        r.vista == null ? '' : N(r.vista), r.prazo == null ? '' : N(r.prazo), '', '', '']);
    });
    (sf.itens || []).forEach(function(it){
      rows.push([nm, 'ITEM', S(it.empresa), S(it.classe), S(it.produto),
        (it.precoVista == null || it.precoVista === '') ? '' : N(it.precoVista),
        (it.precoPrazo == null || it.precoPrazo === '') ? '' : N(it.precoPrazo),
        it.pct == null ? '' : N(it.pct * 100), it.pctPrazo == null ? '' : N(it.pctPrazo * 100), S(it.un || '')]);
    });
  });
  s.getRange(1, 1, rows.length, 10).setValues(rows);
  try { s.setFrozenRows(1); } catch (e) {}
  return { rows: rows.length - 1 };
}
// Aba plana "PREÇOS" na PRÓPRIA planilha do planejamento: PRODUTO | À VISTA | A PRAZO | SAFRA.
// É a lista que o PORTIFÓLIO busca por VLOOKUP LOCAL (sem IMPORTRANGE — mais robusto).
// Grava também no Banco (histórico permanente), mas o VLOOKUP do PORTIFÓLIO usa a local.
function writeFlatPrecos(list, safra){
  writeFlatPrecosEm(ss(), list, safra);                       // local (planejamento) — é a que o PORTIFÓLIO usa
  if (PRECOS_DB_ID){ try { writeFlatPrecosEm(precosSS(), list, safra); } catch(e){} }   // cópia no Banco (histórico)
  try { escreveUnPortifolio(list); } catch(e){}               // a unidade do módulo Preços acompanha na planilha (PORTIFÓLIO UN)
  return { rows: (list||[]).length };
}
function writeFlatPrecosEm(b, list, safra){
  var s = b.getSheetByName('PREÇOS'); if (!s) s = b.insertSheet('PREÇOS');
  s.clearContents();
  // A..D usados pelo VLOOKUP do PORTIFÓLIO (A:B); UN vai na coluna E (não quebra a fórmula).
  var rows = [['PRODUTO', 'À VISTA', 'A PRAZO', 'SAFRA', 'UN']];
  (list || []).forEach(function(it){
    rows.push([S(it.p), (it.v == null || it.v === '') ? '' : N(it.v), (it.z == null || it.z === '') ? '' : N(it.z), S(safra), S(it.u || '')]);
  });
  s.getRange(1, 1, rows.length, 5).setValues(rows);
  try { s.setFrozenRows(1); } catch (e) {}
  return { rows: rows.length - 1 };
}
// leva a unidade publicada (módulo Preços) para a coluna UN (F) do PORTIFÓLIO, casando pelo produto.
// Só grava quando a unidade vem preenchida — não apaga o que já existe.
function escreveUnPortifolio(list){
  var P = ss().getSheetByName('PORTIFÓLIO'); if (!P) return;
  var last = P.getLastRow(); if (last < 4) return;
  var n = last - 3;
  var byName = {};
  (list || []).forEach(function(it){ var k = S(it.p).trim().toUpperCase(); if (k && S(it.u)) byName[k] = S(it.u); });
  var prod = P.getRange(4, 3, n, 1).getValues();   // C = produto
  var un = P.getRange(4, 6, n, 1).getValues();     // F = UN
  var dirty = false;
  for (var i = 0; i < n; i++){ var k = S(prod[i][0]).trim().toUpperCase();
    if (k && byName[k] && S(un[i][0]) !== byName[k]){ un[i][0] = byName[k]; dirty = true; } }
  if (dirty) P.getRange(4, 6, n, 1).setValues(un);
}

// mapa das colunas da tabela do talhão, detectado pelo cabeçalho (linha 9), 0-based.
// Suporta o layout NOVO (igual ao app) e o ORIGINAL (retrocompatível: Classe=B, Produto=C, Un=F, Dose=I).
// data -> "yyyy-mm-dd" (aceita célula de data, "dd/mm/yyyy" ou ISO); vazio se não for data
function dateISO(v){
  if (v instanceof Date && !isNaN(v)){ var z = function(n){ return (n < 10 ? '0' : '') + n; }; return v.getFullYear() + '-' + z(v.getMonth() + 1) + '-' + z(v.getDate()); }
  var s = S(v); if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var b = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (b) return b[3] + '-' + (b[2].length < 2 ? '0' : '') + b[2] + '-' + (b[1].length < 2 ? '0' : '') + b[1];
  return '';
}
// "yyyy-mm-dd" -> Date (meio-dia local, p/ não virar o dia anterior por fuso) ou null
function parseISODate(v){ var m = S(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null; }
// valor (col B) da linha do resumo cujo rótulo (col A) contém `label`, procurando nas linhas r0..r1
function resumoVal(vals, r0, r1, label){
  for (var L = r0; L <= r1; L++){ var rr = vals[L - 1]; if (rr && S(rr[0]).toUpperCase().indexOf(label) >= 0) return rr[1]; }
  return '';
}
// nº da linha do resumo (a partir de `base`, até 6 linhas) cujo rótulo contém `label`; 0 se não existir
function resumoLabelRow(vals, base, label){
  for (var L = base; L <= base + 6 && L <= vals.length; L++){ var rr = vals[L - 1]; if (rr && S(rr[0]).toUpperCase().indexOf(label) >= 0) return L; }
  return 0;
}
// insere UM bloco novo de operação (BLK linhas: cabeçalho + itens, com as fórmulas) no fim da faixa da safra.
// A safrinha (e o que estiver abaixo) desce; as referências das fórmulas/resumos se ajustam sozinhas.
function addOpBlock(s, tag){
  var n = s.getMaxRows(), vals = s.getRange(1, 1, n, 9).getValues(), m = talColMap(vals[8]);
  var split = findSafraSplit(vals, n, m);
  var r0 = (tag === 'S') ? (split > 0 ? split + 1 : 238) : 10;
  var r1 = (tag === 'S') ? n : (split > 0 ? split - 1 : Math.min(224, n));
  var heads = [];
  for (var L = r0; L <= r1; L++){ var row = vals[L - 1]; if (row && S(row[m.op]).toUpperCase().indexOf('OPERA') === 0) heads.push(L); }
  var BLK = (heads.length >= 2) ? (heads[1] - heads[0]) : 17;
  var lastEnd = heads.length ? heads[heads.length - 1] + BLK - 1 : r0 - 1;
  if (tag === 'S' && lastEnd >= n) s.insertRowsAfter(n, BLK); else s.insertRowsAfter(lastEnd, BLK);
  var r = lastEnd + 1, first = r + 1, last = r + BLK - 1, k = heads.length;
  if (heads.length) s.getRange(heads[heads.length - 1], 1, BLK, TAL_COLS).copyFormatToRange(s, 1, TAL_COLS, r, last);  // mesma formatação do bloco anterior
  var rows = []; for (var i = 0; i < BLK; i++) rows.push(blank(TAL_COLS));
  rows[0][0] = 'OPERAÇÃO ' + (k + 1);
  rows[0][7] = '=SUM($H' + first + ':$H' + last + ')';  rows[0][8] = '=SUM($I' + first + ':$I' + last + ')';
  for (var L2 = first; L2 <= last; L2++){ var i2 = L2 - r, dose = numCell('$E' + L2), area = numCell('$B$2');
    rows[i2][6] = '=IF($D' + L2 + '="","",IFERROR(VLOOKUP($D' + L2 + ',PORTIFÓLIO!$C:$S,17,0),0))';
    rows[i2][7] = '=IF($D' + L2 + '="","",' + dose + '*$G' + L2 + ')';
    rows[i2][8] = '=IF($D' + L2 + '="","",$H' + L2 + '*' + area + ')'; }
  s.getRange(r, 1, BLK, TAL_COLS).clearDataValidations();
  s.getRange(r, 1, BLK, TAL_COLS).setValues(rows);
}
// linha "Data de plantio:" do resumo da safrinha (procura antes do 2º cabeçalho; padrão 234)
function plantioSafRow(vals, n, split){
  // procura o rótulo "Data de plantio:" no resumo da safrinha (antes do 2º cabeçalho; sem ele, na faixa padrão 225..240)
  var r0 = (split > 0) ? Math.max(5, split - 8) : 225, r1 = (split > 0) ? split - 1 : Math.min(240, n);
  for (var L = r0; L <= r1; L++){ var rr = vals[L - 1];
    if (rr && S(rr[0]).toUpperCase().indexOf('PLANTIO') >= 0) return L; }
  return (split > 0) ? split - 3 : 234;                                   // linha padrão do modelo (resumo em split-6 .. split-1)
}
// onde fica o DAE da operação: na coluna "DAP (dias)" quando a aba tem; senão, na linha-cabeçalho da
// operação, ao lado do nome (coluna da CLASSE, que nessa linha é vazia), como "25 DAE" (N() lê o número)
function daeCol(m){ return (m.dap >= 0) ? m.dap : m.classe; }
function daeVal(m, n){ n = N(n); if (m.dap >= 0) return n || ''; return n ? (n + ' DAE') : ''; }
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
      var d = N(row[daeCol(m)]); if (d) cur.dap = d;                      // DAE: coluna DAP ou "25 DAE" ao lado do nome (negativo = pré-plantio)
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
  // 1) operações NOVAS além das existentes: insere os blocos (linhas) primeiro e relê a aba
  edits.forEach(function(ed){ if (ed.type !== 'addopblock') return;
    try { var cnt = Math.max(1, Math.min(50, N(ed.count) || 1)); for (var c = 0; c < cnt; c++) addOpBlock(s, ed.tag); out.ok++; }
    catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push('addopblock: ' + err); } });
  var n = s.getMaxRows();                          // sem teto de 451: a aba cresce com as operações
  var vals = s.getRange(1, 1, n, 9).getValues();   // 0-based: linha L -> vals[L-1]
  var m = talColMap(vals[8]);                      // colunas detectadas pelo cabeçalho
  var split = findSafraSplit(vals, n, m);          // fronteira 1ª safra / safrinha
  var pR1 = (split > 0) ? split - 1 : Math.min(224, n);
  var sR0 = (split > 0) ? split + 1 : 238;
  var dirty = false, reorders = [];
  edits.forEach(function(ed){
    try {
      if (ed.type === 'addopblock') return;                            // já feito acima
      if (ed.type === 'reorderops'){ reorders.push(ed); return; }   // espelho: reescreve a faixa inteira (depois)
      if (ed.type === 'plantio' || ed.type === 'plantio_safrinha'){   // data de plantio PREVISTA (resumo da aba: B4 / safrinha)
        var prow = (ed.type === 'plantio') ? 4 : plantioSafRow(vals, n, split);
        var dv = parseISODate(ed.value);
        // garante o rótulo na coluna A (é por ele que a leitura acha a linha) sem apagar outro texto existente
        var lblA = S((vals[prow - 1] || [])[0]);
        if (!lblA || lblA.toUpperCase().indexOf('PLANTIO') >= 0){ s.getRange(prow, 1).setValue('Data de plantio:'); if (vals[prow - 1]) vals[prow - 1][0] = 'Data de plantio:'; }
        if (dv){ s.getRange(prow, 2).setValue(dv); s.getRange(prow, 2).setNumberFormat('dd/mm/yyyy'); }
        else s.getRange(prow, 2).setValue('');
        out.ok++; return;
      }
      if (ed.type === 'ciclo' || ed.type === 'ciclo_safrinha'){       // ciclo (dias) + colheita estimada (fórmula) no resumo
        var base = (ed.type === 'ciclo') ? 1 : (split > 0 ? split - 6 : 231);
        var rowP = base + 3;                                            // "Data de plantio:"
        var rowC = resumoLabelRow(vals, base, 'CICLO') || (base + 4);
        var rowH = resumoLabelRow(vals, base, 'COLHEITA') || (base + 5);
        s.getRange(rowC, 1).setValue('Ciclo (dias):'); s.getRange(rowC, 2).setValue(N(ed.value) || '');
        s.getRange(rowH, 1).setValue('Colheita estimada:');
        s.getRange(rowH, 2).setFormula('=IF(OR($B' + rowP + '="",$B' + rowC + '=""),"",$B' + rowP + '+$B' + rowC + ')');
        s.getRange(rowH, 2).setNumberFormat('dd/mm/yyyy');
        out.ok++; return;
      }
      var faixa = ed.tag === 'S' ? [sR0, n] : [10, pR1];
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
      } else if (ed.type === 'dae'){                                         // DAE (dias após emergência) na coluna DAP (B)
        if (!op) throw 'operação não encontrada (dae)';
        var dc = daeCol(m), dvv = daeVal(m, ed.value);                        // com ou sem coluna DAP
        vals[op.head - 1][dc] = dvv; s.getRange(op.head, dc + 1).setValue(dvv);   // linha-cabeçalho da operação
        out.ok++;
      } else { throw 'tipo desconhecido p/ talhão: ' + ed.type; }
    } catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push(String(err)); }
  });
  if (dirty){
    // grava só nas FAIXAS DE OPERAÇÃO (pula o resumo da safrinha, que tem fórmulas)
    escreveColsTalhao(s, vals, 10, pR1, m);
    escreveColsTalhao(s, vals, sR0, n, m);
  }
  // ESPELHO: reescreve a faixa inteira da safra na ordem/nome do app (depois das edições granulares)
  reorders.forEach(function(ed){
    try { var faixa = ed.tag === 'S' ? [sR0, n] : [10, pR1];
      writeReorderOps(s, vals, m, faixa, ed.ops || []); out.ok++;
    } catch(err){ out.fail++; if (out.msgs.length < 10) out.msgs.push('reorder: ' + err); }
  });
}
// reescreve as operações de UMA safra (faixa [r0,r1]) na ordem recebida: nome (marcador "OPERAÇÃO n" +
// rótulo), DAP e insumos. Grava só as colunas detectadas (op/dap/classe/produto/dose/un); as colunas de
// fórmula (preço/custo) ficam intactas. Renumera os slots físicos = ordem exibida no app (planilha = espelho).
function writeReorderOps(s, vals, m, faixa, ops){
  var r0 = faixa[0], r1 = faixa[1];
  // detecta os blocos (cabeçalho "OPERA" + linhas de corpo) na faixa
  var blocks = [], cur = null;
  for (var L = r0; L <= r1; L++){ var row = vals[L - 1]; if (!row) continue;
    var a = S(row[m.op]);
    if (a.toUpperCase().indexOf('OPERA') === 0){ cur = { head:L, body:[] }; blocks.push(cur); }
    else if (cur){ cur.body.push(L); } }
  if (!blocks.length) throw 'sem operações na aba';
  for (var p = 0; p < blocks.length; p++){
    var blk = blocks[p], op = ops[p] || null;
    var label = (op && op.label) ? (' · ' + S(op.label)) : '';
    vals[blk.head - 1][m.op] = 'OPERAÇÃO ' + (p + 1) + label;                 // cabeçalho: marcador + rótulo
    if (m.dap >= 0) vals[blk.head - 1][m.classe] = '';                         // (sem coluna DAP, a classe do cabeçalho guarda o DAE)
    vals[blk.head - 1][daeCol(m)] = (op && op.dap !== '' && op.dap != null) ? daeVal(m, op.dap) : '';
    vals[blk.head - 1][m.produto] = '';                                        // cabeçalho não tem insumo
    vals[blk.head - 1][m.dose] = '';   vals[blk.head - 1][m.un] = '';
    var itens = (op && op.itens) || [];
    for (var j = 0; j < blk.body.length; j++){ var L2 = blk.body[j], it = itens[j];
      vals[L2 - 1][m.op] = ''; if (m.dap >= 0) vals[L2 - 1][m.dap] = '';
      if (it){ vals[L2 - 1][m.classe] = S(it.classe); vals[L2 - 1][m.produto] = S(it.produto);
               vals[L2 - 1][m.dose] = N(it.dose);     vals[L2 - 1][m.un] = S(it.un); }
      else   { vals[L2 - 1][m.classe] = ''; vals[L2 - 1][m.produto] = ''; vals[L2 - 1][m.dose] = ''; vals[L2 - 1][m.un] = ''; }
    }
  }
  // grava SÓ as colunas gerenciadas (deixa preço/custo = fórmulas intactas)
  var cols = [m.op, m.classe, m.produto, m.dose, m.un]; if (m.dap >= 0) cols.push(m.dap);
  var wn = r1 - r0 + 1;
  cols.forEach(function(c){ var colv = [];
    for (var L = r0; L <= r1; L++) colv.push([vals[L - 1][c]]);
    s.getRange(r0, c + 1, wn, 1).clearDataValidations();
    s.getRange(r0, c + 1, wn, 1).setValues(colv);
  });
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
    if (a.toUpperCase().indexOf('OPERA') === 0){ cur = { head: L, body: [], has: false }; blocks.push(cur); }
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

/* Cache dos dados (CacheService), em DUAS partes (ver readData):
   'pb_' = BASE (pesada: abas de talhão, portfólio, preços, equipe) e 'pa_' = APP (leve).
   - gravação do app que só mexe em compras/tarefas/execução/NF-e… limpa só a parte APP (a BASE segue no cache);
   - edição feita À MÃO na planilha limpa as duas (gatilho simples onEdit, abaixo);
   - de qualquer jeito, cada parte vence em CACHE_TTL s (pega fórmulas/IMPORTRANGE que mudam sozinhas).
   Como o valor pode passar de 100KB, é fatiado. */
var CACHE_TTL = 300;
function cacheGetK_(pfx){
  var c = CacheService.getScriptCache(), meta = c.get(pfx + 'meta');
  if (!meta) return null;
  var n = parseInt(meta, 10), keys = [];
  for (var i = 0; i < n; i++) keys.push(pfx + i);
  var got = c.getAll(keys), parts = [];
  for (var j = 0; j < n; j++){ var v = got[pfx + j]; if (v == null) return null; parts.push(v); }
  return parts.join('');
}
function cachePutK_(pfx, str){
  try {
    var c = CacheService.getScriptCache(), size = 90000, n = Math.ceil(str.length / size), obj = {};
    for (var i = 0; i < n; i++) obj[pfx + i] = str.substr(i * size, size);
    obj[pfx + 'meta'] = String(n);
    c.putAll(obj, CACHE_TTL);
  } catch (e) {}
}
function cacheClear(){ try { CacheService.getScriptCache().removeAll(['pb_meta','pa_meta','pd_meta']); } catch (e) {} }
function cacheClearApp_(){ try { CacheService.getScriptCache().remove('pa_meta'); } catch (e) {} }
// edição À MÃO na planilha -> o próximo puxar traz o dado novo (gatilho simples: não precisa instalar)
function onEdit(e){ cacheClear(); }
// JSON atual dos dados (cada parte do cache; senão lê a planilha e cacheia)
function currentJson(){
  var b = cacheGetK_('pb_');
  if (b == null){ b = JSON.stringify(readBase_()); cachePutK_('pb_', b); }
  var a = cacheGetK_('pa_');
  if (a == null){ a = JSON.stringify(readAppPart_()); cachePutK_('pa_', a); }
  return b.slice(0, -1) + ',' + a.slice(1);   // junta os dois objetos JSON num só
}

function doGet(e){
  // NF-e: ?acao=nfe_lista&status=…&token=…  |  ?acao=nfe&chave=…&token=…  (exigem o token da CONFIG NFE)
  if (e && e.parameter && e.parameter.acao){
    var p = e.parameter;
    if (!nfeTokenOk_(p.token)) return json({ ok:false, erro:'token da NF-e inválido ou NF-e não configurada' });
    if (p.acao === 'nfe_lista') return json(nfeLista_(p.status));
    if (p.acao === 'capturar'){ var cr = capturarNfe(25000); return json({ ok:cr !== 'ocupado', erro:(typeof cr === 'string') ? cr : '', captura:nfeCapturaInfo_() }); }
    if (p.acao === 'nfe') return json(nfeUma_(p.chave));
    if (p.acao === 'contratos') return json({ ok:true, contratos:nfeContratos_() });
    if (p.acao === 'nfe_chave') return json(nfeChave_(p.chave));
    if (p.acao === 'pendencias') return json(nfePendenciasLista_(p.status));
    return json({ ok:false, erro:'ação desconhecida' });
  }
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
  var out = { ok:0, fail:0, msgs:[] }, base = false;
  // TRAVA: uma gravação por vez. Dois aparelhos (ou 2 envios do mesmo) gravando juntos podiam
  // apagar a linha errada do razão ou perder uma compra na COMPRAS APP. Quem chega depois espera.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(45000)){ out.fail = 1; out.msgs.push('planilha ocupada — tente de novo'); return json(out); }
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload && payload.__precos){         // módulo Preços: regrava a aba de histórico inteira
      var pr = writePrecosSheet(payload.__precos); out.ok = pr.rows; base = true;
    } else if (payload && payload.__flatPrecos){   // publica a lista plana produto->preço (p/ o planejamento buscar)
      var fr = writeFlatPrecos(payload.__flatPrecos, payload.safra); out.ok = fr.rows; base = true;
    } else if (payload && payload.__retorno){       // baixa do operador (página retorno.html)
      var rr = writeRetorno(payload.__retorno); out.ok = rr.rows;
    } else if (payload && payload.__entradas){       // VÁRIAS compras (e exclusões) numa requisição só
      var ens = writeComprasApp(payload.__entradas); out.ok = ens.rows; out.ids = ens.ids;
    } else if (payload && payload.__entrada){        // compra do app -> entrada no razão de estoque
      var en = writeCompraApp(payload.__entrada); out.ok = en.rows; out.ids = en.ids;
    } else if (payload && payload.__saida){          // recomendação aprovada -> saída no razão (sincroniza entre aparelhos)
      var sr = writeSaida(payload.__saida); out.ok = sr.rows;
    } else if (payload && payload.__tarefas){        // módulo Tarefas: equipe + tarefas (regrava as abas)
      var tk = writeTarefasApp(payload.__tarefas); out.ok = tk.rows;
    } else if (payload && payload.__realizado){      // status/execução das operações de campo (merge por chave)
      var rz = writeRealizadoApp(payload.__realizado); out.ok = rz.rows;
    } else if (payload && payload.__result){         // Resultados: colhido/preço por talhão/safra (merge por chave)
      var rzt = writeMapApp('RESULTADO APP', payload.__result); out.ok = rzt.rows;
    } else if (payload && (payload.__nfeClassifica || payload.__nfeUpload || payload.__recebimento || payload.__pendencia || payload.__nfeFoto || payload.__nfeReabrir || payload.__nfeProdutor)){   // NF-e: exigem o token
      if (!nfeTokenOk_(payload.token)){ out.fail = 1; out.msgs.push('token da NF-e inválido'); }
      else if (payload.__recebimento){ var rb = nfeRecebimento_(payload.__recebimento); out.ok = rb.rows; if (rb.erro){ out.fail = 1; out.msgs.push(rb.erro); } }
      else if (payload.__pendencia && typeof nfePendencia_ === 'function'){ var pd = nfePendencia_(payload.__pendencia); out.ok = pd.rows; if (pd.erro){ out.fail = 1; out.msgs.push(pd.erro); } }
      else if (payload.__nfeFoto && typeof nfeFoto_ === 'function'){ out.foto = nfeFoto_(payload.__nfeFoto); out.ok = out.foto && out.foto.url ? 1 : 0; }
      else if (payload.__nfeProdutor){ var np = nfeAddProdutor_(payload.__nfeProdutor); out.ok = np.rows; if (np.erro){ out.fail = 1; out.msgs.push(np.erro); } }
      else if (payload.__nfeReabrir){ var ra = nfeReabrir_(payload.__nfeReabrir); out.ok = ra.rows; if (ra.erro){ out.fail = 1; out.msgs.push(ra.erro); } }
      else if (payload.__nfeClassifica){ var nc = nfeClassifica_(payload.__nfeClassifica); out.ok = nc.rows; if (nc.erro){ out.fail = 1; out.msgs.push(nc.erro); } }
      else if (payload.__nfeUpload){ out.nfe = processarXmlNfe(S(payload.__nfeUpload.xml), 'app'); out.ok = 1; }   // (a trava do doPost já protege)
    } else if (payload && payload.__nfeDepara){        // NF-e: memória de-para (CNPJ + código do produto -> produto do app)
      var dp = writeDeParaNfe(payload.__nfeDepara.itens); out.ok = dp.rows;
    } else if (payload && payload.__limites){         // limites (contornos) dos talhões importados no Mapa (merge por chave)
      var lim = writeMapApp('LIMITES APP', payload.__limites); out.ok = lim.rows;
    } else if (payload && payload.__opplan){          // ordem + nomes das operações (merge por chave)
      var opl = writeMapApp('PLANO OPS APP', payload.__opplan); out.ok = opl.rows;
    } else {
      applyEditsBatch(payload, out); base = true;   // edições de campo (dose, estoque, área…): mexem na BASE
    }
  } catch(err){ out.msgs.push('payload inválido: ' + err); }
  finally {
    // invalida o cache: o próximo puxar traz o dado fresco. Só a parte APP, a não ser que mexeu na BASE.
    if (base) cacheClear(); else cacheClearApp_();
    lock.releaseLock();
  }
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

   Preço AUTOMÁTICO: a coluna VALOR do PORTIFÓLIO puxa o preço da aba local "PREÇOS"
   por fórmula (VLOOKUP local, sem IMPORTRANGE). A aba PREÇOS é preenchida quando o
   app publica os preços (tela Preços → "Publicar preços").

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
  garantirPrecosBancoIn(nb);   // aba local "PREÇOS" (preenchida pelo app; VLOOKUP local)

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
  garantirPrecosBanco();   // aba local "PREÇOS" (preenchida pelo app; VLOOKUP local)
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
// preço: VLOOKUP LOCAL na aba "PREÇOS" da própria planilha (sem IMPORTRANGE — robusto).
// A aba PREÇOS é preenchida quando o app publica os preços (Preços → Publicar preços).
function precoFormula(L){
  return "=IFERROR(VLOOKUP($C" + L + ",'PREÇOS'!$A:$B,2,FALSE),0)";
}
// garante uma aba "PREÇOS" (local) com cabeçalho, para o VLOOKUP não quebrar antes de publicar
function garantirPrecosBancoIn(book){
  if (!book) return;
  var s = book.getSheetByName('PREÇOS');
  if (!s){ s = book.insertSheet('PREÇOS'); s.getRange(1,1,1,4).setValues([['PRODUTO','À VISTA','A PRAZO','SAFRA']]); s.setFrozenRows(1); }
}
function garantirPrecosBanco(){ garantirPrecosBancoIn(ss()); }

/* ------------------------- RELIGAR PREÇOS (rodar à mão) -------------------------
   Conserta o "não puxa preços": garante a aba local PREÇOS e reescreve as fórmulas
   da coluna VALOR do PORTIFÓLIO para buscar nessa aba (VLOOKUP local, sem IMPORTRANGE).
   Depois, no app: Preços → "Publicar preços" preenche a aba PREÇOS e o VALOR aparece.
   No editor, selecione "ligarPrecos" e Executar. */
function ligarPrecos(){
  garantirPrecosBanco();
  var P = ss().getSheetByName('PORTIFÓLIO');
  if (!P){ Logger.log('Sem aba PORTIFÓLIO'); return 'Sem PORTIFÓLIO'; }
  var last = P.getLastRow(), n = 0;
  if (last >= 4){ var nn = last - 3, cvals = P.getRange(4, 3, nn, 1).getValues(), f = [];
    for (var i = 0; i < nn; i++){ var L = 4 + i; f.push([ S(cvals[i][0]) ? precoFormula(L) : '' ]); if (S(cvals[i][0])) n++; }
    P.getRange(4, 19, nn, 1).setFormulas(f);   // col S = VALOR
  }
  var msg = 'VALOR religado em ' + n + ' produto(s) (busca local na aba PREÇOS). Agora, no app: Preços → Publicar preços.';
  Logger.log(msg); try { ss().toast(msg, 'Pronto', 15); } catch (e) {}
  return msg;
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
  resumoBloco(v, 1, (t.nome || t.id), t.area || 0, t.produtividade || 0, t.empreendimento || '', t.plantio || '', 10, 224, plano.ciclo);
  hdrRow(v, 9);
  preencheOps(v, plano.principal || [], 10, 17);
  // ---- safrinha: resumo (231-234), cabeçalho (237) e operações (238-451) ----
  resumoBloco(v, 231, (t.nome || t.id) + ' — Safrinha', t.area || 0, t.prod_safrinha || 0, t.emp_safrinha || '', t.plantio_safrinha || '', 238, 451, plano.ciclo_safrinha);
  hdrRow(v, 237);
  preencheOps(v, plano.safrinha || [], 238, 17);
  return v;
}
// bloco de resumo do talhão a partir da linha r (1-based): título, área, produtividade, cultura, plantio + custos
function resumoBloco(v, r, titulo, area, prod, cultura, plantio, opR0, opR1, ciclo){
  v[r + 3][0] = 'Ciclo (dias):';        v[r + 3][1] = ciclo || '';                                    // A{r+4} · B{r+4}
  v[r + 4][0] = 'Colheita estimada:';   v[r + 4][1] = '=IF(OR($B' + (r + 3) + '="",$B' + (r + 4) + '=""),"",$B' + (r + 3) + '+$B' + (r + 4) + ')';  // plantio + ciclo
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
