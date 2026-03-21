#!/usr/bin/env python3
"""
Exporta bills_data.json a un archivo Excel para uso operativo.
"""

import argparse
import json
from collections import Counter
from pathlib import Path


def month_name(month_number: int) -> str:
    names = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ]
    if isinstance(month_number, int) and 1 <= month_number <= 12:
        return names[month_number - 1]
    return "Sin dato"


def sort_key(bill: dict) -> tuple:
    try:
        year = int(bill.get("año", 0))
    except Exception:
        year = 0
    try:
        month = int(bill.get("mes", 0))
    except Exception:
        month = 0
    bill_id = bill.get("id", "")
    return (year, month, bill_id)


def export_excel(data_path: Path, output_path: Path) -> None:
    try:
        from openpyxl import Workbook
    except Exception:
        raise RuntimeError("Falta openpyxl. Instalalo con: pip3 install openpyxl")

    data = json.loads(data_path.read_text(encoding="utf-8"))
    bills = sorted(data.get("bills", []), key=sort_key)

    wb = Workbook()
    ws = wb.active
    ws.title = "Proyectos de Ley IA"

    headers = [
        "#",
        "Expediente",
        "Año",
        "Mes",
        "Título",
        "Tipo",
        "Dashboard",
        "Autor Principal",
        "Bloque",
        "Resumen",
        "PDF Path",
        "Destinatarios",
    ]
    ws.append(headers)

    for idx, b in enumerate(bills, start=1):
        ws.append(
            [
                idx,
                b.get("id", ""),
                b.get("año", ""),
                month_name(b.get("mes")),
                b.get("titulo", ""),
                b.get("tipo", ""),
                b.get("dashboard", ""),
                b.get("autor_principal", ""),
                b.get("bloque", ""),
                b.get("resumen", ""),
                b.get("pdf_path", ""),
                ", ".join(b.get("destinatarios", [])),
            ]
        )

    stats = wb.create_sheet("Estadísticas")
    stats.append(["Métrica", "Valor"])
    stats.append(["Total de proyectos", len(bills)])

    years = [b.get("año") for b in bills if isinstance(b.get("año"), int)]
    if years:
        stats.append(["Rango de años", f"{min(years)}-{max(years)}"])
    else:
        stats.append(["Rango de años", "Sin dato"])

    stats.append(["Generado", data.get("metadata", {}).get("generado", "")])
    stats.append(["Fuente", data.get("metadata", {}).get("fuente", "")])
    stats.append([])

    stats.append(["Bloques", "Cantidad"])
    for bloque, count in Counter(b.get("bloque", "Sin datos") for b in bills).most_common():
        stats.append([bloque, count])

    stats.append([])
    stats.append(["Tipos", "Cantidad"])
    for tipo, count in Counter(b.get("tipo", "Sin clasificar") for b in bills).most_common():
        stats.append([tipo, count])

    wb.save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Exporta bills_data.json a Excel")
    parser.add_argument("--input", default="bills_data.json", help="Ruta del JSON de entrada")
    parser.add_argument("--output", default="Proyectos_Ley_IA_Completo.xlsx", help="Ruta del XLSX de salida")
    args = parser.parse_args()

    data_path = Path(args.input)
    output_path = Path(args.output)

    if not data_path.exists():
        raise SystemExit(f"No existe el archivo: {data_path}")

    export_excel(data_path, output_path)
    print(f"Excel actualizado: {output_path}")


if __name__ == "__main__":
    main()
