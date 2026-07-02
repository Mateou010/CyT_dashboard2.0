// Resumen del proyecto de ley con IA a partir del texto del PDF.
// Por defecto usa OpenAI. Sin OPENAI_API_KEY, devuelve el sumario oficial.
import pdf from 'pdf-parse';

export async function extraerTextoPdf(buffer) {
  const data = await pdf(buffer);
  return (data.text || '').replace(/\s+\n/g, '\n').trim();
}

export async function resumir({ sumario, textoPdf }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sumario || '(sin resumen)';

  const prompt = `Sos un asistente que resume proyectos de ley argentinos para ciudadanos.
Resumí en 4-6 oraciones claras y neutrales QUÉ propone este proyecto, a quién afecta
y cuál es su objetivo. Evitá tecnicismos. No inventes.

SUMARIO OFICIAL: ${sumario}

TEXTO DEL PROYECTO (puede estar recortado):
${(textoPdf || '').slice(0, 12000)}`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!r.ok) { console.error('Resumen IA falló:', r.status); return sumario || '(sin resumen)'; }
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || sumario || '(sin resumen)';
  } catch (e) {
    console.error('Resumen IA error:', e.message);
    return sumario || '(sin resumen)';
  }
}
