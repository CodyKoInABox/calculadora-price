# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

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
