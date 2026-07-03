"""Tests para analyze_projects_text.py (bug 5: score_all_axes == score_axis x N)."""
import unittest

from _helpers import PROJECT_ROOT  # noqa: F401
import analyze_projects_text as apt


SAMPLE_LINES = [
    "Articulo 1. La presente ley establece un regimen de regulacion y control.",
    "La autoridad de aplicacion tendra facultades de fiscalizacion y supervision.",
    "Se busca fomentar y promover la innovacion y la competitividad del mercado.",
    "",
    "Quienes incurran en el delito seran reprimidos con pena de prision y multa.",
    "Se garantiza el consentimiento del usuario y la privacidad de la persona.",
    "Queda prohibida la transferencia y localizacion de datos fuera del pais.",
    "Se promueve la interoperabilidad y la portabilidad de la informacion.",
    "El estado nacional resguarda la seguridad nacional y la defensa.",
    "Una linea sin ninguna palabra clave relevante para los ejes analizados.",
    "impuesto tasa gravamen canon retencion carga fiscal para pymes emprendedor",
]


class TestScoreAllAxesEquivalence(unittest.TestCase):
    def _assert_equivalent(self, lines):
        combined = apt.score_all_axes(lines, apt.AXES)
        for axis in apt.AXES:
            expected = apt.score_axis(lines, axis)
            self.assertEqual(
                combined[axis["key"]], expected,
                f"Resultado difiere para eje '{axis['key']}'",
            )

    def test_matches_per_axis_on_sample(self):
        self._assert_equivalent(SAMPLE_LINES)

    def test_matches_on_empty_input(self):
        self._assert_equivalent([])

    def test_matches_on_no_hits(self):
        self._assert_equivalent(["texto neutro", "sin coincidencias", ""])

    def test_matches_on_repeated_lines(self):
        lines = SAMPLE_LINES + SAMPLE_LINES  # fuerza dedupe de evidencia
        self._assert_equivalent(lines)


class TestScoreAxisBehaviour(unittest.TestCase):
    def test_neutral_score_when_no_hits(self):
        axis = apt.AXES[0]
        score, top = apt.score_axis(["nada relevante aqui"], axis)
        self.assertEqual(score, 5.0)
        self.assertTrue(top[0].startswith("Sin evidencia"))

    def test_score_within_bounds(self):
        for axis in apt.AXES:
            score, _ = apt.score_axis(SAMPLE_LINES, axis)
            self.assertGreaterEqual(score, 1.0)
            self.assertLessEqual(score, 10.0)


if __name__ == "__main__":
    unittest.main()
