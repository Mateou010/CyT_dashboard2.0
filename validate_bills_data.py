#!/usr/bin/env python3
"""
Valida consistencia mínima de bills_data.json.
"""

import argparse
import json
from pathlib import Path


REQUIRED_FIELDS = [
    "id",
    "titulo",
    "año",
    "bloque",
    "tipo",
    "dashboard",
    "pdf_path",
]


def validate(data_path: Path) -> int:
    if not data_path.exists():
        print(f"ERROR: No existe {data_path}")
        return 1

    data = json.loads(data_path.read_text(encoding="utf-8"))
    bills = data.get("bills", [])
    metadata_total = data.get("metadata", {}).get("total")
    errors = []

    if metadata_total != len(bills):
        errors.append(
            f"metadata.total ({metadata_total}) no coincide con bills ({len(bills)})"
        )

    ids = [b.get("id") for b in bills]
    if len(ids) != len(set(ids)):
        errors.append("Hay IDs duplicados en bills")

    for idx, bill in enumerate(bills, start=1):
        bid = bill.get("id", f"fila_{idx}")
        for field in REQUIRED_FIELDS:
            value = bill.get(field)
            if value in (None, "", []):
                errors.append(f"{bid}: falta campo requerido '{field}'")

        pdf_path = bill.get("pdf_path", "")
        if pdf_path:
            rel = pdf_path[2:] if pdf_path.startswith("./") else pdf_path
            if not Path(rel).exists():
                errors.append(f"{bid}: ruta PDF inexistente '{pdf_path}'")

    if errors:
        print("VALIDACION: ERROR")
        for err in errors:
            print(f"- {err}")
        return 1

    print("VALIDACION: OK")
    print(f"- Proyectos: {len(bills)}")
    print("- metadata.total coincide")
    print("- IDs unicos")
    print("- Campos requeridos completos")
    print("- Rutas de PDF validas")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida bills_data.json")
    parser.add_argument("--input", default="bills_data.json", help="Ruta del JSON a validar")
    args = parser.parse_args()
    raise SystemExit(validate(Path(args.input)))


if __name__ == "__main__":
    main()
