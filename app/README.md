# App — Planejamento de Safra 26/27

Web app **estático** (sem backend) para planejamento completo por talhão, com
demanda de compras, cotação e DRE orçada. Os dados base saem da planilha
`PLANEJAMENTO_SAFRA_2627.xlsx`; suas edições ficam salvas no navegador
(`localStorage`).

## Como rodar

**Opção 1 — arquivo único (mais fácil):** abra **`planejamento_app.html`** direto
no navegador (duplo clique). É uma versão autocontida (HTML+CSS+JS+dados em um só
arquivo), não precisa de servidor. Gere-a com:

```bash
python3 scripts/build_singlefile.py
```

**Opção 2 — servidor local** (usa `index.html` + `data.json` separados):

```bash
cd app
python3 -m http.server 8091
# abra http://localhost:8091
```

## Publicar no GitHub Pages

Já existe o workflow `.github/workflows/deploy-pages.yml` que publica a pasta
`app/`. Como o token do Actions não tem permissão para **ligar** o Pages
sozinho, é preciso habilitar uma vez (passo único):

1. No GitHub, vá em **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Faça o merge desta branch na `main` (ou rode o workflow manualmente em
   **Actions → Deploy app to GitHub Pages → Run workflow**).
4. O app fica em `https://favbalanca-ai.github.io/PLANEJAMENTO-INSUMOS/`.

Enquanto isso, há uma **versão hospedada** pronta (link enviado no chat) e o
arquivo único `planejamento_app.html` para abrir localmente.

## Telas

- **Painel** — indicadores: área total, demanda de compras (R$), custo de
  insumos, itens sem preço; custo por cultura, compras por classe, maiores compras.
- **Talhões** — criar, duplicar (copiando o plano de outro) e excluir talhões;  lista dos 20 talhões; edite **área** e **produtividade** e o
  cálculo (produção, custo/ha, custo total) atualiza sozinho. Clique para abrir.
  Em todo o app o talhão aparece **só pelo nome** (ex.: "ESTEVÃO"): códigos na frente do nome
  ("NV2-", "TL02-") são escondidos (`tNome`). O código continua sendo o nome da **aba** na planilha e
  aparece discreto só na coluna "Aba" da lista de Talhões e no detalhe do talhão.
- **Talhão (detalhe)** — operações da safra principal e safrinha, com produtos,
  **dose/ha editável**, preço, custo/ha. Cada operação tem uma **máquina**
  (conjunto) sugerida automaticamente pela classe dos insumos e trocável no
  seletor; o custo de máquina/ha entra no subtotal da operação.
- **Demanda de Compras** — consolida a demanda de todos os talhões e subtrai o
  **estoque** (editável): `A comprar = máx(0; Demanda − Estoque)`. Itens sem
  preço podem ter o preço preenchido ali.
- **Estoque → filtro de Saldo** — seletor ao lado da busca: *Todos os saldos · Não zerado · Positivo · Negativo ·
  Zerado* (com a contagem de cada um); combina com a classe, a busca e "só com movimento", e vale também para
  o **Relatório PDF**.
- **NF-e → ♻️ Reclassificar nota já recebida** — em *Compras registradas* (botão na nota vinda do XML, nas duas
  visões) ou na seção *♻️ Reclassificar uma nota já recebida* (lista as notas RECEBIDAS da planilha). Abre a
  conferência de novo (data da entrada anterior, itens do de-para); ao confirmar com **Regravar entrada**, a
  entrada é **substituída** — mesma chave no razão (`[#chave]`), em NFE ITENS, no de-para e em COMPRAS APP —
  sem duplicar. Até a regravação subir, o estoque já desconta a entrada antiga (`subst`). Importar o mesmo XML
  por fora continua bloqueado (a mensagem aponta o Reclassificar).
- **NF-e de SEMENTE** — quando a unidade do produto no app é de sementes (**5MM**, 60MIL…), o fator de conversão
  sai do **nº de sementes da embalagem** lido na descrição da nota ("BIG BAG 5.000.000 SEM", "SC 200.000
  SEMENTES", "5MM", "200 MIL"): ex. 8 bags de 5 milhões + 5 sacos de 200 mil = **8,2** (antes contava 13).
  Memória do de-para com fator 1 numa semente de outro tamanho é recalculada. O fator continua editável.
- **Aviso claro quando a planilha está sem permissão (v270)** — "Baixar e anexar pelo link" (bula/FISPQ) e outros
  pedidos à planilha que voltam com "Você não tem permissão para chamar UrlFetchApp.fetch…" mostram a instrução:
  rodar `autorizarPermissoes` no Apps Script e aceitar (`permAviso`). A função nova no Code.gs pede todas as
  permissões de uma vez (planilha, Drive, internet, Gmail, gatilhos).
- **Revisão do Administrativo, fase 4 — segurança (v311)** — (1) com usuários cadastrados na planilha, o
  **Financeiro e os cadastros só chegam a quem entrou com login** (o Code.gs tira `financeiro`/`vendas` do pacote e
  recusa gravações do Financeiro sem sessão, mesmo com EXIGIR LOGIN = NÃO); as telas explicam e oferecem "Entrar";
  (2) a tela Usuários avisa quando EXIGIR LOGIN está em NÃO e já há usuários; (3) o token de sessão vai **no corpo** do
  POST (`cap.sCorpo`), não mais na URL; GET e planilha antiga continuam pela URL; (4) **Sair** apaga do aparelho
  compras, recomendações, fila de NF-e, fotos, extrato e log (ficam só URL da planilha, auto-sync, token da NF-e e
  módulo); (5) `__retorno` só aceita recomendação que existe em RECOM LINKS e limita os campos; (6) ids das planilhas
  SST e Banco de Preços passam a ser lidos da CONFIG APP (`PLANILHA SST`, `BANCO PRECOS`) antes do valor no código.
- **Revisão do Administrativo, fase 3 — conciliação e fechamento (v310)** — (1) lançamento do extrato cujo fornecedor
  tem título em aberto fora da janela de ±10 dias vira "escolha o título" (não mais avulso pronto que duplicava a
  despesa); (2) o mesmo título em duas linhas bloqueia a confirmação; valor pago ≠ saldo aparece na pergunta;
  (3) avulsos ganham campo **CPF/CNPJ** (vai para o Livro Caixa) e a regra DE-PARA BANCO guarda o DOC; (4) linhas sem
  decisão sobem como PENDENTE (outro aparelho vê); (5) o extrato lido e as decisões ficam guardados no aparelho
  (`planejamento_banco`) e voltam ao reabrir a aba; fechar pergunta antes de descartar; (6) **↩ Desfazer** a última
  conciliação (até 7 dias): apaga as baixas e os avulsos e devolve as linhas a pendentes; (7) título cancelado tem
  Reabrir; editar o valor de um título com baixas recalcula PARCIAL/PAGO (app e planilha); (8) reclassificar uma nota
  mantém vencimento, categoria, imóvel, obs e forma de pagamento ajustados à mão nos títulos em aberto; (9) fechamento
  com e-mail que falha registra a pasta como "só salvo" em vez de perder o link.
- **Revisão do Administrativo, fase 2 — integridade (v309)** — (1) remessa de entrega futura: "Aprovar" espera
  carregar os contratos (`nfeRemessaResolver`) e, sem contrato ligado, deixa a nota para a pessoa; a planilha nunca
  mais apaga a CHAVE REFERENCIADA do XML com uma referência vazia; (2) reclassificar uma nota recebida respeita a
  quantidade recebida (falta/avaria) e o fator novo (`nfeQtdItem`), e a planilha mantém quem/quando recebeu
  (`reclass:true`); (3) a entrada no razão vai **no mesmo pedido** da classificação (`cl.entrada`) e do recebimento
  (`payload.entrada`): não fica mais "status gravado, estoque não"; (4) nota "recebida sem XML" que casa depois ganha os
  títulos a pagar e um alerta ⚠ na caixa de entrada com botão Reclassificar; alerta de nota cancelada ganha "Estornar
  entrada"; (5) a planilha recusa rebaixar RECEBIDA para EM TRÂNSITO e receber de novo uma nota já recebida (envio
  atrasado de outro aparelho); ignorar uma nota tira a entrada do razão; (6) "Não é venda" desfaz na planilha e
  fornecedor/CNPJ/produtor voltam do XML; (7) nota EM TRÂNSITO ou contrato registrado por engano pode ser **reaberto**
  (`nfeReabrirStatus`: botão ↩ no contrato sem entrega e link na conferência do Receber) — itens, títulos, apropriações
  e entrada são desfeitos; (8) diesel/Arla só entram no tanque quando a nota **chega** (recebimento) ou na entrada
  direta; ignorar ou cancelar a nota tira do tanque.
- **Revisão do Administrativo, fase 1 (v308)** — correções pequenas achadas na revisão do módulo:
  (1) módulo Máquinas liberável para operadores (`MODULOS_APP` no Code.gs estava sem `maquinas`); (2) toque duplo em
  "Registrar baixa" não grava duas vezes (id nasce ao abrir o formulário + trava `_bxBusy` + botão desabilitado);
  (3) "Notas do mês" do fechamento contava zero (filtro por `docTipo` "NF-e"; agora chave de 44 dígitos ou
  "1 - Nota fiscal"); (4) excluir uma baixa feita pela conciliação solta a linha do EXTRATO BANCO (volta a PENDENTE);
  (5) gravar o WhatsApp das etiquetas limpa o cache da CONFIG APP (o número antigo voltava por 6 h); (6) Receber nota
  com trava contra toque duplo (`REC.enviando`) e "Quem conferiu" já vem com o usuário logado; (7) de-para: cópia local
  já enviada é descartada quando a planilha tem a chave — a planilha vence; (8) a IA não recebe mais o CPF do
  produtor; fator que a IA não informou vem 0 e o app aplica a regra de embalagem, e fator que diverge >25 % da regra
  fica amarelo; (9) "Aprovar todas" espera a venda gravar e não marca como pronta remessa (contrato) nem tipo que não
  entra com item para o estoque (`trava` no cartão); (10) fila de NF-e: recusa definitiva da planilha sai da fila com
  o motivo no toast (`nfeErroPermanente`), só rede/"ocupada" reenvia; (11) remessa de contrato não abate o "em pedido"
  de novo; (12) Cadastros só para ADMIN quando há login, link "registrar compra" só com acesso, teclado numérico em
  Inicial/Em pedido; login com mensagem única (não revela logins).
- **Tabela de CFOP na conferência (v307)** — o tipo da nota passa a ser decidido pelos 3 últimos dígitos do CFOP
  (`CFOP_TAB`, igual no Code.gs): além de venda, faturamento e remessa, agora há compra de combustível/lubrificante,
  bem do ativo, uso e consumo, bonificação, demonstração, conserto/serviço, industrialização, devolução, energia,
  comunicação/frete e consignação/vasilhame. Cada tipo tem um aviso explicando o que acontece e o destino sugerido
  dos itens (diesel/Arla → Tanque, óleo → Máquina, bem → Máquina, consumo → Oficina, energia/frete/vasilhame →
  Ignorar). O CFOP aparece com o nome (`CFOP_NOME`) no item e no cartão. Confirmar um tipo que "não entra" com item
  no estoque pede confirmação. Caso que motivou: óleo 15W40 com CFOP 1662 aparecia como "Outra operação".
  Ver `docs/NFE_RECEBIMENTO.md` §6.
- **Busca na caixa de entrada de Notas + arquivos de outra conta (v306)** — campo 🔎 acima dos cartões: filtra por
  fornecedor, nº da nota, CNPJ, produtor, tipo, data, valor, chave e o que a IA reconheceu (produto/máquina); várias
  palavras = todas precisam bater; mostra "n de N"; a busca sobrevive ao redesenho (`NFE_UI.q`, `nfeAplicaBusca`).
  Na planilha, arquivo lido que não pode ir para a lixeira ("Access denied: DriveApp" = arquivo de outra conta do
  Google) é movido para `NFe/Lidos` ou só desligado da Entrada; se nada funcionar, a nota fica registrada, o arquivo
  entra numa lista de "já lidos" (`NFE_ARQ_FEITOS`) e não é lido de novo — acaba o erro repetido a cada 15 min. A
  mensagem diz o passo que falhou (ler / gravar / tirar da Entrada) e o app explica o que é "Access denied".
- **Máquinas do cadastro na lista "Máquina ou bem" (v305)** — na conferência da NF-e (peças, oficina) e no
  Financeiro, a lista de máquinas (`maqListaManut`) agora inclui as cadastradas no módulo Máquinas (aba MÁQUINAS APP),
  não só as da CUSTO OPERAÇÃO e as que já apareceram em notas. Ex.: caminhão MB1313 cadastrado passa a aparecer ao
  digitar parte do nome.
- **Caixa de entrada de Notas: avisos legíveis (v304)** — os arquivos rejeitados aparecem **agrupados por motivo**
  ("7× NFS-e (nota de serviço) — não entra no estoque…"), com os nomes escondidos num "n arquivos" e a contagem
  total; a planilha agora diz o que o arquivo é (NFS-e, CT-e, NFCom, MDF-e, carta de correção, manifesto…) em vez de
  "não é XML de NF-e". Erro de permissão do Drive vira **um** aviso só, com quantos arquivos esperam na NFe/Entrada
  e o passo a passo do `autorizarPermissoes` (sem o texto cru do erro repetido dez vezes); outros erros são agrupados
  por mensagem. Funções: `nfeRejeitadasHtml`, `nfeErrosHtml`, `_nfeAgrupa`.
- **Editar e apagar conjuntos, inclusive os da planilha (v303)** — em ⚙️ Conjuntos e custo cada linha tem ✏️ e 🗑.
  O lápis abre a edição de máquina, implemento (listas montadas pelo uso real nos conjuntos: plantadeira/plataforma
  entram como implemento) e tipo de operação. Mudar máquina ou implemento renomeia: para um conjunto montado o
  registro vira o nome novo; para um da CUSTO OPERAÇÃO o app cria o conjunto novo (`c:`) com os mesmos números e
  **oculta** o antigo (`ov:` com `oculto:true`), porque a linha da planilha não é apagada pelo app. As operações do
  talhão e as recomendações em rascunho que usavam o antigo passam para o novo. 🗑 exclui o montado ou oculta o da
  planilha (confirmação; as operações que o usavam voltam à sugestão automática). Os ocultos ficam numa lista
  "Conjuntos ocultos da planilha" embaixo da tabela, com ↩ restaurar. Correção: escolher de novo um conjunto para
  uma operação cujo registro tinha sido apagado não "pegava" (`del` antigo ficava no merge).
- **Conjunto como modelo da operação (v302)** — em **⚙️ Conjuntos e custo**, "Montar conjunto" escolhe a
  **máquina** e o **implemento** no cadastro do módulo Máquinas (ou "outra… digitar"); escolher a máquina já preenche
  L/h e R$/HM do cadastro. Cada conjunto ganha um **tipo de operação** (Pulverização, Plantio, Adubação/Correção,
  Colheita, Preparo de solo, Outra) — coluna nova na tabela; quando não escolhido, o app adivinha pelo nome e mostra
  com "?". A sugestão automática de conjunto da operação usa esse tipo (herbicida → Pulverização, semente → Plantio…)
  antes da busca por palavra no nome. Tudo o que antes ficava só no aparelho sobe para a aba **CONJUNTOS APP**
  (payload `__conjunto`): conjuntos montados (`c:`), edições de largura/velocidade/eficiência/L/h/R$/HM/operação dos
  conjuntos da CUSTO OPERAÇÃO (`ov:`, só o que mudou) e o conjunto escolhido em cada operação do talhão (`op:TL|P3`).
  Os dados antigos do aparelho são migrados e enviados na primeira abertura (`conjMigrar`). Na **recomendação** e na
  **execução do Campo** o select mostra primeiro os conjuntos do tipo da operação e, embaixo, o rendimento
  ("🚜 ≈ 12,2 ha/h · ~6,5 h para 80 ha") — a linha vai para o PDF, para a leitura da recomendação enviada e para o
  texto do WhatsApp. Trocar o conjunto na recomendação atualiza a operação no planejamento (fonte única); no Campo,
  o conjunto da recomendação enviada vem pré-selecionado. Correção no redesenho parcial: um `select` cuja lista de
  opções mudou de estrutura (optgroup) ficava vazio depois de editar outro campo da mesma tela.
- **Todas as máquinas na aba MÁQUINAS APP (v301)** — antes a aba só recebia as máquinas editadas no Cadastro; as da
  CUSTO OPERAÇÃO e das notas ficavam só em memória. Agora o primeiro abastecimento ou OS de uma máquina já a grava na
  aba (`maqRegistrar`) e o Cadastro tem o botão **"Enviar as N que faltam para a planilha"** (`maqRegistrarTodas`).
- **Etiquetas separadas (v300)** — dois botões: **Etiquetas WhatsApp** (um QR do WhatsApp por máquina, só aparece com
  o número salvo) e **Etiquetas App** (um QR `MAQ:<id>` por máquina). Cada PDF tem um QR grande por máquina, três por
  linha. `maqEtiquetas(modo)`.
- **Abastecimento pelo WhatsApp, sem app (v299)** — em Cadastro de máquinas informa-se o **número de WhatsApp**
  que recebe os abastecimentos (vai para a aba CONFIG APP, chave WHATSAPP MAQUINAS, e fica no aparelho; nunca no
  código). As etiquetas ganham um **QR do WhatsApp**: a câmera comum do celular abre a conversa com a mensagem pronta
  "ABASTECIMENTO · máquina [m:id] / Horímetro / Litros / Origem"; o operador preenche e envia. No escritório,
  Abastecimento → **📥 Importar do WhatsApp**: escolhe a conversa exportada (.txt, Android ou iPhone) ou cola as
  mensagens; o app entende ABASTECIMENTO, HORÍMETRO (só leitura) e MANUTENÇÃO (vira OS corretiva aberta), reconhece a
  máquina pela etiqueta `[m:id]` ou pelo nome, mostra a prévia (🟢 pronto, 🟡 falta dado com campos para corrigir,
  ✔️ já importado) e grava tudo de uma vez; cada mensagem vira um id `wa:` e reimportar não duplica. Consumo passa a
  contar entre **enchimentos** (leitura de horímetro só marca horas). Funções: `maqWhats`, `maqWaLink`, `waParse`,
  `waInterpreta`, `waImportHtml`, `waGravar`.
- **Custo-hora real no custo do talhão (v298)** — em **Resultados**, cada operação que tem início e fim registrados
  no Campo e uma máquina com custo-hora real (módulo Máquinas) passa a custar **horas × R$/h real**; as outras seguem
  pelo planejado da CUSTO OPERAÇÃO. Coluna nova **Máquinas** (com "real N/M op." e o planejado no título), KPI de
  custo com a contagem, ficha do talhão com "Máquinas/ha … real …". No Painel da frota e no PDF da máquina, as
  **horas por talhão** vindas do Campo. O consumo e o custo-hora passam a usar o **método do tanque cheio**: o que
  entrou depois da primeira leitura do horímetro é o consumido no período (o primeiro enchimento não conta como
  consumo). Funções: `maqDeConjunto`, `maqHorasPorTalhao`, `opMaqReal`, `custoMaqRealSeq`, `custoMaqRealTalhao`.
- **Conjuntos planejados também no módulo Máquinas (v297)** — a tela Máquinas do Planejamento (conjuntos, rendimento,
  L/h, R$/hora e custo por passada) aparece também no módulo Máquinas como **⚙️ Conjuntos e custo**, sem trocar de
  módulo (`VIEW_MOD.maquinas='both'`, `TELA_MODS`), com um aviso ligando ao Painel da frota (o real).
- **Máquinas, parte B (v296)** — **📷 Ler QR pela câmera ao vivo**: abre a câmera e reconhece o QR Code da
  máquina no vídeo (leitor do aparelho ou zxing-wasm; sem câmera ou negada, cai na foto). **Nota de diesel no tanque**:
  na apropriação da NF-e há o destino **🛢️ Tanque de combustível**; ao confirmar, os litros entram no tanque da
  fazenda (entrada com id da nota, reenviar não duplica), o título fica na categoria Combustível e a IA já sugere o
  destino. **Relatórios em PDF**: por máquina (resumo, plano de preventivas, abastecimentos, OS, peças das notas) e da
  frota (custo por máquina, R$/h real × planejado). Funções: `qrScanAbrir`, `qrScanTick`, `maqRelHtml`,
  `frotaRelHtml`, `maqPdf`; `nfeDestManut` aceita `tanque`, `nfeCategoriaManut` → Combustível.
- **Módulo 🚜 Máquinas: abastecimento, manutenção e custo-hora real (v295)** — módulo novo (permissão por usuário
  como os outros) com quatro telas. **Painel da frota** (`#/frota`): um cartão por máquina com horímetro, horas na
  safra, combustível (L e R$), consumo real L/h × planejado da CUSTO OPERAÇÃO, peças e serviços (notas apropriadas +
  ordens de serviço), **custo-hora real × planejado** e a próxima preventiva; alertas de preventiva vencida, OS
  aberta há mais de 7 dias e consumo 20 % acima; KPIs da frota e saldo do tanque da fazenda. **Abastecimento**
  (`#/abastecimento`): máquina pelo nome ou **📷 QR Code** colado nela (`MAQ:<id>`, lido pelo leitor do aparelho ou
  pelo zxing-wasm), horímetro obrigatório (avisa se voltou), litros, combustível, origem tanque/posto com valor,
  operador; ao registrar mostra o L/h desde o último abastecimento e **avisa as preventivas** (faltam X h / vencida);
  entradas no tanque da fazenda e saldo. **Manutenção** (`#/manutencao`): plano de preventivas por horas (a cada
  250 h…) e ordens de serviço **preventiva, corretiva ou reforma** com horímetro, peças, mão de obra e status; OS
  preventiva concluída reinicia o contador do plano. **Cadastro** (`#/maqcad`): máquinas e implementos da CUSTO
  OPERAÇÃO + das notas + novas; horímetro inicial, consumo e custo-hora planejados, tanque, ativa; etiquetas QR em
  PDF. Dados em `OV.maqApp`, `OV.abast`, `OV.osMaq`, sobem pelo lote (`__maqCad`, `__abastecimento`, `__osMaq`) e
  funcionam sem internet. Funções: `maqTodas`, `maqHorimetro`, `abastGravar`, `abastConsumo`, `tanqueSaldo`,
  `planoStatus`, `maqAlertas`, `osGravar`, `maqCustos`, `maqLerQr`, `maqEtiquetas`.
- **Referência de dose da bula na recomendação (v294)** — embaixo da dose de cada insumo aparece **"📖 bula:
  0,03 a 0,05 L/ha"** (faixa cadastrada em Preços → Bulas; "até X" quando só há máxima). Dose **acima da bula** fica
  em **vermelho** (campo e número), com "ACIMA +N%" na linha da bula, aviso no rodapé da tabela ("⛔ 1 dose(s) acima
  da bula …") e toast ao digitar; abaixo da mínima fica âmbar. Produto sem bula mostra "sem bula · cadastrar" e bula
  sem dose mostra "bula sem dose · informar", com link para a ficha. O PDF leva a linha "bula: …" e pinta a dose
  acima de vermelho. Funções: `bulaDoseRef`, `bulaRefHtml`, `bulaDoseCls`.
- **Campo: arredondar por tanque não multiplica mais a dose (v293)** — caso real: dessecação da Roncador, PREMIO a
  0,04 L/ha, 25 ha por tanque = 1 L; com embalagem de 20 L cadastrada na bula, "Arredondar por tanque" subia para meia
  embalagem (10 L) e a dose realizada virava 0,4 L/ha; a recomendação criada do planejamento herdava o 0,4. Agora
  `tankRedondo` só usa a embalagem quando o volume é pelo menos meia embalagem e **nunca mexe mais que 10 % na dose**
  (`TANK_MAX_DIF`); fora disso vale o passo "de balde" (0,5 · 0,1 · 0,01). Volume por tanque digitado que mude a dose
  50 % ou mais avisa na hora ("+900 % do planejado — confira"). Na recomendação, item cuja dose veio ajustada do Campo
  mostra **"📅 planejado 0,04 L/ha (+900 %) · usar o plano"** (`it.plan`, ação `recomDosePlano`) e, se a diferença
  passar de 50 %, um aviso no rodapé da tabela pede conferência antes de aprovar.
- **Fechamento mensal e envio ao contador (v292 — Fase C do Administrativo)** — Financeiro ganhou a aba
  **📅 Fechamento** (produtor + mês). **Checklist** automático: notas sem classificar e em trânsito, títulos vencidos
  sem baixa, pagos sem conta, extrato de cada conta conciliado até o fim do mês, pendências do LCDPR e se o mês
  anterior foi fechado (⛔ impede o LCDPR, ⚠️ é aviso, cada item com link "resolver"). **Resumo** em regime de caixa:
  entradas e saídas por categoria com o mês anterior e variação, resultado, a pagar/a receber em aberto, notas de
  compra e vendas faturadas no mês, saldo de cada conta no último dia. **Gerar documentos** monta o relatório em
  **PDF** (gerado no app), os lançamentos do mês em **CSV** e o **LCDPR do ano até o mês** (.txt; só sem pendências ⛔).
  **📧 Enviar ao contador** manda os três pela planilha (Gmail da conta dela), com o resumo no corpo do e-mail, para o
  e-mail do contador do produtor (ou o contador geral) com cópia ao produtor, e guarda tudo em
  `Financeiro/Fechamentos/AAAA-MM` no Drive; "Só salvar no Drive" guarda sem enviar. O mês fica marcado "Enviado em …"
  e pode ser reenviado (os arquivos são substituídos). `lcdprDados(cpf, ano, ate)` ganhou a data limite. Funções:
  `fechChecklist`, `fechResumo`, `finFechamentoHtml`, `fechRelatorioHtml`, `fechCsv`, `fechGerar`, `fechEnviar`
  (payload `__fechamento`).
- **Conciliação bancária — Banco do Brasil e Sicoob (v291 — Fase B do Administrativo)** — Financeiro ganhou a aba
  **🔁 Banco**: importe o extrato em **OFX** (ou CSV) e o app reconhece a conta pelo número do banco (001 BB, 756
  Sicoob) + conta cadastrada. Cada lançamento vira um cartão: 🟢 *casou com um título* (mesmo valor, vencimento até
  10 dias, mesmo produtor; débito → a pagar, crédito → a receber), 🟡 *escolha o título* (mais de um candidato: nunca
  grava sozinho), ⚪ *lançamento avulso* (sem título: categoria vem das regras da planilha, das regras padrão — tarifa,
  energia, folha, impostos, combustível… — ou do botão 🤖 Sugerir categorias), ⏭ *ignorar* (aplicações e transferências
  entre contas próprias) e ✔️ *já conciliado* (a linha já entrou antes: nunca duplica). **Confirmar** manda tudo de uma
  vez: baixas nos títulos casados e título pago + baixa para os avulsos; o Extrato por conta, o Livro Caixa e o LCDPR
  já enxergam. Mostra **saldo no banco × saldo no app** e a diferença (precisa do saldo inicial com data em Cadastros →
  Contas). Funções: `ofxParse`, `csvBancoParse`, `bancoContaDe`, `bancoCands`, `bancoRegraDe`, `bancoClassificar`,
  `finBancoHtml`, `bancoConfirmar` (payload `__concilia`), `bancoIa` (`__bancoIa`).
- **Caixa de entrada "Notas" com classificação automática por IA (v290 — Fase A do Administrativo)** — o menu
  "Compras" virou **📥 Notas**: cada nota que chega na pasta do Drive aparece como um cartão já classificado pela
  planilha (regras + IA, modelo Claude no Apps Script). Cartão **verde** = a IA reconheceu todos os itens (produto e
  fator do estoque, peça → máquina, material de oficina, benfeitoria, palete/embalagem a ignorar) e o botão
  **✅ Aprovar** confirma em um toque sem abrir a conferência (compra fica *em trânsito* e entra no estoque ao receber;
  venda da produção vai para a aba VENDAS com a cultura que a IA indicou). Cartão **amarelo** = só os itens em dúvida
  ficam para você (botão Conferir, item 🟡). Na conferência, os itens vindos da IA aparecem com a etiqueta **🤖 IA**
  (`NFE_ST.ia`) e uma caixa mostra o motivo e a confiança, com **Refazer com a IA**; a memória do de-para do
  fornecedor continua tendo prioridade sobre a IA, e cada aprovação alimenta essa memória. Notas sem classificação
  têm o link "classificar agora"; com 2+ notas prontas aparece **Aprovar N prontas**. Contratos e Pendências saíram
  do menu e abrem por links dentro de Notas. Funções: `nfeAprovar`, `nfeAprovarTodas`, `nfeIaPedir`, `nfeIaResumo`,
  ramo IA em `nfeItemInicial` (confiança mínima `NFE_IA_MIN` = 0,75). Sem a chave na planilha a IA fica desligada e
  tudo funciona como antes.
- **Venda por cultura, não por empreendimento (v289)** — a colheita de vários talhões vai para um armazém só, então na
  conferência da venda escolhe-se a **cultura** (Soja, Milho, Feijão, Laranja…) e, se souber, a safra (1ª, 2ª ou "não
  sei / as duas"). Em Resultados o preço médio da cultura vale para **todos os empreendimentos** dela (a tela diz
  "vale para FA-SOJA SEQUEIRO, FA-SOJA IRRIGADO…"); o painel Vendas da safra e o estoque de grãos agrupam por cultura,
  e o de-para da balança (Cadastros) passa a apontar para a cultura. Vendas antigas gravadas com o nome do
  empreendimento continuam valendo (o app reconhece a cultura pelo nome). Culturas novas: laranja, arroz, girassol,
  aveia, milheto.
- **Nota de venda reconhecida pelo produto da fazenda (v288)** — uma nota cujos itens são só **soja, milho, feijão,
  laranja** (e sorgo, trigo, algodão, arroz, girassol) é tratada como **venda do produtor** quando é contranota de
  entrada do comprador (tpNF 0 ou CFOP 1xxx/2xxx) ou é emitida por um CPF — mesmo que o produtor ainda não esteja em
  Cadastros → Produtores. A conferência de venda mostra o nome do produtor que veio no XML com o aviso "não
  cadastrado" e o link para o cadastro. A captura da planilha segue a mesma regra (não marca IGNORADA).
- **Financeiro → Vendas só com o controle financeiro e contábil (v287)** — contratos e cargas saem do Financeiro
  (ficam no app da balança). A aba passa a mostrar: **faturado** (notas de venda conferidas), **recebido** (baixas,
  sem compensações), **a receber** (com vencidos) e **adiantamentos a compensar**; tabelas **por comprador** e **por
  produtor** (com link para o Livro Caixa do produtor) e a lista de **títulos a receber em aberto** com o botão
  💳 Receber. Resultados e Cadastros → Balança continuam iguais.
- **Produtor da nota na lista e na conferência (v286)** — em Compras, cada nota a classificar mostra 👤 o produtor
  (destinatário) e a conferência ganha o cartão **Produtor (destinatário)** com o nome do cadastro (Cadastros →
  Produtores), ou o nome do XML quando o CPF/CNPJ não está cadastrado, destacado como "fora da lista de produtores".
- **Apropriação da NF-e: máquina, oficina ou benfeitoria (v285)** — além de insumo (estoque) e peça/serviço → máquina,
  cada item da conferência pode ir para **🧰 Material de oficina** (tipo: ferramenta, consumível, EPI, outro) ou
  **🏗️ Benfeitoria** (nome da obra — galpão, cerca, curral… com memória dos nomes já usados — e tipo: construção,
  reforma, elétrica, hidráulica, outro). O app sugere pela descrição (cimento, telha, arame, tinta, fio… → benfeitoria;
  ferramenta, eletrodo, lixa, luva, EPI… → oficina) e a memória do de-para guarda destino, nome e tipo por item e
  fornecedor. O banner da nota ganhou **Tudo → máquina / oficina / benfeitoria**. Nada disso entra no estoque: vai
  para a aba MANUTENÇÃO MÁQUINAS com a coluna **DESTINO**. O título a pagar da nota recebe a categoria
  **Benfeitorias** quando a obra vale mais que o resto, senão **Manutenção**. A tela Máquinas → "Manutenção e
  benfeitorias" agrupa por máquina, 🧰 Oficina e cada 🏗️ benfeitoria; o CSV ganhou a coluna Destino.
- **Painel do Campo só com parâmetros operacionais (v284)** — saíram os cartões financeiros (Insumos aplicados ·
  custo real, Grãos em estoque e Vendas da safra). Esses números continuam em Resultados, Relatórios e Financeiro.
- **Mapa: experimentos ocultos por padrão (v283)** — o mapa volta a mostrar só os talhões com a cor do semáforo. Os
  experimentos aparecem apenas quando a pessoa pede: na ficha do talhão, cada experimento tem **👁️ Mostrar no mapa**
  (vira 🙈 Ocultar), e há **mostrar todos** / **ocultar do mapa**. O escolhido é desenhado tracejado na cor dele, com
  etiqueta e balão (Ficha do talhão · Experimentos · Ocultar), e continua visível ao redesenhar o mapa até ser ocultado
  ou o app ser fechado.
- **Mapa: experimento só no contorno (v282)** — a faixa de referência aparece como linha tracejada grossa na cor
  escolhida, **sem preenchimento**, com uma etiqueta pequena embaixo do nome do talhão; a cor do semáforo do talhão
  (verde, amarelo, vermelho) continua à vista. Tocar dentro da faixa abre a ficha do talhão; tocar na linha abre o
  balão do experimento.
- **Mapa: experimento que cobre o talhão (v281)** — o balão do experimento ganhou **📋 Ficha do talhão** ao lado de
  🧪 Experimentos: quando a faixa de referência cobre o talhão inteiro, o toque cai no experimento e a ficha do
  talhão continuava inacessível pelo mapa.
- **Estoque de grãos com valor estimado (v280, fase 6B)** — a aba *Estoque* da balança (sacas colhidas na recepção e
  expedidas, por safra e cultura) chega ao app em `pesagem.estoque`. Por cultura do app: **em estoque** = colhido −
  vendido, **comprometido** = saldo dos contratos, **disponível** = estoque − comprometido. Valor estimado pelo
  **preço médio das vendas da safra** (aba VENDAS); sem nota da cultura, pelo preço médio contratado; sem contrato,
  pelo preço orçado — a tabela diz qual foi usado. Aparece em **Resultados → Vendas da safra** (tabela "Estoque de
  grãos"), como KPI em **Financeiro → Vendas** e como card no **Painel do Campo**. Não entra na margem nem na DRE. O
  de-para em Cadastros → Balança lista também as culturas da aba Estoque.
- **Balança (Pesagem v2) — contratos de venda e cargas (v279, fase 6A)** — a planilha do Planejamento lê, só para
  consulta, a planilha do app da balança (abas *Contratos*, *Pesagem* e *NFAs_Emitidas*) a cada 10 min e manda ao
  app na chave `pesagem`. **Cadastros → ⚖️ Balança**: link da planilha (vazio = a planilha procura sozinha) e o
  **de-para produto da balança → cultura do app**. **Financeiro → 🌾 Vendas**: contratado, entregue na balança,
  faturado (notas conferidas) e saldo a entregar com valor previsto; tabela de contratos (comprador, produto →
  cultura, preço por saca, contratado/entregue/saldo/faturado em sacas, status) e, tocando no nº, as cargas
  (data, placa, kg, NFA, nota conferida / a conferir / sem NFA). Os **XML das NFAs** emitidas pela balança entram
  sozinhos na captura de 15 min como "Venda do produtor". Em **Conferir venda** o contrato e a carga (ticket) vêm
  sugeridos pelo nº da NFA, a cultura pelo de-para, e a tela compara o preço da nota com o do contrato e o peso da
  balança com o da nota. A aba VENDAS ganha CONTRATO e TICKET. **Resultados → Vendas da safra** mostra também os
  contratos por cultura (contratado, entregue, saldo, R$/sc contratado); o preço real continua vindo só das notas.
- **Experimento: área de referência marcada com o celular (v278)** — em *Nova Ação* do talhão (Mapa → toque no
  talhão, ou Campo) o item **🧪 Experimento** abre a tela `#/experimento/<talhão>`: um sub-limite **dentro do talhão**
  para faixa de variedade, teste de produto, dose ou testemunha. Só referência: não muda a área do talhão, o estoque
  nem a demanda; pode haver vários no mesmo talhão, inclusive sobrepostos. Dois jeitos de marcar: **📍 Marcar cantos**
  (vai a cada canto e toca em Marcar; também dá para tocar no mapa e arrastar os pontos numerados) e **🚶 Caminhar o
  contorno** (Iniciar/Pausar/Continuar: um ponto a cada 3 m, só com precisão até 15 m; parado não grava). A tela
  mostra o limite do talhão, a posição do GPS com a precisão (vermelho quando fraca — pede confirmação antes de
  marcar), nº de pontos, área em ha e aviso de **ponto fora do limite**. Formulário: nome, tipo, data, cor (sugere
  uma ainda não usada no talhão) e observação. Mínimo 3 pontos. Sem internet o mapa não aparece, mas o GPS continua
  marcando. Depois: polígono tracejado na cor escolhida no **Mapa** (tocar mostra nome, tipo, ha e link), seção
  **🧪 Experimentos** na ficha do talhão (ver, editar, baixar **KML** para o monitor da máquina, remover), evento na
  Timeline, e na **Recomendação** o seletor **Área de referência** preenche a área a aplicar com os ha da faixa (o
  cartão e o PDF mostram o experimento). Fica em `OV.experimentos` e sobe para a aba **EXPERIMENTOS APP** quando o
  Code.gs tiver o ramo `__experimentos` (até lá funciona só no aparelho).
- **Venda de grãos pela nota fiscal (v277 — fase 5 do financeiro)** — a planilha reconhece a nota de **venda do
  produtor** (emitida pelo CPF/CNPJ de um produtor cadastrado) e a **contranota de entrada** do comprador
  (`tpNF` 0 com o produtor como destinatário): ficam em Compras com a etiqueta *Venda do produtor* e o botão
  **🌾 Conferir venda** (nada entra no estoque). A tela mostra comprador, produtor, parcelas e os itens em **kg
  (padrão)**, **sacas de 60 kg** e **toneladas** (T/TON, SC, @ são convertidos), com R$/sc; sugere a **cultura do
  app** pela descrição (soja, milho, sorgo…) e a safra. Se o comprador já tinha **adiantamento** recebido (título a
  receber com categoria Adiantamento, pago), dá para marcar o que esta nota quita: vira uma baixa especial
  (conta 999, etiqueta *compensação*) que **não** entra no extrato nem no Livro Caixa. Ao confirmar: aba
  **VENDAS**, títulos **a receber** (categoria Venda de grãos) com as parcelas do XML, e o **preço médio por saca
  passa a ser o preço real** em Resultados (painel *Vendas da safra*; o preço digitado no talhão continua
  valendo se existir) e no Painel do Campo (card *Vendas da safra*). "Não é venda" volta para a conferência
  de compra; a planilha aceita desfazer (`__nfeVenda {desfazer:true}`).
- **Peças e serviços apropriados por máquina (v276)** — na conferência da NF-e cada item tem um terceiro caminho
  além de "produto do app" e "ignorar": **🔧 Peça ou serviço → máquina**. O item não entra no estoque; vira uma
  linha na aba **MANUTENÇÃO MÁQUINAS** (data, fornecedor, NF, máquina, tipo do gasto, item, quantidade, valor real
  com frete e impostos, produtor). O app **reconhece** a nota de peças pelo nome do fornecedor (máquinas, peças,
  implementos, serviços, oficina, pneus, posto…), pela descrição dos itens (filtro, óleo, rolamento, correia,
  pneu, mão de obra, revisão, frete…), pelo CFOP de serviço/conserto e pela memória do de-para; mostra o aviso
  "Parece nota de peças ou serviços" com o botão **Apropriar a nota inteira** (máquina da última compra desse
  fornecedor já sugerida) e deixa trocar item a item (rádio Insumo × Peça/serviço, máquina com lista dos
  conjuntos + "outro bem" digitável, tipo do gasto: peça, pneu, óleo, serviço, combustível, frete, outro).
  O de-para memoriza destino, máquina e tipo (colunas DESTINO · MÁQUINA · TIPO GASTO). Nota só de peças gera o
  título do Financeiro com categoria **Manutenção**. Tela **Máquinas** ganha o painel **🔧 Manutenção na safra**
  (total por máquina, por tipo, lista e CSV) — só informação, o R$/ha das operações continua pelo R$/HM. Notas
  **ignoradas** podem ser listadas em Compras ("Ver as N notas ignoradas") e reabertas com **Reabrir e conferir**.
  Funções: `nfeDetectaPecas`, `nfeTipoMaqGuess`, `nfeMaqUltima`, `maqListaManut`, `nfeItemValor`, `manutPainelHtml`,
  `exportManutCsv`, `nfeIgnoradasHtml`, `nfeReabrirConferir`.
- **Livro Caixa Digital do Produtor Rural (v275, fase 4 do Financeiro)** — segmento **📒 Livro Caixa** no
  Financeiro: escolhe produtor e ano, mostra as **pendências** que travam a geração (com link para resolver), o
  **resumo mensal** (Q200) e os **lançamentos** (Q100, com filtro por mês), e gera o arquivo
  `LCDPR_<CPF>_<ano>.txt` + um **CSV de conferência** para o contador. Um lançamento por **baixa** (valor que saiu
  ou entrou na conta; conta "Caixa" vira 999 = numerário em trânsito; título a receber = receita, a pagar =
  despesa, categoria "Adiantamento" = tipo 3). O leiaute inteiro fica em `LCDPR_LEIAUTE` (versão 1.3 como
  conhecida — **confira o primeiro arquivo com o contador**). Cadastros ganham os campos do leiaute: produtor
  (endereço, UF, código IBGE do município, CEP, telefone, e-mail, forma de apuração), imóvel (CAEPF, inscrição
  estadual, endereço, código IBGE, CEP, código só números), conta (nº do banco, país), **contrapartes** do imóvel
  (condômino, arrendante, parceiro, comodante) e o **contador** (um para todos, na CONFIG APP). Ao gerar, o app
  carimba "LCDPR GERADO <CPF> <ano>" na CONFIG APP. Detalhes em `docs/LCDPR.md`. Funções: `lcdprDados`,
  `lcdprTxt`, `lcdprCsv`, `finLivroHtml`, `lcGerarTxt`.
- **Baixa na conta do produtor e extrato (v274, fase 3 do Financeiro)** — o botão "Pago" virou **💳 Baixar**:
  registra data, **conta do produtor** (só as dele; com uma só, já vem escolhida), valor pago (vem com o saldo),
  juros/multa (já dentro do valor pago, informado à parte), desconto, observação e **comprovante** (foto reduzida
  ou PDF, para a pasta Financeiro/Comprovantes ao lado da planilha). Abatido do título = valor pago − juros +
  desconto; saldo = valor − Σ abatidos; o título fica ABERTO / **PARCIAL** / PAGO (pagamento em várias baixas é
  permitido). Cada título mostra "▸ N baixa(s)" com a lista (conta, valores, link do comprovante, excluir; excluir
  recalcula o status). Títulos marcados "pago" na v273 sem conta aparecem como **Pago · sem conta** com o botão
  **Completar baixa**. Os cards do Financeiro passam a somar o **saldo** dos títulos. Segmento **🏦 Extrato por
  conta**: movimentos (baixas) por conta, produtor e período, com entrada/saída e **saldo corrente** a partir do
  saldo inicial da conta (campos novos Saldo inicial e Data do saldo em Cadastros → Contas); **⬇ CSV do período**
  com uma linha por baixa (data, conta, produtor, fornecedor, documento, chave da NF-e, valores, comprovante).
  Funções: `finBaixarAbrir`, `finBaixaFormHtml`, `finBaixaSalvar` (`__finArquivo` + `__baixa`), `finBxDel`,
  `finSaldo`, `finAplicaStatus`, `finMovimentos`, `finExtratoHtml`, `exportFinExtratoCsv`.
- **Financeiro: cadastros e títulos a pagar (v273, fase 2 do Financeiro)** — no módulo Administrativo, a tela
  **Financeiro** substitui o Fluxo de Caixa local (o caderno no aparelho foi aposentado; `#/fluxocaixa` abre o
  Financeiro). Os dados vivem na planilha (chave `financeiro` do pacote: abas PRODUTORES, IMÓVEIS RURAIS, CONTAS
  BANCÁRIAS e TÍTULOS), só para quem tem o módulo Administrativo.
  - **Títulos de nota fiscal nascem sozinhos**: ao confirmar a nota em Compras, a planilha relê o XML e grava um
    título por parcela do bloco de cobrança (vencimento, valor, forma de pagamento, fornecedor, produtor
    destinatário). Nota sem parcelas vira 1 título com vencimento igual à emissão e a observação "confirmar".
    Nota cancelada cancela os títulos em aberto; remessa de entrega futura não gera título (o dinheiro é da nota
    de faturamento). O app lê as parcelas no XML (`nfeLerXml`: `dups`, `pag`), mostra na conferência
    ("Pagamento: 3 parcelas · boleto") e manda junto no `__nfeClassifica` como reserva.
  - **Tela Financeiro** (`V.financeiro`): cards A pagar em aberto, Vencidos, 7 dias e 30 dias; chips de situação;
    busca; filtros por produtor e mês; lista por vencimento com dias de atraso; **Novo título** manual (recibo,
    folha, energia, arrendamento, venda…); editar; **✔ Pago** (só a data; conta bancária, juros e desconto entram na
    fase 3); reabrir; cancelar título de nota; excluir manual. Gravação `__titulo` (`finPost`), idempotente pelo ID.
  - **Tela Cadastros** (`V.cadastros`, só ADMIN): produtores (CPF, nome, e-mail do contador, imóvel padrão),
    imóveis rurais (código, CAD ITR, município, exploração, produtor, participação %, fazenda do app) e contas
    bancárias. Gravação `__cadFin`. Os CPFs da aba PRODUTORES também valem para a captura de NF-e.
  - O card do Administrativo no Início avisa títulos vencidos e os que vencem em 7 dias.
- **Custo real no estoque e R$/ha realizado (v272, fase 1 do Financeiro)** — o custo de cada produto passa a vir
  do que foi pago nas notas, não só do preço de referência da planilha. `custoMedioCalc` monta, por produto, a
  linha do tempo: **estoque inicial** da safra (valor = custo inicial digitado na tela Estoque → senão o preço da
  **última nota** do produto → senão o preço de referência, marcado `ref.`), **entradas** (compras e NF-e com o
  preço pago: custo real com frete e impostos) e **saídas** (operações concluídas, TS feito e recomendações
  avulsas aprovadas), em ordem de data. Cada entrada recalcula o **custo médio ponderado**; cada saída sai pelo
  custo médio **do dia da aplicação** (`custoSaidaOp`), e o número não muda quando chega nota nova depois.
  Onde aparece: **Estoque** (colunas Custo inicial, Custo médio e Valor saldo a custo real; KPI com a referência
  embaixo; relatório PDF), **extrato do produto** (R$/un de cada entrada, custo de cada saída), **Relatórios →
  Uso de produtos** (Custo real ao lado da Referência, na tela, no CSV e no PDF), **ficha do talhão** (Realizado ·
  custo real R$/ha) e **Painel do Campo** (card Insumos aplicados · custo real). A tela **Resultados** passa a
  valorar o realizado pelo custo médio (`custoInsumoRealSeq`). O custo inicial digitado vai para a coluna
  **CUSTO INICIAL** do PORTIFÓLIO (edição `custoIni`, mesmo caminho do EM PEDIDO). As saídas enviadas à planilha
  (`__saida`) levam o `custo` de cada item, e o razão MOVIMENTAÇÃO ESTOQUE ganha as colunas VALOR UNIT e VALOR TOTAL.
  Tudo é calculado no app a partir do que já está sincronizado; a DRE continua a preço de referência.
- **Relatórios → Aplicações no período (v271)** — relatório para lançar as aplicações no sistema externo (Agro1):
  escolha **De / Até** (e, se quiser, fazenda e talhão) e o app lista, **por talhão, uma ficha por operação
  realizada** com os dados da tela "Aplicação de Insumos" (data da aplicação, operação, tipo, cultura, área aplicada,
  operador, máquina, vazão, tanque, nº de tanques, calda total, horário, estádio, alvo, observação) e, embaixo,
  os insumos daquela operação (tipo do item, item, unidade, área, dose/ha, total). Entram operações concluídas ou
  parciais do Campo (cada etapa vira uma ficha com a própria data), TS feito e recomendações avulsas aprovadas;
  aplicações sem data são avisadas e não entram em período nenhum. Botões **CSV** (uma linha por insumo, com os
  dados da operação repetidos) e **PDF**. Depois de lançar, **"Marcar como lançado até dd/mm"**: o próximo período
  já começa no dia seguinte e as fichas antigas ficam com o selo "✓ lançado". A marca e o período ficam só no
  aparelho (`localStorage`, chave `planejamento_agro1_rel`). Funções: `agro1Todas`, `agro1Filtradas`,
  `aplicacoesPeriodoHtml`, `exportAplicacoesCsv`, `exportAplicacoesPDF`.
- **Conserto: NDVI do talhão em foco não aparecia no mapa (v268/v269)** — os tiles WMS em EPSG:3857 com a `GEOMETRY`
  do talhão vinham vazios (recorte em lat/lng) ou com erro (recorte em metros, v268), embora a legenda e os percentis
  (GetMap em CRS:84) funcionassem. Na v269 a camada em foco deixou de ser tiles: é **uma imagem** pedida do mesmo jeito
  das estatísticas (`ndviFocoImagem`: GetMap em CRS:84, recortada no limite, 5 m por pixel, cores das 6 faixas) e
  colocada no mapa como `L.imageOverlay` na caixa do talhão. Erro do Copernicus vira aviso com a resposta dele.
- **Plantio com vários materiais: PDF/WhatsApp/quadro em sacos e sementes por ha (v267)** — a unidade **Sc60M** (saco
  com 60 mil sementes) e variações ("SC 60 MIL", "60M", "5MM") passam a ser lidas (`semPorUn`, rótulo `sc`/`bag`); a
  tabela de materiais mostra área, sc/ha, sacos, sementes/ha e sementes por metro de cada um. Semente de cada
  material: população informada × ha ÷ sementes por saco; sem população e com uma linha do material no plano, vale o
  total da linha (dose × área do talhão, a convenção da dose "equivalente"). Sementes não aparecem mais entre os
  "Fertilizantes e líquidos". `plBl` dá o plural certo (bags / sc / sacos).
- **Plantio com vários materiais no mesmo talhão (v266)** — no cartão da operação de plantio (Campo → 🌱 Recomendação
  de plantio) entra o bloco **🌽 Materiais no talhão**: cada linha é um híbrido/cultivar (sementes do portfólio) com os
  hectares que ocupa; "＋ Outro material" adiciona, e o app avisa quando a soma não bate com a área do talhão. A
  população é a mesma para todos; a semente de cada material é calculada pela sua embalagem. Fica em `rl.sems`
  (REALIZADO APP, sincroniza). Entra no quadro, no WhatsApp, no PDF do plantio e na página do operador (um card de
  baixa por material, `pl.ms`); a recomendação criada da operação ganha uma linha de semente por material com a área.
  Na Recomendação (direta ou do plano), toda linha de semente tem o campo **ha** (vazio = talhão inteiro): total,
  retorno e baixa usam a área da linha; o cartão mostra a soma dos materiais. O planejamento (demanda) continua com a
  semente do plano — ajuste lá se quiser comprar os dois materiais.
- **Recomendação: máquina escolhida da lista (v265)** — o campo "Máquina / conjunto" do cartão virou uma lista com os
  conjuntos da aba Máquinas (mais "✏️ Outra (digitar)…" para drone, avião, terceiro). Na recomendação direta, ao
  escolher o primeiro insumo o app sugere o conjunto pela classe (pulverizador para defensivos, adubadora para
  fertilizantes, plantadeira para semente, distribuidor para corretivo), igual ao planejamento; a recomendação vinda de
  uma operação continua trazendo a máquina do plano.
- **Conserto: recomendação direta não guardava os insumos (v264)** — desde a v234 (tela Receber nota), o tratador de
  mudanças da tela Receber pegava qualquer campo `data-recf`/`data-reci` da página e parava ali; a Recomendação usa os
  mesmos atributos, então produto, dose, nome, área etc. digitados no cartão não eram salvos e "Enviar por WhatsApp"
  respondia "Adicione ao menos um produto". Agora esses tratadores só valem na tela Receber (`emReceber`).
- **Chuva da estação meteorológica, pela planilha do Monitor de Irrigação (v262/v263)** — com a linha **PLANILHA IRRIGACAO**
  (link da planilha do app de irrigação) na aba CONFIG APP — o Code.gs procura e grava o link sozinho na primeira
  sincronização (v263) —, o puxar traz `chuva_est`: a chuva diária da aba CLIMA
  (estação Ecowitt da fazenda; dias sem leitura preenchidos pela estação do INMET da aba CLIMA INMET; fazenda sem
  estação = chuva estimada pelo modelo, marcada). A tela **Chuva** ganha o painel 🌦️ Estação meteorológica (7 dias,
  30 dias, mês, acumulado; meses recolhíveis com os dias de chuva e a fonte), por fazenda (seletor); o pluviômetro
  manual continua abaixo. O Painel do Campo mostra **Chuva · 30 dias 🌦️** da estação quando há dados (toque abre a tela
  Chuva); sem estação, continua o registro manual. `chuvaEst`, `chuvaEstDias`, `chuvaEstFazKey` (casa o nome da fazenda
  da irrigação com FA/FE).
- **Inserir operação mesmo com operações finalizadas (v261)** — no Talhão (Planejamento), o ＋ de "Inserir operação"
  passa a funcionar quando a safra já tem operação em execução ou concluída: a nova operação entra **no fim da
  lista** (não no meio), para os slots das executadas não mudarem de lugar na planilha — a chave da baixa no estoque,
  das recomendações e do realizado é o slot. Reordenar e excluir continuam travados nessa situação. Depois de
  inserir: renomear, definir o DAE e adicionar os insumos; ao sincronizar, a aba do talhão ganha o bloco novo.
- **Quadro de operações: finalizadas mostram o que foi baixado e o manejo aplicado (v260)** — na janelinha do cartão
  (`oqPopOpen`), operação concluída ou parcial troca a tabela de doses previstas por **📦 Produtos baixados** (produto,
  dose real = volume ÷ área aplicada, volume baixado; TS marcado; se a baixa já foi para a planilha) e **🧑‍🌾 Manejo
  aplicado** (área aplicada com parcial/transpasse, etapas, data, operador, máquina e, quando houve recomendação
  aprovada ligada à operação: nome, aprovação, tipo de aplicação, alvo, estádio, calda, condições, retorno do
  operador; eficácia avaliada na mistura). `oqAplicadoHtml`. Operações abertas continuam com o previsto.
- **Painel do Campo: card Área plantada (v259)** — % da área da fazenda escolhida cujo plantio está finalizado
  (`areaPlantadaResumo`): talhão conta quando a **recomendação de plantio (semente) foi aprovada** ou a operação com
  semente foi concluída no Campo — a mesma regra que define o dia 0 do DAE (`plantioRealDe`). A área é a do talhão;
  plantio parcial ou recomendação aprovada com área menor contam a área feita. Mostra ha plantados de ha totais e o
  nº de talhões; "n parcial" quando há plantio em andamento parcial.
- **Mapa: ferramentas encolhidas num botão (v258)** — os botões Importar arquivos, Importar pasta, ☁️ Drive, 📍 Seguir,
  🛰️ NDVI e 🏷️ nomes saem da barra e ficam dentro de **🧰 Ferramentas ▾**: um toque abre a lista (seleção), outro
  toque, tocar fora ou escolher uma opção fecha (`mapaToolsToggle`). O seletor de Fazenda continua à vista. Os botões
  são os mesmos de antes (mesmos `data-act`), só mudaram de lugar.
- **Contorno sem talhão (v257)** — contorno importado para um talhão que foi apagado ou mudou de código na planilha
  continua desenhado (rótulo "· sem talhão"); antes tocar nele dava "Talhão não encontrado". Agora abre uma folha
  curta (código, nome, área, arquivo) com **🗑️ Remover limite**, e a lista abaixo do mapa ganha a linha
  "⚪ Contorno sem talhão" com Ver/Remover. Esses contornos não entram na contagem nem no filtro de fazenda.
- **Remover limite pela ficha do talhão (v256)** — tocar num contorno no Mapa abre a ficha do talhão; ela ganhou o botão
  **🗑️ Remover limite** (com confirmação) e mostra o arquivo de onde o contorno veio. Serve para tirar um polígono que
  está no lugar errado sem precisar achar o talhão na lista. A remoção é a mesma da lista (`limRemover`: marca `del`
  em `OV.limites`, sobe para `LIMITES APP`, vale para todos os aparelhos) e dá para desfazer em **↩️ Restaurar**.
- **☁️ Drive também na importação do XML da NF-e (v255)** — ao lado de "📄 Importar XML da NF-e" (Adm → Entradas), o
  botão **☁️ Drive** lista os `.xml` da pasta **NFe** do Drive (a da `CONFIG NFE → PASTA NFE`, com Entrada · XML ·
  Rejeitados), mais novos primeiro; escolhe-se um e a conferência abre igual à do arquivo do aparelho
  (`nfeImportarArquivo`). Exige o token da NF-e no aparelho ou login de administrador (mesma regra das ações da NF-e).
  A folha do Drive virou genérica (`driveOpen(tipo)`, `DRIVE_TIPOS`): contornos (vários, Shapefile puxa companheiros)
  e nfe (um por vez).
- **☁️ Drive: importar contornos da pasta do Google Drive (v254)** — no Mapa, o botão **☁️ Drive** abre uma folha
  com os arquivos da pasta **Contornos** (criada ao lado da planilha, no Drive da dona; ou a pasta indicada em
  `CONFIG APP → PASTA CONTORNOS`), incluindo subpastas. Marque os arquivos (KML, KMZ, GeoJSON, ZIP, Shapefile; marcar
  o `.shp` traz o `.dbf`/`.prj` junto) e toque em **Importar**: a planilha entrega o conteúdo (`doGet`
  `acao=drive_lista` / `acao=drive_arquivo`, base64) e a leitura segue igual à do botão "Importar arquivos"
  (`limImportFiles`), com a conferência talhão a talhão antes de salvar. Resolve o celular (iPhone/Android), onde o
  seletor de arquivos não mostra o Drive. Precisa do `Code.gs` v254 publicado; funciona com login do Campo/Adm, com o
  token da NF-e ou quando o login não é exigido.
- **Características agronômicas da cultivar vindas do RNC (v252)** — a ficha da cultivar (Catálogo → Cultivares) ganhou
  o bloco **Características (registro no RNC)**: **Tecnologia** (evento de transformação genética traduzido para o nome
  comercial quando dá: I2X, IPRO, Enlist E3, Conkesta E3, RR2, RR, milho Bt…; "convencional" quando não há evento),
  os **descritores** do relatório de registro (cor da flor, tipo de crescimento, cor da pubescência, cor do hilo,
  reação à peroxidase… em soja; ponta da folha, pendão, espiga… em milho; panícula, arista… em sorgo), **situação**,
  **data e validade do registro** e as **Regiões de adaptação (REC)** por UF. Os dados vêm do arquivo
  `agrofit/rnc_det.json`, colhido pela ação mensal (`scripts/rnc_build.py`) na consulta pública do CultivarWeb,
  **só para soja, milho e sorgo**, das cultivares mais novas para as mais antigas, até `RNC_DET_CAP` por rodada
  (padrão 1500; cada cultivar leva ~1 s). Cultivar ainda sem colheita mostra um aviso. **Grupo de maturação e ciclo
  não constam no RNC** — continuam pelo botão "Buscar na web".
- **🔔 Avisos na barra de cima (v253)** — sino com contador (vermelho quando há atraso, laranja quando só há coisa
  para conferir) que abre a folha *Avisos* com três grupos, calculados no aparelho (`notifItens`): **Aguardando
  conferir para finalizar** (recomendações com retorno do operador esperando aprovação + operações parciais),
  **Operações em atraso** (data passada, não encerradas) e **Operações da semana** (até 7 dias ou em andamento).
  Cada item leva ao Campo do talhão ou à Recomendação. Respeita a fazenda escolhida; atualiza a cada tela
  (`notifAtualiza` no `route`). Opção **Avisar no aparelho**: notificação do navegador, 1 vez por dia ao abrir o app,
  só quando há algo para conferir ou em atraso (precisa da permissão do navegador; sem servidor, só com o app aberto).
- **Seletor de Fazenda também na Recomendação e na Timeline (v251)** — mesma escolha compartilhada. Recomendação:
  talhões do seletor e cartões só da fazenda; Timeline: talhões, eventos e cartões por talhão só da fazenda (eventos
  sem talhão continuam). Trocar a fazenda numa rota com talhão (`#/recomendacao/<id>`, `#/timeline/<id>`) volta
  para a visão geral, porque o talhão pode ser de outra fazenda.
- **Seletor de Fazenda também no Painel do Campo e no Mapa (v250)** — a mesma escolha do quadro (`oqFaz`, guardada no
  aparelho) vale nas três telas (`fazSelectHtml`, `fazOk`, `fazTalhoes`). No Painel filtra os indicadores (operações,
  monitoramentos, chuva, stand, recomendações, talhões com atividade) e a atividade recente; no Mapa, a lista de
  talhões, os limites desenhados e o enquadramento. Registros sem talhão (ex.: chuva geral) continuam aparecendo.
- **Catálogo → Cultivares com cadastro do RNC (v249)** — a ficha da cultivar deixou de mostrar os números do SIGEF
  (campos de produção, estados, safras, área) e passou a mostrar o **cadastro**: nº de registro no RNC, mantenedor e
  tipo de registro, vindos da consulta pública do CultivarWeb (`scripts/rnc_build.py`, roda na ação mensal depois do
  SIGEF: lê as ~384 páginas da lista, casa pelo nome da cultivar e grava `rnc:{n,m,t}` em `cultivares.json`). A lista
  e a folha de escolha mostram "RNC nº · mantenedor". Características agronômicas (GM, ciclo, tecnologia) não existem
  em base aberta — o botão *Buscar na web* procura "<cultivar> características". Se a consulta pública mudar, a ação
  mantém o arquivo anterior e a ficha avisa "não encontrado na consulta pública".
- **Unidade do produto: a planilha manda (v248)** — a unidade vem da coluna **UN** da aba **PORTIFÓLIO**; quando ela
  está preenchida, a lista de Preços é ajustada para a mesma unidade (antes era o contrário: a lista de Preços
  "mestra" sobrepunha a planilha, e mudar na planilha não aparecia no app). Só quando o PORTIFÓLIO não tem unidade é
  que a da lista de Preços vale (`mergePrecosProdutos`, `_unSheet`). *Compras registradas → por produto* mostra a
  unidade **atual** do produto (a gravada em cada compra é histórico).
- **Quadro de operações → faixas que encolhem (v247)** — *Filtros + legenda* e *Linha do tempo* viraram duas faixas
  recolhíveis (`details.oq-fold`); o cabeçalho de cada uma resume o conteúdo mesmo encolhida (filtros escolhidos ·
  "hoje dd/mm · N atrasada(s) · N nos próximos 7 dias"). Tocar no cabeçalho encolhe/expande e a escolha fica no
  aparelho (`planejamento_oq_fold`, `OQ_FOLD`). Na impressão os cabeçalhos somem.
- **Quadro de operações → seletor de Fazenda (v246)** — primeiro filtro do quadro (antes de Safra): *Todas as fazendas ·
  Fazenda Água Viva (n) · Fazenda Espora (n)*. A fazenda é deduzida do **prefixo do empreendimento** do talhão
  (`fazendaKey`: `FA-…` = Água Viva, `FE-…` = Espora; outro prefixo vira "Fazenda XX", sem prefixo = "Sem fazenda";
  nomes em `FAZENDAS`). Filtra as linhas do quadro e a lista do seletor Talhão; a escolha fica no aparelho
  (`planejamento_oq_faz`). O seletor só aparece quando há mais de uma fazenda.
- **Estoque → extrato do produto (v245)** — tocar no **nome do produto**, no número de **Entradas** ou no de **Saídas**
  abre o *Extrato* (`estExtratoOpen`): saídas conhecidas por **data · talhão · operação · origem (Operação / TS /
  Recomendação) · operador · quantidade** (fonte: `usoProdutosDe`, as mesmas do relatório de uso) e entradas por
  **data · fornecedor · nota · quantidade** (compras registradas, COMPRAS APP). O que a planilha tem além do que o
  aparelho conhece aparece como "lançado em outro aparelho ou direto na aba MOVIMENTAÇÃO ESTOQUE" (ou "ainda não
  enviado", quando é o contrário). Responde "de onde saiu esse 8,4?" sem abrir a planilha.
- **Estoque → zerar "Em pedido" e abater pela entrada (v244)** — digitar **0** (ou apagar) num produto que tem EM
  PEDIDO na planilha agora é uma edição de verdade (`pedido = 0` sobe para a planilha); antes o zero era tratado como
  "sem alteração" e o valor da planilha voltava. E toda **entrada registrada** (compra manual, NF-e confirmada,
  recebimento na fazenda) **abate** o em pedido do produto (`pedidoAbater`: 115 pedidos, chegaram 40 → 75; chegou
  mais que o pedido → 0), com aviso na tela; regravação de nota (reclassificar) não abate de novo.
- **Estoque → "Em pedido" ao lado de "Inicial" + aviso de recusa (v243)** — a coluna *Em pedido* saiu do grupo
  escondido da direita e virou a 3ª coluna (cabe na tela do celular sem rolar). No envio automático, se a planilha
  recusar uma edição (ex.: `produto não encontrado: …` quando o nome não está na aba PORTIFÓLIO, ou `sem permissão…`
  para usuário sem módulo Administrativo/Planejamento), o app agora mostra um aviso com o motivo (uma vez por motivo,
  `_pushFalhaAviso`) em vez de ficar mudo — o detalhe continua em Sincronizar → Log.
- **Mapa → ficha do talhão: cabeçalho (v241)** — o resumo passa a ter **Empreendimento** (nome completo, ex.: FA-SOJA
  IRRIGADO 26-27), **Cultura** (só a cultura, deduzida do empreendimento: `culturaNome` → Soja, Milho…), Variedade e
  **Stand** (última contagem da ação Stand do talhão — `standUltimo`: plantas/ha, plantas/m, % da meta e data; a linha
  só aparece quando existe contagem), depois Plantio, Estádio e Operações. v242: contagem anterior ao plantio real
  da safra atual fica de fora (é de outra safra ou teste) e a linha Stand abre `#/stand/<talhão>`.
- **Campo → área a aplicar: transpasse e aplicação parcial (v240)** — na 🚿 *Recomendação de aplicação* o campo
  **Área a aplicar (ha)** (`r.app.area`; vazio = área do talhão, `opAreaDe`) aceita área **maior** (transpasse: 100 ha →
  105) ou **menor** (parcial: 70). Calda, nº de tanques, totais, WhatsApp, recomendação/PDF e a baixa seguem essa área
  (mudar a área na tela Recomendação também leva para o Campo). O **Finalizar** ganhou **Área aplicada (ha)** com o
  aviso do que vai acontecer (`finAreaInfo`): maior ou igual ao talhão → **Concluída** (com a área registrada); menor →
  status **Parcial** (`r.areaFeita`, baixa só do que foi aplicado, já conta no estoque — `opBaixou`), com **▶ Aplicar o
  restante** (nova etapa com os ha que faltam; `r.etapas` guarda as anteriores e as baixas são **somadas**, mesmo id
  `op:` no razão) e **✔ Finalizar sem aplicar o resto** (ou a caixa *Encerrar assim mesmo* já no Finalizar). Parcial
  conta como "em andamento" nos filtros, no quadro e nas tarefas; a timeline mostra "Operação parcial (70 de 100 ha)";
  Reabrir limpa etapas, área e baixa. Tudo dentro do JSON da aba REALIZADO APP: sem mudança no `Code.gs`.
- **PDF da recomendação no Android (v239)** — o leitor de PDF do WhatsApp e de vários celulares Android **não abre
  links dentro do PDF** (só mostra a imagem), então o botão *ABRIR PARA DAR BAIXA* não funcionava lá. Agora o link
  de baixa também sai **fora** do PDF: a janela *PDF pronto* ganhou **🔗 Enviar o link de baixa (WhatsApp)**
  (`pdfLinkMsg`, mesma mensagem curta com o link), *Enviar o PDF* manda o link como texto junto do arquivo
  (`navigator.share` com `text`), e um aviso explica a limitação (em destaque no Android). No próprio PDF, o link
  curto entra também como **texto de verdade no rodapé** (`doc.textWithLink`, selecionável/copiável e clicável nos
  leitores que aceitam), e o bloco do botão avisa para abrir o PDF no Google Drive/Chrome se o botão não abrir.
- **NF-e → ➕ Novo produto (v238)** — ao lado do 🏛️ em cada item da conferência. Abre a folha *Novo produto*
  (`prodNovoOpen`) já preenchida com o nome do item, a unidade sugerida pela uCom da nota (`nfeUnApp`: L, KG, TON, SC)
  e o fornecedor; você ajusta nome, **classe** (lista das classes do portfólio + catálogo) e **unidade** e toca em
  *Cadastrar*. O produto entra no portfólio (lista de Preços + PROD, via `agProdutoGarantir` com `k:'novo'`) e o
  item fica **Confirmado** com o fator recalculado. Nome que já existe é reaproveitado, sem duplicar. Para
  fertilizantes, corretivos e outros itens que não estão no catálogo MAPA.
- **Celular: fonte ~20% menor em todos os módulos (v236 + v237)** — como já estava no quadro de operações. O bloco
  no fim de `styles.css` é gerado por `scripts/css_fonte_celular.py` (lê toda regra com `font-size` em px, aplica o
  fator `FATOR` = 0,81, arredonda em 0,5 px, mínimo 9,5 px; só `@media (max-width:640px)`). Ficam de fora: campos de texto (16 px — o iPhone
  não dá zoom ao tocar), o quadro de operações (já reduzido), PDF/impressão e os botões flutuantes. Mudou um tamanho
  de letra no CSS? Rode o script de novo — ele substitui o bloco.
- **Recomendação → cartões encolhidos e Finalizadas (v235)** — cada cartão nasce **encolhido** (cabeçalho + linha de
  resumo: nº de produtos, área, cultura, primeiros produtos); tocar no cabeçalho expande/encolhe (`recomToggle`,
  memória em `RECOM_UI.aberto`, sobrevive ao redesenho). **Rascunho** (em edição) e **Retorno recebido** (pede
  aprovação) ficam sempre abertos. As **aprovadas** saem da lista principal e ficam na seção **✅ Finalizadas (n)**
  recolhida no fim (abre sozinha no chip Aprovadas), ordenadas pela data da aplicação.
- **Recomendação → folha Buscar insumo (v233)** — no cartão em edição, o botão **🔍** da linha e o **🔍 Buscar
  insumo** do rodapé abrem a folha (`recomInsumoOpen`, modo `insumo` do `agPickOpen`): filtro por **categoria**
  (classes do portfólio + do catálogo), busca por nome / ingrediente ativo / fabricante, **📦 No app (portfólio)**
  primeiro (fabricante, unidade, preço, ingrediente ativo) e **🏛️ Catálogo MAPA** depois, filtrado pela cultura
  do talhão e sem repetir o que já existe no app. Escolher do catálogo cadastra o produto no portfólio + bula
  (`agProdutoGarantir`); a linha recebe produto, unidade, ingrediente ativo e carência da bula. Nome que não existe
  em lugar nenhum ganha a opção **➕ Cadastrar como novo insumo** (entra no portfólio sem classe/unidade). O
  **+ linha** continua para digitar à mão. Nada muda na planilha.
- **Recomendação → visão geral (v232)** — `#/recomendacao` abre **todos os talhões** (o seletor tem "Todos os
  talhões"; `#/recomendacao/<id>`, usado pelo mapa e pelo Campo, filtra um só). Contadores clicáveis **Total ·
  Pendentes · Atrasadas · Agendadas · Aprovadas** (`recomSit`: pendente = enviada/retorno recebido; atrasada = data
  passou sem aprovar; agendada = data de hoje em diante), **busca** que filtra os cartões sem redesenhar
  (`recomAplicaBusca`; talhão, operação, nome, alvo, cultura, produtos, status), atrasadas primeiro e aprovadas por
  último, estado vazio "Nenhuma recomendação encontrada". O painel "Nova recomendação" virou o botão flutuante
  **＋**, que abre as três opções em **pílulas** empilhadas acima dele e vira ✕ (v234; tocar fora recolhe) — os passos
  seguintes sobem numa folha (`recomNovaOpen`): **📅 A partir do planejamento** (talhão → operação; com talhão selecionado vai direto às
  operações), **📝 Recomendação direta** (em branco) e **🔁 Replicar recomendação** (`recomReplicar`: copia para os
  talhões marcados como rascunho, com nova data, área/cultura do destino e operação casada pelo nome). Cartão ganhou
  **Nome da aplicação** e **Tipo de aplicação** (`RECOM_TIPOS`: Terrestre, Drone, Avião, Pivô Central, Gotejo,
  Fertirrigação, Sulco de Plantio, Lanço, Incorporado), que saem no WhatsApp e no PDF. Nada muda na planilha.
- **🏛️ Catálogo MAPA no Administrativo (v231)** — na **conferência da NF-e**, em **Nova compra** e em
  **Receber sem XML**, o campo *Produto do app* ganhou o botão **🏛️** que abre a folha do catálogo (defensivos do
  AGROFIT e cultivares do SIGEF). Se o produto escolhido ainda não existe no app, ele é **criado no portfólio**
  (linha na lista de Preços da safra com classe, fabricante e unidade pela formulação) e, para defensivos, a
  **bula** é preenchida pelo catálogo (`agProdutoGarantir`, mesma rotina do 🏛️ da tela de Preços). Na NF-e a
  folha já abre buscando pelo nome do item; o item fica **Confirmado** com o fator recalculado para a unidade do
  produto. Item **Novo** (nada parecido no portfólio) recebe, depois que o catálogo carrega, a caixa *"🏛️ Catálogo
  MAPA sugere: marca · classe"* com **✓ Usar** — só quando a marca do catálogo está escrita no nome do item
  (`nfeSugereCatalogo`); itens Sugerido/Automático não ganham sugestão do catálogo. Nada muda na planilha nem no
  `Code.gs`: o produto novo sobe pelo mesmo caminho da lista de Preços.
- **Estoque (também no Administrativo)** — a mesma tela aparece nos módulos Planejamento e
  Administrativo (`VIEW_MOD.estoque='both'`, `TELA_MODS.estoque`); abrir por um módulo não troca de módulo.
  Operador com acesso ao Administrativo vê e edita o estoque inicial e o "em pedido".
- **Cotação** — itens a comprar agrupados por fornecedor, com exportação CSV.
- **Compras (entradas)** — compras registradas à mão, por XML de NF-e ou pelo
  Receber nota. A lista **sincroniza entre aparelhos** pela aba `COMPRAS APP` da
  planilha; excluir uma compra tira as entradas dela do estoque em todos os aparelhos.
- **Sincronizar → Log detalhado** — cada conversa do app com a planilha (compras, baixas, de-para,
  execução, edições, puxar, NF-e…): hora, quanto demorou e o que a planilha respondeu (erros em vermelho,
  lentos > 20 s em amarelo). Filtro "Só problemas" e botão **Copiar** para mandar o log numa mensagem.
  Guarda as últimas 300 no aparelho.
- **Login** — tela **Entrar** (login + PIN), **Minha conta** (trocar PIN, sair) e, para o administrador,
  **👥 Usuários**: criar/editar pessoas, perfil (Administrador/Operador), módulos e telas liberados
  (nenhuma tela marcada = todas do módulo), redefinir PIN, desativar. O menu, o Início e as rotas só
  mostram o que é liberado; quem filtra os dados de verdade é a planilha (ver `sync/README.md`).
- **Modo embutido** (`?embed=receber`) — o app aparece dentro de outro (módulo **📦 Receber insumos** do
  Pesagem v2, mesmo site `favbalanca-ai.github.io` → mesmo login no aparelho): sem menus, só as abas
  **Receber** e **Pendências** (conforme a permissão), além de Entrar / Minha conta / ⚙️ Sincronizar.
  Não troca o módulo salvo do app normal.
- **Mapa → 🏷️ Mostrar/Ocultar nomes** — botão no topo do mapa que liga/desliga o nome dos talhões sobre os
  contornos (sem redesenhar o mapa: mantém o zoom). A escolha fica guardada no aparelho.
- **Celular → menu ⋯ Mais (v219)** — no módulo Campo o menu de baixo fica com **Painel · Mapa · Campo ·
  Timeline · ⋯ Mais**; Monitoramento, Chuva, Stand, Aferição, Recomendação, Misturas, Relatórios e Sincronizar
  abrem pela folha **Mais** (`navMaisOpen`; itens marcados com `data-mais="campo"` no `index.html` e
  `data-fold` pelo `applyModule`). Só mostra as telas liberadas pelo login; a tela atual fica destacada e o
  botão Mais fica ativo quando ela está dentro dele. No computador a lista lateral continua completa.
- **Mapa → 📍 Seguir, botão ＋ e 🛰️ NDVI (v225)** — *Seguir* liga/desliga o acompanhamento do GPS
  (`geoSeguir`, `watchPosition`): ponto azul com círculo de precisão, mapa centrado e seguindo; o status mostra
  ±m e o talhão em que você está (`talhaoNaPosicao`, ponto-no-polígono). Lembrado no aparelho
  (`planejamento_mapa_seguir`) e funciona **sem internet** (limites e ponto são desenhados localmente; só o fundo de
  satélite precisa de rede — o status avisa). O **＋** flutuante (`mapaFab`) abre o Nova Ação do talhão onde você
  está; fora dos limites ou sem GPS, abre a lista de talhões (mais próximos primeiro). **NDVI**: camada WMS do
  **Copernicus Data Space** (Sentinel-2, 10 m) com o ID da configuração que a dona cola em *⚙️ Configurar NDVI*
  (guardado só no aparelho, `planejamento_cdse`; é o mesmo Instance ID do Monitor de Irrigação, camada padrão `VEGETATION_INDEX`). **v227:** se a planilha tiver a aba **CONFIG APP** com `COPERNICUS INSTANCE ID`, o puxar traz `config_app` e o app usa esse ID em todos os aparelhos (`ndviPlanilha`); o ID colado no aparelho continua vencendo; controles de data final, janela (7–90 dias) e nuvem máxima;
  o serviço devolve a imagem mais recente da janela (`PRIORITY=mostRecent`); legenda no mapa; erro de tile avisa
  uma vez. **Talhão em foco (v228)**: escolhendo um talhão com limite, o app pede ao FIS do Sentinel Hub as
  datas das passagens pelo **WFS** da configuração (`ndviDatas`, 90 dias até a data, nuvem ≤ 60 %, DSS10 = L2A com
  reserva DSS2) e, para a passagem escolhida, pede o **NDVI cru** (`ndviStats`: GetMap em CRS:84 com evalscript
  que grava o valor no vermelho e a máscara no alfa, ~10 m por pixel até 512 px, `GEOMETRY` do limite), lê os pixels
  numa canvas e calcula mín/máx/média e o 5º e 95º percentil no aparelho (o FIS do Sentinel Hub não existe no
  Copernicus Data Space — responde 404). Depois desenha a camada **recortada no limite** com um evalscript
  de **6 faixas** entre esses percentis (`ndviEvalFaixas`, cores RdYlBu, vermelho = baixo, azul = alto). A legenda
  mostra os 6 intervalos, a média e a variação; seletor de passagem (mais nova primeiro); mapa enquadra o talhão;
  com o NDVI ligado os limites ficam só no contorno tracejado. A ficha do talhão passou a abrir com as seções **encolhidas**.
- **Mapa → Ficha do talhão (v218)** — tocar no limite do talhão abre um cartão (`talFichaOpen`) com nome,
  área do limite e do cadastro, **resumo** (cultura, variedade, plantio + DAP, estádio, status das operações)
  e as operações das duas safras agrupadas por tipo (`talFichaTipo`): **Semeadura**, **Adubação**,
  **Correção de solo** e **Pulverizações** — realizada com a data real e as doses realizadas, planejada em cinza,
  atrasada em vermelho, cancelada riscada — mais as últimas **ocorrências e aferições**. Botões ➕ Nova Ação,
  📋 Campo e 🔍 Centralizar; tocar fora fecha.
- **Nova Ação** — botão da ficha do talhão no mapa (ou ➕ *Ação* na lista de limites / ➕ *Nova ação* na tela
  do talhão no Campo) abre a folha **Nova Ação**: Ocorrência e Outras ocorrências → Monitoramento;
  Recomendação; **Aferição**; Aplicação → operações do talhão; Stand; Anotação e Estimativa de
  produtividade aparecem como *em breve*. Embaixo, links para Operações e Timeline.
- **Campo → Aferição** (`#/afericao/<tipo>~<talhão>`, menu *Aferir*) — abas **Dados** e **Histórico**
  (histórico filtrado pela máquina escolhida). O resumo é recalculado enquanto digita:
  - **Aplicação (pulverizador):** comprimento, largura da barra, espaçamento entre bicos, volume (mL) de
    cada bico no tempo do percurso → **L/ha = média × 10 ÷ (comprimento × espaçamento)**, total na barra,
    CV entre bicos, bicos fora de ±10%, diferença da vazão alvo.
  - **Colheita (perda):** comprimento × largura (m²), peso (g) ou nº de grãos × PMS → **kg/ha = g ÷ m² × 10**
    e sc/ha.
  - **Semeadura: adubo:** g por linha → kg/m e **kg/ha = média × 10 ÷ (comprimento × espaçamento)**; alvo
    sugerido pelo adubo da operação de plantio.
  - **Semeadura: sementes:** contagem (ou peso + PMS) por linha → sementes/m e **sementes/ha**; alvo
    sugerido pela população do plantio.
  - Velocidade: digitada ou calculada pelo **tempo do percurso** (comprimento ÷ tempo × 3,6).
  - Salva na planilha (aba **AFERICOES APP**, ver `sync/README.md`); depois de salvar, a próxima aferição
    já vem com a mesma máquina e medidas. Excluir marca como excluída (some em todos os aparelhos).
- **Campo → Anotações e ocorrências** (`#/ocorrencia/<tipo>~<talhão>`) — pelo menu Nova Ação: **Anotação** e
  **Outras ocorrências → Climáticas / Manutenção/Melhorias / Solo/Fertilidade**. Todas com **Tirar foto /
  Selecionar imagem** (reduzida no aparelho e enviada ao Drive; sem sinal, fica na fila e sobe depois),
  atividade e **Compartilhar** (abre o compartilhar do celular com o texto e a foto; sem suporte, WhatsApp).
  Climática: evento, situação, estádio (lista dos estádios da cultura) e período. Manutenção: ação e **Gerar
  tarefa** (cria a tarefa no quadro do módulo Tarefas). Solo: situação e ação. Aparecem na **Timeline** e
  vão para a planilha (aba **OCORRENCIAS APP**). A "Ocorrência" (pragas/doenças) continua no Monitoramento.
- **Campo → Estimativa de produtividade** (`#/produtividade/<talhão>`, pelo menu Nova Ação) — atividade, **PMS**,
  **fator de correção** (padrão 20%), estádio e tipo de amostragem (**Planta**: nós improdutivos, nós, vagens,
  grãos · **Espiga**: fileiras × grãos por fileira). Quadro Informações: talhão, cultura, cultivar (semente do
  plantio), **amostras recomendadas** (1 a cada 5 ha), plantas **estabelecidas** (da última contagem de Stand,
  pode corrigir) e **produtivas** (estabelecidas × (1 − fator)), média de grãos por planta, **sc/ha** e a
  comparação com a produtividade planejada. Botão **+** abre o **teclado grande**: digite o número e toque no
  que ele é; **OK** guarda a planta e já abre a próxima, mostrando o sc/ha da planta.
  **sc/ha = produtivas × grãos/planta × PMS ÷ 1.000.000 ÷ 60.** Vai para a planilha (aba **PRODUTIVIDADE APP**)
  e aparece na Timeline.
- **Campo → Contagem de Stand** (modelo novo) — atividade, comprimento, espaçamento e meta (sugerida pela
  população do plantio); uma linha por fileira contada. Quadro **Informações**: linhas, **densidade**
  (média ÷ comprimento ÷ espaçamento × 10.000), **CV entre linhas**, plantas/metro, % da meta.
  - **Informar distâncias** (chave): cada linha ganha dominadas, duplas, ausentes e o botão 📏 — a tela
    **Posição das Plantas (cm)** recebe a medida na trena de cada planta (a 1ª no 0). Com a trena o app
    conta sozinho plantas, duplas (< 0,5× o espaçamento ideal) e ausentes (> 1,5×; conta as que faltaram no
    vão). Espaçamento ideal = 100 ÷ plantas/m da meta (sem meta: a média medida). Mostra **CV de
    distribuição**, **% inconformes**, % dominadas/duplas/ausentes.
  - Sincroniza com a planilha (aba **STAND APP**); excluir marca como excluída. Contagens antigas continuam
    aparecendo (e sobem para a planilha).
- **Campo → Quadro de operações** — ao abrir *Operação de Campo* sem escolher talhão aparece o quadro:
  uma **linha por talhão** (nome, cultura · cultivar, área, *Detalhes ›*) e um **cartão por operação**
  (nome, atividade, data, **DAA** = dias desde a aplicação, **Pos. Ciclo** = dias depois do plantio).
  Cores: verde = aplicado · listrado = em andamento · amarelo = faltam até 3 dias · vermelho = atrasado ·
  cinza = dentro do prazo · riscado = *não será realizada*. Filtros de safra (1ª, 2ª, ambas), atividade
  (pela classe dos produtos: Herbicida, Fungicida, Plantio…) e talhão; botão 🖨 Imprimir. O **+** do cartão
  abre o talhão já com a operação aberta. No celular a coluna do talhão fica fixa e os cartões rolam de lado;
  a fonte é menor (v221: cartões de 96 px e 9,5 px, legenda e linha do tempo compactas) para caber mais na tela.
  - **Tocar no cartão** abre uma janelinha: data estimada, data efetiva (em vermelho com ⚠ e quantos dias
    antes/depois, se diferente da estimada), dias após aplicado, situação e a tabela **Produto · Dose/ha ·
    Total** no talhão (dose realizada quando informada, senão a do plano; extras incluídos) + *Ver aplicação ›*.
    No celular ela aparece presa embaixo; fecha no ✕, tocando fora ou com Esc.
  - **Ver planejamento ›** (na janelinha; só para quem tem o Planejamento): abre o talhão no Planejamento, já
    na operação (aberta e destacada em vermelho por alguns segundos) — insumos, doses, DAE e máquina.
  - **‹ Recuar / Avançar ›** (na janelinha): troca a operação de lugar com a anterior/próxima da mesma safra
    do talhão. É só a **ordem de exibição** (quadro e tela do talhão) — vale mesmo com operações concluídas,
    não reescreve a aba do talhão nem mexe em baixas. Fica no registro da operação (`ord`) e sobe para a
    planilha junto com a execução do Campo (aba REALIZADO APP), então aparece igual nos outros aparelhos.
    Sem `ord`, vale a ordem do planejamento.
  - **Visualizar: Por data (semanas)** (padrão) — as colunas são **semanas, iguais para todos os talhões**: cada
    cartão cai na coluna da semana da sua data (mesma semana no mesmo talhão = cartões empilhados); semanas sem
    operação viram colunas estreitas (o mês aparece na virada); coluna "Sem data" no fim para quem não tem
    plantio. A **linha vermelha de HOJE é reta** de cima a baixo, no dia certo dentro da semana, com a etiqueta
    HOJE no cabeçalho; o quadro abre rolado com a semana de hoje no meio. O cabeçalho da semana (*Mais detalhes*)
    lista as operações daquela semana. **Por operação** mantém o quadro antigo (colunas = ordem das operações).
    A escolha fica guardada no aparelho.
  - **Linha do tempo** acima do quadro: régua com os meses, um traço colorido por operação (cor da situação),
    parte já passada listrada, os próximos 7 dias em amarelo e a marca vermelha **Hoje dd/mm**; ao lado, quantas
    estão atrasadas e quantas vencem nos próximos 7 dias. Em cada talhão, uma **linha vermelha** no vão entre os
    cartões mostra onde fica o hoje (depois da última operação com data até hoje); a linha ocupa a altura toda e
    emenda com a do talhão de baixo, formando uma linha vertical contínua onde os talhões estão no mesmo ponto, e o
    cabeçalho "Mais detalhes" ganha a etiqueta **HOJE** no vão da maioria dos talhões. Sai também na impressão.
  - **⚠** no cartão = aplicada em data diferente da estimada · **🔔** = retorno do operador esperando aprovação.
  - **Mais detalhes** (acima de cada coluna): a mesma operação em todos os talhões do quadro — situação,
    estimada, efetiva, DAA e produtos (dose/ha · total), com **+** para abrir cada uma.
- **Status "Não será realizada"** — 4º botão no registro da operação (além de Pendente / Em andamento /
  Concluída). Não conta como atrasada nem como próxima, sai da % de conclusão e tem o chip *Não realizadas*;
  "↩ Voltar a pendente" desfaz.
- **Campo → tirar/voltar produto planejado da aplicação** — na tabela Insumo · Planejado · Realizado da
  operação, o **✕** tira o produto *desta aplicação* (linha riscada, "fora desta aplicação", **↩** volta). Só a
  execução muda (`r.excl[iid]`, vai com a execução para a planilha): o **planejamento do talhão fica igual**.
  Calda por tanque, WhatsApp, recomendação/PDF, baixa no estoque, TS/plantio e o quadro ignoram o produto
  tirado. **+ insumo extra** inclui um produto; os extras passam a entrar também na recomendação/PDF, e a
  recomendação de uma aplicação (não plantio) é refeita a partir do Campo a cada envio, enquanto o operador
  não respondeu. Operação concluída não mostra o ✕.
- **Campo → Recomendação de TS** — toda operação com **semente + produtos de TS** ganha a seção
  🧪 *Recomendação de TS* e o botão **Enviar TS**. A batelada é medida em **bag** (a unidade da semente
  no planejamento, ex.: 5MM); as doses vêm do **planejamento** (por ha) e viram "por batelada"
  (`dose/ha ÷ bags/ha × bags por batelada`). Mostra nº de bateladas, a última (parcial), sementes/ha e,
  com o PMS (opcional), kg/ha. O operador abre o link (`retorno.html` em modo TS), vê a dose por batelada
  e dá baixa: a **semente e os produtos de TS saem do estoque** nessa hora e a operação de plantio
  continua aberta — ao concluir o plantio eles **não saem de novo** (`opBaixaEff`). Se o TS voltar
  **depois** do plantio concluído, a baixa do plantio é reenviada sem a semente; reabrir/reprovar/excluir o
  TS faz o contrário (`tsMarca`). O custo realizado do talhão soma a baixa do TS. Unidades em branco no
  PORTIFÓLIO aparecem como aviso (preencher na planilha).
- **Campo → operação SÓ de TS** — operação **sem semente** mas com produto de classe TS (ex.: "Tratamento
  de sementes" planejado como operação própria) usa o **modelo de batelada**, não o de pulverizador: a
  semente é **emprestada da operação de plantio** da mesma safra (`tsSemDe`), **todos** os produtos da
  operação (TS, fungicida, biológico…) viram dose por batelada e o botão principal é **📲 Enviar TS ao
  operador** (a seção 🚿 de aplicação some). Enviar deixa a operação *em andamento*; a baixa do operador
  (só os produtos — a semente **não** entra, ela baixa no plantio) **conclui a operação** com a data de
  hoje, sem segunda baixa (`tsCalc().soTS`, `tsRecomFromOp` → `tsCfg.semInfo`, `tsMarca`, `opBaixaEff`).
  O link do operador leva a semente em `ts.sn/sd/so` para calcular a batelada.
- **Campo → Recomendação de plantio** — na operação com semente, a seção 🚿 de aplicação vira
  🌱 *Recomendação de plantio*: **população (sementes/ha)** — já vem a do planejamento (bags/ha × sementes
  por bag) e pode ser informada —, plantadeira, início e fim. **Linhas sempre a 50 cm** (fixo):
  `sementes por metro = população × 0,5 ÷ 10.000` (200.000/ha → 10 por metro). Fertilizantes e líquidos
  só **por ha** (kg/ha ou L/ha; tonelada aparece em kg), sem conta de tanque. O WhatsApp e o
  `retorno.html` (modo plantio) mostram "200.000 sementes por ha · 10 por metro" e as doses por ha; na
  baixa, o adubo é digitado em kg e volta para a planilha na unidade do estoque (t). Ao concluir, o
  plantio vira realizado (dia 0 do DAE). Mostra se o TS já foi feito; depois de enviar o TS, os
  produtos de TS saem da recomendação de plantio.
- **Campo → PDF da recomendação** — ao lado de cada "Enviar por WhatsApp" (TS, plantio e aplicação) há
  **🖨 PDF (com link de baixa)**: gera a recomendação pronta para imprimir/salvar ("Salvar como PDF") com o
  botão **👉 ABRIR PARA DAR BAIXA** clicável no PDF (o mesmo link do WhatsApp para o `retorno.html`).
  Gerar o PDF conta como enviado (TS "enviado"; operação "em andamento"). O PDF de plantio mostra em
  destaque sementes por ha, sementes por metro (linhas a 50 cm) e as doses por ha; o de TS, a dose por
  batelada. A tela Recomendação (🖨) usa o mesmo PDF. O link do PDF é **curto** (`retorno.html?s=…&r=<id>`)
  e vem com **QR Code**: ao gerar, o app grava a recomendação na aba `RECOM LINKS` (`__recomLink`) e a
  página do operador busca o resto em `?acao=recom&id=`. Sem o Code.gs novo (ou sem conexão), o PDF sai
  com o link longo, sem QR. QR via `qrcode-generator@1.4.4` (jsDelivr, carregado só ao gerar o PDF).
  O **arquivo PDF é montado no próprio app** (`pdfArquivo`: `html2canvas@1.4.1` + `jspdf@2.5.1`, jsDelivr):
  "Imprimir → Salvar como PDF" do celular perdia os links. A página vira imagem (mesmo visual da
  impressão, ~200–300 KB) e o link entra como link de verdade sobre o botão e o QR Code. O PDF sai
  **sempre numa página só**: se passa do A4, encolhe para caber (até 62%); se for muito comprido, a
  página cresce na altura (nada de tabela/QR cortados entre páginas). Abre a janela
  **PDF pronto**: 📲 Enviar o PDF (WhatsApp… — compartilhar do celular), ⬇️ Baixar, 👁 Abrir e 🖨 Imprimir.
  Sem internet para o gerador, cai na impressão como antes.
- **Máquinas** — catálogo de conjuntos (custo de operação) com **R$/HM** e
  **preço do diesel** editáveis; calcula custo de máquina/ha, diesel/ha e custo
  total/ha, além do custo médio por passada.
- **DRE Orçada** — resultado por cultura: Receita = Produção × Preço; Custo =
  insumos + **máquinas** (somadas por operação) + **arrendamento/outros**
  (R$/ha editável). Preço de venda, custo de máquinas e arrendamento editáveis.
- **Relatórios → Uso de produtos por talhão** (módulo Campo) — só o que **já saiu do estoque**
  (baixas aprovadas): operação concluída com baixa (`opBaixaEff`, sem contar em dobro o que o TS
  já tirou), TS feito (`r.ts.baixa`: semente + produtos) e recomendação avulsa aprovada. Seletor
  de talhão: um talhão mostra **totais por produto** (quantidade, valor = qtd × preço da planilha)
  e os **lançamentos** (data, operação, produto, quantidade, quem); "Todos os talhões" mostra a
  tabela por talhão (R$ e R$/ha, clique abre o talhão) e os totais da fazenda por produto.
  Botões ⬇ CSV e 🖨 PDF (um bloco por talhão). Funções: `usoProdutosDe`, `usoTotais`,
  `usoProdutosHtml`, `exportUsoProdutosCsv`, `exportUsoProdutosPDF`.
- **Preços → 📘 Bula do produto** — botão em cada produto do portfólio abre a ficha: ingrediente ativo,
  concentração, pH ideal da calda, dose mín/máx da bula, carência (dias), reentrada (horas), classe
  toxicológica, grupo/modo de ação, links da bula e da FISPQ, observações, e **anexar PDF** (bula e FISPQ
  vão para a pasta "Bulas" do Drive; o link volta para a ficha). Grava na aba **BULAS APP** (`__bula`,
  `__bulaArquivo`; `bulaDe`, `bulaSalvar`, `bulaArqEnviar`, `bulaApplyPulled`). A **recomendação** usa a
  ficha: ingrediente ativo e carência dos itens (`recomNorm`), reentrada sugerida = a maior entre os
  produtos (`recomCreate`), aviso **⚠ fora da bula** quando a dose sai da faixa (`bulaDoseAviso`) e o pH
  ideal da calda no cartão e no PDF (`bulaPhTxt`). Sem bula, vale a coluna ATIVOS da planilha, como antes.
- **Campo → dose por tanque ajustável** — na 🚿 Recomendação de aplicação, a coluna **Por tanque** dos líquidos
  é editável: digitar o volume redondo que vai no tanque (ex.: 27,5 em vez de 27,503) recalcula a **dose/ha
  realizada** (volume ÷ ha por tanque), a caixa "Realizado" da tabela de insumos, o total na área, o WhatsApp,
  o PDF e a página do operador (`recomItensFromOp` usa a dose ajustada). Abaixo do produto aparece a dose e a
  diferença % vs o planejado. Botão **⚖ Arredondar por tanque** arredonda todos (0,5 L acima de 10 L · 0,1 L
  entre 1 e 10 · 0,01 L abaixo de 1). Digitar o volume exato do planejado limpa o ajuste. O planejamento do
  talhão não muda (`tankSetDose`, `tankArredondar`, `tankRefresh`).
- **Arredondar pela embalagem** — a ficha 📘 Bula ganhou **Embalagem (tamanho + unidade)** (ex.: 5 L, 15 kg;
  coluna EMBALAGEM na aba BULAS APP). Com embalagem cadastrada, ⚖ Arredondar leva o volume por tanque para a
  **meia embalagem mais próxima** (19,5 L c/ 5 L → 20 L; 31 kg c/ 15 kg → 30 kg; 17 L → 17,5 L); sem embalagem,
  vale o passo 0,5/0,1/0,01 (`embDe`, `embTxt`, `tankRedondo`). Ao lado do volume aparece "📦 4 emb. de 5 L" — no
  quadro, no WhatsApp, no PDF e na página do operador (`it.e`/`it.eu` no link). **Sólidos de calda** (WG/WP em
  kg/g: herbicida, inseticida, fungicida…) agora entram na seção "Na calda (tanque)" com coluna por tanque;
  fertilizante, corretivo e semente continuam em "Sólidos — distribuição" (`vaiNoTanque`).
- **TS: bateladas e quantidade por batelada ajustáveis** — na 🧪 Recomendação de TS, a caixa **Nº de
  bateladas** recalcula a batelada (semente total ÷ nº) para ficarem todas iguais, sem última parcial; a coluna
  **Por batelada** é editável por produto (a dose/ha realizada = qtd ÷ bags por batelada × bags/ha da semente;
  `tsCalc` usa a dose ajustada) e **⚖ Arredondar por batelada / embalagem** usa a mesma regra do tanque
  (`tsArredondar`, `tankRedondo`). "📦 N emb." aparece no quadro, no WhatsApp, no PDF e na página do operador.
- **Campo → quadro no PC** — com o quadro aberto o conteúdo deixa de ter largura máxima
  (`.content:has(.oq-wrap)`), e no modo *Por data (semanas)* a semana com **3+ cartões** num talhão vira
  coluna **dupla** e com **6+** vira **tripla** (`oq-cell-2`/`oq-cell-3`, cabeçalho com a mesma largura);
  no celular continua uma coluna simples.
- **🏛️ Catálogo MAPA (Agrofit)** (`#/catalogo`, v222; menu do módulo Preços e ⋯ Mais do Campo) — todos os
  **defensivos registrados no Ministério da Agricultura** (4.4 mil produtos): chips por classe com contagem,
  busca por marca / ingrediente ativo / registro / fabricante e filtro por cultura (produtos "todas as culturas"
  entram em qualquer filtro). A ficha mostra tipo, nome comercial, princípio ativo com concentração, fabricante,
  registro MAPA, formulação, classes toxicológica e ambiental, modo de ação, categoria, uso em orgânicos,
  culturas registradas e, para as culturas da fazenda, os **alvos registrados** (nome comum + científico).
  Os dados são `app/agrofit/produtos.json` (1,7 MB) e `pragas_<cultura>.json` (50–150 KB cada), gerados pela
  ação do GitHub **Catálogo MAPA (Agrofit)** (`scripts/agrofit_build.py`, culturas em
  `scripts/agrofit_culturas.txt`) todo dia 1 ou por *Run workflow*; o app baixa ao abrir a tela e guarda no
  IndexedDB (`agrofitCarregar`), então funciona sem internet depois da primeira vez. Nada vai para a planilha.
  - **Abas (v223)**: **🧪 Insumos** (acima) · **🐛 Alvos** · **🌱 Cultivares**. *Alvos* lista os ~1.700 alvos do
    AGROFIT (`agrofit/alvos.json`): chips por tipo (praga, doença, planta daninha, nematoide — deduzido da classe dos
    produtos registrados), busca por nome popular/científico, filtro por cultura; a ficha traz culturas com registro
    e, nas culturas da fazenda, os **produtos registrados para o alvo** (abrem a ficha do insumo). *Cultivares*
    (`agrofit/cultivares.json`, `scripts/sigef_build.py`) vem do **SIGEF** (dados abertos: campos de produção de
    sementes inscritos no MAPA): 12,7 mil cultivares de 335 espécies, com espécie (nome comum + científico),
    categorias de semente, campos por estado, safras e área inscrita; filtro por espécie e busca. O nº RNC não está
    nos dados abertos — a ficha tem o botão *RNC no CultivarWeb* (site do Ministério, com código de imagem).
  - **Catálogo nos cadastros (v224)** — folha de busca (`agPickOpen`, mesmo padrão do Nova Ação) filtrada pela
    cultura do talhão: **Preços → 🏛️ na linha do produto** (Defensivos: preenche marca, classe do app
    (`agClasseApp`), fabricante curto e unidade pela formulação (`agUnDe`: SL/EC/SC… = L, WG/WP/SP… = KG) e cria a
    **ficha da bula** com ingrediente ativo, concentração, classe tox., grupo, formulação e registro; Sementes:
    cultivar do SIGEF vira produto SEMENTE em SC); **Monitoramento → 🏛️ ao lado de Alvo** (alvos registrados para
    a cultura; preenche o alvo e marca a categoria praga/doença/daninha); **Recomendação → 🏛️ em Alvo e em
    Cultivar** (cultivares da espécie do talhão). O que for digitado à mão continua valendo.
  - **Bula → 🏛️ Buscar no catálogo MAPA**: procura o produto pelo nome (ou pelo registro já preenchido), lista
    os candidatos e, ao escolher, preenche **ingrediente ativo, concentração, classe tox., grupo/modo de ação,
    formulação e registro MAPA** (campos novos `form` e `reg`); você confere e salva.
- **Bula → 🔎 Buscar na web e ⬇ Baixar e anexar pelo link** — embaixo de "Link da bula" e "Link da FISPQ".
  Buscar abre o Google com a pesquisa pronta (`"PRODUTO" bula pdf` / `FISPQ pdf`); a dona copia o endereço do PDF
  para o campo e toca em Baixar: o app manda `__bulaBaixar:{url,tipo}` e a **planilha** baixa o arquivo (o navegador
  do app não consegue, por CORS), guarda na pasta "Bulas" do Drive e devolve o link, que entra na ficha com o
  nome do arquivo e o link de origem (`bulaBuscar`, `bulaBaixar`). Link que não é PDF, 404 ou > 15 MB: aviso e o
  campo fica como estava.
- **Campo → Misturas** (`#/misturas`) — banco de misturas de produtos com eficácia. Toda **recomendação de
  aplicação aprovada** (retorno do operador aprovado) vira um registro automático (`misturaDeRecom`): produtos
  e doses, alvo, talhão, cultura, estádio, data, calda, condições, máquina e operador; TS e plantio não entram;
  reprovar/reabrir a recomendação tira a mistura se ainda não foi avaliada. A **avaliação** (⭐ botão no cartão da
  operação concluída no Campo e na tela Misturas) tem nota Eficaz / Parcial / Não eficaz, data (dias após a
  aplicação calculados), observação e fotos (Drive). A tela agrupa combinações iguais (mesmos produtos, mesmo
  com doses diferentes) com nº de aplicações, barra ✅➖❌⏳ e a lista de aplicações; painel "A avaliar" e filtro
  por nota. A Timeline mostra "eficácia: …" no evento da aplicação. Aba **MISTURAS APP** (`__mistura`;
  `mistApplyPulled`, `mistAvalSalvar`, `mistFotosEnviar`).

## Baixa do operador e aprovação (v180)

- A baixa que o operador envia pelo link (aplicação, plantio e TS) chega como **Retorno recebido** e só sai
  do estoque quando o administrador **aprova** — no cartão da operação no **Campo** (✅ Aprovar baixa /
  ✖ Reprovar) ou na tela Recomendação. Vale só o **último envio** do operador e só uma vez
  (`retornoTs`): reprovar/reabrir não "volta sozinho" no próximo puxar.
- Uma baixa só é marcada como enviada se a planilha **aceitou** (`postOk`); planilha ocupada = tenta de novo.
  A página do operador só mostra "Baixa enviada!" com o OK da planilha.
- Números digitados: `numBR` — "2,5" e "2.5" = 2,5; "1.500" = 1500.
- Operação concluída / TS feito: PDF e WhatsApp não criam outro link de baixa (o PDF diz "Baixa já registrada").

## Revisão fase 1 — nada se perde entre aparelhos (v216)
- **Tarefas e Equipe com merge por registro.** Cada tarefa/integrante leva `_u` (hora da última mudança) e as
  exclusões viram lápides (`TAREFAS.excl` / `EQUIPE.excl` = `{id:_u}`). O envio vai com `merge:1` e a planilha
  mescla por id (abas EQUIPE APP / TAREFAS APP ganham colunas ATUALIZADO e DEL). `tarefasApplyPulled` mescla
  registro a registro (`tarefasMerge`): o celular B não apaga mais a tarefa que A criou, e uma tarefa criada sem
  internet não some ao reabrir.
- **Marcas de envio guardadas no aparelho.** As assinaturas de cada conjunto viram um hash curto (`sigHash`) e
  ficam em `planejamento_sync_sigs` (`sigsSalvar`/`sigsCarregar`). Ao reabrir, o que foi feito offline continua
  pendente e sobe no portão de entrada — antes, a primeira puxada carimbava tudo como enviado.
- **Fotos e PDFs pendentes no IndexedDB** (`idbGet`/`idbSet`, `filaCarregar`/`filaSalvar`), fora do limite de 5 MB
  do localStorage; o que estava no localStorage migra sozinho. PDF pelo celular limitado a 2 MB (acima disso,
  "Baixar e anexar pelo link"). `lsSet` avisa uma vez por minuto quando a memória do aparelho enche.
- **Baixas de estoque na fila.** `pushOpSaida`/`clearOpSaida` esperam a sincronização ficar livre
  (`esperaLivre`); limpeza de saída que falhou fica marcada (`saidaClearPend`) e `pushSaidasPendentes` reenvia.
- **Hora da planilha nos carimbos.** O puxar traz `_srv.now`; `srvRelogio` calcula o desvio do relógio do celular
  e `tsAgora()` é usado em todo `_u` (um celular com hora errada não vence nem perde o conflito à toa). Desvio
  acima de 2 min aparece no Log detalhado.
- Tipo cuja aba a planilha ainda não confirmou fica pendente no lote (não é descartado); `limitesApplyPulled`
  igual aos demais mapas; `realEnsure` nasce com `_u`; funções de envio antigas (`ocorPush`, `realizadoPush`…)
  removidas; `SYNC_TIPO` completo.

## Revisão fase 3 — app no celular (v217)
- **Memória por render (`memo`).** Dentro de `route()` as funções pesadas — `effItems`, `opsOf`,
  `campoOpsDoTalhao`, `talhoesAll`, `plantioRealAutoDe`, `opDataPlan`, `oqAtividades` — calculam uma vez por
  chave e reaproveitam o resultado no mesmo desenho da tela (`_M`). A memória nasce no começo de cada `route()`
  e é zerada no fim, então nunca fica velha: a próxima tela já vê a mudança. Fora do render (eventos) calculam
  normalmente.
- **`mergePrecosProdutos` só refaz quando a lista de preços muda** (`PRECOS_VER`/`_mpKey`): `savePrecos`,
  a chegada de preços da planilha e a troca da lista de produtos invalidam o atalho.
- **`pendingInfo` com folga de 400 ms** (`_piCache`): o contador de pendências, chamado várias vezes por
  gravação, não refaz a conta em sequência.
- **Envio delta (`loteDelta`).** Como a planilha mescla por chave/`_u`, cada tipo manda só os registros que
  mudaram desde o último envio OK (`LOTE.ult`, com 1 min de folga, guardado em `planejamento_sync_sigs.__ult`).
  Sem marca anterior, ou a cada 20 envios, vai o conjunto inteiro (rede de segurança). Vale para os mapas
  (operações, ocorrências, misturas, bulas…) e para as listas de tarefas/equipe.
- **`numBR` em todos os campos numéricos** (`numBRn` devolve `null` quando o campo foi apagado): "1.500" vira
  1500 e "2,5" vira 2,5 também na dose realizada, vazão/tanque, resultados, novo talhão, adicionar em massa e
  ajuste de vazão.
- Todo carimbo `_u` usa `tsAgora()`; código morto removido (`doseDe`, `fieldSig`, `parsePontos`, `_pctParse`,
  `custoClasseHa`).

## Sincronização mais rápida (v211)
- **Envio em lote.** Os registros do Campo (execução, ocorrências + fotos, misturas, bulas, stand, aferições,
  produtividade, limites, resultados, tarefas) não têm mais um temporizador e um pedido cada: `scheduleXxxPush`
  só marca o tipo (`loteAgendar`) e, 1,5 s depois da última mudança, `loteEnviar` manda tudo o que mudou numa
  requisição `__lote` (fotos/PDFs sobem antes, para virarem link). Tabela `LOTE_TIPOS` (payload, assinatura,
  rótulo). Com Code.gs antigo (sem `cap.lote` no puxar) manda um pedido por tipo, como antes. Ao entrar/sair do
  app, `loteEnviarTudo()`.
- **Planilha relê só o que mudou.** O Code.gs guarda uma chave de cache por aba: depois de gravar uma mistura, o
  próximo puxar relê só MISTURAS APP (antes: as 17 abas). O Log detalhado mostra quais abas foram relidas.
- **Checagem leve de verdade.** O "mudou alguma coisa?" (a cada 45 s) responde do cache; se o cache está frio,
  responde "frio" na hora e o app puxa direto (uma leitura em vez de duas).

## Desempenho (v181)

- **Redesenho parcial** (`morphInto`): na MESMA tela (edição, sincronização) o app compara a tela nova
  com a atual e troca só o que mudou — o campo em que a pessoa está não é tocado (não perde o foco).
  Vale para Estoque, Talhão, Talhões, Campo, Demanda, Cotação, Painel, DRE, Resultados, Máquinas,
  Empreendimentos, Recomendação, Preços, Sincronizar e Compras. Mapa e câmera: redesenho completo.
  Celular médio (CPU 4×): editar 1 número no Estoque 2,0 s → 0,6 s; Talhão 0,42 s → 0,15 s.
- Compras: digitar quantidade/preço atualiza só a linha e o total (antes perdia o foco a cada letra).
- Puxar sem mudança na planilha não redesenha (o `_srv` — tempo de leitura — ficava fora da comparação).
- Envio automático de edições simples: confere com a planilha **uma vez**, 8 s depois da última edição
  (antes baixava a planilha inteira a cada número). Voltar ao app usa a checagem leve (hash), pedido
  antes dos dados. O puxar automático não fica parado por uma edição sem eco (puxa a cada ~1,5 min).
- Faixa/selo de sincronização calculados 1x por quadro; baixas pendentes enviadas uma de cada vez;
  formatadores de número criados uma vez; Painel e Demanda sem contas repetidas;
  `content-visibility` nos cartões do Campo/Talhão no celular.

## iPhone: zoom e girar a tela

- **Celular: a janela não rola — só o conteúdo** (`body{overflow:hidden}`, `#app{height:100%}`, `.main{overflow-y:auto}`)
  e o **menu de baixo é um pedaço normal do rodapé** (`position:static`, último item do flex), sem
  `position:fixed`. Motivo: no Safari do iPhone o menu fixo subia com a rolagem e ficava parado no meio da tela
  (com ou sem teclado). A barra do topo continua `sticky` dentro do `.main`; `route({toTop})` e `rolarTopo()`
  zeram o `.main`; `scrollIntoView` funciona igual. No computador nada muda.
- No celular, todo campo (input/select/textarea) tem letra de **16px**: com menos, o Safari do iPhone dá
  **zoom sozinho** ao tocar e a página fica ampliada (a barra de baixo ia parar no meio da tela).
- `text-size-adjust:100%`: o iPhone não aumenta a letra ao girar a tela.
- Ao girar a tela, o app trava a escala em 1 por um instante e solta (desfaz zoom que tenha ficado;
  o zoom com os dedos continua funcionando).

## Botões

- **Exportar** — baixa suas edições em JSON.
- **Restaurar** — descarta suas edições e volta aos dados originais.

## Estrutura

```
app/
├── index.html    layout + navegação
├── styles.css    design
├── app.js        engine de cálculo, telas e roteamento
├── data.json     dados extraídos da planilha (produtos, talhões, operações, preços)
└── README.md
```

## Atualizar os dados

`data.json` é gerado a partir do workbook. Para regerar após mudar a planilha,
use o extrator (ver `scripts/` na raiz do repositório) apontando para o
`PLANEJAMENTO_SAFRA_2627_ORIGINAL.xlsx`.
