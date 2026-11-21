# Prompt para gerar o banco de questões de um procedimento

Cole o texto abaixo numa IA (Claude, por exemplo), substituindo os campos entre colchetes. Depois **revise todas as questões** antes de usar.

---

Você é especialista em educação de profissionais de saúde e em elaboração de itens de múltipla escolha (diretrizes de Haladyna, Downing & Rodriguez e do NBME).

Procedimento: [NOME DO PROCEDIMENTO]
Contexto: [SETOR, PÚBLICO, OBSERVAÇÕES]

REGRAS DO PROTOCOLO (única fonte de verdade; numere a partir de 0; marque as críticas):
[0] (CRÍTICA) [texto da regra]
[1] [texto da regra]
…

Use 3 regras (competências), no máximo 4. Para CADA regra, gere 10 questões:
- uso "treino": 3 de nível 1 e 3 de nível 2;
- uso "avaliacao": 4 de nível 2.
Varie os formatos (campo "tipo"): a maioria "multipla", e em cada regra pelo menos uma de cada um destes: "vf", "multiselect", "ordenar" (quando a regra tiver uma sequência de ações) e "associar".

Formatos:
- "multipla": "alternativas" (4), "correta" (índice 0-3), "equivocos" (4 textos; "" na correta).
- "vf": o enunciado é uma afirmação; "correta" é true ou false; "equivoco" (1 frase).
- "multiselect": "alternativas" (4 ou 5), "corretas" (lista de índices, pelo menos 2), "notas" (um comentário curto por alternativa), "equivoco".
- "ordenar": "itens" com 4 ou 5 etapas JÁ NA ORDEM CORRETA (o site embaralha), "equivoco".
- "associar": "opcoes" (2 a 5 categorias), "pares" (4 ou 5 itens, cada um {"item": "...", "resposta": índice da opção}), "equivoco".

Níveis:
- Nível 1 — Básico: reconhecer a regra (o que é, quando se aplica).
- Nível 2 — Situação real: uma situação de trabalho em que a regra decide a conduta, incluindo armadilhas comuns.

Requisitos de cada questão:
- No nível 2, use uma vinheta curta (1 a 3 frases) de uma situação real, variando profissionais e setores.
- O enunciado traz uma pergunta clara, que dá para responder sem ler as alternativas.
- Em "multipla": exatamente 4 alternativas, com exatamente 1 correta segundo as regras.
- Distratores plausíveis, cada um representando um erro comum de profissionais.
- Alternativas homogêneas em tamanho e gramática; a correta NÃO pode ser a mais longa nem a mais detalhada.
- Distribua a posição da correta entre as 4 posições.
- Proibido: "todas as anteriores", "nenhuma das anteriores", enunciado negativo (NÃO, EXCETO), pistas gramaticais.
- Não introduza fatos, números ou condutas que não estejam nas regras.
- As questões de avaliação devem ser diferentes das de treino (outras situações).
- "explicacao": 1 a 2 frases dizendo por que a correta está certa, citando a regra.
- "equivocos": 4 textos alinhados às alternativas; para cada distrator, o equívoco que ele representa (1 frase); para a correta, "".

Escreva em português do Brasil. Responda SOMENTE com JSON neste formato:

```json
{
  "id": "[nome-curto-sem-espaco]",
  "titulo": "[NOME DO PROCEDIMENTO]",
  "descricao": "[CONTEXTO]",
  "notaMinima": 80,
  "video": {"youtube": "", "arquivo": "", "legenda": ""},
  "regras": [{"nome": "nome curto", "texto": "…", "critica": true, "videoInicio": null}],
  "questoes": [
    {"id": "r0q01", "regra": 0, "nivel": 1, "uso": "treino", "tipo": "multipla",
     "enunciado": "…", "alternativas": ["…","…","…","…"], "correta": 0,
     "explicacao": "…", "equivocos": ["","…","…","…"]},
    {"id": "r0q02", "regra": 0, "nivel": 1, "uso": "treino", "tipo": "vf",
     "enunciado": "…", "correta": false, "explicacao": "…", "equivoco": "…"}
  ]
}
```

---

## Checklist de revisão (para o gestor)

- [ ] A alternativa marcada como correta segue o protocolo do serviço.
- [ ] Nenhuma outra alternativa é defensável.
- [ ] Não há conteúdo fora das regras.
- [ ] A correta não é visivelmente a mais longa.
- [ ] As questões de avaliação não repetem situações do treino.
- [ ] O campo `id` de cada questão é único.
