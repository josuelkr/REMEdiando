# Treinamento rápido com gamificação — protótipo

Site estático (HTML + JavaScript, sem servidor e sem login) para treinar equipes em competências simples.
O exemplo incluído é **atendimento ao cliente com educação**: 3 competências (Receber bem, Entender e resolver, Cliente insatisfeito — crítica), **30 questões em 5 formatos**, cerca de 5 minutos.

## Como funciona

1. **Tutorial:** vídeo curto (opcional) e as competências.
2. **Prática em dois degraus:** cada competência começa no básico; acertou, vai para uma situação real; acertou de novo, está dominada. Errou, desce e a competência volta em outra situação.
3. **Avaliação:** 2 questões inéditas por competência (6 no total), sem correção na hora. Aprova com 80% e nenhum erro em competência crítica.
4. **Remediação:** quem reprova pratica só o que errou e faz outra versão da prova.

## Gamificação

| | pontos |
|---|---|
| Acerto na prática | +10 |
| A cada 3 acertos seguidos | +10 |
| Competência dominada | +20 |
| Aprovação / de primeira / com 100% | +50 / +50 / +30 |
| Resposta rápida demais (sem tempo de ler) | 0 |

Medalhas: **bronze** concluiu; **prata** aprovado na 1ª avaliação; **ouro** 1ª avaliação com 100% e no máximo uma resposta rápida demais. Nada premia velocidade, para não incentivar o chute. Os valores ficam em `CFG.pts`, no início do `app.js`.

## Painel do gestor

- **O que fazer agora:** quem cobrar (parou há mais de 72 h, não começou), quem reconhecer (ouro e prata), com quem conversar (possível chute, pulou o tutorial, reprovou 2+ vezes) e o que reforçar na reunião (competência com mais erro na 1ª vez e o erro mais comum).
- **Erro na 1ª vez por competência**, com intervalo de confiança de 95% (Wilson); com menos de 5 pessoas aparece “poucos dados”. O destaque só é dado como claro quando os intervalos não se sobrepõem.
- **Resposta rápida demais:** abaixo de 10% do tempo médio da equipe na questão, entre 3 e 10 s (Wise & Ma, 2012). “Possível chute” exige pelo menos 2 respostas rápidas e esforço abaixo de 90%.
- O tempo total **não** é usado como sinal de pressa: quem já sabe responde menos questões e termina antes.
- **Baixar planilha** (CSV para Excel) e Exportar/Importar dados (JSON) para juntar aparelhos.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (pode ser público) e envie **todo o conteúdo desta pasta** para a raiz dele (`index.html` precisa ficar na raiz).
   - Pelo site: *Add file → Upload files*, arraste todos os arquivos e pastas e clique em *Commit changes*.
2. No repositório, vá em **Settings → Pages**.
3. Em *Build and deployment*, escolha **Source: Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
4. Em 1 a 2 minutos o site aparece em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Testar no computador

Abrir o `index.html` direto do disco não funciona, porque o navegador bloqueia a leitura dos arquivos JSON. Rode um servidor local dentro da pasta:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

## Estrutura

```
index.html                  página
fonts/                      fontes (Bricolage Grotesque e Atkinson Hyperlegible, licença OFL)
app.js                      lógica (treino, avaliação, dashboard)
style.css                   aparência
dados/procedimentos.json    lista de procedimentos carregados
dados/atendimento-cliente.json  competências e banco de questões do exemplo
PROMPT_GERAR_QUESTOES.md    prompt para gerar o banco de um procedimento novo
```

## Vídeo do tutorial

No arquivo do procedimento, preencha o campo `video`:

```json
"video": { "youtube": "CODIGO_DO_VIDEO", "arquivo": "", "legenda": "" }
```

- `youtube`: só o código do vídeo (o trecho depois de `v=` no endereço do YouTube).
- `arquivo`: alternativa ao YouTube, um vídeo dentro do repositório, por exemplo `videos/atendimento.mp4`.
- Em cada regra, `videoInicio` (em segundos) é opcional: quando preenchido, quem erra uma questão daquela regra ganha o botão “Rever este trecho do vídeo”.

Sem vídeo configurado, o tutorial mostra um espaço reservado.

## Formato do banco de questões

Campos comuns a todas as questões:

```
id          identificador único
regra       índice da regra (começa em 0)
nivel       1 básico, 2 situação real
uso         "treino" ou "avaliacao" (nunca se misturam)
tipo        multipla | vf | multiselect | ordenar | associar
enunciado   texto da questão
explicacao  por que a resposta está certa
```

Campos de cada tipo:

| tipo | campos | correção |
|---|---|---|
| `multipla` | `alternativas` (4), `correta` (índice), `equivocos` (um por alternativa, "" na correta) | mostra por que a alternativa escolhida engana |
| `vf` | `correta` (true/false), `equivoco` | — |
| `multiselect` | `alternativas`, `corretas` (lista de índices), `notas` (comentário de cada item), `equivoco` | comenta cada item marcado ou não |
| `ordenar` | `itens` **já na ordem correta** (o site embaralha), `equivoco` | mostra a posição certa de cada etapa |
| `associar` | `opcoes` (categorias), `pares` (`item` + `resposta` = índice da opção), `equivoco` | mostra a categoria certa de cada item |

Exemplo de `associar`:

```json
{"id":"r2as1","regra":2,"nivel":2,"uso":"treino","tipo":"associar",
 "enunciado":"Classifique cada atitude.",
 "opcoes":["Acolhe","Afasta"],
 "pares":[{"item":"Atender sem tirar os olhos da tela","resposta":1}],
 "explicacao":"…","equivoco":"…"}
```

Distribuição usada **por competência** no exemplo: prática com 3 questões de nível 1 e 3 de nível 2; avaliação com 4 de nível 2 (a prova sorteia 2, o que permite 2 versões sem repetir).

## Para adicionar um procedimento

1. Use o `PROMPT_GERAR_QUESTOES.md` com uma IA, colando as regras do procedimento.
2. **Revise cada questão** antes de usar: a resposta correta tem de seguir o protocolo, só uma alternativa pode ser defensável e nada pode estar fora das regras.
3. Salve o resultado como `dados/NOME.json` e acrescente `"NOME.json"` em `dados/procedimentos.json`.

## Limitações do protótipo

- **Sem login:** a pessoa digita o nome e o progresso fica salvo no navegador (localStorage). Para juntar os dados da equipe, cada aparelho usa **Exportar dados** no Dashboard e o gestor usa **Importar dados**.
- Para um painel automático da equipe inteira, a próxima etapa é um banco de dados on-line (por exemplo Supabase ou Firebase).
- As questões do exemplo seguem boas práticas gerais de atendimento e devem ser ajustadas à realidade de cada empresa.
- Com 6 questões, a avaliação confirma o básico, mas não mede com precisão fina: compare pessoas pela tendência (pontos, medalhas, erro na 1ª vez), não por uma questão.
