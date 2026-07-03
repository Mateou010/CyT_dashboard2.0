"""Tests para validate_bills_data.py (bug 4: rutas de PDF relativas al JSON, no al CWD)."""
import json
import os
import tempfile
import unittest
from pathlib import Path

from _helpers import PROJECT_ROOT  # noqa: F401
import validate_bills_data


def _make_valid_bill(pdf_path):
    return {
        "id": "0001-D-2025",
        "titulo": "Proyecto de prueba",
        "año": 2025,
        "bloque": "PRO",
        "tipo": "CENTRAL",
        "dashboard": "DIRECTA",
        "pdf_path": pdf_path,
    }


class TestPdfPathResolution(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.orig_cwd = os.getcwd()

    def tearDown(self):
        os.chdir(self.orig_cwd)
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _write_dataset(self, pdf_rel):
        # Crea el PDF referenciado (relativo al dir del JSON) y el JSON.
        pdf_abs = Path(self.tmpdir) / pdf_rel
        pdf_abs.parent.mkdir(parents=True, exist_ok=True)
        pdf_abs.write_bytes(b"%PDF-1.4 fake")
        bill = _make_valid_bill(f"./{pdf_rel}")
        data = {"metadata": {"total": 1}, "bills": [bill]}
        json_path = Path(self.tmpdir) / "bills_data.json"
        json_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return json_path

    def test_pdf_resolved_relative_to_json_dir_from_other_cwd(self):
        """Bug 4: correr desde otro cwd no debe dar falso negativo."""
        json_path = self._write_dataset("PDFs/0001-D-2025.pdf")
        # Nos paramos en un cwd distinto (la raiz del proyecto), donde el
        # PDF NO existe relativo al cwd. Debe validar OK igual.
        os.chdir(PROJECT_ROOT)
        rc = validate_bills_data.validate(json_path)
        self.assertEqual(rc, 0)

    def test_missing_pdf_still_reported(self):
        """El chequeo sigue detectando PDFs realmente inexistentes."""
        bill = _make_valid_bill("./PDFs/no_existe.pdf")
        data = {"metadata": {"total": 1}, "bills": [bill]}
        json_path = Path(self.tmpdir) / "bills_data.json"
        json_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        os.chdir(PROJECT_ROOT)
        rc = validate_bills_data.validate(json_path)
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()
