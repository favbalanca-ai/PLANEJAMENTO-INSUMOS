#!/usr/bin/env python3
"""Melhorias na planilha PLANEJAMENTO_SAFRA_2627.xlsx
1. Corrige o bug financeiro em PORTIFÓLIO!U (VOLUME INDICADO): R-T -> MAX(0;R-T)
2. Cria a aba 'DEMANDA DE COMPRAS' (lista de compras acionável) que consolida
   Demanda (PORTIFÓLIO!R) - Estoque (PORTIFÓLIO!T) = A Comprar, com preço e valor.
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import FormulaRule, CellIsRule
import json

SRC="PLANEJAMENTO_SAFRA_2627_ORIGINAL.xlsx"
OUT="PLANEJAMENTO_SAFRA_2627.xlsx"

wbv=openpyxl.load_workbook(SRC, data_only=True)   # valores (p/ selecionar linhas)
wb =openpyxl.load_workbook(SRC, data_only=False)  # fórmulas (p/ salvar)

pv=wbv["PORTIFÓLIO"]
P =wb["PORTIFÓLIO"]

# ---------------------------------------------------------------------------
# 1) CORRIGIR PORTIFÓLIO!U  ->  =MAX(0; R-T)   (não permitir compra negativa)
# ---------------------------------------------------------------------------
for r in range(4, 434):
    P.cell(r, 21).value = f"=MAX(0,R{r}-T{r})"   # U = coluna 21

# ---------------------------------------------------------------------------
# 2) Selecionar produtos (insumos) com demanda ou estoque, exceto MÁQUINAS
# ---------------------------------------------------------------------------
sel=[]
for r in range(4, 416):
    prod=pv.cell(r,3).value
    if not (prod and str(prod).strip()):        continue
    classe=(pv.cell(r,2).value or "")
    if str(classe).strip().upper().startswith("MÁQUINA"): continue
    R=pv.cell(r,18).value or 0; T=pv.cell(r,20).value or 0
    try: R=float(R)
    except: R=0
    try: T=float(T)
    except: T=0
    if R>0 or T>0:
        sel.append(r)

# ordenar por classe depois produto (usando valores em cache)
def key(r):
    return (str(pv.cell(r,2).value or "").upper(), str(pv.cell(r,3).value or "").upper())
sel.sort(key=key)

# ---------------------------------------------------------------------------
# 3) Criar aba DEMANDA DE COMPRAS
# ---------------------------------------------------------------------------
name="DEMANDA DE COMPRAS"
if name in wb.sheetnames: del wb[name]
ws=wb.create_sheet(name, 0)   # primeira aba

# --- paleta / estilos ---
AZUL   ="FF1F4E5F"   # cabeçalho escuro
AZUL2  ="FF2E7D8C"
CINZA  ="FFF2F5F7"
VERDE  ="FFE7F4E4"
AMARELO="FFFFF3CD"
VERM   ="FFFCE4E4"
branco =Font(color="FFFFFFFF", bold=True, size=11)
thin=Side(style="thin", color="FFB8C4CC")
border=Border(left=thin,right=thin,top=thin,bottom=thin)
brl='R$ #,##0.00'
num='#,##0.00'

HDR=["CLASSE","FORNECEDOR","PRODUTO","UN","DEMANDA","ESTOQUE",
     "A COMPRAR","PREÇO UNIT.","VALOR TOTAL","STATUS"]
first=6                     # primeira linha de dados
last=first+len(sel)-1

# ---- Título ----
ws.merge_cells("A1:J1")
c=ws["A1"]; c.value="DEMANDA DE COMPRAS DE INSUMOS  —  SAFRA 2026/2027"
c.font=Font(color="FFFFFFFF", bold=True, size=16)
c.alignment=Alignment(horizontal="left", vertical="center", indent=1)
c.fill=PatternFill("solid", fgColor=AZUL)
ws.row_dimensions[1].height=30

ws.merge_cells("A2:J2")
c=ws["A2"]; c.value=("A COMPRAR = MÁX(0; Demanda − Estoque).  Demanda e preço vêm da aba PORTIFÓLIO; "
                     "edite o ESTOQUE na PORTIFÓLIO (coluna T) que esta lista atualiza sozinha.")
c.font=Font(italic=True, size=9, color="FF5A6b72")
c.alignment=Alignment(horizontal="left", vertical="center", indent=1)
ws.row_dimensions[2].height=16

# ---- KPIs (labels linha 3, valores linha 4) ----
DATA=f"I{first}:I{last}"
GCOL=f"G{first}:G{last}"
HCOL=f"H{first}:H{last}"
def kpi(col, label, formula, fmt, vcolor):
    lc=ws.cell(3,col,label); lc.font=Font(bold=True,size=9,color="FF5A6b72")
    lc.alignment=Alignment(horizontal="left",vertical="center")
    vc=ws.cell(4,col,formula); vc.font=Font(bold=True,size=14,color=vcolor)
    vc.alignment=Alignment(horizontal="left",vertical="center")
    if fmt: vc.number_format=fmt
kpi(1,"TOTAL A COMPRAR (R$)", f"=SUM({DATA})", brl, AZUL)
kpi(3,"ITENS A COMPRAR",      f'=COUNTIF({GCOL},">0")', None, AZUL)
kpi(5,"ITENS SEM PREÇO",      f'=SUMPRODUCT(({GCOL}>0)*({HCOL}<=0))', None, "FFB00020")
kpi(7,"VALOR EM ESTOQUE (R$)",f"=SUMPRODUCT(F{first}:F{last},H{first}:H{last})", brl, "FF2E7D32")
ws.row_dimensions[3].height=14
ws.row_dimensions[4].height=20

# ---- Cabeçalho da tabela (linha 5 = first-1) ----
hrow=first-1  # 5
for i,h in enumerate(HDR, start=1):
    cell=ws.cell(hrow, i, h)
    cell.font=branco; cell.fill=PatternFill("solid", fgColor=AZUL2)
    cell.alignment=Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border=border
ws.row_dimensions[hrow].height=28

# ---- Linhas de dados ----
for idx,r in enumerate(sel):
    row=first+idx
    ws.cell(row,1, f"='PORTIFÓLIO'!B{r}")   # CLASSE
    ws.cell(row,2, f"='PORTIFÓLIO'!A{r}")   # FORNECEDOR
    ws.cell(row,3, f"='PORTIFÓLIO'!C{r}")   # PRODUTO
    ws.cell(row,4, f"='PORTIFÓLIO'!F{r}")   # UN
    ws.cell(row,5, f"='PORTIFÓLIO'!R{r}")   # DEMANDA
    ws.cell(row,6, f"='PORTIFÓLIO'!T{r}")   # ESTOQUE
    ws.cell(row,7, f"=MAX(0,E{row}-F{row})")# A COMPRAR
    ws.cell(row,8, f"='PORTIFÓLIO'!S{r}")   # PREÇO
    ws.cell(row,9, f"=G{row}*H{row}")       # VALOR TOTAL
    ws.cell(row,10,
        f'=IF(G{row}>0,IF(H{row}<=0,"⚠ SEM PREÇO","COMPRAR"),'
        f'IF(E{row}>0,"OK - ESTOQUE","SEM DEMANDA"))')  # STATUS
    # formatos
    ws.cell(row,5).number_format=num
    ws.cell(row,6).number_format=num
    ws.cell(row,7).number_format=num
    ws.cell(row,8).number_format=brl
    ws.cell(row,9).number_format=brl
    for col in range(1,11):
        cc=ws.cell(row,col); cc.border=border
        if col in (1,2,3,4,10): cc.alignment=Alignment(horizontal="left", vertical="center", indent=1 if col!=4 else 0)
        else: cc.alignment=Alignment(horizontal="right", vertical="center")
    # zebra
    if idx%2==1:
        for col in range(1,11):
            ws.cell(row,col).fill=PatternFill("solid", fgColor=CINZA)

# ---- Linha TOTAL ----
tot=last+1
ws.cell(tot,3,"TOTAL GERAL").font=Font(bold=True,size=11,color="FFFFFFFF")
ws.cell(tot,7,f"=SUM(G{first}:G{last})").font=Font(bold=True,color="FFFFFFFF")
ws.cell(tot,9,f"=SUM(I{first}:I{last})")
ws.cell(tot,9).font=Font(bold=True,size=12,color="FFFFFFFF")
ws.cell(tot,9).number_format=brl
ws.cell(tot,7).number_format=num
for col in range(1,11):
    cc=ws.cell(tot,col); cc.fill=PatternFill("solid", fgColor=AZUL)
    cc.border=border
    if not cc.font.bold: cc.font=Font(color="FFFFFFFF")
ws.row_dimensions[tot].height=22

# ---- Formatação condicional ----
rng=f"A{first}:J{last}"
# COMPRAR -> verde ; SEM PREÇO -> vermelho ; OK-ESTOQUE -> cinza claro
ws.conditional_formatting.add(rng,
    FormulaRule(formula=[f'$J{first}="COMPRAR"'], fill=PatternFill("solid",fgColor=VERDE)))
ws.conditional_formatting.add(rng,
    FormulaRule(formula=[f'$J{first}="⚠ SEM PREÇO"'], fill=PatternFill("solid",fgColor=AMARELO)))
ws.conditional_formatting.add(rng,
    FormulaRule(formula=[f'$J{first}="OK - ESTOQUE"'], fill=PatternFill("solid",fgColor="FFEDEFF1")))

# ---- larguras ----
widths={1:16,2:16,3:34,4:6,5:12,6:12,7:12,8:13,9:15,10:16}
for c,w in widths.items(): ws.column_dimensions[get_column_letter(c)].width=w

# ---- AutoFilter + freeze ----
ws.auto_filter.ref=f"A{hrow}:J{last}"
ws.freeze_panes=f"A{first}"

# ---- RESUMO POR CLASSE (à direita, col L) ----
Lc=12
ws.cell(hrow,Lc,"RESUMO POR CLASSE").font=branco
ws.merge_cells(start_row=hrow,start_column=Lc,end_row=hrow,end_column=Lc+1)
ws.cell(hrow,Lc).fill=PatternFill("solid",fgColor=AZUL2)
ws.cell(hrow,Lc).alignment=Alignment(horizontal="center",vertical="center")
ws.cell(hrow,Lc+1).fill=PatternFill("solid",fgColor=AZUL2)
classes=[]
for r in sel:
    cl=str(pv.cell(r,2).value or "")
    if cl not in classes: classes.append(cl)
for i,cl in enumerate(classes):
    rr=hrow+1+i
    ws.cell(rr,Lc,cl).border=border
    ws.cell(rr,Lc,cl).alignment=Alignment(horizontal="left",indent=1)
    ws.cell(rr,Lc+1,f'=SUMIF($A${first}:$A${last},L{rr},$I${first}:$I${last})')
    ws.cell(rr,Lc+1).number_format=brl; ws.cell(rr,Lc+1).border=border
rtot=hrow+1+len(classes)
ws.cell(rtot,Lc,"TOTAL").font=Font(bold=True)
ws.cell(rtot,Lc+1,f'=SUM(M{hrow+1}:M{rtot-1})').number_format=brl
ws.cell(rtot,Lc+1).font=Font(bold=True)
ws.cell(rtot,Lc).fill=PatternFill("solid",fgColor=CINZA)
ws.cell(rtot,Lc+1).fill=PatternFill("solid",fgColor=CINZA)
ws.column_dimensions[get_column_letter(Lc)].width=16
ws.column_dimensions[get_column_letter(Lc+1)].width=16

ws.sheet_view.showGridLines=False

# ---- forçar recálculo ao abrir ----
try:
    wb.calculation.fullCalcOnLoad=True
except Exception: pass

wb.save(OUT)
print("Salvo:", OUT, "| itens:", len(sel), "| linhas dados", first,"-",last)
