# Livro Caixa Digital do Produtor Rural (LCDPR) — como o app monta o arquivo

Gerado em **Administrativo → Financeiro → 📒 Livro Caixa**, um arquivo `.txt` por produtor e ano
(`LCDPR_<CPF>_<ano>.txt`), a partir dos cadastros, dos títulos e das baixas. O leiaute inteiro fica em
`LCDPR_LEIAUTE` (`app/app.js`): ordem dos campos, códigos e tamanho do histórico. Se o contador ou o
validador do e-CAC apontar diferença, ajusta-se ali.

**Importante:** o leiaute foi escrito pela versão 1.3 como conhecida, sem acesso ao manual oficial na
hora de programar. **Confira o primeiro arquivo com o contador** antes de entregar.

## Formato

- Campos separados por `|`, sem `|` no início nem no fim da linha; uma linha por registro; `CRLF`; UTF-8.
- Datas `ddmmaaaa`. Valores em **centavos sem separador** (R$ 1.234,56 → `123456`), inclusive a participação % (100% → `10000`).
- Saldo acumulado do Q100 = receitas − despesas desde 1º de janeiro (não é saldo bancário); `NAT_SLD` = `P` (positivo) ou `N`.
- Conta `999` = numerário em trânsito: pagamento que não passou por conta bancária (a conta cadastrada como **Caixa (dinheiro)** sai como 999).

## De onde sai cada registro

| Registro | Campos (ordem) | Origem no app |
|---|---|---|
| `0000` | REG, "LCDPR", COD_VER (`0013`), CPF, NOME, IND_INI (0), SIT_ESPECIAL (0), DT_SIT_ESP (vazio), DT_INI (01/01), DT_FIN (31/12) | Cadastros → Produtor + ano escolhido |
| `0010` | REG, FORMA_APUR (1 livro caixa · 2 arbitrado) | Produtor → forma de apuração |
| `0030` | REG, ENDEREÇO, NÚMERO, COMPLEMENTO, BAIRRO, UF, COD_MUNICÍPIO (IBGE, 7 dígitos), CEP, TELEFONE, E-MAIL | Produtor |
| `0040` | REG, COD_IMÓVEL, PAÍS (BR), MOEDA (BRL), CAD_ITR, CAEPF, INSCRIÇÃO ESTADUAL, NOME, ENDEREÇO, NÚMERO, COMPLEMENTO, BAIRRO, UF, COD_MUNICÍPIO, CEP, TIPO_EXPLORAÇÃO, PARTICIPAÇÃO | Imóveis rurais ativos do produtor |
| `0045` | REG, COD_IMÓVEL, TIPO_CONTRAPARTE, CPF/CNPJ, NOME, PARTICIPAÇÃO | Contrapartes de cada imóvel |
| `0050` | REG, COD_CONTA, PAÍS, Nº BANCO, NOME DO BANCO, AGÊNCIA, CONTA | Contas bancárias ativas do produtor |
| `Q100` | REG, DATA, COD_IMÓVEL, COD_CONTA, Nº DOC, TIPO_DOC, HISTÓRICO, CPF/CNPJ PARTICIPANTE, TIPO_LANC, VL_ENTRADA, VL_SAÍDA, SLD_FIN, NAT_SLD | Uma linha por **baixa** do ano (aba BAIXAS), em ordem de data |
| `Q200` | REG, MÊS (mmaaaa), VL_ENTRADA, VL_SAÍDA, SLD_FIN, NAT_SLD | Soma dos Q100 por mês (só meses com movimento) |
| `9999` | REG, NOME DO CONTADOR, CPF/CNPJ, CRC, E-MAIL, TELEFONE, QTD_LINHAS (inclui a própria) | Cadastros → Contador (CONFIG APP) |

### Códigos

- **TIPO_EXPLORAÇÃO (0040)**: 1 exploração individual · 2 condomínio · 3 imóvel arrendado · 4 parceria · 5 comodato · 6 outros (ordem da lista "Exploração" do cadastro).
- **TIPO_CONTRAPARTE (0045)**: 1 condômino · 2 arrendante · 3 parceiro · 4 comodante · 5 outros.
- **TIPO_DOC (Q100)**: 1 nota fiscal · 2 fatura · 3 recibo · 4 contrato · 5 folha de pagamento · 6 outros (primeiro dígito do campo "Documento" do título).
- **TIPO_LANC (Q100)**: 1 receita (título **a receber**) · 2 despesa de custeio/investimento (título **a pagar**) · 3 adiantamento (título com categoria "Adiantamento").

### Regras dos lançamentos

- Entram as baixas com data dentro do ano, de títulos do produtor que não estejam cancelados.
- Valor = **valor pago/recebido** (o que saiu ou entrou na conta; juros já dentro). O desconto não é dinheiro e não entra.
- Imóvel = o do título; senão o **imóvel padrão** do produtor; senão o primeiro imóvel ativo (aviso).
- Participação em parceria/condomínio: o lançamento vai **integral** (decisão da dona); a parte do parceiro é tratada pela contabilidade.
- Histórico = "`tipo do documento` `nº` parc. `x/y` `fornecedor` - `categoria` (juros …)", limitado ao tamanho do leiaute.
- Títulos marcados como pagos **sem baixa** (versão anterior) não entram: a tela lista como pendência e pede "Completar baixa".
- **Compensação de adiantamento** (v277): quando a nota de venda quita um adiantamento já recebido, a baixa é
  gravada na conta 999 com COMPENSAÇÃO = S e REF = título do adiantamento. Ela **não** gera Q100 (o dinheiro já
  entrou como adiantamento, tipo 3) nem aparece no extrato por conta; serve só para dar baixa no título da venda.

## Pendências que travam a geração

Produtor sem endereço/município/CEP · contador sem nome ou CPF/CNPJ · nenhum imóvel ativo · imóvel sem CAD ITR, endereço, município, UF ou CEP, ou com código não numérico · conta sem código numérico, nº do banco, agência ou conta (exceto Caixa) · baixa de conta que não está no cadastro · título sem CPF/CNPJ do participante · títulos pagos sem baixa no ano.

## Conferência

- **CSV de conferência**: mesmas linhas do Q100 em colunas legíveis, para o contador.
- A tela mostra o resumo mensal (Q200) e os lançamentos (Q100) com filtro por mês.
- Ao gerar, o app grava "LCDPR GERADO `<CPF>` `<ano>`" na aba CONFIG APP com data/hora e quem gerou.

## Arquivo parcial (fechamento mensal, v292)

`lcdprDados(cpf, ano, ate)` aceita uma data limite: o fechamento mensal gera o LCDPR do ano **até o último dia do mês**
(0000 com DT_FIN = essa data, Q100/Q200 só até ela). O arquivo anual continua igual quando `ate` não é informado.

