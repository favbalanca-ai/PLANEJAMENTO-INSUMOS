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
