"""Tests para extract_bills.py (bugs 1, 2 y 3)."""
import glob
import os
import shutil
import tempfile
import unittest

from _helpers import PROJECT_ROOT  # noqa: F401  (efecto: sys.path)
import extract_bills


def _find_real_pdf():
    """Devuelve la ruta a cualquier PDF real del repo, o None si no hay."""
    pattern = os.path.join(PROJECT_ROOT, "PDFs_Proyectos_Ley", "**", "*.pdf")
    matches = glob.glob(pattern, recursive=True)
    if matches:
        return matches[0]
    matches = glob.glob(os.path.join(PROJECT_ROOT, "**", "*.pdf"), recursive=True)
    return matches[0] if matches else None


class TestNormalizeBillId(unittest.TestCase):
    def test_zero_pads_to_four_digits(self):
        self.assertEqual(extract_bills.normalize_bill_id("509-D-2019"), "0509-D-2019")

    def test_already_padded_is_stable(self):
        self.assertEqual(extract_bills.normalize_bill_id("0509-D-2019"), "0509-D-2019")

    def test_senate_camera(self):
        self.assertEqual(extract_bills.normalize_bill_id("012-S-2020"), "0012-S-2020")

    def test_non_matching_returns_empty(self):
        self.assertEqual(extract_bills.normalize_bill_id("basura"), "")
        self.assertEqual(extract_bills.normalize_bill_id("1234-D-abcd"), "")
        self.assertEqual(extract_bills.normalize_bill_id(""), "")


class TestParsePdfMalformedName(unittest.TestCase):
    """Bug 1: nombre de PDF mal formado no debe crashear parse_pdf."""

    def test_non_numeric_year_returns_none_without_crash(self):
        # Antes: int('abcd') -> ValueError sin capturar. Ahora: se saltea -> None.
        result = extract_bills.parse_pdf("/tmp/no/existe/1234-D-abcd.pdf")
        self.assertIsNone(result)

    def test_totally_malformed_name_returns_none(self):
        result = extract_bills.parse_pdf("/tmp/no/existe/proyecto_final.pdf")
        self.assertIsNone(result)


class TestParsePdfIdNormalization(unittest.TestCase):
    """Bug 2: el id del bill debe salir normalizado (zero-padded)."""

    @classmethod
    def setUpClass(cls):
        cls.real_pdf = _find_real_pdf()

    def test_unpadded_filename_yields_padded_id(self):
        if not self.real_pdf:
            self.skipTest("No hay PDFs reales en el repo para este test")
        tmpdir = tempfile.mkdtemp()
        try:
            # Nombre sin padear -> debe normalizarse a 4 digitos.
            dest = os.path.join(tmpdir, "509-D-2019.pdf")
            shutil.copyfile(self.real_pdf, dest)
            result = extract_bills.parse_pdf(dest)
            self.assertIsNotNone(result)
            self.assertEqual(result["id"], "0509-D-2019")
            self.assertEqual(result["año"], 2019)
            self.assertEqual(result["camara"], "Diputados")
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)


class TestDeadCodeRemoved(unittest.TestCase):
    """Bug 3: generate_historical_data y datos simulados eliminados."""

    def test_generate_historical_data_removed(self):
        self.assertFalse(hasattr(extract_bills, "generate_historical_data"))

    def test_simulated_data_removed(self):
        for name in ("LEGISLADORES_SIMULADOS", "TITULOS_SIMULADOS",
                     "YEARS_COUNTS", "ESTADOS_DIST", "MONTHLY_WEIGHTS"):
            self.assertFalse(hasattr(extract_bills, name),
                             f"{name} deberia haberse eliminado")


if __name__ == "__main__":
    unittest.main()
