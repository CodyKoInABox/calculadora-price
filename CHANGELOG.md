# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [2.0.0]

### Alterado (interno, sem mudança de uso)
- O motor (`math`, `costs`, `invest`, `sacre`) foi movido para `src/engine/`, sem dependência de React ou DOM. `src/engine/index.js` é a API pública.
- Helpers de estado, defaults e a conversão de taxas saíram do `App.jsx` para `src/appState.js`. `InterestField` e `ExtrasEditor` viraram componentes próprios. `saveBlob` foi para `src/download.js`. O `App.jsx` caiu de cerca de 1270 para 973 linhas.

### Adicionado
- Testes de propriedades do motor com `fast-check`: saldo sempre zera, amortizações fecham o principal, SAC e Price com parcela constante, identidade do razão no SACRE, balão nunca alonga o prazo.
- `npm run build:engine` gera `dist-engine/`, um pacote ESM sem dependências com o motor. Ainda não publicado no npm.

### Pendente
- Reducer para o estado do `App.jsx` e hook para os cenários salvos (#31 segue aberta).
- Publicação do pacote `calculadora-price-engine` (#32 segue aberta).

## [1.6.0]

### Adicionado
- Comparação de até 4 cenários salvos lado a lado: tabela de indicadores (parcelas, juros, total pago, CET, seguros) e gráfico do saldo devedor mês a mês.
- Relatório PDF próprio, gerado no navegador sem dependências. Inclui o resumo e a tabela completa no modo de cálculo direto, e os indicadores lado a lado nos modos Price × SAC e A vs B. Não usa mais `window.print()`.
- PWA: manifesto, ícone e service worker. Depois do primeiro carregamento, a calculadora abre offline. Fontes do Google ficam fora do cache e caem para a fonte do sistema.

### Notas
- O PDF usa Helvetica com codificação WinAnsi. Caracteres fora dessa codificação (por exemplo, setas) aparecem como `?`.
- O bundle cresceu para cerca de 499 kB (155 kB gzip). Ainda não investiguei a causa.

## [1.5.0]

### Adicionado
- Cenários salvos no navegador (localStorage): salvar a configuração atual com um nome, carregar e excluir. Cada cenário guarda o mesmo conteúdo de um link de compartilhamento, incluindo custos, SACRE e modo A vs B.
- Exportar e importar cenários em JSON. A importação valida o formato e ignora entradas inválidas.

### Alterado
- Carregar um link ou um cenário passa a usar os valores padrão para o que não foi informado, em vez de manter o estado atual. Os cenários A e B do modo A vs B são mantidos ao carregar um cenário de outro modo.

## [1.4.0]

### Adicionado
- Sistema SACRE como variação da Price no cálculo direto: a parcela é recalculada a cada 12 meses sobre o saldo devedor, e a parcela fica constante dentro de cada ano.
- Campo de correção do saldo (TR) em % a.m., aplicado todo mês antes dos juros. Sem TR, o SACRE é igual à Price.
- Coluna "Correção TR" na tabela de amortização e métrica de correção acumulada, aparecendo só quando há TR.
- Parâmetros `sc` e `tr` nos links de compartilhamento.

### Notas
- A última parcela absorve o resíduo da TR do último ano, por isso fica acima das demais.
- SACRE não está disponível no limite de renda nem em Price × SAC.

## [1.3.0]

### Adicionado
- Painel "Amortizar ou investir?": compara os juros economizados pelos extras com o rendimento líquido de aplicar o mesmo dinheiro até o fim do contrato. Mostra a taxa de equilíbrio e aceita aplicações isentas de IR.
- CET em cada cenário do modo A vs B.
## [1.2.0]

### Adicionado
- CET (custo efetivo total) no resumo e na comparação Price × SAC, calculado pela TIR mensal dos fluxos e anualizado.
- Bloco "Seguros e taxas" com tarifas iniciais, taxa de administração, MIP (sobre o saldo) e DFI (sobre o imóvel). Afetam só o CET, não a parcela.
- Total de seguros e taxas no resumo, com a diferença em pontos percentuais em relação à taxa contratada.
- "Calcular pela renda": define a parcela máxima como 25%, 30% ou 35% da renda bruta (modo "A partir da parcela").
- Seguros e taxas entram no link de compartilhamento.

### Observações
- No modo A vs B, o CET ainda não é exibido.

## [1.1.0]

### Corrigido
- Cálculo inverso com curva ("A partir da parcela") não trava mais a tela: roda em Web Worker e cancela cálculos obsoletos.
- Arrastar a curva no modo inverso não dispara mais o solver a cada frame.
- `npm run test:status` agora falha quando a suíte quebra, bloqueando o deploy.

### Alterado
- Resultados recalculam automaticamente após editar os campos (com pequeno atraso).
- Erros de validação aparecem no formulário, em vez de `alert()`.
- Editor da curva tem sliders com valor visível para cada ponto.
- Gráfico ampliado mantém o foco dentro do diálogo e o devolve ao fechar.
- Bundle menor: só os componentes do Chart.js em uso são registrados.

### Interno
- ESLint com regras de React Hooks, executado no CI.
- Valores padrão centralizados em `src/defaults.js`.
