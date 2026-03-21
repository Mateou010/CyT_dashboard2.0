#!/usr/bin/env python3
"""
Analisis textual completo de proyectos de ley para el Puente Legislativo.
Genera bridge_analysis.json con puntajes por eje + evidencia + calidad normativa.
"""

import json
import re
from datetime import datetime
from pathlib import Path

AXES = [
    {
        "key": "intervencion",
        "title": "Intervencion Estatal",
        "positive": [
            "regula", "regulación", "régimen", "autoridad de aplicación", "registro",
            "prohib", "control", "supervisión", "fiscalización", "obligación", "certificación",
            "evaluación de impacto", "clasificación de riesgos", "sancion",
        ],
        "negative": [
            "fomentar", "promover", "incentivar", "consultivo", "voluntario", "recomendación",
            "guía", "buenas prácticas", "no vinculante",
        ],
    },
    {
        "key": "economia",
        "title": "Enfoque Economico",
        "positive": [
            "incentivo", "promoción", "fomento", "innovación", "competitividad", "mercado",
            "beneficio", "productividad", "pyme", "emprendedor",
        ],
        "negative": [
            "impuesto", "tasa", "tribut", "canon", "gravamen", "carga fiscal", "retención",
            "nuevos cargos públicos", "erogación",
        ],
    },
    {
        "key": "datos",
        "title": "Gobernanza de Datos",
        "positive": [
            "interoperabilidad", "transferencia internacional", "flujo", "portabilidad", "apertura de datos",
            "acceso transfronterizo", "intercambio de datos",
        ],
        "negative": [
            "soberanía", "localización", "residencia de datos", "servidores en territorio",
            "almacenamiento local", "prohibición de transferencia", "datos en el país",
        ],
    },
    {
        "key": "punitividad",
        "title": "Punitividad",
        "positive": [
            "pena", "prisión", "multa", "delito", "reprimido", "sancion", "inhabilitación",
            "escalas penales", "agravante", "prohibición", "retiro obligatorio",
        ],
        "negative": [
            "preventivo", "concientización", "capacitación", "orientación", "consultivo",
            "promover", "sensibilización", "recomendación",
        ],
    },
    {
        "key": "sujeto",
        "title": "Sujeto Protegido",
        "positive": [
            "persona", "individuo", "usuario", "consumidor", "ciudadano", "derechos humanos",
            "víctima", "privacidad", "consentimiento",
        ],
        "negative": [
            "estado", "soberanía", "nacional", "administración pública", "seguridad nacional",
            "defensa", "interés estratégico", "infraestructura crítica",
        ],
    },
]

THEMATIC_BUCKETS = [
    ["educación", "escuela", "docente", "universid"],
    ["penal", "pena", "prisión", "delito", "reprimido"],
    ["consumidor", "usuario", "proveedor"],
    ["administración pública", "estado", "ministerio", "organismo"],
    ["ciencia", "conicet", "investigación"],
    ["datos", "privacidad", "biométric"],
    ["econom", "inversión", "fondo", "mercado"],
]


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def score_axis(lines, axis):
    pos = 0
    neg = 0
    evidence = []

    for idx, raw in enumerate(lines, start=1):
        line = raw.lower()
        if not line:
            continue

        pos_hits = [k for k in axis["positive"] if k in line]
        neg_hits = [k for k in axis["negative"] if k in line]

        if pos_hits:
            pos += len(pos_hits)
        if neg_hits:
            neg += len(neg_hits)

        if pos_hits or neg_hits:
            snippet = normalize(raw)
            strength = abs(len(pos_hits) - len(neg_hits)) + len(pos_hits) + len(neg_hits)
            evidence.append((strength, idx, snippet, pos_hits, neg_hits))

    total = pos + neg
    if total == 0:
        score = 5.0
    else:
        score = 5 + 4 * ((pos - neg) / total)
        score = max(1.0, min(10.0, round(score, 1)))

    evidence.sort(key=lambda x: (-x[0], x[1]))
    top = []
    seen = set()
    for _, ln, snippet, pos_hits, neg_hits in evidence:
        key = (ln, snippet)
        if key in seen:
            continue
        seen.add(key)
        marks = []
        if pos_hits:
            marks.append("+" + ", ".join(pos_hits[:2]))
        if neg_hits:
            marks.append("-" + ", ".join(neg_hits[:2]))
        mark_text = " | ".join(marks)
        top.append(f"L{ln}: {snippet}" + (f" [{mark_text}]" if mark_text else ""))
        if len(top) == 3:
            break

    if not top:
        top = [f"Sin evidencia textual fuerte para {axis['title']}."]

    return score, top


def compute_quality(full_text: str):
    text = full_text.lower()

    def hits(keywords):
        return sum(1 for k in keywords if k in text)

    definicion = min(1.0, hits(["definiciones", "se entenderá por", "inteligencia artificial", "algoritmo", "riesgo"]) / 3)
    alcance = min(1.0, hits(["objeto", "ámbito de aplicación", "aplicará", "sujetos", "autoridad de aplicación"]) / 3)
    implementacion = min(1.0, hits(["plazo", "registro", "certificación", "sancion", "procedimiento", "presupuesto"]) / 4)
    tecnica = min(1.0, hits(["artículo", "inciso", "ley", "código", "comuníquese"]) / 5)

    vaguedad_hits = hits(["promover", "fomentar", "impulsar", "adecuado", "integral", "general", "x°"])
    coherencia = 1 - min(1.0, vaguedad_hits / 16)

    solidez = round((definicion + alcance + implementacion + tecnica + coherencia) / 5, 3)

    thematic_spread = 0
    for bucket in THEMATIC_BUCKETS:
        if any(k in text for k in bucket):
            thematic_spread += 1
    breadth = min(1.0, max(0.0, (thematic_spread - 2) / 4))
    vaguedad = min(1.0, vaguedad_hits / 20)

    prohib = "prohib" in text or "inaceptable" in text
    promo = "foment" in text or "promov" in text or "incentiv" in text
    contradiction = 1.0 if (prohib and promo) else 0.0

    ambiguedad = round(min(1.0, 0.45 * breadth + 0.4 * vaguedad + 0.15 * contradiction), 3)
    peso = round(max(0.2, min(1.0, solidez * (1 - ambiguedad))), 3)

    return {
        "solidez": solidez,
        "ambiguedad": ambiguedad,
        "peso": peso,
        "complejidad_normativa_elevada": ambiguedad >= 0.6,
    }


def main():
    base = Path(__file__).resolve().parent
    bills_path = base / "bills_data.json"
    txt_dir = base / "proyectoss_txt"
    out_path = base / "bridge_analysis.json"

    data = json.loads(bills_path.read_text(encoding="utf-8"))
    bills = data.get("bills", [])

    out = {
        "metadata": {
            "generado": datetime.now().isoformat(),
            "metodo": "Lectura textual completa con codificacion por ejes + evidencia trazable",
            "version": "bridge-v2-text-evidence",
            "total_bills": len(bills),
            "axis_order": [a["key"] for a in AXES],
        },
        "bills": {},
    }

    processed = 0
    with_txt = 0

    for bill in bills:
        bill_id = bill.get("id")
        if not bill_id:
            continue
        processed += 1

        txt_file = txt_dir / f"{bill_id}.txt"
        if txt_file.exists():
            with_txt += 1
            raw = txt_file.read_text(encoding="utf-8", errors="ignore")
            lines = [ln.rstrip() for ln in raw.splitlines()]
        else:
            raw = ""
            lines = []

        scores = {}
        evidence_map = {}
        evidence_lines = []

        for axis in AXES:
            score, evidence = score_axis(lines, axis)
            scores[axis["key"]] = score
            evidence_map[axis["key"]] = evidence
            evidence_lines.append(evidence[0] if evidence else f"Sin evidencia para {axis['title']}.")

        quality = compute_quality(raw if raw else f"{bill.get('titulo', '')} {bill.get('resumen', '')}")

        out["bills"][bill_id] = {
            "scores": scores,
            "evidence": evidence_map,
            "evidence_lines": evidence_lines,
            "quality": quality,
            "fuente_texto": str(txt_file.name) if txt_file.exists() else "sin_txt",
        }

    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Analisis generado: {out_path}")
    print(f"Proyectos procesados: {processed}")
    print(f"Con TXT completo: {with_txt}")


if __name__ == "__main__":
    main()
