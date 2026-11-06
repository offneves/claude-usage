# token-usage

Mod do Claude Code que mostra, numa faixa acima do prompt, o uso de tokens da sessão atual:

```
╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Contexto  [■■□□□□□□□□] 21% 42k - 200k  •  Limite 5h  [■■□□□□□□□□] 23% 2h 10min  •  Limite semanal  [■□□□□□□□□□] 8% 3 dias   Ocultar │
│                                                                                                                                     │
│ Sessão          enviados 12.3k · gerados 3.1k · re-cache 80k · salvos no cache 5k · custo US$ 0.84                                  │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

- **Contexto**: quanto da janela do modelo a conversa já ocupa
- **Sessão**: tokens enviados ao modelo, gerados por ele, reutilizados do cache (re-cache) e gravados no cache, somados a cada turno (subagentes incluídos), e o custo em US$, como o `/cost`
- **Limites de uso** (5 horas e semanal) e quanto falta para renovarem, quando a conta é por assinatura

Contexto, Limite 5h e Limite semanal ficam lado a lado numa linha, separados por uma bolinha; quando o terminal é estreito demais para os três, eles ficam um embaixo do outro, nessa ordem, com rótulos, barras, percentuais e detalhes alinhados em colunas. A borda da faixa e as barras são laranja forte (os quadrados vazios e os colchetes em volta da barra ficam cinza), o percentual em branco e a linha **Sessão** em cinza claro. Em terminais com menos de 50 colunas as barras somem e ficam só os números; se a linha **Sessão** não couber inteira, cache e custo descem para uma segunda linha.

Em terminal estreito:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ Contexto        [■■□□□□□□□□] 21%  42k - 200k                         Ocultar │
│ Limite 5h       [■■□□□□□□□□] 23%  2h 10min                                   │
│ Limite semanal  [■□□□□□□□□□] 8%   3 dias                                     │
│                                                                              │
│ Sessão          enviados 12.3k · gerados 3.1k                                │
│                 re-cache 80k · salvos no cache 5k · custo US$ 0.84           │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Um toast avisa quando o contexto passa de 85% ou um limite passa de 90%.

## Instalação

Requer o [Claude Code](https://claude.com/claude-code) 2.1.275 ou mais recente, com login feito.

### Opção 1: a partir do clone (recomendada)

Assim o Claude Code lê o mod direto da pasta clonada, e atualizar é só um `git pull`.

```bash
git clone https://github.com/offneves/claude-usage.git ~/Developer/claude-usage
claude plugin marketplace add ~/Developer/claude-usage
claude plugin install token-usage@claude-usage
```

O primeiro comando baixa o repositório. O segundo registra a pasta como um marketplace chamado `claude-usage`, e o terceiro instala o mod `token-usage` dele, para o seu usuário: ele passa a valer em todas as sessões. Sessões abertas antes da instalação precisam de `/reload-plugins` ou de um reinício.

Para conferir:

```bash
claude plugin list
```

`token-usage@claude-usage` deve aparecer como `enabled`, com `Read from:` apontando para a pasta clonada.

### Opção 2: direto do GitHub, sem clonar

Num terminal com o Claude Code aberto, digite no prompt:

```
/plugin install token-usage --marketplace offneves/claude-usage
```

Responda `y` para adicionar o marketplace e escolha o escopo (o de usuário é o primeiro). Ou, num shell:

```bash
claude plugin install token-usage --marketplace offneves/claude-usage
```

Nesse caso o Claude Code guarda uma cópia própria; para atualizar, use `claude plugin update token-usage@claude-usage`.

Se o repositório for **privado**, a máquina precisa ter acesso ao GitHub configurado antes (uma chave SSH, ou `gh auth login` seguido de `gh auth setup-git`), porque a instalação não pede senha.

## Atualizar

Com a opção 1:

```bash
cd ~/Developer/claude-usage
git pull
```

Depois rode `/reload-plugins` nas sessões abertas, ou reinicie-as.

## Desinstalar

```bash
claude plugin uninstall token-usage@claude-usage
claude plugin marketplace remove claude-usage
```

## Uso

- `/usage-panel` mostra ou oculta a faixa
- O botão **Ocultar** esconde a faixa até o próximo `/usage-panel`

## Desenvolvimento

Instalado pela opção 1, o mod já roda a partir desta pasta: edite os arquivos e rode `/reload-plugins` para ver a mudança. Para testar uma alteração só numa sessão, sem mexer na instalação, use `claude --plugin-dir .`.

```
claude plugin validate .   # confere o manifesto, o marketplace e o módulo
claude plugin test .       # roda os testes em tests/
```

Estrutura:

| Arquivo | O que é |
|---|---|
| `.claude-plugin/plugin.json` | manifesto do mod |
| `.claude-plugin/marketplace.json` | faz do repositório um marketplace, o que permite instalar com os comandos acima |
| `hooks/hooks.json` | aponta para o módulo de hooks |
| `hooks/register.tsx` | o código: comando `/usage-panel`, contagem de tokens e desenho da faixa |
| `types/index.d.ts` | tipos do estado que o mod guarda |
| `tests/register.test.tsx` | testes |

A pasta `.claude-plugin/types/` é gerada pelo Claude Code ao carregar o mod (tipos para o editor e o `tsconfig.json` base) e fica fora do git. Numa máquina nova ela aparece depois da primeira sessão com o mod instalado; até lá o editor pode acusar tipos faltando.
