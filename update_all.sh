#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> [1/4] Regenerando bills_data.json desde los PDFs..."
python3 extract_bills.py

echo
echo "==> [2/4] Exportando Excel consolidado..."
python3 export_bills_excel.py --input bills_data.json --output Proyectos_Ley_IA_Completo.xlsx

echo
echo "==> [3/4] Generando analisis textual del Puente Legislativo..."
python3 analyze_projects_text.py

echo
echo "==> [4/4] Validando integridad de datos y rutas..."
python3 validate_bills_data.py --input bills_data.json

echo
echo "Listo. Integracion completa actualizada:"
echo "- Base de datos JSON: bills_data.json"
echo "- Excel consolidado: Proyectos_Ley_IA_Completo.xlsx"
echo "- Puente Legislativo (texto completo): bridge_analysis.json"
echo "- Web/dashboard: usan bills_data.json + bridge_analysis.json en forma dinamica"
