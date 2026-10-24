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
- **Mapa → Nova Ação** — tocar no talhão do mapa (ou ➕ *Ação* na lista de limites / ➕ *Nova ação* na tela
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
  abre o talhão já com a operação aberta. No celular a coluna do talhão fica fixa e os cartões rolam de lado.
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
